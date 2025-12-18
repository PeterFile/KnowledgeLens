import type { ChatMessage, LLMConfig, SearchConfig, SearchResult } from '../../types';
import { API_ENDPOINTS, getFastModel } from '../llm/constants';
import { callLLMWithMessages } from '../llm';

/**
 * Search the web using configured search provider
 */
export async function searchWeb(
  query: string,
  config: SearchConfig,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  switch (config.provider) {
    case 'serpapi':
      return searchWithSerpApi(query, config.apiKey, signal);
    case 'google':
      if (!config.searchEngineId) {
        throw new Error('Google Custom Search requires searchEngineId (cx)');
      }
      return searchWithGoogleCustomSearch(query, config.apiKey, config.searchEngineId, signal);
    default:
      throw new Error(`Unsupported search provider: ${config.provider}`);
  }
}

/**
 * SerpApi search implementation
 */
async function searchWithSerpApi(
  query: string,
  apiKey: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    api_key: apiKey,
    engine: 'google',
    num: '5',
  });

  const response = await fetch(`${API_ENDPOINTS.serpapi}?${params}`, { signal });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SerpApi error: ${response.status} - ${error}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;
  const results = data.organic_results ?? [];

  return results.slice(0, 5).map((r: Record<string, string>) => ({
    title: r.title ?? '',
    snippet: r.snippet ?? '',
    url: r.link ?? '',
  }));
}

/**
 * Google Custom Search implementation
 */
async function searchWithGoogleCustomSearch(
  query: string,
  apiKey: string,
  searchEngineId: string,
  signal?: AbortSignal
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    key: apiKey,
    cx: searchEngineId,
    num: '5',
  });

  const response = await fetch(`${API_ENDPOINTS.google}?${params}`, { signal });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google Custom Search error: ${response.status} - ${error}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;
  const items = data.items ?? [];

  return items.slice(0, 5).map((item: Record<string, string>) => ({
    title: item.title ?? '',
    snippet: item.snippet ?? '',
    url: item.link ?? '',
  }));
}

/**
 * Build a search-enhanced prompt combining selected text with search results
 */
export function buildSearchEnhancedPrompt(
  selectedText: string,
  searchResults: SearchResult[]
): string {
  const searchContext = searchResults
    .map(
      (result, index) => `[${index + 1}] ${result.title}\n${result.snippet}\nSource: ${result.url}`
    )
    .join('\n\n');

  return `Selected text: ${selectedText}

Web search results:
${searchContext}

Please provide an explanation of the selected text, incorporating relevant information from the search results. Include citations to the sources where appropriate.`;
}

// Common English stop words to filter out
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'as',
  'is',
  'was',
  'are',
  'were',
  'been',
  'be',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'must',
  'shall',
  'can',
  'need',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'we',
  'they',
  'what',
  'which',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'also',
  'now',
  'here',
  'there',
]);

/**
 * Extract keywords from text for search purposes.
 * Returns top keywords sorted by frequency, excluding stop words.
 */
export function extractKeywords(text: string, maxKeywords = 5): string[] {
  if (!text || !text.trim()) {
    return [];
  }

  // Extract words (alphanumeric, underscore allowed)
  const words = text.toLowerCase().match(/\b[a-z0-9_]+\b/g) ?? [];

  // Filter out stop words and short words
  const meaningfulWords = words.filter((word) => word.length > 2 && !STOP_WORDS.has(word));

  // Count frequency
  const freq = new Map<string, number>();
  for (const word of meaningfulWords) {
    freq.set(word, (freq.get(word) ?? 0) + 1);
  }

  // Sort by frequency and return top N unique keywords
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([word]) => word);
}

/**
 * Use LLM to generate an optimal search query from user-selected text.
 * This is the "Agentic" approach - letting the model understand intent
 * rather than using heuristic keyword extraction.
 */
export async function generateSearchQuery(
  selectedText: string,
  config: LLMConfig,
  signal?: AbortSignal
): Promise<string> {
  // Use a fast/cheap model for query generation
  const queryGenConfig: LLMConfig = {
    ...config,
    model: getFastModel(config.provider),
  };

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a search query generator. Given user-selected text, output ONLY a concise search query (max 10 words) that captures the user's likely intent. No explanation, just the query.

Examples:
Input: "The quick brown fox jumps over the lazy dog"
Output: "fox jumping over dog"

Input: "React hooks are a new addition in React 16.8"
Output: "react hooks explanation"`,
    },
    { role: 'user', content: selectedText },
  ];

  const response = await callLLMWithMessages(messages, queryGenConfig, () => {}, signal);
  return response.content.trim().replace(/^"|"$/g, '');
}
