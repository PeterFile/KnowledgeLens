import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  registerTool,
  clearToolRegistry,
  getToolSchemas,
  getToolSchema,
  validateToolCall,
  serializeToolCall,
  parseToolCall,
  serializeToolSchema,
  parseToolSchema,
} from '../../../src/lib/agent/tools';
import type { ToolSchema, ToolCall, JSONSchemaProperty } from '../../../src/lib/agent/types';
import { ALL_TOOL_SCHEMAS } from '../../../src/lib/agent/tool-definitions';

describe('Tool Manager', () => {
  beforeEach(() => {
    clearToolRegistry();
  });

  describe('registerTool', () => {
    it('registers a valid tool', () => {
      const schema: ToolSchema = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input value' },
          },
          required: ['input'],
        },
        examples: [],
      };

      const handler = async () => ({ success: true, tokenCount: 0 });
      registerTool(schema, handler);

      expect(getToolSchema('test_tool')).toBeDefined();
      expect(getToolSchemas()).toHaveLength(1);
    });

    it('throws for tool without name', () => {
      const schema = {
        name: '',
        description: 'A test tool',
        parameters: { type: 'object' as const },
        examples: [],
      };

      expect(() => registerTool(schema, async () => ({ success: true, tokenCount: 0 }))).toThrow(
        'valid name'
      );
    });

    it('throws for tool without description', () => {
      const schema = {
        name: 'test',
        description: '',
        parameters: { type: 'object' as const },
        examples: [],
      };

      expect(() => registerTool(schema, async () => ({ success: true, tokenCount: 0 }))).toThrow(
        'description'
      );
    });
  });

  describe('validateToolCall', () => {
    beforeEach(() => {
      const schema: ToolSchema = {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            required_param: { type: 'string', description: 'Required' },
            optional_param: { type: 'number', description: 'Optional' },
          },
          required: ['required_param'],
        },
        examples: [],
      };
      registerTool(schema, async () => ({ success: true, tokenCount: 0 }));
    });

    it('validates correct tool call', () => {
      const call: ToolCall = {
        name: 'test_tool',
        parameters: { required_param: 'value' },
        reasoning: 'Testing',
      };

      const result = validateToolCall(call);
      expect(result.valid).toBe(true);
    });

    it('rejects unknown tool', () => {
      const call: ToolCall = {
        name: 'unknown_tool',
        parameters: {},
        reasoning: 'Testing',
      };

      const result = validateToolCall(call);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Unknown tool');
    });

    it('rejects missing required parameter', () => {
      const call: ToolCall = {
        name: 'test_tool',
        parameters: {},
        reasoning: 'Testing',
      };

      const result = validateToolCall(call);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Missing required parameter');
    });

    it('rejects wrong parameter type', () => {
      const call: ToolCall = {
        name: 'test_tool',
        parameters: { required_param: 123 },
        reasoning: 'Testing',
      };

      const result = validateToolCall(call);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('expected string');
    });
  });

  describe('serializeToolCall and parseToolCall', () => {
    it('round-trips a tool call via JSON format', () => {
      const original: ToolCall = {
        name: 'test_tool',
        parameters: { query: 'test query', limit: 10 },
        reasoning: 'Need to search for information',
      };

      const serialized = serializeToolCall(original);
      const parsed = parseToolCall(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe(original.name);
      expect(parsed!.parameters).toEqual(original.parameters);
      expect(parsed!.reasoning).toBe(original.reasoning);
    });

    it('parses XML-like format', () => {
      const xmlOutput = `
        <tool_call>
          <name>search_web</name>
          <parameters>{"query": "test"}</parameters>
          <reasoning>Need to search</reasoning>
        </tool_call>
      `;

      const parsed = parseToolCall(xmlOutput);
      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe('search_web');
      expect(parsed!.parameters).toEqual({ query: 'test' });
      expect(parsed!.reasoning).toBe('Need to search');
    });

    it('returns null for invalid input', () => {
      const result = parseToolCall('This is not a tool call');
      expect(result).toBeNull();
    });
  });

  describe('serializeToolSchema and parseToolSchema', () => {
    it('round-trips a simple tool schema', () => {
      const original: ToolSchema = {
        name: 'simple_tool',
        description: 'A simple test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Input value' },
          },
          required: ['input'],
        },
        examples: [
          {
            input: { input: 'test' },
            description: 'Basic usage',
          },
        ],
      };

      const serialized = serializeToolSchema(original);
      const parsed = parseToolSchema(serialized);

      expect(parsed).not.toBeNull();
      expect(parsed!.name).toBe(original.name);
      expect(parsed!.description).toBe(original.description);
      expect(parsed!.parameters).toEqual(original.parameters);
      expect(parsed!.examples).toEqual(original.examples);
    });

    it('round-trips all pre-defined tool schemas', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        const serialized = serializeToolSchema(schema);
        const parsed = parseToolSchema(serialized);

        expect(parsed).not.toBeNull();
        expect(parsed!.name).toBe(schema.name);
        expect(parsed!.description).toBe(schema.description);
        expect(parsed!.parameters).toEqual(schema.parameters);
        expect(parsed!.examples).toEqual(schema.examples);
      }
    });

    it('returns null for invalid JSON', () => {
      const result = parseToolSchema('not valid json');
      expect(result).toBeNull();
    });

    it('returns null for JSON missing required fields', () => {
      const result = parseToolSchema('{"name": "test"}');
      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * **Feature: agent-architecture-upgrade, Property 4: Tool Definition Round-Trip**
 * **Validates: Requirements 2.5, 2.6**
 *
 * Property: For any valid tool definition, serializing it to JSON and parsing
 * it back SHALL produce an equivalent tool definition structure.
 */
describe('Property-Based Tests', () => {
  // Arbitraries for generating valid tool schema components

  // Generate valid identifier names (alphanumeric with underscores, starting with letter)
  const identifierArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,29}$/);

  // Generate non-empty description strings
  const descriptionArb = fc
    .string({ minLength: 5, maxLength: 200 })
    .filter((s) => s.trim().length >= 5);

  // Generate JSON schema property types
  const propertyTypeArb = fc.constantFrom(
    'string',
    'number',
    'boolean',
    'array',
    'object'
  ) as fc.Arbitrary<JSONSchemaProperty['type']>;

  // Generate a simple JSON schema property
  const simplePropertyArb: fc.Arbitrary<JSONSchemaProperty> = fc.record({
    type: propertyTypeArb,
    description: fc.option(descriptionArb, { nil: undefined }),
  });

  // Generate a JSON schema property with optional enum for strings
  const propertyArb: fc.Arbitrary<JSONSchemaProperty> = simplePropertyArb.chain((prop) => {
    if (prop.type === 'string') {
      return fc
        .option(
          fc.uniqueArray(fc.string({ minLength: 1, maxLength: 20 }), {
            minLength: 2,
            maxLength: 5,
          }),
          { nil: undefined }
        )
        .map((enumValues) => ({
          ...prop,
          enum: enumValues,
        }));
    }
    return fc.constant(prop);
  });

  // Generate properties object with 1-5 properties
  const propertiesArb: fc.Arbitrary<Record<string, JSONSchemaProperty>> = fc
    .uniqueArray(identifierArb, { minLength: 1, maxLength: 5 })
    .chain((names) =>
      fc.tuple(...names.map(() => propertyArb)).map((props) => {
        const result: Record<string, JSONSchemaProperty> = {};
        names.forEach((name, i) => {
          result[name] = props[i];
        });
        return result;
      })
    );

  // Generate a valid tool example
  const exampleArb = (
    propertyNames: string[]
  ): fc.Arbitrary<{ input: Record<string, unknown>; description: string }> =>
    fc.record({
      input: fc.record(
        Object.fromEntries(
          propertyNames.map((name) => [name, fc.oneof(fc.string(), fc.integer(), fc.boolean())])
        )
      ),
      description: descriptionArb,
    });

  // Generate a valid ToolSchema
  const toolSchemaArb: fc.Arbitrary<ToolSchema> = fc
    .tuple(identifierArb, descriptionArb, propertiesArb)
    .chain(([name, description, properties]) => {
      const propertyNames = Object.keys(properties);

      // Generate required array as subset of property names
      const requiredArb = fc.subarray(propertyNames, {
        minLength: 0,
        maxLength: propertyNames.length,
      });

      // Generate 0-3 examples
      const examplesArb = fc.array(exampleArb(propertyNames), { minLength: 0, maxLength: 3 });

      return fc.tuple(requiredArb, examplesArb).map(([required, examples]) => ({
        name,
        description,
        parameters: {
          type: 'object' as const,
          properties,
          required: required.length > 0 ? required : undefined,
        },
        examples,
      }));
    });

  describe('Property 4: Tool Definition Round-Trip', () => {
    it('serialize then parse produces equivalent tool schema', () => {
      fc.assert(
        fc.property(toolSchemaArb, (schema) => {
          // Serialize and parse
          const serialized = serializeToolSchema(schema);
          const parsed = parseToolSchema(serialized);

          // Verify parsing succeeded
          expect(parsed).not.toBeNull();

          // Verify structural equivalence
          expect(parsed!.name).toBe(schema.name);
          expect(parsed!.description).toBe(schema.description);
          expect(parsed!.parameters.type).toBe(schema.parameters.type);
          expect(parsed!.parameters.properties).toEqual(schema.parameters.properties);
          expect(parsed!.parameters.required).toEqual(schema.parameters.required);
          expect(parsed!.examples).toEqual(schema.examples);
        }),
        { numRuns: 100 }
      );
    });

    it('double round-trip produces identical result', () => {
      fc.assert(
        fc.property(toolSchemaArb, (schema) => {
          // First round-trip
          const serialized1 = serializeToolSchema(schema);
          const parsed1 = parseToolSchema(serialized1);
          expect(parsed1).not.toBeNull();

          // Second round-trip
          const serialized2 = serializeToolSchema(parsed1!);
          const parsed2 = parseToolSchema(serialized2);
          expect(parsed2).not.toBeNull();

          // Both parsed results should be identical
          expect(parsed2!.name).toBe(parsed1!.name);
          expect(parsed2!.description).toBe(parsed1!.description);
          expect(parsed2!.parameters).toEqual(parsed1!.parameters);
          expect(parsed2!.examples).toEqual(parsed1!.examples);
        }),
        { numRuns: 100 }
      );
    });

    it('serialized format is deterministic', () => {
      fc.assert(
        fc.property(toolSchemaArb, (schema) => {
          // Serialize twice
          const serialized1 = serializeToolSchema(schema);
          const serialized2 = serializeToolSchema(schema);

          // Should produce identical output
          expect(serialized1).toBe(serialized2);
        }),
        { numRuns: 100 }
      );
    });

    it('round-trip works for all pre-defined tool schemas', () => {
      for (const schema of ALL_TOOL_SCHEMAS) {
        const serialized = serializeToolSchema(schema);
        const parsed = parseToolSchema(serialized);

        expect(parsed).not.toBeNull();
        expect(parsed!.name).toBe(schema.name);
        expect(parsed!.description).toBe(schema.description);
        expect(parsed!.parameters).toEqual(schema.parameters);
        expect(parsed!.examples).toEqual(schema.examples);
      }
    });

    it('parsed schema can be re-registered and used', () => {
      fc.assert(
        fc.property(toolSchemaArb, (schema) => {
          clearToolRegistry();

          // Serialize and parse
          const serialized = serializeToolSchema(schema);
          const parsed = parseToolSchema(serialized);
          expect(parsed).not.toBeNull();

          // Register the parsed schema
          const handler = async () => ({ success: true, tokenCount: 0 });
          registerTool(parsed!, handler);

          // Verify it can be retrieved
          const retrieved = getToolSchema(parsed!.name);
          expect(retrieved).toBeDefined();
          expect(retrieved!.name).toBe(schema.name);
          expect(retrieved!.description).toBe(schema.description);
        }),
        { numRuns: 100 }
      );
    });
  });
});
