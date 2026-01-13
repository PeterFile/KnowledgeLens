// Tool Handlers - Implementation of tool handlers for the agent system
// Requirements: 6.1, 6.2, 6.4

import type { ToolResult, ToolHandler } from './types';
import type { LLMConfig, SearchConfig } from '../../types';
import { getToolSchema, registerTool } from './tools';
import { SEARCH_WEB_TOOL } from './tool-definitions';

// ============================================================================
// Tool Handler Context
// ============================================================================

/**
 * Context required for tool handlers that need external configuration.
 * This is set during agent initialization.
 */
interface ToolHandlerContext {
  llmConfig: LLMConfig;
  searchConfig?: SearchConfig;
}

let toolHandlerContext: ToolHandlerContext | null = null;
type SearchEnhancementModule = typeof import('./search-enhancement');
let searchEnhancementPromise: Promise<SearchEnhancementModule> | null = null;

async function loadSearchEnhancement(): Promise<SearchEnhancementModule> {
  if (!searchEnhancementPromise) {
    searchEnhancementPromise = import('./search-enhancement').catch((error) => {
      searchEnhancementPromise = null;
      throw error;
    });
  }
  return searchEnhancementPromise;
}

/**
 * Set the context for tool handlers.
 * Must be called before executing tools that require configuration.
 */
export function setToolHandlerContext(context: ToolHandlerContext): void {
  toolHandlerContext = context;
}

/**
 * Get the current tool handler context.
 */
export function getToolHandlerContext(): ToolHandlerContext | null {
  return toolHandlerContext;
}

/**
 * Clear the tool handler context.
 */
export function clearToolHandlerContext(): void {
  toolHandlerContext = null;
}

// ============================================================================
// Search Web Tool Handler
// Requirements: 6.1, 6.2, 6.4
// ============================================================================

/**
 * Handler for the search_web_for_info tool.
 * Uses enhancedSearch() to combine memory retrieval with web search.
 * Requirements: 6.1, 6.2, 6.4
 */
export const searchWebHandler: ToolHandler = async (
  params: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ToolResult> => {
  const query = params.query as string;
  // Note: context parameter is available for future use in query refinement
  // const context = params.context as string | undefined;

  if (!query || typeof query !== 'string') {
    return {
      success: false,
      error: 'Missing required parameter: query',
      tokenCount: 0,
    };
  }

  // Get tool handler context for configuration
  const handlerContext = getToolHandlerContext();
  if (!handlerContext) {
    return {
      success: false,
      error: 'Tool handler context not initialized. LLM configuration required.',
      tokenCount: 0,
    };
  }

  if (!handlerContext.searchConfig) {
    return {
      success: false,
      error: 'Search configuration not available. Please configure search settings.',
      tokenCount: 0,
    };
  }

  try {
    const { enhancedSearch, formatCitations } = await loadSearchEnhancement();
    // Use enhancedSearch to combine memory + web search
    // Requirements: 6.1 - Query memory first, then web search
    const result = await enhancedSearch(
      query,
      handlerContext.searchConfig,
      handlerContext.llmConfig,
      signal
    );

    // Format the output with citations
    // Requirements: 6.4 - Clear source labeling
    const formattedCitations = formatCitations(result.citations);

    // Build the response data
    const responseData = {
      synthesizedAnswer: result.synthesizedAnswer,
      webResultsCount: result.webResults.length,
      memoryResultsCount: result.memoryResults.length,
      citations: formattedCitations,
      conflictDisclaimer: result.conflictDisclaimer,
      // Include raw results for further processing if needed
      webResults: result.webResults.map((r) => ({
        title: r.title,
        snippet: r.snippet,
        url: r.url,
      })),
      memoryResults: result.memoryResults.map((r) => ({
        title: r.document.title,
        content: r.document.content.slice(0, 200) + '...',
        sourceUrl: r.document.sourceUrl,
        score: r.score,
      })),
    };

    // Estimate token count based on response size
    const tokenCount = Math.ceil(JSON.stringify(responseData).length / 4);

    return {
      success: true,
      data: responseData,
      tokenCount,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
      tokenCount: 0,
    };
  }
};

// ============================================================================
// Tool Registration
// ============================================================================

/**
 * Register all tool handlers with the tool registry.
 * Should be called during agent initialization.
 */
export function registerToolHandlers(): void {
  registerTool(SEARCH_WEB_TOOL, searchWebHandler);
}

/**
 * Check if tool handlers are registered.
 */
let handlersRegistered = false;

/**
 * Ensure tool handlers are registered (idempotent).
 */
export function ensureToolHandlersRegistered(): void {
  const toolMissing = !getToolSchema(SEARCH_WEB_TOOL.name);
  if (!handlersRegistered || toolMissing) {
    registerToolHandlers();
    handlersRegistered = true;
  }
}
