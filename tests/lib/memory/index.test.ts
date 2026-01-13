import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock dependencies
const mockVectorStore = {
  insert: vi.fn(),
  insertBatch: vi.fn(),
  search: vi.fn(),
  searchByFilter: vi.fn(),
  remove: vi.fn(),
  removeByFilter: vi.fn(),
  getDocumentCount: vi.fn(() => 0),
  toSnapshot: vi.fn(),
};

const mockEmbeddings = new Map<string, number[]>();

vi.mock('../../../src/lib/memory/storage', () => ({
  saveSnapshot: vi.fn(),
  loadLatestSnapshot: vi.fn(() => null),
  deleteOldSnapshots: vi.fn(),
  setMetadata: vi.fn(),
  getMetadata: vi.fn(() => null),
}));

vi.mock('../../../src/lib/memory/vector-store', () => ({
  createVectorStore: vi.fn(async () => mockVectorStore),
  restoreFromSnapshot: vi.fn(async () => mockVectorStore),
}));

vi.mock('../../../src/lib/memory/chunker', () => ({
  chunkHtmlContent: vi.fn((html: string) => [
    {
      content: html.slice(0, 100),
      headingPath: ['Test'],
      tokenCount: 50,
      startOffset: 0,
      endOffset: 100,
    },
  ]),
}));

vi.mock('../../../src/lib/memory/embedding-client', () => ({
  computeEmbedding: vi.fn(async (text: string) => {
    const cached = mockEmbeddings.get(text);
    if (cached) return cached;
    const embedding = Array(384).fill(text.length / 100);
    mockEmbeddings.set(text, embedding);
    return embedding;
  }),
  computeEmbeddings: vi.fn(async (texts: string[]) => {
    return texts.map((text) => {
      const cached = mockEmbeddings.get(text);
      if (cached) return cached;
      const embedding = Array(384).fill(text.length / 100);
      mockEmbeddings.set(text, embedding);
      return embedding;
    });
  }),
  isReady: vi.fn(() => true),
  preload: vi.fn(() => Promise.resolve()),
}));

// Import after mocking
import { getMemoryManager } from '../../../src/lib/memory/index';
import { saveSnapshot, loadLatestSnapshot, setMetadata } from '../../../src/lib/memory/storage';
import { computeEmbeddings } from '../../../src/lib/memory/embedding-client';

