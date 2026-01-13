// Tool Handlers Tests
// Tests for tool handler implementations
// Requirements: 6.1, 6.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SearchResult as MemorySearchResult } from '../../../src/lib/memory/types';
import type { SearchResult as WebSearchResult, LLMConfig, SearchConfig } from '../../../src/types';

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
  searchWebHandler,
  setToolHandlerContext,
  getToolHandlerContext,
  clearToolHandlerContext,
  registerToolHandlers,
  ensureToolHandlersRegistered,
} from '../../../src/lib/agent/tool-handlers';
import { clearToolRegistry, getToolSchema } from '../../../src/lib/agent/tools';
import { searchWeb } from '../../../src/lib/search';

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

describe('Tool Handlers Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearToolHandlerContext();
    clearToolRegistry();
    mockMemoryManager.search.mockResolvedValue([]);
  });

  afterEach(() => {
    clearToolHandlerContext();
    clearToolRegistry();
  });

  describe('Tool Handler Context', () => {
    it('sets and gets tool handler context', () => {
      expect(getToolHandlerContext()).toBeNull();

      setToolHandlerContext({
        llmConfig: mockLLMConfig,
        searchConfig: mockSearchConfig,
      });

      const context = getToolHandlerContext();
      expect(context).not.toBeNull();
      expect(context?.llmConfig).toEqual(mockLLMConfig);
      expect(context?.searchConfig).toEqual(mockSearchConfig);
    });

    it('clears tool handler context', () => {
      setToolHandlerContext({
        llmConfig: mockLLMConfig,
        searchConfig: mockSearchConfig,
      });

      clearToolHandlerContext();

      expect(getToolHandlerContext()).toBeNull();
    });
  });

  describe('Tool Registration', () => {
    it('registers search_web_for_info tool', () => {
      registerToolHandlers();

      const schema = getToolSchema('search_web_for_info');
      expect(schema).toBeDefined();
      expect(schema?.name).toBe('search_web_for_info');
    });

    it('ensureToolHandlersRegistered is idempotent', () => {
      ensureToolHandlersRegistered();
      const schema1 = getToolSchema('search_web_for_info');

      ensureToolHandlersRegistered();
      const schema2 = getToolSchema('search_web_for_info');

      expect(schema1).toEqual(schema2);
    });
  });

  describe('searchWebHandler', () => {
    beforeEach(() => {
      setToolHandlerContext({
        llmConfig: mockLLMConfig,
        searchConfig: mockSearchConfig,
      });
    });

    it('returns error when query is missing', async () => {
      const result = await searchWebHandler({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required parameter: query');
    });

    it('returns error when context is not initialized', async () => {
      clearToolHandlerContext();

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool handler context not initialized');
    });

    it('returns error when search config is not available', async () => {
      setToolHandlerContext({
        llmConfig: mockLLMConfig,
        // No searchConfig
      });

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search configuration not available');
    });

    it('retrieves from memory before web search', async () => {
      const memoryResults = [
        createMemoryResult('1', 'Memory content', 'https://memory.com', 'Memory Title'),
      ];
      mockMemoryManager.search.mockResolvedValue(memoryResults);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      expect(mockMemoryManager.search).toHaveBeenCalled();
      // Memory search should be called before web search
      expect(mockMemoryManager.search.mock.invocationCallOrder[0]).toBeLessThan(
        (searchWeb as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
      );
    });

    it('returns combined results from memory and web', async () => {
      const memoryResults = [
        createMemoryResult('1', 'Memory content', 'https://memory.com', 'Memory Title'),
      ];
      const webResults = [createWebResult('Web Title', 'Web snippet', 'https://web.com')];

      mockMemoryManager.search.mockResolvedValue(memoryResults);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue(webResults);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const data = result.data as {
        memoryResultsCount: number;
        webResultsCount: number;
        citations: string;
      };
      expect(data.memoryResultsCount).toBe(1);
      expect(data.webResultsCount).toBe(1);
    });

    it('formats citations with source labels', async () => {
      const memoryResults = [
        createMemoryResult('1', 'Memory content', 'https://memory.com', 'Memory Title'),
      ];
      const webResults = [createWebResult('Web Title', 'Web snippet', 'https://web.com')];

      mockMemoryManager.search.mockResolvedValue(memoryResults);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue(webResults);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      const data = result.data as { citations: string };

      // Requirements: 6.4 - Clear source labeling
      expect(data.citations).toContain('[Knowledge Base]');
      expect(data.citations).toContain('[Web Source]');
    });

    it('includes synthesized answer in response', async () => {
      mockMemoryManager.search.mockResolvedValue([]);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([
        createWebResult('Web Title', 'Web snippet', 'https://web.com'),
      ]);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      const data = result.data as { synthesizedAnswer: string };
      expect(data.synthesizedAnswer).toBeTruthy();
    });

    it('handles search failure gracefully', async () => {
      mockMemoryManager.search.mockRejectedValue(new Error('Memory error'));
      (searchWeb as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Web error'));

      const result = await searchWebHandler({ query: 'test query' });

      // Should still succeed with synthesized answer (even if no results)
      expect(result.success).toBe(true);
    });

    it('includes memory results in response data', async () => {
      const memoryResults = [
        createMemoryResult('1', 'Memory content about topic', 'https://memory.com', 'Memory Title'),
      ];
      mockMemoryManager.search.mockResolvedValue(memoryResults);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      const data = result.data as {
        memoryResults: Array<{
          title: string;
          content: string;
          sourceUrl: string;
          score: number;
        }>;
      };
      expect(data.memoryResults).toHaveLength(1);
      expect(data.memoryResults[0].title).toBe('Memory Title');
      expect(data.memoryResults[0].sourceUrl).toBe('https://memory.com');
    });

    it('includes web results in response data', async () => {
      mockMemoryManager.search.mockResolvedValue([]);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([
        createWebResult('Web Title', 'Web snippet about topic', 'https://web.com'),
      ]);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      const data = result.data as {
        webResults: Array<{
          title: string;
          snippet: string;
          url: string;
        }>;
      };
      expect(data.webResults).toHaveLength(1);
      expect(data.webResults[0].title).toBe('Web Title');
      expect(data.webResults[0].url).toBe('https://web.com');
    });

    it('estimates token count based on response size', async () => {
      mockMemoryManager.search.mockResolvedValue([]);
      (searchWeb as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await searchWebHandler({ query: 'test query' });

      expect(result.success).toBe(true);
      expect(result.tokenCount).toBeGreaterThan(0);
    });
  });
});
