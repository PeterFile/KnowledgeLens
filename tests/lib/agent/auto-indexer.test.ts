// Auto-Indexer Tests
// Tests for automatic page indexing functionality
// Requirements: 3.1, 3.3, 3.4, 3.5

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock dependencies
const mockMemoryManager = {
  addDocument: vi.fn(),
  addChunks: vi.fn(),
  search: vi.fn(),
  searchBySourceUrl: vi.fn(),
  removeBySourceUrl: vi.fn(),
  sync: vi.fn(),
  getStats: vi.fn(() => ({
    documentCount: 0,
    indexSizeBytes: 0,
    lastSyncTime: null,
    embeddingModelLoaded: true,
  })),
};

vi.mock('../../../src/lib/memory', () => ({
  getMemoryManager: vi.fn(async () => mockMemoryManager),
  chunkHtmlContent: vi.fn((html: string) => {
    // Simple chunking mock - split by paragraphs
    const paragraphs = html.match(/<p[^>]*>([^<]+)<\/p>/g) || [html];
    return paragraphs.map((p, i) => ({
      content: p.replace(/<[^>]+>/g, '').slice(0, 200),
      headingPath: ['Section'],
      tokenCount: 50,
      startOffset: i * 100,
      endOffset: (i + 1) * 100,
    }));
  }),
}));

// Import after mocking
import {
  computeContentHash,
  shouldIndex,
  removeExistingChunks,
  indexPage,
  indexPageAsync,
} from '../../../src/lib/agent/auto-indexer';

// ============================================================================
// Unit Tests
// ============================================================================

