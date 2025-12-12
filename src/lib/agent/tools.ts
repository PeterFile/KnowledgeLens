// Tool Manager - Registry, validation, and invocation
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6

import type {
  ToolSchema,
  ToolCall,
  ToolResult,
  ToolHandler,
  ValidationResult,
  JSONSchema,
  JSONSchemaProperty,
} from './types';

// ============================================================================
// Tool Registry
// ============================================================================

const toolRegistry = new Map<string, { schema: ToolSchema; handler: ToolHandler }>();

/**
 * Register a tool with its schema and handler
 * Requirements: 2.1, 2.2, 2.3
 */
export function registerTool(schema: ToolSchema, handler: ToolHandler): void {
  if (!schema.name || typeof schema.name !== 'string') {
    throw new Error('Tool schema must have a valid name');
  }
  if (!schema.description || typeof schema.description !== 'string') {
    throw new Error('Tool schema must have a description');
  }
  if (!schema.parameters || schema.parameters.type !== 'object') {
    throw new Error('Tool schema parameters must be an object type');
  }
  toolRegistry.set(schema.name, { schema, handler });
}

/**
 * Unregister a tool by name
 */
export function unregisterTool(name: string): boolean {
  return toolRegistry.delete(name);
}

/**
 * Clear all registered tools
 */
export function clearToolRegistry(): void {
  toolRegistry.clear();
}

/**
 * Get all registered tool schemas for LLM prompt generation
 * Requirements: 2.1, 2.2
 */
export function getToolSchemas(): ToolSchema[] {
  return Array.from(toolRegistry.values()).map((entry) => entry.schema);
}

/**
 * Get a specific tool schema by name
 */
export function getToolSchema(name: string): ToolSchema | undefined {
  return toolRegistry.get(name)?.schema;
}

// ============================================================================
// JSON Schema Validation
// ============================================================================

/**
 * Validate a value against a JSON schema property
 */
function validateProperty(value: unknown, schema: JSONSchemaProperty, path: string): string[] {
  const errors: string[] = [];

  if (value === undefined || value === null) {
    return errors; // Required check is done separately
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path}: expected string, got ${typeof value}`);
      } else if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path}: value must be one of [${schema.enum.join(', ')}]`);
      }
      break;

    case 'number':
      if (typeof value !== 'number') {
        errors.push(`${path}: expected number, got ${typeof value}`);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push(`${path}: expected boolean, got ${typeof value}`);
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
      } else if (schema.items) {
        value.forEach((item, index) => {
          errors.push(...validateProperty(item, schema.items!, `${path}[${index}]`));
        });
      }
      break;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push(
          `${path}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`
        );
      } else if (schema.properties) {
        const obj = value as Record<string, unknown>;
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          errors.push(...validateProperty(obj[key], propSchema, `${path}.${key}`));
        }
      }
      break;
  }

  return errors;
}

/**
 * Validate parameters against a JSON schema
 */
function validateAgainstSchema(
  params: Record<string, unknown>,
  schema: JSONSchema
): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (params[field] === undefined || params[field] === null) {
        errors.push(`Missing required parameter: ${field}`);
      }
    }
  }

  // Validate each property
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (params[key] !== undefined) {
        errors.push(...validateProperty(params[key], propSchema, key));
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate a tool call against its schema
 * Requirements: 2.4
 */
export function validateToolCall(call: ToolCall): ValidationResult {
  // Check if tool exists
  const entry = toolRegistry.get(call.name);
  if (!entry) {
    return {
      valid: false,
      errors: [
        `Unknown tool: ${call.name}. Available tools: ${Array.from(toolRegistry.keys()).join(', ')}`,
      ],
    };
  }

  // Validate parameters against schema
  return validateAgainstSchema(call.parameters, entry.schema.parameters);
}

// ============================================================================
// Tool Call Serialization / Parsing (Round-Trip)
// ============================================================================

/**
 * Serialize a tool call to a string format for LLM output
 * Requirements: 2.5
 */
export function serializeToolCall(call: ToolCall): string {
  return JSON.stringify({
    tool: call.name,
    parameters: call.parameters,
    reasoning: call.reasoning,
  });
}

/**
 * Parse a tool call from LLM output string
 * Supports both JSON format and XML-like format
 * Requirements: 2.6
 */
export function parseToolCall(llmOutput: string): ToolCall | null {
  // Try JSON format first
  const jsonResult = parseJsonToolCall(llmOutput);
  if (jsonResult) return jsonResult;

  // Try XML-like format
  const xmlResult = parseXmlToolCall(llmOutput);
  if (xmlResult) return xmlResult;

  return null;
}

/**
 * Parse tool call from JSON format
 */
function parseJsonToolCall(output: string): ToolCall | null {
  // Find JSON object in the output
  const jsonMatch = output.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.tool && typeof parsed.tool === 'string') {
      return {
        name: parsed.tool,
        parameters: parsed.parameters ?? {},
        reasoning: parsed.reasoning ?? '',
      };
    }
  } catch {
    // JSON parse failed, try other formats
  }

  return null;
}

