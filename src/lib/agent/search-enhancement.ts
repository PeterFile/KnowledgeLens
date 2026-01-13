// Search Enhancement Module for Agent Memory Integration
// Integrates memory retrieval with web search for enhanced results
// Requirements: 6.1, 6.2, 6.3, 6.4

import type {
  ChatMessage,
  LLMConfig,
  SearchConfig,
  SearchResult as WebSearchResult,
} from '../../types';
import type { SearchResult as MemorySearchResult } from '../memory/types';
import { getMemoryManager } from '../memory';
import { searchWeb } from '../search';
import { callLLMWithMessages } from '../llm';

// ============================================================================
// Types
// ============================================================================

export interface Citation {
  index: number;
  source: 'web' | 'memory';
  url: string;
  title: string;
}

export interface EnhancedSearchResult {
  webResults: WebSearchResult[];
  memoryResults: MemorySearchResult[];
  synthesizedAnswer: string;
  citations: Citation[];
  conflictDisclaimer?: string;
}

// ============================================================================
// Memory Retrieval
// ============================================================================

/**
 * Retrieve related memory before web search.
 * Requirements: 6.1
 */
export async function retrieveRelatedMemory(
  query: string,
  limit = 5
): Promise<MemorySearchResult[]> {
  try {
    const memoryManager = await getMemoryManager();
    const results = await memoryManager.search(query, {
      limit,
      mode: 'hybrid',
      filters: { docType: 'content' },
    });
    return results;
  } catch (error) {
    console.warn('Failed to retrieve memory:', error);
    return [];
  }
}

// ============================================================================
// Citation Formatting
// ============================================================================

/**
 * Format citations with clear source labeling.
 * Requirements: 6.4
 */
export function formatCitations(citations: Citation[]): string {
  if (citations.length === 0) return '';

  const lines = citations.map((c) => {
    const sourceLabel = c.source === 'web' ? '[Web Source]' : '[Knowledge Base]';
    return `[${c.index}] ${sourceLabel} ${c.title}\n    ${c.url}`;
  });

  return lines.join('\n');
}

/**
 * Build citations from web and memory results.
 */
function buildCitations(
  webResults: WebSearchResult[],
  memoryResults: MemorySearchResult[]
): Citation[] {
  const citations: Citation[] = [];
  let index = 1;

  // Memory results first (they're from user's knowledge base)
  for (const result of memoryResults) {
    citations.push({
      index: index++,
      source: 'memory',
      url: result.document.sourceUrl,
      title: result.document.title,
    });
  }

  // Then web results
  for (const result of webResults) {
    citations.push({
      index: index++,
      source: 'web',
      url: result.url,
      title: result.title,
    });
  }

  return citations;
}

// ============================================================================
// Synthesis with Memory
// ============================================================================

const SYNTHESIS_SYSTEM_PROMPT = `You are a helpful assistant that synthesizes information from multiple sources.
You will be given a user query, results from the user's knowledge base (previously read content), and web search results.

Your task:
1. Synthesize a comprehensive answer using both sources
2. Cite sources using [N] notation where N is the source number
3. If you notice any conflicts between sources, mention them briefly
4. Prioritize accuracy and cite specific sources for claims

Format your response as:
- A clear, well-structured answer with inline citations [N]
- If conflicts exist, add a brief note about the discrepancy`;

/**
 * Build context from memory and web results for synthesis.
 */
function buildSynthesisContext(
  query: string,
  webResults: WebSearchResult[],
  memoryResults: MemorySearchResult[],
  citations: Citation[]
): string {
  const parts: string[] = [];

  parts.push(`User Query: ${query}\n`);

  // Knowledge base results
  if (memoryResults.length > 0) {
    parts.push('=== From Your Knowledge Base ===');
    for (const result of memoryResults) {
      const citation = citations.find(
        (c) => c.source === 'memory' && c.url === result.document.sourceUrl
      );
      if (citation) {
        parts.push(`[${citation.index}] ${result.document.title}`);
        parts.push(`Source: ${result.document.sourceUrl}`);
        parts.push(`Content: ${result.document.content}`);
        parts.push('');
      }
    }
  }

  // Web search results
  if (webResults.length > 0) {
    parts.push('=== From Web Search ===');
    for (const result of webResults) {
      const citation = citations.find((c) => c.source === 'web' && c.url === result.url);
      if (citation) {
        parts.push(`[${citation.index}] ${result.title}`);
        parts.push(`Source: ${result.url}`);
        parts.push(`Content: ${result.snippet}`);
        parts.push('');
      }
    }
  }

  return parts.join('\n');
}

/**
 * Detect if there's a conflict disclaimer in the LLM response.
 */
function extractConflictDisclaimer(response: string): string | undefined {
  // Look for common conflict indicators
  const conflictPatterns = [
    /(?:however|note|importantly|discrepancy|conflict|differs?|contradict)[^.]*\./gi,
    /(?:the sources? (?:disagree|differ|conflict))[^.]*\./gi,
  ];

  for (const pattern of conflictPatterns) {
    const match = response.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return undefined;
}

/**
 * Synthesize web + memory results with conflict detection.
 * Requirements: 6.2, 6.3, 6.4
 */
export async function synthesizeWithMemory(
  query: string,
  webResults: WebSearchResult[],
  memoryResults: MemorySearchResult[],
  llmConfig: LLMConfig,
  signal?: AbortSignal
): Promise<{
  answer: string;
  citations: Citation[];
  conflictDisclaimer?: string;
}> {
  const citations = buildCitations(webResults, memoryResults);

  // If no results at all, return a simple message
  if (webResults.length === 0 && memoryResults.length === 0) {
    return {
      answer: 'No relevant information found from your knowledge base or web search.',
      citations: [],
    };
  }

  const context = buildSynthesisContext(query, webResults, memoryResults, citations);

  const messages: ChatMessage[] = [
    { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
    { role: 'user', content: context },
  ];

  let answer = '';
  const response = await callLLMWithMessages(
    messages,
    llmConfig,
    (chunk) => {
      answer += chunk;
    },
    signal
  );

  answer = response.content || answer;
  const conflictDisclaimer = extractConflictDisclaimer(answer);

  return {
    answer,
    citations,
    conflictDisclaimer,
  };
}

// ============================================================================
// Enhanced Search Main Function
// ============================================================================

/**
 * Enhanced search orchestrating memory + web search.
 * Called from: tools.ts (search_web_for_info), FloatingPanel.tsx (selection search)
 * Requirements: 6.1, 6.2, 6.4
 */
export async function enhancedSearch(
  query: string,
  webSearchConfig: SearchConfig,
  llmConfig: LLMConfig,
  signal?: AbortSignal
): Promise<EnhancedSearchResult> {
  // Step 1: Retrieve from memory first (Requirements: 6.1)
  const memoryResults = await retrieveRelatedMemory(query);

  // Step 2: Perform web search
  let webResults: WebSearchResult[] = [];
  try {
    webResults = await searchWeb(query, webSearchConfig, signal);
  } catch (error) {
    console.warn('Web search failed:', error);
    // Continue with memory results only
  }

  // Step 3: Synthesize results (Requirements: 6.2, 6.3)
  const { answer, citations, conflictDisclaimer } = await synthesizeWithMemory(
    query,
    webResults,
    memoryResults,
    llmConfig,
    signal
  );

  return {
    webResults,
    memoryResults,
    synthesizedAnswer: answer,
    citations,
    conflictDisclaimer,
  };
}
