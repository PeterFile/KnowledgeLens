// Search Enhancement Tests
// Tests for memory-enhanced web search functionality
// Requirements: 6.1, 6.2, 6.3, 6.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock dependencies
const mockMemoryManager = {
  search: vi.fn(),
  searchBySourceUrl: vi.fn(),
  getStats: vi.fn(() => ({
    documentCount: 0,
    indexSizeBytes: 0,
    lastSyncTime: null,
    embeddingModelLoaded: true,
  })),
};

vi.mock('../../../src/lib/memory', () => ({
  getMemoryManager: vi.fn(async () => mockMemoryManager),
}));

vi.mock('../../../src/lib/search', () => ({
  searchWeb: vi.fn(async () => []),
}));

vi.mock('../../../src/lib/llm', () => ({
  callLLMWithMessages: vi.fn(async (messages, config, onToken) => {
    const response = 'Synthesized answer with [1] and [2] citations.';
    onToken(response);
    return { content: response };
  }),
}));

// Import after mocking
import {
  retrieveRelatedMemory,
  formatCitations,
  synthesizeWithMemory,
  enhancedSearch,
  type Citation,
} from '../../../src/lib/agent/search-enhancement';
import { searchWeb } from '../../../src/lib/search';
import type { SearchResult as MemorySearchResult } from '../../../src/lib/memory/types';
import type { SearchResult as WebSearchResult, LLMConfig, SearchConfig } from '../../../src/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockLLMConfig: LLMConfig = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-4',
};

const mockSearchConfig: SearchConfig = {
  provider: 'serpapi',
  apiKey: 'test-key',
};

function createMemoryResult(
  id: string,
  content: string,
  sourceUrl: string,
  title: string
): MemorySearchResult {
  return {
    document: {
      id,
      content,
      sourceUrl,
      title,
      embedding: [],
      headingPath: [],
      createdAt: Date.now(),
    },
    score: 0.8,
  };
}

