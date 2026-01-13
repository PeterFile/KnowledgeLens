// Agentic RAG - Search with result grading and query rewriting
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5

import type { LLMConfig, LLMResponse, SearchConfig, SearchResult } from '../../types';
import type {
  GradedResult,
  AgenticRAGConfig,
  RAGResult,
  StatusCallback,
  RelevanceGrade,
} from './types';
import { callLLMWithMessages, searchWeb } from '../api';
import { renderTemplate, RESULT_GRADING, QUERY_REWRITE } from './prompts';

// ============================================================================
// Token Usage Tracking
// ============================================================================

interface TokenAccumulator {
  input: number;
  output: number;
}

function addTokenUsage(accumulator: TokenAccumulator, response: LLMResponse): void {
  if (response.usage) {
    accumulator.input += response.usage.promptTokens;
    accumulator.output += response.usage.completionTokens;
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RAG_CONFIG: AgenticRAGConfig = {
  maxRetries: 2,
  relevanceThreshold: 0.5, // 50% of results must be relevant
};

// ============================================================================
// Result Grading
// Requirements: 4.1 - Grade each result for relevance (relevant/not relevant)
// ============================================================================

/** Result from gradeResults including token usage */
export interface GradeResultsOutput {
  gradedResults: GradedResult[];
  tokenUsage: TokenAccumulator;
}

/**
 * Grade search results for relevance to the query.
 * Each result is assigned a relevance grade with confidence and reasoning.
 * Returns both graded results and token usage for tracking.
 */
export async function gradeResults(
  results: SearchResult[],
  query: string,
  context: string,
  llmConfig: LLMConfig,
  signal?: AbortSignal
): Promise<GradeResultsOutput> {
  const tokenUsage: TokenAccumulator = { input: 0, output: 0 };

  if (results.length === 0) {
    return { gradedResults: [], tokenUsage };
  }

  // Format results for the prompt
  const formattedResults = results
    .map((r, i) => `[${i}] Title: ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.url}`)
    .join('\n\n');

  // Render the grading prompt
  const prompt = renderTemplate(RESULT_GRADING, {
    query,
    context: context || 'No additional context provided',
    results: formattedResults,
  });

  // Call LLM to grade results
  let response = '';
  const llmResponse = await callLLMWithMessages(
    [
      { role: 'system', content: 'You are a search result relevance evaluator.' },
      { role: 'user', content: prompt },
    ],
    llmConfig,
    (chunk) => {
      response += chunk;
    },
    signal
  );
  addTokenUsage(tokenUsage, llmResponse);

  // Parse the grading response
  return { gradedResults: parseGradingResponse(response, results), tokenUsage };
}

/**
 * Parse the LLM grading response into GradedResult objects.
 * Uses flexible regex to handle LLM output variations (single/double quotes, spaces).
 * Exported for testing purposes.
 */
export function parseGradingResponse(response: string, results: SearchResult[]): GradedResult[] {
  const gradedResults: GradedResult[] = [];

  // Flexible regex to handle LLM output variations:
  // - Single or double quotes: index="1" or index='1'
  // - Optional spaces: index = "1" or index="1"
  // - No quotes: index=1
  const resultPattern = /<result[^>]*index\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)<\/result>/gi;
  let match;

  while ((match = resultPattern.exec(response)) !== null) {
    const index = parseInt(match[1], 10);
    const content = match[2];

    if (index >= 0 && index < results.length) {
      const relevance = extractTagContent(content, 'relevance');
      const confidence = extractTagContent(content, 'confidence');
      const reasoning = extractTagContent(content, 'reasoning');

      gradedResults.push({
        result: results[index],
        relevance: parseRelevance(relevance),
        confidence: parseConfidence(confidence),
        reasoning: reasoning || 'No reasoning provided',
      });
    }
  }

  // If parsing failed, return all results as relevant with low confidence
  // This ensures graceful degradation
  if (gradedResults.length === 0) {
    return results.map((result) => ({
      result,
      relevance: 'relevant' as RelevanceGrade,
      confidence: 0.5,
      reasoning: 'Grading response could not be parsed; defaulting to relevant',
    }));
  }

  return gradedResults;
}

/** Extract content from XML-like tags. Exported for testing. */
export function extractTagContent(text: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = text.match(pattern);
  return match ? match[1].trim() : '';
}

/** Parse relevance string to RelevanceGrade. Exported for testing. */
export function parseRelevance(value: string): RelevanceGrade {
  const normalized = value.toUpperCase().trim();
  return normalized === 'NOT_RELEVANT' ? 'not_relevant' : 'relevant';
}

/** Parse confidence string to number [0, 1]. Exported for testing. */
export function parseConfidence(value: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return 0.5;
  return Math.max(0, Math.min(1, parsed));
}

// ============================================================================
// Query Rewriting
// Requirements: 4.2, 4.3 - Rewrite query when results are poor
// ============================================================================

/** Result from rewriteQuery including token usage */
export interface RewriteQueryOutput {
  query: string;
  tokenUsage: TokenAccumulator;
}

/**
 * Rewrite a search query to improve results.
 * Uses different search strategy (broader terms, synonyms, related concepts).
 * Returns both the new query and token usage for tracking.
 */
export async function rewriteQuery(
  originalQuery: string,
  failedResults: GradedResult[],
  context: string,
  llmConfig: LLMConfig,
  signal?: AbortSignal
): Promise<RewriteQueryOutput> {
  const tokenUsage: TokenAccumulator = { input: 0, output: 0 };

  // Format failed results for the prompt
  const formattedFailedResults = failedResults
    .filter((r) => r.relevance === 'not_relevant')
    .map(
      (r, i) =>
        `[${i}] Title: ${r.result.title}\nSnippet: ${r.result.snippet}\nReason not relevant: ${r.reasoning}`
    )
    .join('\n\n');

  // Render the query rewrite prompt
  const prompt = renderTemplate(QUERY_REWRITE, {
    original_query: originalQuery,
    failed_results: formattedFailedResults || 'No specific failed results',
    context: context || 'No additional context',
  });

  // Call LLM to rewrite query
  let response = '';
  const llmResponse = await callLLMWithMessages(
    [
      { role: 'system', content: 'You are a search query optimization expert.' },
      { role: 'user', content: prompt },
    ],
    llmConfig,
    (chunk) => {
      response += chunk;
    },
    signal
  );
  addTokenUsage(tokenUsage, llmResponse);

  // Extract the rewritten query
  const rewrittenQuery = extractTagContent(response, 'rewritten_query');

  // If extraction failed, try to use the response directly (fallback)
  if (!rewrittenQuery) {
    // Take first line that looks like a query (not too long, no XML tags)
    const lines = response.split('\n').filter((l) => l.trim() && !l.includes('<'));
    if (lines.length > 0 && lines[0].length < 200) {
      return { query: lines[0].trim(), tokenUsage };
    }
    // Last resort: return original query with slight modification
    return { query: `${originalQuery} explained`, tokenUsage };
  }

  return { query: rewrittenQuery, tokenUsage };
}

// ============================================================================
// Agentic RAG Main Function
// Requirements: 4.4, 4.5 - Execute RAG with self-correction and fallback
// ============================================================================

/**
 * Check if a query already exists in history (case-insensitive, trimmed).
 * Prevents infinite loops when LLM generates duplicate queries.
 */
function isDuplicateQuery(query: string, history: string[]): boolean {
  const normalized = query.toLowerCase().trim();
  return history.some((q) => q.toLowerCase().trim() === normalized);
}

/**
 * Execute Agentic RAG with result grading, query rewriting, and fallback.
 *
 * Flow:
 * 1. Search with original query
 * 2. Grade results for relevance
 * 3. If majority not relevant, rewrite query and retry (up to maxRetries)
 * 4. If all retries fail, fall back to LLM-only with disclaimer
 * 5. Return only relevant results with citations
 */
export async function agenticRAG(
  query: string,
  context: string,
  config: AgenticRAGConfig,
  llmConfig: LLMConfig,
  searchConfig: SearchConfig,
  onStatus?: StatusCallback,
  signal?: AbortSignal
): Promise<RAGResult> {
  const queryHistory: string[] = [query];
  let currentQuery = query;
  let attempts = 0;
  let lastGradedResults: GradedResult[] = [];
  const totalTokenUsage: TokenAccumulator = { input: 0, output: 0 };

  while (attempts <= config.maxRetries) {
    // Update status: searching
    onStatus?.({
      phase: 'executing',
      stepNumber: attempts + 1,
      maxSteps: config.maxRetries + 1,
      tokenUsage: { ...totalTokenUsage },
      currentTool: 'search_web_for_info',
    });

    try {
      // Step 1: Search
      const searchResults = await searchWeb(currentQuery, searchConfig, signal);

      if (searchResults.length === 0) {
        // No results, try rewriting
        attempts++;
        if (attempts <= config.maxRetries) {
          const rewriteOutput = await rewriteQuery(currentQuery, [], context, llmConfig, signal);
          addTokenUsage(totalTokenUsage, {
            content: '',
            usage: {
              promptTokens: rewriteOutput.tokenUsage.input,
              completionTokens: rewriteOutput.tokenUsage.output,
            },
          });

          // Check for duplicate query to prevent infinite loops
          if (isDuplicateQuery(rewriteOutput.query, queryHistory)) {
            // LLM generated same query, force termination
            break;
          }
          currentQuery = rewriteOutput.query;
          queryHistory.push(currentQuery);
          continue;
        }
        break;
      }

      // Update status: grading
      onStatus?.({
        phase: 'analyzing',
        stepNumber: attempts + 1,
        maxSteps: config.maxRetries + 1,
        tokenUsage: { ...totalTokenUsage },
        currentTool: 'grade_search_results',
      });

      // Step 2: Grade results
      const gradeOutput = await gradeResults(
        searchResults,
        currentQuery,
        context,
        llmConfig,
        signal
      );
      addTokenUsage(totalTokenUsage, {
        content: '',
        usage: {
          promptTokens: gradeOutput.tokenUsage.input,
          completionTokens: gradeOutput.tokenUsage.output,
        },
      });
      lastGradedResults = gradeOutput.gradedResults;

      // Step 3: Check relevance threshold
      const relevantCount = gradeOutput.gradedResults.filter(
        (r) => r.relevance === 'relevant'
      ).length;
      const relevanceRatio = relevantCount / gradeOutput.gradedResults.length;

      if (relevanceRatio >= config.relevanceThreshold) {
        // Success: return relevant results
        return {
          relevantResults: gradeOutput.gradedResults.filter((r) => r.relevance === 'relevant'),
          queryHistory,
          fallbackUsed: false,
        };
      }

      // Not enough relevant results, try rewriting
      attempts++;
      if (attempts <= config.maxRetries) {
        // Update status: rewriting
        onStatus?.({
          phase: 'thinking',
          stepNumber: attempts + 1,
          maxSteps: config.maxRetries + 1,
          tokenUsage: { ...totalTokenUsage },
          currentTool: 'rewrite_search_query',
        });

        const rewriteOutput = await rewriteQuery(
          currentQuery,
          gradeOutput.gradedResults,
          context,
          llmConfig,
          signal
        );
        addTokenUsage(totalTokenUsage, {
          content: '',
          usage: {
            promptTokens: rewriteOutput.tokenUsage.input,
            completionTokens: rewriteOutput.tokenUsage.output,
          },
        });

        // Check for duplicate query to prevent infinite loops
        if (isDuplicateQuery(rewriteOutput.query, queryHistory)) {
          // LLM generated same query, force termination
          break;
        }
        currentQuery = rewriteOutput.query;
        queryHistory.push(currentQuery);
      }
    } catch {
      // Search or grading failed, try again or fall back
      attempts++;
      if (attempts > config.maxRetries) {
        break;
      }
    }
  }

  // All retries exhausted: fall back to LLM-only
  // Requirements: 4.4 - Fall back with disclaimer
  const relevantFromLastAttempt = lastGradedResults.filter((r) => r.relevance === 'relevant');

  return {
    relevantResults: relevantFromLastAttempt,
    queryHistory,
    fallbackUsed: true,
    disclaimer:
      "Search results were limited or not relevant. Response may rely on the AI's internal knowledge, which could be outdated or incomplete.",
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate the relevance ratio of graded results.
 */
export function calculateRelevanceRatio(gradedResults: GradedResult[]): number {
  if (gradedResults.length === 0) return 0;
  const relevantCount = gradedResults.filter((r) => r.relevance === 'relevant').length;
  return relevantCount / gradedResults.length;
}

/**
 * Filter graded results to only include relevant ones.
 * Requirements: 4.5 - Only cite sources graded as relevant
 */
export function filterRelevantResults(gradedResults: GradedResult[]): GradedResult[] {
  return gradedResults.filter((r) => r.relevance === 'relevant');
}

/**
 * Format relevant results for citation in final response.
 */
export function formatResultsForCitation(relevantResults: GradedResult[]): string {
  if (relevantResults.length === 0) {
    return 'No relevant sources found.';
  }

  return relevantResults
    .map((r, i) => `[${i + 1}] ${r.result.title}\n${r.result.snippet}\nSource: ${r.result.url}`)
    .join('\n\n');
}