/**
 * Parse tool call from XML-like format
 * Example: <tool_call><name>search_web</name><parameters>{"query": "test"}</parameters></tool_call>
 */
function parseXmlToolCall(output: string): ToolCall | null {
  const toolCallMatch = output.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
  if (!toolCallMatch) return null;

  const content = toolCallMatch[1];
  const nameMatch = content.match(/<name>([\s\S]*?)<\/name>/);
  const paramsMatch = content.match(/<parameters>([\s\S]*?)<\/parameters>/);
  const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);

  if (!nameMatch) return null;

  let parameters: Record<string, unknown> = {};
  if (paramsMatch) {
    try {
      parameters = JSON.parse(paramsMatch[1].trim());
    } catch {
      // If JSON parse fails, try to extract key-value pairs
      parameters = {};
    }
  }

  return {
    name: nameMatch[1].trim(),
    parameters,
    reasoning: reasoningMatch?.[1]?.trim() ?? '',
  };
}

// ============================================================================
// Tool Execution
// ============================================================================

/**
 * Execute a tool with validation
 */
export async function executeTool(call: ToolCall, signal?: AbortSignal): Promise<ToolResult> {
  // Validate the call first
  const validation = validateToolCall(call);
  if (!validation.valid) {
    return {
      success: false,
      error: `Validation failed: ${validation.errors?.join('; ')}`,
      tokenCount: 0,
    };
  }

  // Get the handler
  const entry = toolRegistry.get(call.name);
  if (!entry) {
    return {
      success: false,
      error: `Tool not found: ${call.name}`,
      tokenCount: 0,
    };
  }

  // Execute the handler
  try {
    return await entry.handler(call.parameters, signal);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      tokenCount: 0,
    };
  }
}

// ============================================================================
// Tool Schema Serialization (for persistence/debugging)
// ============================================================================

/**
 * Serialize a tool schema to JSON string
 */
export function serializeToolSchema(schema: ToolSchema): string {
  return JSON.stringify(schema);
}

/**
 * Parse a tool schema from JSON string
 */
export function parseToolSchema(json: string): ToolSchema | null {
  try {
    const parsed = JSON.parse(json);
    if (
      typeof parsed.name === 'string' &&
      typeof parsed.description === 'string' &&
      parsed.parameters &&
      typeof parsed.parameters === 'object'
    ) {
      return {
        name: parsed.name,
        description: parsed.description,
        parameters: parsed.parameters,
        examples: Array.isArray(parsed.examples) ? parsed.examples : [],
      };
    }
  } catch {
    // Parse failed
  }
  return null;
}

/**
 * Format tool schemas for LLM prompt injection
 */
export function formatToolsForPrompt(): string {
  const schemas = getToolSchemas();
  if (schemas.length === 0) {
    return 'No tools available.';
  }

  return schemas
    .map((schema) => {
      const examplesStr =
        schema.examples.length > 0
          ? `\nExamples:\n${schema.examples.map((ex) => `  - ${ex.description}: ${JSON.stringify(ex.input)}`).join('\n')}`
          : '';

      return `### ${schema.name}
${schema.description}

Parameters:
${formatSchemaParameters(schema.parameters)}${examplesStr}`;
    })
    .join('\n\n');
}

/**
 * Format JSON schema parameters for human-readable display
 */
function formatSchemaParameters(schema: JSONSchema, indent = 0): string {
  const prefix = '  '.repeat(indent);
  const lines: string[] = [];

  if (schema.properties) {
    const required = new Set(schema.required ?? []);
    for (const [name, prop] of Object.entries(schema.properties)) {
      const reqStr = required.has(name) ? ' (required)' : ' (optional)';
      const desc = prop.description ? ` - ${prop.description}` : '';
      lines.push(`${prefix}- ${name}: ${prop.type}${reqStr}${desc}`);

      if (prop.enum) {
        lines.push(`${prefix}  Allowed values: ${prop.enum.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}