function createWebResult(title: string, snippet: string, url: string): WebSearchResult {
  return { title, snippet, url };
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('Search Enhancement Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemoryManager.search.mockResolvedValue([]);
  });

  describe('retrieveRelatedMemory', () => {
    it('returns empty array when no results', async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      const results = await retrieveRelatedMemory('test query');

      expect(results).toEqual([]);
      expect(mockMemoryManager.search).toHaveBeenCalledWith('test query', {
        limit: 5,
        mode: 'hybrid',
        filters: { docType: 'content' },
      });
    });

    it('returns memory results when found', async () => {
      const mockResults = [
        createMemoryResult('1', 'Content 1', 'https://example.com/1', 'Title 1'),
        createMemoryResult('2', 'Content 2', 'https://example.com/2', 'Title 2'),
      ];
      mockMemoryManager.search.mockResolvedValue(mockResults);

      const results = await retrieveRelatedMemory('test query');

      expect(results).toHaveLength(2);
      expect(results[0].document.content).toBe('Content 1');
    });

    it('respects custom limit', async () => {
      mockMemoryManager.search.mockResolvedValue([]);

      await retrieveRelatedMemory('test query', 10);

      expect(mockMemoryManager.search).toHaveBeenCalledWith('test query', {
        limit: 10,
        mode: 'hybrid',
        filters: { docType: 'content' },
      });
    });

    it('returns empty array on error', async () => {
      mockMemoryManager.search.mockRejectedValue(new Error('DB error'));

      const results = await retrieveRelatedMemory('test query');

      expect(results).toEqual([]);
    });
  });

  describe('formatCitations', () => {
    it('returns empty string for no citations', () => {
      const result = formatCitations([]);
      expect(result).toBe('');
    });

    it('formats web source citations correctly', () => {
      const citations: Citation[] = [
        { index: 1, source: 'web', url: 'https://example.com', title: 'Web Article' },
      ];

      const result = formatCitations(citations);

      expect(result).toContain('[1]');
      expect(result).toContain('[Web Source]');
      expect(result).toContain('Web Article');
      expect(result).toContain('https://example.com');
    });

    it('formats memory source citations correctly', () => {
      const citations: Citation[] = [
        { index: 1, source: 'memory', url: 'https://saved.com', title: 'Saved Article' },
      ];

      const result = formatCitations(citations);

      expect(result).toContain('[1]');
      expect(result).toContain('[Knowledge Base]');
      expect(result).toContain('Saved Article');
      expect(result).toContain('https://saved.com');
    });

    it('formats mixed citations correctly', () => {
      const citations: Citation[] = [
        { index: 1, source: 'memory', url: 'https://saved.com', title: 'Saved' },
        { index: 2, source: 'web', url: 'https://web.com', title: 'Web' },
      ];

      const result = formatCitations(citations);

      expect(result).toContain('[1] [Knowledge Base]');
      expect(result).toContain('[2] [Web Source]');
    });
  });

  describe('synthesizeWithMemory', () => {
    it('returns message when no results', async () => {
      const result = await synthesizeWithMemory('query', [], [], mockLLMConfig);

      expect(result.answer).toContain('No relevant information found');
      expect(result.citations).toHaveLength(0);
    });

    it('builds citations from both sources', async () => {
      const webResults = [createWebResult('Web Title', 'Web snippet', 'https://web.com')];
      const memoryResults = [
        createMemoryResult('1', 'Memory content', 'https://memory.com', 'Memory Title'),
      ];

      const result = await synthesizeWithMemory('query', webResults, memoryResults, mockLLMConfig);

      expect(result.citations).toHaveLength(2);
      // Memory results come first
      expect(result.citations[0].source).toBe('memory');
      expect(result.citations[1].source).toBe('web');
    });

    it('calls LLM with correct context', async () => {
      const { callLLMWithMessages } = await import('../../../src/lib/llm');
      const webResults = [createWebResult('Web Title', 'Web snippet', 'https://web.com')];

      await synthesizeWithMemory('test query', webResults, [], mockLLMConfig);

      expect(callLLMWithMessages).toHaveBeenCalled();
      const messages = (callLLMWithMessages as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain('test query');
    });
  });

  describe('enhancedSearch', () => {
    it('retrieves from memory first', async () => {
      mockMemoryManager.search.mockResolvedValue([]);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await enhancedSearch('query', mockSearchConfig, mockLLMConfig);

      expect(mockMemoryManager.search).toHaveBeenCalled();
    });

    it('performs web search', async () => {
      mockMemoryManager.search.mockResolvedValue([]);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await enhancedSearch('query', mockSearchConfig, mockLLMConfig);

      expect(searchWeb).toHaveBeenCalledWith('query', mockSearchConfig, undefined);
    });

    it('returns combined results', async () => {
      const memoryResults = [
        createMemoryResult('1', 'Memory content', 'https://memory.com', 'Memory Title'),
      ];
      const webResults = [createWebResult('Web Title', 'Web snippet', 'https://web.com')];

      mockMemoryManager.search.mockResolvedValue(memoryResults);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue(webResults);

      const result = await enhancedSearch('query', mockSearchConfig, mockLLMConfig);

      expect(result.memoryResults).toHaveLength(1);
      expect(result.webResults).toHaveLength(1);
      expect(result.citations).toHaveLength(2);
      expect(result.synthesizedAnswer).toBeTruthy();
    });

    it('continues with memory only when web search fails', async () => {
      const memoryResults = [
        createMemoryResult('1', 'Memory content', 'https://memory.com', 'Memory Title'),
      ];
      mockMemoryManager.search.mockResolvedValue(memoryResults);
      (searchWeb as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const result = await enhancedSearch('query', mockSearchConfig, mockLLMConfig);

      expect(result.memoryResults).toHaveLength(1);
      expect(result.webResults).toHaveLength(0);
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemoryManager.search.mockResolvedValue([]);
  });

  const urlArb = fc.webUrl();
  const titleArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{2,50}$/);
  const contentArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 .,!?]{10,200}$/);

  const webResultArb: fc.Arbitrary<WebSearchResult> = fc.record({
    title: titleArb,
    snippet: contentArb,
    url: urlArb,
  });

  const memoryResultArb: fc.Arbitrary<MemorySearchResult> = fc.record({
    document: fc.record({
      id: fc.uuid(),
      content: contentArb,
      sourceUrl: urlArb,
      title: titleArb,
      embedding: fc.constant([]),
      headingPath: fc.constant([]),
      createdAt: fc.integer({ min: 0, max: Date.now() }),
    }),
    score: fc.float({ min: 0, max: 1, noNaN: true }),
  });

  const citationArb: fc.Arbitrary<Citation> = fc.record({
    index: fc.integer({ min: 1, max: 100 }),
    source: fc.constantFrom('web', 'memory') as fc.Arbitrary<'web' | 'memory'>,
    url: urlArb,
    title: titleArb,
  });

  /**
   * **Feature: agent-memory-integration, Property 12: Dual Source Citation**
   * *For any* Agent response that uses both web search results and stored knowledge,
   * the citations SHALL clearly distinguish between "Web Source" and "Knowledge Base" labels.
   * **Validates: Requirements 6.4**
   */
  describe('Property 12: Dual Source Citation', () => {
    it('formatCitations distinguishes web and memory sources', () => {
      fc.assert(
        fc.property(fc.array(citationArb, { minLength: 1, maxLength: 10 }), (citations) => {
          const formatted = formatCitations(citations);

          for (const citation of citations) {
            if (citation.source === 'web') {
              expect(formatted).toContain('[Web Source]');
            } else {
              expect(formatted).toContain('[Knowledge Base]');
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('all citations have correct index and source label', () => {
      fc.assert(
        fc.property(fc.array(citationArb, { minLength: 1, maxLength: 10 }), (citations) => {
          const formatted = formatCitations(citations);

          for (const citation of citations) {
            // Check index is present
            expect(formatted).toContain(`[${citation.index}]`);

            // Check source label is present
            const expectedLabel = citation.source === 'web' ? '[Web Source]' : '[Knowledge Base]';
            expect(formatted).toContain(expectedLabel);

            // Check URL is present
            expect(formatted).toContain(citation.url);

            // Check title is present
            expect(formatted).toContain(citation.title);
          }

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('mixed sources are clearly labeled', () => {
      fc.assert(
        fc.property(
          fc.array(webResultArb, { minLength: 1, maxLength: 5 }),
          fc.array(memoryResultArb, { minLength: 1, maxLength: 5 }),
          (webResults, memoryResults) => {
            // Build citations like the real implementation does
            const citations: Citation[] = [];
            let index = 1;

            // Memory results first
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

            const formatted = formatCitations(citations);

            // Count occurrences of each label
            const webSourceCount = (formatted.match(/\[Web Source\]/g) || []).length;
            const knowledgeBaseCount = (formatted.match(/\[Knowledge Base\]/g) || []).length;

            // Should have correct number of each label
            expect(webSourceCount).toBe(webResults.length);
            expect(knowledgeBaseCount).toBe(memoryResults.length);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('citation indices are sequential starting from 1', () => {
      fc.assert(
        fc.property(
          fc.array(webResultArb, { minLength: 0, maxLength: 5 }),
          fc.array(memoryResultArb, { minLength: 0, maxLength: 5 }),
          (webResults, memoryResults) => {
            // Skip if both are empty
            if (webResults.length === 0 && memoryResults.length === 0) {
              return true;
            }

            // Build citations like the real implementation does
            const citations: Citation[] = [];
            let index = 1;

            for (const result of memoryResults) {
              citations.push({
                index: index++,
                source: 'memory',
                url: result.document.sourceUrl,
                title: result.document.title,
              });
            }

            for (const result of webResults) {
              citations.push({
                index: index++,
                source: 'web',
                url: result.url,
                title: result.title,
              });
            }

            const formatted = formatCitations(citations);

            // Check all indices from 1 to total are present
            const totalCitations = webResults.length + memoryResults.length;
            for (let i = 1; i <= totalCitations; i++) {
              expect(formatted).toContain(`[${i}]`);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('memory sources appear before web sources in citation order', () => {
      fc.assert(
        fc.property(
          fc.array(webResultArb, { minLength: 1, maxLength: 3 }),
          fc.array(memoryResultArb, { minLength: 1, maxLength: 3 }),
          (webResults, memoryResults) => {
            // Build citations like the real implementation does
            const citations: Citation[] = [];
            let index = 1;

            // Memory results first
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

            // Verify memory citations have lower indices than web citations
            const memoryCitations = citations.filter((c) => c.source === 'memory');
            const webCitations = citations.filter((c) => c.source === 'web');

            const maxMemoryIndex = Math.max(...memoryCitations.map((c) => c.index));
            const minWebIndex = Math.min(...webCitations.map((c) => c.index));

            expect(maxMemoryIndex).toBeLessThan(minWebIndex);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