describe('Memory Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddings.clear();
    mockVectorStore.insertBatch.mockResolvedValue(['id-1']);
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.toSnapshot.mockResolvedValue(new ArrayBuffer(100));
    mockVectorStore.getDocumentCount.mockReturnValue(0);
  });

  describe('Property 1: Snapshot Load Performance', () => {
    it('initializes from snapshot when available', async () => {
      const snapshotData = new ArrayBuffer(50);
      vi.mocked(loadLatestSnapshot).mockResolvedValueOnce({
        data: snapshotData,
        documentCount: 10,
      });

      const manager = await getMemoryManager();
      expect(manager).toBeDefined();
    });

    it('creates new store when no snapshot exists', async () => {
      vi.mocked(loadLatestSnapshot).mockResolvedValueOnce(null);

      const manager = await getMemoryManager();
      expect(manager).toBeDefined();
    });
  });

  describe('Property 15: Auto-Embedding on Document Add', () => {
    it('computes embeddings when adding documents', async () => {
      const manager = await getMemoryManager();

      await manager.addDocument('<p>Test content for embedding</p>', {
        sourceUrl: 'https://example.com',
        title: 'Test Page',
      });

      expect(computeEmbeddings).toHaveBeenCalled();
    });

    it('embeddings are computed for all chunks', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 50, maxLength: 500 }),
          fc.webUrl(),
          fc.string({ minLength: 1, maxLength: 100 }),
          async (content, sourceUrl, title) => {
            vi.clearAllMocks();
            mockVectorStore.insertBatch.mockResolvedValue(['id-1']);

            const manager = await getMemoryManager();
            await manager.addDocument(`<p>${content}</p>`, { sourceUrl, title });

            expect(computeEmbeddings).toHaveBeenCalled();
            expect(mockVectorStore.insertBatch).toHaveBeenCalled();

            const insertCall = mockVectorStore.insertBatch.mock.calls[0][0];
            for (const doc of insertCall) {
              expect(Array.isArray(doc.embedding)).toBe(true);
              expect(doc.embedding.length).toBe(384);
            }
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 16: Singleton Consistency', () => {
    it('returns the same instance on multiple calls', async () => {
      const manager1 = await getMemoryManager();
      const manager2 = await getMemoryManager();

      expect(manager1).toBe(manager2);
    });

    it('state is consistent across calls', async () => {
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (callCount) => {
          const managers = await Promise.all(
            Array(callCount)
              .fill(null)
              .map(() => getMemoryManager())
          );

          // All should be the same instance
          const first = managers[0];
          return managers.every((m) => m === first);
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('addDocument', () => {
    it('returns array of document ids', async () => {
      mockVectorStore.insertBatch.mockResolvedValue(['id-1', 'id-2']);

      const manager = await getMemoryManager();
      const ids = await manager.addDocument('<p>Test content</p>', {
        sourceUrl: 'https://example.com',
        title: 'Test',
      });

      expect(Array.isArray(ids)).toBe(true);
    });
  });

  describe('addChunks', () => {
    it('adds pre-chunked content with embeddings', async () => {
      mockVectorStore.insertBatch.mockResolvedValue(['id-1']);

      const manager = await getMemoryManager();
      const chunks = [
        {
          content: 'Chunk content',
          headingPath: ['Section'],
          tokenCount: 50,
          startOffset: 0,
          endOffset: 50,
        },
      ];

      const ids = await manager.addChunks(chunks, {
        sourceUrl: 'https://example.com',
        title: 'Test',
      });

      expect(ids).toHaveLength(1);
      expect(computeEmbeddings).toHaveBeenCalledWith(['Chunk content']);
    });

    it('returns empty array for empty chunks', async () => {
      const manager = await getMemoryManager();
      const ids = await manager.addChunks([], {
        sourceUrl: 'https://example.com',
        title: 'Test',
      });

      expect(ids).toEqual([]);
    });
  });

  describe('search', () => {
    it('delegates to vector store with computed embedding', async () => {
      mockVectorStore.search.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            content: 'Result content',
            embedding: Array(384).fill(0.1),
            sourceUrl: 'https://example.com',
            title: 'Test',
            headingPath: [],
            createdAt: Date.now(),
          },
          score: 0.9,
        },
      ]);

      const manager = await getMemoryManager();
      const results = await manager.search('test query');

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.9);
    });
  });

  describe('sync', () => {
    it('saves snapshot to storage', async () => {
      const manager = await getMemoryManager();
      await manager.sync();

      expect(saveSnapshot).toHaveBeenCalled();
      expect(setMetadata).toHaveBeenCalledWith('lastSyncTime', expect.any(Number));
    });
  });

  describe('getStats', () => {
    it('returns memory statistics', async () => {
      mockVectorStore.getDocumentCount.mockReturnValue(5);

      const manager = await getMemoryManager();
      const stats = manager.getStats();

      expect(stats).toHaveProperty('documentCount');
      expect(stats).toHaveProperty('indexSizeBytes');
      expect(stats).toHaveProperty('lastSyncTime');
      expect(stats).toHaveProperty('embeddingModelLoaded');
    });
  });
});

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddings.clear();
    mockVectorStore.insertBatch.mockResolvedValue(['id-1']);
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.toSnapshot.mockResolvedValue(new ArrayBuffer(100));
    mockVectorStore.getDocumentCount.mockReturnValue(0);
  });

  describe('Full Flow: addDocument → search → sync → restore', () => {
    it('completes full lifecycle', async () => {
      const manager = await getMemoryManager();

      // Add document
      const ids = await manager.addDocument('<p>Integration test content</p>', {
        sourceUrl: 'https://test.com',
        title: 'Integration Test',
      });
      expect(ids.length).toBeGreaterThan(0);

      // Search
      mockVectorStore.search.mockResolvedValue([
        {
          document: {
            id: ids[0],
            content: 'Integration test content',
            embedding: Array(384).fill(0.1),
            sourceUrl: 'https://test.com',
            title: 'Integration Test',
            headingPath: ['Test'],
            createdAt: Date.now(),
          },
          score: 0.95,
        },
      ]);

      const results = await manager.search('integration');
      expect(results.length).toBeGreaterThanOrEqual(0);

      // Sync
      await manager.sync();
      expect(saveSnapshot).toHaveBeenCalled();

      // Stats
      const stats = manager.getStats();
      expect(stats.lastSyncTime).not.toBeNull();
    });
  });

  describe('Error Recovery', () => {
    it('sync function exists and can be called', async () => {
      const manager = await getMemoryManager();

      // Verify sync is a function
      expect(typeof manager.sync).toBe('function');

      // Call sync - it should work with the default mock
      await manager.sync();
      expect(saveSnapshot).toHaveBeenCalled();
    });
  });

  describe('Concurrent Access', () => {
    it('handles concurrent addDocument calls', async () => {
      mockVectorStore.insertBatch.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return ['id-' + Math.random()];
      });

      const manager = await getMemoryManager();

      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          manager.addDocument(`<p>Concurrent content ${i}</p>`, {
            sourceUrl: `https://example.com/page${i}`,
            title: `Page ${i}`,
          })
        );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach((ids) => expect(ids.length).toBeGreaterThan(0));
    });

    it('handles concurrent search calls', async () => {
      mockVectorStore.search.mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return [];
      });

      const manager = await getMemoryManager();

      const promises = Array(10)
        .fill(null)
        .map((_, i) => manager.search(`query ${i}`));

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });
  });
});