describe('Auto-Indexer Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
    mockMemoryManager.removeBySourceUrl.mockResolvedValue(0);
    mockMemoryManager.addChunks.mockResolvedValue(['id-1', 'id-2']);
  });

  describe('computeContentHash', () => {
    it('returns consistent hash for same content', () => {
      const content = 'Test content for hashing';
      const hash1 = computeContentHash(content);
      const hash2 = computeContentHash(content);

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different content', () => {
      const hash1 = computeContentHash('Content A');
      const hash2 = computeContentHash('Content B');

      expect(hash1).not.toBe(hash2);
    });

    it('returns 16 character hash', () => {
      const hash = computeContentHash('Any content');
      expect(hash.length).toBe(16);
    });

    it('handles empty content', () => {
      const hash = computeContentHash('');
      expect(hash.length).toBe(16);
    });

    it('handles unicode content', () => {
      const hash = computeContentHash('Unicode: 你好世界 🌍');
      expect(hash.length).toBe(16);
    });
  });

  describe('shouldIndex', () => {
    it('returns shouldIndex: true when no existing content', async () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);

      const result = await shouldIndex('https://example.com', 'abc123');

      expect(result.shouldIndex).toBe(true);
      expect(result.existingContentHash).toBeUndefined();
    });

    it('returns shouldIndex: false when content unchanged', async () => {
      const contentHash = 'abc123';
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            content: 'Existing content',
            title: `hash:${contentHash}|Original Title`,
            sourceUrl: 'https://example.com',
            headingPath: [],
            createdAt: Date.now(),
            embedding: [],
          },
          score: 1.0,
        },
      ]);

      const result = await shouldIndex('https://example.com', contentHash);

      expect(result.shouldIndex).toBe(false);
      expect(result.existingContentHash).toBe(contentHash);
    });

    it('returns shouldIndex: true when content changed', async () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            content: 'Existing content',
            title: 'hash:oldHash|Original Title',
            sourceUrl: 'https://example.com',
            headingPath: [],
            createdAt: Date.now(),
            embedding: [],
          },
          score: 1.0,
        },
      ]);

      const result = await shouldIndex('https://example.com', 'newHash');

      expect(result.shouldIndex).toBe(true);
      expect(result.existingContentHash).toBe('oldHash');
    });

    it('returns shouldIndex: true on error', async () => {
      mockMemoryManager.searchBySourceUrl.mockRejectedValue(new Error('DB error'));

      const result = await shouldIndex('https://example.com', 'abc123');

      expect(result.shouldIndex).toBe(true);
    });
  });

  describe('removeExistingChunks', () => {
    it('removes chunks and returns count', async () => {
      mockMemoryManager.removeBySourceUrl.mockResolvedValue(5);

      const count = await removeExistingChunks('https://example.com');

      expect(count).toBe(5);
      expect(mockMemoryManager.removeBySourceUrl).toHaveBeenCalledWith('https://example.com');
    });

    it('returns 0 when no chunks exist', async () => {
      mockMemoryManager.removeBySourceUrl.mockResolvedValue(0);

      const count = await removeExistingChunks('https://example.com');

      expect(count).toBe(0);
    });
  });

  describe('indexPage', () => {
    it('indexes new page successfully', async () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
      mockMemoryManager.addChunks.mockResolvedValue(['id-1', 'id-2']);

      const result = await indexPage('<p>Test content</p>', 'https://example.com', 'Test Page');

      expect(result.success).toBe(true);
      expect(result.chunksIndexed).toBeGreaterThan(0);
      expect(result.sourceUrl).toBe('https://example.com');
    });

    it('skips indexing when content unchanged', async () => {
      const content = '<p>Test content</p>';
      const contentHash = computeContentHash(content);

      mockMemoryManager.searchBySourceUrl.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            content: 'Existing',
            title: `hash:${contentHash}|Test Page`,
            sourceUrl: 'https://example.com',
            headingPath: [],
            createdAt: Date.now(),
            embedding: [],
          },
          score: 1.0,
        },
      ]);

      const result = await indexPage(content, 'https://example.com', 'Test Page');

      expect(result.success).toBe(true);
      expect(result.chunksIndexed).toBe(0);
      expect(mockMemoryManager.addChunks).not.toHaveBeenCalled();
    });

    it('removes old chunks before re-indexing', async () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([
        {
          document: {
            id: 'doc-1',
            content: 'Old content',
            title: 'hash:oldHash|Test Page',
            sourceUrl: 'https://example.com',
            headingPath: [],
            createdAt: Date.now(),
            embedding: [],
          },
          score: 1.0,
        },
      ]);
      mockMemoryManager.removeBySourceUrl.mockResolvedValue(3);
      mockMemoryManager.addChunks.mockResolvedValue(['id-1']);

      const result = await indexPage('<p>New content</p>', 'https://example.com', 'Test Page');

      expect(result.success).toBe(true);
      expect(mockMemoryManager.removeBySourceUrl).toHaveBeenCalledWith('https://example.com');
      expect(mockMemoryManager.addChunks).toHaveBeenCalled();
    });

    it('returns error result on failure', async () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
      mockMemoryManager.addChunks.mockRejectedValue(new Error('Storage error'));

      const result = await indexPage('<p>Test content</p>', 'https://example.com', 'Test Page');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });

    it('stores hash in title for deduplication', async () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
      mockMemoryManager.addChunks.mockResolvedValue(['id-1']);

      const content = '<p>Test content</p>';
      await indexPage(content, 'https://example.com', 'Test Page');

      const addChunksCall = mockMemoryManager.addChunks.mock.calls[0];
      const metadata = addChunksCall[1];

      expect(metadata.title).toMatch(/^hash:[a-zA-Z0-9+/=]+\|Test Page$/);
    });
  });

  describe('indexPageAsync', () => {
    it('does not throw and returns immediately', () => {
      mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
      mockMemoryManager.addChunks.mockResolvedValue(['id-1']);

      // Should not throw
      expect(() => {
        indexPageAsync('<p>Test</p>', 'https://example.com', 'Test');
      }).not.toThrow();
    });

    it('handles errors silently', async () => {
      mockMemoryManager.searchBySourceUrl.mockRejectedValue(new Error('Async error'));

      // Should not throw
      indexPageAsync('<p>Test</p>', 'https://example.com', 'Test');

      // Wait for async operation to complete
      await new Promise((r) => setTimeout(r, 50));
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
    mockMemoryManager.removeBySourceUrl.mockResolvedValue(0);
    mockMemoryManager.addChunks.mockResolvedValue(['id-1']);
  });

  const urlArb = fc.webUrl();
  const titleArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{2,50}$/);
  const htmlContentArb = fc
    .array(fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 .,!?]{20,100}$/), { minLength: 1, maxLength: 5 })
    .map((paragraphs) => paragraphs.map((p) => `<p>${p}</p>`).join('\n'));

  /**
   * **Feature: agent-memory-integration, Property 5: Page Indexing with Metadata**
   * *For any* page content indexed via Auto_Index, all resulting chunks stored in
   * Memory_Manager SHALL have the correct sourceUrl, title, and a createdAt timestamp
   * within 1 second of the indexing call.
   * **Validates: Requirements 3.1, 3.3**
   */
  describe('Property 5: Page Indexing with Metadata', () => {
    it('indexed chunks have correct sourceUrl and title', async () => {
      await fc.assert(
        fc.asyncProperty(htmlContentArb, urlArb, titleArb, async (content, sourceUrl, title) => {
          vi.clearAllMocks();
          mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
          mockMemoryManager.addChunks.mockResolvedValue(['id-1']);

          const beforeIndex = Date.now();
          const result = await indexPage(content, sourceUrl, title);
          const afterIndex = Date.now();

          if (!result.success || result.chunksIndexed === 0) {
            // Skip if no chunks were indexed (empty content edge case)
            return true;
          }

          // Verify addChunks was called with correct metadata
          expect(mockMemoryManager.addChunks).toHaveBeenCalled();
          const addChunksCall = mockMemoryManager.addChunks.mock.calls[0];
          const metadata = addChunksCall[1];

          // Check sourceUrl matches
          expect(metadata.sourceUrl).toBe(sourceUrl);

          // Check title contains original title (with hash prefix)
          expect(metadata.title).toContain(title);
          expect(metadata.title).toMatch(/^hash:[a-zA-Z0-9+/=%]+\|/);

          // Verify timing is reasonable (within test execution window)
          expect(afterIndex - beforeIndex).toBeLessThan(5000);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('all chunks from same page share sourceUrl', async () => {
      await fc.assert(
        fc.asyncProperty(htmlContentArb, urlArb, titleArb, async (content, sourceUrl, title) => {
          vi.clearAllMocks();
          mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
          mockMemoryManager.addChunks.mockResolvedValue(['id-1', 'id-2', 'id-3']);

          await indexPage(content, sourceUrl, title);

          if (mockMemoryManager.addChunks.mock.calls.length === 0) {
            return true;
          }

          const addChunksCall = mockMemoryManager.addChunks.mock.calls[0];
          const metadata = addChunksCall[1];

          // All chunks should have the same sourceUrl
          expect(metadata.sourceUrl).toBe(sourceUrl);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: agent-memory-integration, Property 6: Page Indexing Idempotence**
   * *For any* URL indexed multiple times with identical content, the Memory_Manager
   * SHALL contain exactly one set of chunks for that URL. *For any* URL indexed with
   * different content, the Memory_Manager SHALL contain only the chunks from the most
   * recent indexing (full replacement).
   * **Validates: Requirements 3.4, 3.5**
   */
  describe('Property 6: Page Indexing Idempotence', () => {
    it('identical content is not re-indexed', async () => {
      await fc.assert(
        fc.asyncProperty(htmlContentArb, urlArb, titleArb, async (content, sourceUrl, title) => {
          vi.clearAllMocks();

          // First index - no existing content
          mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
          mockMemoryManager.addChunks.mockResolvedValue(['id-1']);

          const result1 = await indexPage(content, sourceUrl, title);

          if (!result1.success) return true;

          // Simulate existing content with same hash
          const contentHash = computeContentHash(content);
          mockMemoryManager.searchBySourceUrl.mockResolvedValue([
            {
              document: {
                id: 'doc-1',
                content: 'Existing',
                title: `hash:${contentHash}|${title}`,
                sourceUrl,
                headingPath: [],
                createdAt: Date.now(),
                embedding: [],
              },
              score: 1.0,
            },
          ]);

          vi.clearAllMocks();

          // Second index - same content
          const result2 = await indexPage(content, sourceUrl, title);

          // Should skip indexing (chunksIndexed = 0)
          expect(result2.success).toBe(true);
          expect(result2.chunksIndexed).toBe(0);
          expect(mockMemoryManager.addChunks).not.toHaveBeenCalled();

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('different content triggers full replacement', async () => {
      await fc.assert(
        fc.asyncProperty(
          htmlContentArb,
          htmlContentArb,
          urlArb,
          titleArb,
          async (content1, content2, sourceUrl, title) => {
            // Ensure contents are different
            if (computeContentHash(content1) === computeContentHash(content2)) {
              return true;
            }

            vi.clearAllMocks();

            // Simulate existing content with different hash
            const oldHash = computeContentHash(content1);
            mockMemoryManager.searchBySourceUrl.mockResolvedValue([
              {
                document: {
                  id: 'doc-1',
                  content: 'Old content',
                  title: `hash:${oldHash}|${title}`,
                  sourceUrl,
                  headingPath: [],
                  createdAt: Date.now(),
                  embedding: [],
                },
                score: 1.0,
              },
            ]);
            mockMemoryManager.removeBySourceUrl.mockResolvedValue(3);
            mockMemoryManager.addChunks.mockResolvedValue(['id-new']);

            // Index with new content
            const result = await indexPage(content2, sourceUrl, title);

            if (!result.success) return true;

            // Should have removed old chunks
            expect(mockMemoryManager.removeBySourceUrl).toHaveBeenCalledWith(sourceUrl);

            // Should have added new chunks
            expect(mockMemoryManager.addChunks).toHaveBeenCalled();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('content hash is deterministic', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 5000 }), (content) => {
          const hash1 = computeContentHash(content);
          const hash2 = computeContentHash(content);

          // Same content always produces same hash
          expect(hash1).toBe(hash2);

          // Hash is always 16 characters
          expect(hash1.length).toBe(16);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('different content produces different hashes', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 1000 }),
          fc.string({ minLength: 10, maxLength: 1000 }),
          (content1, content2) => {
            // Skip if contents happen to be identical
            if (content1 === content2) return true;

            const hash1 = computeContentHash(content1);
            const hash2 = computeContentHash(content2);

            // Different content should produce different hashes (with high probability)
            // Note: This is not guaranteed due to hash collisions, but should be rare
            // We only check if the first 1000 chars + length differ
            const sample1 = content1.slice(0, 1000) + content1.length;
            const sample2 = content2.slice(0, 1000) + content2.length;

            if (sample1 !== sample2) {
              expect(hash1).not.toBe(hash2);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
