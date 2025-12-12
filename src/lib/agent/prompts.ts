// Prompt Template System
// Requirements: 8.1, 8.2, 8.3, 8.4, 8.5

import type {
  PromptTemplate,
  PromptSection,
  PlaceholderDef,
  DelimiterType,
  PlaceholderType,
  ValidationResult,
} from './types';

// ============================================================================
// Template Registry
// ============================================================================

const templateRegistry = new Map<string, PromptTemplate>();

/**
 * Load a template by name from the registry.
 * Requirements: 8.2 - validate that all required sections are present
 */
export function loadTemplate(name: string): PromptTemplate {
  const template = templateRegistry.get(name);
  if (!template) {
    throw new Error(`Template "${name}" not found in registry`);
  }

  const validation = validateTemplate(template);
  if (!validation.valid) {
    throw new Error(`Template "${name}" is invalid: ${validation.errors?.join(', ')}`);
  }

  return template;
}

/**
 * Validate that a template has all required sections and valid structure.
 * Requirements: 8.2 - validate that all required sections are present
 */
export function validateTemplate(template: PromptTemplate): ValidationResult {
  const errors: string[] = [];

  if (!template.name || template.name.trim() === '') {
    errors.push('Template must have a name');
  }

  if (!Array.isArray(template.sections)) {
    errors.push('Template must have a sections array');
  } else {
    // Check for duplicate section names
    const sectionNames = new Set<string>();
    for (const section of template.sections) {
      if (!section.name || section.name.trim() === '') {
        errors.push('Each section must have a name');
      } else if (sectionNames.has(section.name)) {
        errors.push(`Duplicate section name: "${section.name}"`);
      } else {
        sectionNames.add(section.name);
      }

      if (!['xml', 'markdown'].includes(section.delimiter)) {
        errors.push(`Invalid delimiter "${section.delimiter}" for section "${section.name}"`);
      }
    }

    // Check that all required sections have content
    for (const section of template.sections) {
      if (section.required && (!section.content || section.content.trim() === '')) {
        errors.push(`Required section "${section.name}" has no content`);
      }
    }
  }

  if (!Array.isArray(template.placeholders)) {
    errors.push('Template must have a placeholders array');
  } else {
    // Check for duplicate placeholder names
    const placeholderNames = new Set<string>();
    for (const placeholder of template.placeholders) {
      if (!placeholder.name || placeholder.name.trim() === '') {
        errors.push('Each placeholder must have a name');
      } else if (placeholderNames.has(placeholder.name)) {
        errors.push(`Duplicate placeholder name: "${placeholder.name}"`);
      } else {
        placeholderNames.add(placeholder.name);
      }

      if (!['string', 'array', 'object'].includes(placeholder.type)) {
        errors.push(`Invalid placeholder type "${placeholder.type}" for "${placeholder.name}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Render a template with placeholder values injected.
 * Requirements: 8.3 - use named placeholders that are type-checked
 */
export function renderTemplate(template: PromptTemplate, context: Record<string, unknown>): string {
  // Validate required placeholders are provided
  for (const placeholder of template.placeholders) {
    if (placeholder.required && !(placeholder.name in context)) {
      throw new Error(`Missing required placeholder: "${placeholder.name}"`);
    }

    // Type check the provided value
    if (placeholder.name in context) {
      const value = context[placeholder.name];
      if (!isValidPlaceholderValue(value, placeholder.type)) {
        throw new Error(
          `Invalid type for placeholder "${placeholder.name}": expected ${placeholder.type}`
        );
      }
    }
  }

  // Build the rendered output
  const parts: string[] = [];

  for (const section of template.sections) {
    const renderedContent = injectPlaceholders(section.content, context);
    const formattedSection = formatSection(section.name, renderedContent, section.delimiter);
    parts.push(formattedSection);
  }

  return parts.join('\n\n');
}

function isValidPlaceholderValue(value: unknown, expectedType: PlaceholderType): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

function injectPlaceholders(content: string, context: Record<string, unknown>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, name) => {
    if (!(name in context)) {
      return match; // Leave unmatched placeholders as-is
    }

    const value = context[name];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .join('\n');
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  });
}

function formatSection(name: string, content: string, delimiter: DelimiterType): string {
  if (delimiter === 'xml') {
    return `<${name}>\n${content}\n</${name}>`;
  }
  // markdown
  return `## ${name}\n\n${content}`;
}

// ============================================================================
// Serialization & Parsing (Round-Trip Support)
// Requirements: 8.5 - serialize/parse round-trip
// ============================================================================

// Serialization format markers
const TEMPLATE_HEADER = '---TEMPLATE---';
const SECTION_HEADER = '---SECTION---';
const PLACEHOLDER_HEADER = '---PLACEHOLDERS---';

/**
 * Serialize a template to a string format that can be parsed back.
 * Requirements: 8.5 - produce a string that can be parsed back
 */
export function serializeTemplate(template: PromptTemplate): string {
  const lines: string[] = [];

  // Header with template name
  lines.push(TEMPLATE_HEADER);
  lines.push(`name: ${template.name}`);
  lines.push('');

  // Placeholders section
  lines.push(PLACEHOLDER_HEADER);
  for (const placeholder of template.placeholders) {
    lines.push(`${placeholder.name}:${placeholder.type}:${placeholder.required}`);
  }
  lines.push('');

  // Sections
  for (const section of template.sections) {
    lines.push(SECTION_HEADER);
    lines.push(`name: ${section.name}`);
    lines.push(`delimiter: ${section.delimiter}`);
    lines.push(`required: ${section.required}`);
    lines.push('content:');
    // Indent content lines to preserve structure
    const contentLines = section.content.split('\n');
    for (const line of contentLines) {
      lines.push(`  ${line}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse a serialized template string back to a PromptTemplate.
 * Requirements: 8.5 - parse back to original template structure
 */
export function parseTemplate(content: string): PromptTemplate {
  const lines = content.split('\n');
  let index = 0;

  // Helper to read next non-empty line
  const readLine = (): string | null => {
    while (index < lines.length) {
      const line = lines[index++];
      if (line.trim() !== '') {
        return line;
      }
    }
    return null;
  };

  // Helper to peek at current line without advancing
  const peekLine = (): string | null => {
    let tempIndex = index;
    while (tempIndex < lines.length) {
      const line = lines[tempIndex++];
      if (line.trim() !== '') {
        return line;
      }
    }
    return null;
  };

  // Parse header
  const headerLine = readLine();
  if (headerLine !== TEMPLATE_HEADER) {
    throw new Error('Invalid template format: missing header');
  }

  const nameLine = readLine();
  if (!nameLine?.startsWith('name: ')) {
    throw new Error('Invalid template format: missing name');
  }
  const name = nameLine.slice(6);

  // Parse placeholders
  const placeholders: PlaceholderDef[] = [];
  const placeholderHeader = readLine();
  if (placeholderHeader !== PLACEHOLDER_HEADER) {
    throw new Error('Invalid template format: missing placeholders section');
  }

  while (peekLine() && !peekLine()?.startsWith(SECTION_HEADER)) {
    const line = readLine();
    if (line) {
      const parts = line.split(':');
      if (parts.length === 3) {
        placeholders.push({
          name: parts[0],
          type: parts[1] as PlaceholderType,
          required: parts[2] === 'true',
        });
      }
    }
  }

  // Parse sections
  const sections: PromptSection[] = [];
  while (peekLine() === SECTION_HEADER) {
    readLine(); // consume SECTION_HEADER

    const sectionNameLine = readLine();
    if (!sectionNameLine?.startsWith('name: ')) {
      throw new Error('Invalid section format: missing name');
    }
    const sectionName = sectionNameLine.slice(6);

    const delimiterLine = readLine();
    if (!delimiterLine?.startsWith('delimiter: ')) {
      throw new Error('Invalid section format: missing delimiter');
    }
    const delimiter = delimiterLine.slice(11) as DelimiterType;

    const requiredLine = readLine();
    if (!requiredLine?.startsWith('required: ')) {
      throw new Error('Invalid section format: missing required');
    }
    const required = requiredLine.slice(10) === 'true';

    const contentMarker = readLine();
    if (contentMarker !== 'content:') {
      throw new Error('Invalid section format: missing content marker');
    }

    // Read indented content lines
    const contentLines: string[] = [];
    while (index < lines.length) {
      const line = lines[index];
      // Check if this is a new section or end of content
      if (line.trim() === SECTION_HEADER || (line.trim() === '' && peekLine() === SECTION_HEADER)) {
        break;
      }
      // Remove 2-space indent if present
      if (line.startsWith('  ')) {
        contentLines.push(line.slice(2));
      } else if (line.trim() === '') {
        // Empty line within content
        contentLines.push('');
      } else {
        // Non-indented non-empty line means end of content
        break;
      }
      index++;
    }

    // Remove trailing empty lines from content
    while (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
      contentLines.pop();
    }

    sections.push({
      name: sectionName,
      delimiter,
      content: contentLines.join('\n'),
      required,
    });
  }

  return { name, sections, placeholders };
}

// ============================================================================
// Template Registration
// ============================================================================

/**
 * Register a template in the registry.
 */
export function registerTemplate(template: PromptTemplate): void {
  const validation = validateTemplate(template);
  if (!validation.valid) {
    throw new Error(`Cannot register invalid template: ${validation.errors?.join(', ')}`);
  }
  templateRegistry.set(template.name, template);
}

/**
 * Check if a template exists in the registry.
 */
export function hasTemplate(name: string): boolean {
  return templateRegistry.has(name);
}

/**
 * Get all registered template names.
 */
export function getTemplateNames(): string[] {
  return Array.from(templateRegistry.keys());
}

/**
 * Clear all templates from registry (useful for testing).
 */
export function clearTemplates(): void {
  templateRegistry.clear();
}

// ============================================================================
// Pre-defined Templates
// Requirements: 8.1 - use structured sections with clear delimiters
// Requirements: 8.4 - include explicit thinking instructions for CoT
// ============================================================================

/**
 * ReAct System Prompt Template
 * Used for the main agent loop with reasoning, action, and observation.
 */
export const REACT_SYSTEM: PromptTemplate = {
  name: 'REACT_SYSTEM',
  sections: [
    {
      name: 'system',
      delimiter: 'xml',
      content: `You are an AI assistant that uses the ReAct (Reasoning + Acting) pattern to help users.

For each request, you will:
1. THINK: Analyze the request and reason about what needs to be done
2. ACT: Select and invoke the appropriate tool
3. OBSERVE: Analyze the tool result to determine if the goal is achieved

Always explain your reasoning before taking action.`,
      required: true,
    },
    {
      name: 'tools',
      delimiter: 'xml',
      content: `Available tools:
{{tools}}

To use a tool, respond with:
<tool_call>
{"name": "tool_name", "parameters": {...}, "reasoning": "why this tool"}
</tool_call>`,
      required: true,
    },
    {
      name: 'context',
      delimiter: 'xml',
      content: `{{context}}`,
      required: false,
    },
    {
      name: 'thinking',
      delimiter: 'xml',
      content: `Before responding, think step by step:
1. What is the user's goal?
2. What information do I need?
3. Which tool is most appropriate?
4. What parameters should I use?

<thinking>
{{thinking_prompt}}
</thinking>`,
      required: true,
    },
    {
      name: 'goal',
      delimiter: 'xml',
      content: `Current goal: {{goal}}`,
      required: true,
    },
  ],
  placeholders: [
    { name: 'tools', type: 'string', required: true },
    { name: 'context', type: 'string', required: false },
    { name: 'thinking_prompt', type: 'string', required: false },
    { name: 'goal', type: 'string', required: true },
  ],
};

/**
 * Reflection Template
 * Used for analyzing failures and generating self-correction insights.
 */
export const REFLECTION: PromptTemplate = {
  name: 'REFLECTION',
  sections: [
    {
      name: 'system',
      delimiter: 'xml',
      content: `You are analyzing a failed action to understand what went wrong and how to improve.

Your task is to:
1. Identify the root cause of the failure
2. Explain why the approach didn't work
3. Suggest a specific fix or alternative approach`,
      required: true,
    },
    {
      name: 'failed_action',
      delimiter: 'xml',
      content: `Failed action:
Tool: {{tool_name}}
Parameters: {{tool_params}}
Reasoning: {{tool_reasoning}}`,
      required: true,
    },
    {
      name: 'error',
      delimiter: 'xml',
      content: `Error received:
{{error_message}}`,
      required: true,
    },
    {
      name: 'context',
      delimiter: 'xml',
      content: `Context at time of failure:
{{context}}`,
      required: false,
    },
    {
      name: 'instructions',
      delimiter: 'xml',
      content: `Provide your analysis in this format:
<analysis>
Root cause: [what went wrong]
Why it failed: [explanation]
Suggested fix: [specific actionable fix]
</analysis>`,
      required: true,
    },
  ],
  placeholders: [
    { name: 'tool_name', type: 'string', required: true },
    { name: 'tool_params', type: 'string', required: true },
    { name: 'tool_reasoning', type: 'string', required: true },
    { name: 'error_message', type: 'string', required: true },
    { name: 'context', type: 'string', required: false },
  ],
};

/**
 * Result Grading Template
 * Used for evaluating search result relevance in Agentic RAG.
 */
export const RESULT_GRADING: PromptTemplate = {
  name: 'RESULT_GRADING',
  sections: [
    {
      name: 'system',
      delimiter: 'xml',
      content: `You are evaluating search results for relevance to a user's query.

For each result, determine if it is RELEVANT or NOT_RELEVANT to answering the query.
A result is relevant if it contains information that directly helps answer the query.`,
      required: true,
    },
    {
      name: 'query',
      delimiter: 'xml',
      content: `User query: {{query}}`,
      required: true,
    },
    {
      name: 'context',
      delimiter: 'xml',
      content: `Additional context: {{context}}`,
      required: false,
    },
    {
      name: 'results',
      delimiter: 'xml',
      content: `Search results to evaluate:
{{results}}`,
      required: true,
    },
    {
      name: 'instructions',
      delimiter: 'xml',
      content: `For each result, respond with:
<grading>
<result index="N">
<relevance>RELEVANT or NOT_RELEVANT</relevance>
<confidence>0.0 to 1.0</confidence>
<reasoning>brief explanation</reasoning>
</result>
</grading>`,
      required: true,
    },
  ],
  placeholders: [
    { name: 'query', type: 'string', required: true },
    { name: 'context', type: 'string', required: false },
    { name: 'results', type: 'string', required: true },
  ],
};

/**
 * Query Rewrite Template
 * Used for improving search queries when initial results are poor.
 */
export const QUERY_REWRITE: PromptTemplate = {
  name: 'QUERY_REWRITE',
  sections: [
    {
      name: 'system',
      delimiter: 'xml',
      content: `You are improving a search query that returned poor results.

Your task is to rewrite the query to be more effective by:
- Using broader or more specific terms as appropriate
- Adding synonyms or related concepts
- Removing ambiguous terms
- Focusing on the core information need`,
      required: true,
    },
    {
      name: 'original_query',
      delimiter: 'xml',
      content: `Original query: {{original_query}}`,
      required: true,
    },
    {
      name: 'failed_results',
      delimiter: 'xml',
      content: `Results that were not relevant:
{{failed_results}}`,
      required: true,
    },
    {
      name: 'context',
      delimiter: 'xml',
      content: `User's actual information need: {{context}}`,
      required: false,
    },
    {
      name: 'instructions',
      delimiter: 'xml',
      content: `Provide a rewritten query:
<rewritten_query>your improved query here</rewritten_query>

Explain your changes:
<explanation>why this query should work better</explanation>`,
      required: true,
    },
  ],
  placeholders: [
    { name: 'original_query', type: 'string', required: true },
    { name: 'failed_results', type: 'string', required: true },
    { name: 'context', type: 'string', required: false },
  ],
};

/**
 * Context Compaction Template
 * Used for summarizing context when approaching token limits.
 */
export const CONTEXT_COMPACTION: PromptTemplate = {
  name: 'CONTEXT_COMPACTION',
  sections: [
    {
      name: 'system',
      delimiter: 'xml',
      content: `You are compacting conversation context to preserve essential information while reducing token count.

Preserve:
- Key decisions and their rationale
- User preferences and constraints
- Important facts and findings
- Error reflections and lessons learned

Remove:
- Verbose explanations that can be summarized
- Redundant information
- Intermediate steps that led to final conclusions`,
      required: true,
    },
    {
      name: 'grounding',
      delimiter: 'xml',
      content: `Current goal and state (MUST preserve):
{{grounding}}`,
      required: true,
    },
    {
      name: 'history',
      delimiter: 'xml',
      content: `Conversation history to compact:
{{history}}`,
      required: true,
    },
    {
      name: 'reflections',
      delimiter: 'xml',
      content: `Error reflections (MUST preserve):
{{reflections}}`,
      required: false,
    },
    {
      name: 'instructions',
      delimiter: 'xml',
      content: `Provide a compacted summary:
<compacted>
<key_decisions>bullet points of important decisions</key_decisions>
<findings>essential facts discovered</findings>
<summary>brief narrative of progress</summary>
</compacted>`,
      required: true,
    },
  ],
  placeholders: [
    { name: 'grounding', type: 'string', required: true },
    { name: 'history', type: 'string', required: true },
    { name: 'reflections', type: 'string', required: false },
  ],
};

// ============================================================================
// Template Collection Export
// ============================================================================

export const TEMPLATES = {
  REACT_SYSTEM,
  REFLECTION,
  RESULT_GRADING,
  QUERY_REWRITE,
  CONTEXT_COMPACTION,
} as const;

// Register all pre-defined templates on module load
for (const template of Object.values(TEMPLATES)) {
  registerTemplate(template);
}
