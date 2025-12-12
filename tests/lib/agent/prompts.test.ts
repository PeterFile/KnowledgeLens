import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadTemplate,
  validateTemplate,
  renderTemplate,
  parseTemplate,
  serializeTemplate,
  registerTemplate,
  hasTemplate,
  getTemplateNames,
  clearTemplates,
  TEMPLATES,
} from '../../../src/lib/agent/prompts';
import type { PromptTemplate } from '../../../src/lib/agent/types';

describe('Prompt Template System', () => {
  beforeEach(() => {
    // Re-register default templates after clearing
    clearTemplates();
    for (const template of Object.values(TEMPLATES)) {
      registerTemplate(template);
    }
  });

  describe('validateTemplate', () => {
    it('validates a well-formed template', () => {
      const template: PromptTemplate = {
        name: 'test_template',
        sections: [{ name: 'intro', delimiter: 'xml', content: 'Hello {{name}}', required: true }],
        placeholders: [{ name: 'name', type: 'string', required: true }],
      };

      const result = validateTemplate(template);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('rejects template without name', () => {
      const template: PromptTemplate = {
        name: '',
        sections: [],
        placeholders: [],
      };

      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Template must have a name');
    });

    it('rejects duplicate section names', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          { name: 'intro', delimiter: 'xml', content: 'a', required: false },
          { name: 'intro', delimiter: 'xml', content: 'b', required: false },
        ],
        placeholders: [],
      };

      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Duplicate section name'));
    });

    it('rejects invalid delimiter', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [{ name: 'intro', delimiter: 'invalid' as 'xml', content: 'a', required: false }],
        placeholders: [],
      };

      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Invalid delimiter'));
    });

    it('rejects required section with empty content', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [{ name: 'intro', delimiter: 'xml', content: '', required: true }],
        placeholders: [],
      };

      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('has no content'));
    });

    it('rejects duplicate placeholder names', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [],
        placeholders: [
          { name: 'foo', type: 'string', required: true },
          { name: 'foo', type: 'array', required: false },
        ],
      };

      const result = validateTemplate(template);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Duplicate placeholder name'));
    });
  });

  describe('loadTemplate', () => {
    it('loads a registered template', () => {
      const template = loadTemplate('REACT_SYSTEM');
      expect(template.name).toBe('REACT_SYSTEM');
    });

    it('throws for unknown template', () => {
      expect(() => loadTemplate('UNKNOWN_TEMPLATE')).toThrow('not found');
    });
  });

  describe('renderTemplate', () => {
    it('renders template with string placeholders', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          { name: 'greeting', delimiter: 'xml', content: 'Hello {{name}}!', required: true },
        ],
        placeholders: [{ name: 'name', type: 'string', required: true }],
      };

      const result = renderTemplate(template, { name: 'World' });
      expect(result).toContain('Hello World!');
      expect(result).toContain('<greeting>');
      expect(result).toContain('</greeting>');
    });

    it('renders template with markdown delimiter', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          {
            name: 'Introduction',
            delimiter: 'markdown',
            content: 'Welcome {{user}}',
            required: true,
          },
        ],
        placeholders: [{ name: 'user', type: 'string', required: true }],
      };

      const result = renderTemplate(template, { user: 'Alice' });
      expect(result).toContain('## Introduction');
      expect(result).toContain('Welcome Alice');
    });

    it('renders array placeholders as newline-separated', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          { name: 'list', delimiter: 'xml', content: 'Items:\n{{items}}', required: true },
        ],
        placeholders: [{ name: 'items', type: 'array', required: true }],
      };

      const result = renderTemplate(template, { items: ['apple', 'banana', 'cherry'] });
      expect(result).toContain('apple\nbanana\ncherry');
    });

    it('renders object placeholders as JSON', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          { name: 'data', delimiter: 'xml', content: 'Config:\n{{config}}', required: true },
        ],
        placeholders: [{ name: 'config', type: 'object', required: true }],
      };

      const result = renderTemplate(template, { config: { key: 'value' } });
      expect(result).toContain('"key": "value"');
    });

    it('throws for missing required placeholder', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          { name: 'greeting', delimiter: 'xml', content: 'Hello {{name}}!', required: true },
        ],
        placeholders: [{ name: 'name', type: 'string', required: true }],
      };

      expect(() => renderTemplate(template, {})).toThrow('Missing required placeholder');
    });

    it('throws for wrong placeholder type', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          { name: 'greeting', delimiter: 'xml', content: 'Hello {{name}}!', required: true },
        ],
        placeholders: [{ name: 'name', type: 'string', required: true }],
      };

      expect(() => renderTemplate(template, { name: ['array', 'value'] })).toThrow('Invalid type');
    });

    it('leaves unmatched placeholders as-is', () => {
      const template: PromptTemplate = {
        name: 'test',
        sections: [
          {
            name: 'content',
            delimiter: 'xml',
            content: '{{known}} and {{unknown}}',
            required: true,
          },
        ],
        placeholders: [{ name: 'known', type: 'string', required: true }],
      };

      const result = renderTemplate(template, { known: 'value' });
      expect(result).toContain('value and {{unknown}}');
    });
  });

  describe('serializeTemplate and parseTemplate', () => {
    it('round-trips a simple template', () => {
      const original: PromptTemplate = {
        name: 'simple_test',
        sections: [{ name: 'intro', delimiter: 'xml', content: 'Hello world', required: true }],
        placeholders: [{ name: 'greeting', type: 'string', required: true }],
      };

      const serialized = serializeTemplate(original);
      const parsed = parseTemplate(serialized);

      expect(parsed.name).toBe(original.name);
      expect(parsed.sections).toHaveLength(original.sections.length);
      expect(parsed.sections[0].name).toBe(original.sections[0].name);
      expect(parsed.sections[0].delimiter).toBe(original.sections[0].delimiter);
      expect(parsed.sections[0].content).toBe(original.sections[0].content);
      expect(parsed.sections[0].required).toBe(original.sections[0].required);
      expect(parsed.placeholders).toHaveLength(original.placeholders.length);
      expect(parsed.placeholders[0]).toEqual(original.placeholders[0]);
    });

    it('round-trips template with multiple sections', () => {
      const original: PromptTemplate = {
        name: 'multi_section',
        sections: [
          { name: 'system', delimiter: 'xml', content: 'You are an assistant', required: true },
          { name: 'context', delimiter: 'markdown', content: 'Context: {{ctx}}', required: false },
          { name: 'instructions', delimiter: 'xml', content: 'Do the thing', required: true },
        ],
        placeholders: [
          { name: 'ctx', type: 'string', required: false },
          { name: 'data', type: 'object', required: true },
        ],
      };

      const serialized = serializeTemplate(original);
      const parsed = parseTemplate(serialized);

      expect(parsed.name).toBe(original.name);
      expect(parsed.sections).toHaveLength(3);
      expect(parsed.placeholders).toHaveLength(2);

      for (let i = 0; i < original.sections.length; i++) {
        expect(parsed.sections[i].name).toBe(original.sections[i].name);
        expect(parsed.sections[i].delimiter).toBe(original.sections[i].delimiter);
        expect(parsed.sections[i].content).toBe(original.sections[i].content);
        expect(parsed.sections[i].required).toBe(original.sections[i].required);
      }
    });

    it('round-trips template with multiline content', () => {
      const original: PromptTemplate = {
        name: 'multiline_test',
        sections: [
          {
            name: 'instructions',
            delimiter: 'xml',
            content: 'Line 1\nLine 2\nLine 3\n\nLine after blank',
            required: true,
          },
        ],
        placeholders: [],
      };

      const serialized = serializeTemplate(original);
      const parsed = parseTemplate(serialized);

      expect(parsed.sections[0].content).toBe(original.sections[0].content);
    });

    it('round-trips pre-defined REACT_SYSTEM template', () => {
      const serialized = serializeTemplate(TEMPLATES.REACT_SYSTEM);
      const parsed = parseTemplate(serialized);

      expect(parsed.name).toBe(TEMPLATES.REACT_SYSTEM.name);
      expect(parsed.sections).toHaveLength(TEMPLATES.REACT_SYSTEM.sections.length);
      expect(parsed.placeholders).toHaveLength(TEMPLATES.REACT_SYSTEM.placeholders.length);
    });
  });

  describe('registerTemplate and hasTemplate', () => {
    it('registers and retrieves custom template', () => {
      clearTemplates();

      const custom: PromptTemplate = {
        name: 'custom_template',
        sections: [{ name: 'body', delimiter: 'xml', content: 'Custom content', required: true }],
        placeholders: [],
      };

      expect(hasTemplate('custom_template')).toBe(false);
      registerTemplate(custom);
      expect(hasTemplate('custom_template')).toBe(true);

      const loaded = loadTemplate('custom_template');
      expect(loaded.name).toBe('custom_template');
    });

    it('throws when registering invalid template', () => {
      const invalid: PromptTemplate = {
        name: '',
        sections: [],
        placeholders: [],
      };

      expect(() => registerTemplate(invalid)).toThrow('invalid');
    });
  });

  describe('getTemplateNames', () => {
    it('returns all registered template names', () => {
      const names = getTemplateNames();
      expect(names).toContain('REACT_SYSTEM');
      expect(names).toContain('REFLECTION');
      expect(names).toContain('RESULT_GRADING');
      expect(names).toContain('QUERY_REWRITE');
      expect(names).toContain('CONTEXT_COMPACTION');
    });
  });

  describe('Pre-defined Templates', () => {
    it('REACT_SYSTEM template is valid', () => {
      const result = validateTemplate(TEMPLATES.REACT_SYSTEM);
      expect(result.valid).toBe(true);
    });

    it('REFLECTION template is valid', () => {
      const result = validateTemplate(TEMPLATES.REFLECTION);
      expect(result.valid).toBe(true);
    });

    it('RESULT_GRADING template is valid', () => {
      const result = validateTemplate(TEMPLATES.RESULT_GRADING);
      expect(result.valid).toBe(true);
    });

    it('QUERY_REWRITE template is valid', () => {
      const result = validateTemplate(TEMPLATES.QUERY_REWRITE);
      expect(result.valid).toBe(true);
    });

    it('CONTEXT_COMPACTION template is valid', () => {
      const result = validateTemplate(TEMPLATES.CONTEXT_COMPACTION);
      expect(result.valid).toBe(true);
    });

    it('REACT_SYSTEM can be rendered with required placeholders', () => {
      const result = renderTemplate(TEMPLATES.REACT_SYSTEM, {
        tools: 'tool1, tool2',
        goal: 'Help the user',
      });

      expect(result).toContain('tool1, tool2');
      expect(result).toContain('Help the user');
    });
  });
});