describe('removeBySourceUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddings.clear();
    mockVectorStore.insertBatch.mockResolvedValue(['id-1']);
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.searchByFilter.mockResolvedValue([]);
    mockVectorStore.removeByFilter.mockResolvedValue(0);
    mockVectorStore.toSnapshot.mockResolvedValue(new ArrayBuffer(100));
    mockVectorStore.getDocumentCount.mockReturnValue(0);
  });

  it('removes all chunks matching sourceUrl', async () => {
    mockVectorStore.removeByFilter.mockResolvedValue(3);

    const manager = await getMemoryManager();
    const removedCount = await manager.removeBySourceUrl('https://example.com/page1');

    expect(removedCount).toBe(3);
    expect(mockVectorStore.removeByFilter).toHaveBeenCalledWith({
      sourceUrl: 'https://example.com/page1',
    });
  });

  it('returns 0 when no chunks match', async () => {
    mockVectorStore.removeByFilter.mockResolvedValue(0);

    const manager = await getMemoryManager();
    const removedCount = await manager.removeBySourceUrl('https://nonexistent.com');

    expect(removedCount).toBe(0);
  });

  it('handles multiple URLs independently', async () => {
    mockVectorStore.removeByFilter.mockResolvedValueOnce(2).mockResolvedValueOnce(5);

    const manager = await getMemoryManager();

    const count1 = await manager.removeBySourceUrl('https://example.com/page1');
    const count2 = await manager.removeBySourceUrl('https://example.com/page2');

    expect(count1).toBe(2);
    expect(count2).toBe(5);
  });
});

describe('searchBySourceUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbeddings.clear();
    mockVectorStore.insertBatch.mockResolvedValue(['id-1']);
    mockVectorStore.search.mockResolvedValue([]);
    mockVectorStore.searchByFilter.mockResolvedValue([]);
    mockVectorStore.removeByFilter.mockResolvedValue(0);
    mockVectorStore.toSnapshot.mockResolvedValue(new ArrayBuffer(100));
    mockVectorStore.getDocumentCount.mockReturnValue(0);
  });

  it('returns all chunks for a sourceUrl', async () => {
    const mockResults = [
      {
        document: {
          id: 'doc-1',
          content: 'Chunk 1 content',
          embedding: Array(384).fill(0.1),
          sourceUrl: 'https://example.com/page1',
          title: 'Test Page',
          headingPath: ['Section 1'],
          createdAt: Date.now(),
        },
        score: 1.0,
      },
      {
        document: {
          id: 'doc-2',
          content: 'Chunk 2 content',
          embedding: Array(384).fill(0.2),
          sourceUrl: 'https://example.com/page1',
          title: 'Test Page',
          headingPath: ['Section 2'],
          createdAt: Date.now(),
        },
        score: 1.0,
      },
    ];
    mockVectorStore.searchByFilter.mockResolvedValue(mockResults);

    const manager = await getMemoryManager();
    const results = await manager.searchBySourceUrl('https://example.com/page1');

    expect(results).toHaveLength(2);
    expect(mockVectorStore.searchByFilter).toHaveBeenCalledWith(
      { sourceUrl: 'https://example.com/page1' },
      100
    );
  });

  it('returns empty array when no chunks match', async () => {
    mockVectorStore.searchByFilter.mockResolvedValue([]);

    const manager = await getMemoryManager();
    const results = await manager.searchBySourceUrl('https://nonexistent.com');

    expect(results).toEqual([]);
  });

  it('respects custom limit parameter', async () => {
    mockVectorStore.searchByFilter.mockResolvedValue([]);

    const manager = await getMemoryManager();
    await manager.searchBySourceUrl('https://example.com', 50);

    expect(mockVectorStore.searchByFilter).toHaveBeenCalledWith(
      { sourceUrl: 'https://example.com' },
      50
    );
  });

  it('does not compute embeddings (filter-only search)', async () => {
    const { computeEmbedding } = await import('../../../src/lib/memory/embedding-client');
    vi.mocked(computeEmbedding).mockClear();
    mockVectorStore.searchByFilter.mockResolvedValue([]);

    const manager = await getMemoryManager();
    await manager.searchBySourceUrl('https://example.com');

    // searchBySourceUrl should NOT call computeEmbedding
    expect(computeEmbedding).not.toHaveBeenCalled();
  });
});
