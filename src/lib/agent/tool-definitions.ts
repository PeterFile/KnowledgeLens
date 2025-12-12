// Tool Definitions - Structured tool schemas for the agent system
// Requirements: 2.1, 2.2, 2.3

import type { ToolSchema } from './types';

/**
 * Tool: explain_text_with_context
 * Explains selected text using surrounding page context
 */
export const EXPLAIN_TEXT_TOOL: ToolSchema = {
  name: 'explain_text_with_context',
  description: `Explains selected text by analyzing it within its surrounding context from the webpage.
Use this tool when the user wants to understand a specific piece of text, term, concept, or phrase.
The tool considers the context before and after the selection to provide accurate explanations.`,
  parameters: {
    type: 'object',
    properties: {
      selectedText: {
        type: 'string',
        description: 'The text that the user has selected and wants explained',
      },
      contextBefore: {
        type: 'string',
        description: 'Text appearing before the selection (up to 500 chars) for context',
      },
      contextAfter: {
        type: 'string',
        description: 'Text appearing after the selection (up to 500 chars) for context',
      },
      pageTitle: {
        type: 'string',
        description: 'Title of the webpage for additional context',
      },
    },
    required: ['selectedText'],
  },
  examples: [
    {
      input: {
        selectedText: 'quantum entanglement',
        contextBefore: 'Einstein famously called',
        contextAfter: '"spooky action at a distance"',
        pageTitle: 'Introduction to Quantum Physics',
      },
      description: 'Explain a physics concept with surrounding context',
    },
    {
      input: {
        selectedText: 'He kicked the bucket',
        contextBefore: 'After years of illness,',
        contextAfter: 'leaving behind a legacy.',
      },
      description: 'Explain an idiom in context',
    },
  ],
};

/**
 * Tool: search_web_for_info
 * Searches the web for additional information about a topic
 */
export const SEARCH_WEB_TOOL: ToolSchema = {
  name: 'search_web_for_info',
  description: `Searches the web for additional information about a topic or query.
Use this tool when you need external information to answer a question or provide context.
Returns relevant search results with titles, snippets, and source URLs.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant information',
      },
      context: {
        type: 'string',
        description: 'Optional context about why this search is being performed',
      },
    },
    required: ['query'],
  },
  examples: [
    {
      input: {
        query: 'quantum entanglement explanation simple',
        context: 'User wants to understand a physics concept',
      },
      description: 'Search for explanatory content about a concept',
    },
    {
      input: {
        query: 'React useEffect cleanup function',
      },
      description: 'Search for technical documentation',
    },
  ],
};

/**
 * Tool: summarize_page_content
 * Summarizes the content of a webpage
 */
export const SUMMARIZE_PAGE_TOOL: ToolSchema = {
  name: 'summarize_page_content',
  description: `Summarizes the main content of a webpage.
Use this tool when the user wants a quick overview of what a page is about.
Extracts key points, main arguments, and important information.`,
  parameters: {
    type: 'object',
    properties: {
      pageContent: {
        type: 'string',
        description: 'The extracted text content from the webpage',
      },
      pageTitle: {
        type: 'string',
        description: 'Title of the webpage',
      },
      pageUrl: {
        type: 'string',
        description: 'URL of the webpage for reference',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum length of the summary in words (default: 200)',
      },
    },
    required: ['pageContent'],
  },
  examples: [
    {
      input: {
        pageContent: 'Article text about climate change...',
        pageTitle: 'Climate Change: What You Need to Know',
        maxLength: 150,
      },
      description: 'Summarize a news article',
    },
  ],
};

/**
 * Tool: extract_screenshot_text
 * Extracts and analyzes text from a screenshot using vision AI
 */
export const EXTRACT_SCREENSHOT_TOOL: ToolSchema = {
  name: 'extract_screenshot_text',
  description: `Extracts and analyzes text and visual content from a screenshot.
Use this tool when the user captures a screenshot and wants to understand or extract information from it.
Can identify text, diagrams, code, tables, and other visual elements.`,
  parameters: {
    type: 'object',
    properties: {
      imageBase64: {
        type: 'string',
        description: 'Base64-encoded image data from the screenshot',
      },
      analysisType: {
        type: 'string',
        description: 'Type of analysis to perform',
        enum: ['text_extraction', 'code_extraction', 'diagram_analysis', 'general'],
      },
      additionalContext: {
        type: 'string',
        description: 'Additional context about what the user is looking for',
      },
    },
    required: ['imageBase64'],
  },
  examples: [
    {
      input: {
        imageBase64: 'data:image/png;base64,...',
        analysisType: 'code_extraction',
        additionalContext: 'Extract the Python code from this screenshot',
      },
      description: 'Extract code from a screenshot',
    },
    {
      input: {
        imageBase64: 'data:image/png;base64,...',
        analysisType: 'diagram_analysis',
      },
      description: 'Analyze a diagram or flowchart',
    },
  ],
};

/**
 * Tool: grade_search_results
 * Grades search results for relevance to a query (Agentic RAG)
 */
export const GRADE_SEARCH_RESULTS_TOOL: ToolSchema = {
  name: 'grade_search_results',
  description: `Evaluates search results for relevance to the original query.
Use this tool as part of Agentic RAG to filter out irrelevant results before generating a response.
Returns a relevance grade (relevant/not_relevant) with confidence score and reasoning.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The original search query',
      },
      results: {
        type: 'array',
        description: 'Array of search results to grade',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            snippet: { type: 'string' },
            url: { type: 'string' },
          },
        },
      },
      context: {
        type: 'string',
        description: 'Additional context about what the user is looking for',
      },
    },
    required: ['query', 'results'],
  },
  examples: [
    {
      input: {
        query: 'React hooks best practices',
        results: [
          {
            title: 'React Hooks Documentation',
            snippet: 'Learn about useState, useEffect...',
            url: 'https://react.dev/hooks',
          },
        ],
        context: 'User is learning React development',
      },
      description: 'Grade search results for a technical query',
    },
  ],
};

/**
 * Tool: rewrite_search_query
 * Rewrites a search query for better results (Agentic RAG)
 */
export const REWRITE_SEARCH_QUERY_TOOL: ToolSchema = {
  name: 'rewrite_search_query',
  description: `Rewrites a search query to improve result quality.
Use this tool when initial search results are not relevant enough.
Generates alternative queries using broader terms, synonyms, or related concepts.`,
  parameters: {
    type: 'object',
    properties: {
      originalQuery: {
        type: 'string',
        description: 'The original search query that produced poor results',
      },
      failedResults: {
        type: 'array',
        description: 'The results that were graded as not relevant',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            snippet: { type: 'string' },
            reasoning: { type: 'string' },
          },
        },
      },
      context: {
        type: 'string',
        description: 'Context about what the user is actually looking for',
      },
    },
    required: ['originalQuery'],
  },
  examples: [
    {
      input: {
        originalQuery: 'JS closure memory leak',
        failedResults: [
          {
            title: 'JavaScript Basics',
            snippet: 'Introduction to variables...',
            reasoning: 'Too basic, not about closures or memory',
          },
        ],
        context: 'User wants to understand memory issues with closures',
      },
      description: 'Rewrite a query that returned irrelevant results',
    },
  ],
};

/**
 * All tool schemas for easy registration
 */
export const ALL_TOOL_SCHEMAS: ToolSchema[] = [
  EXPLAIN_TEXT_TOOL,
  SEARCH_WEB_TOOL,
  SUMMARIZE_PAGE_TOOL,
  EXTRACT_SCREENSHOT_TOOL,
  GRADE_SEARCH_RESULTS_TOOL,
  REWRITE_SEARCH_QUERY_TOOL,
];

/**
 * Get a tool schema by name
 */
export function getToolDefinition(name: string): ToolSchema | undefined {
  return ALL_TOOL_SCHEMAS.find((schema) => schema.name === name);
}
