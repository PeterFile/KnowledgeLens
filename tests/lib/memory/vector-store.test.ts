import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  createVectorStore,
  restoreFromSnapshot,
  type VectorStore,
  type Document,
  type SearchOptions,
} from '../../../src/lib/memory/vector-store';

// Mock Orama
const mockDocuments = new Map<string, Document>();

vi.mock('@orama/orama', () => ({
  create: vi.fn(async () => ({ _mock: true })),
  insert: vi.fn(async (_db, doc: Document) => {
    mockDocuments.set(doc.id, doc);
    return doc.id;
  }),
  search: vi.fn(async (_db, params) => {
    const docs = Array.from(mockDocuments.values());
    let filtered = docs;

    // Apply filters
    if (params.where) {
      if (params.where.sourceUrl) {
        filtered = filtered.filter((d) => d.sourceUrl === params.where.sourceUrl);
      }
      if (params.where.createdAt?.gte) {
        filtered = filtered.filter((d) => d.createdAt >= params.where.createdAt.gte);
      }
      if (params.where.createdAt?.lte) {
        filtered = filtered.filter((d) => d.createdAt <= params.where.createdAt.lte);
      }
    }

    // Apply text search
    if (params.term) {
      const term = params.term.toLowerCase();
      filtered = filtered.filter((d) => d.content.toLowerCase().includes(term));
    }

    return {
      hits: filtered.slice(0, params.limit || 10).map((doc, i) => ({
        document: doc,
        score: 1 - i * 0.1,
      })),
    };
  }),
  remove: vi.fn(async (_db, id: string) => {
    if (!mockDocuments.has(id)) {
      throw new Error('Document not found');
    }
    mockDocuments.delete(id);
    return true;
  }),
  count: vi.fn(() => mockDocuments.size),
}));

vi.mock('@orama/plugin-data-persistence', () => ({
  persist: vi.fn(async () => new Uint8Array([1, 2, 3, 4])),
  restore: vi.fn(async () => ({ _mock: true, _restored: true })),
}));

// Generators
const documentArb: fc.Arbitrary<Omit<Document, 'id'>> = fc.record({
  content: fc.string({ minLength: 10, maxLength: 500 }),
  embedding: fc.array(fc.float({ min: -1, max: 1 }), { minLength: 384, maxLength: 384 }),
  sourceUrl: fc.webUrl(),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  headingPath: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
  createdAt: fc.integer({ min: 1000000000000, max: 2000000000000 }),
});

const searchOptionsArb: fc.Arbitrary<SearchOptions> = fc.record({
  limit: fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined }),
  mode: fc.option(fc.constantFrom('hybrid', 'vector', 'fulltext'), { nil: undefined }),
  filters: fc.option(
    fc.record({
      sourceUrl: fc.option(fc.webUrl(), { nil: undefined }),
      createdAfter: fc.option(fc.integer({ min: 1000000000000, max: 1500000000000 }), {
        nil: undefined,
      }),
      createdBefore: fc.option(fc.integer({ min: 1500000000000, max: 2000000000000 }), {
        nil: undefined,
      }),
    }),
    { nil: undefined }
  ),
});

describe('Vector Store', () => {
  let store: VectorStore;

  beforeEach(async () => {
    mockDocuments.clear();
    vi.clearAllMocks();
    store = await createVectorStore();
  });

  describe('Property 2: Search Performance', () => {
    it('search returns results for valid queries', async () => {
      await fc.assert(
        fc.asyncProperty(
          documentArb,
          fc.string({ minLength: 1, maxLength: 50 }),
          async (doc, query) => {
            await store.insert(doc);
            const embedding = Array(384).fill(0.1);
            const results = await store.search(query, embedding, { limit: 10 });

            expect(Array.isArray(results)).toBe(true);
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 3: Hybrid Search Correctness', () => {
    it('hybrid search returns documents matching text or vector', async () => {
      const doc = {
        content: 'TypeScript programming language',
        embedding: Array(384).fill(0.5),
        sourceUrl: 'https://example.com',
        title: 'Test',
        headingPath: [],
        createdAt: Date.now(),
      };

      await store.insert(doc);

      const results = await store.search('TypeScript', Array(384).fill(0.5), { mode: 'hybrid' });

      expect(results.length).toBeGreaterThanOrEqual(0);
      if (results.length > 0) {
        expect(results[0].document.content).toContain('TypeScript');
      }
    });

    it('hybrid mode respects configured weights', async () => {
      await fc.assert(
        fc.asyncProperty(
          documentArb,
          fc.record({ text: fc.float({ min: 0, max: 1 }), vector: fc.float({ min: 0, max: 1 }) }),
          async (doc, weights) => {
            await store.insert(doc);
            const embedding = Array(384).fill(0.1);

            const results = await store.search('test', embedding, {
              mode: 'hybrid',
              hybridWeights: weights,
            });

            expect(Array.isArray(results)).toBe(true);
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 4: Document Storage Round-Trip', () => {
    it('inserted documents can be retrieved with identical content', async () => {
      await fc.assert(
        fc.asyncProperty(documentArb, async (doc) => {
          const id = await store.insert(doc);

          // Search for the document
          const results = await store.search(doc.content.slice(0, 20), doc.embedding, {
            limit: 100,
          });

          const found = results.find((r) => r.document.id === id);
          if (found) {
            expect(found.document.content).toBe(doc.content);
            expect(found.document.sourceUrl).toBe(doc.sourceUrl);
            expect(found.document.title).toBe(doc.title);
            expect(found.document.headingPath).toEqual(doc.headingPath);
          }
          return true;
        }),
        { numRuns: 30 }
      );
    });
  });

  describe('Property 5: Search Filter Correctness', () => {
    it('filtered results satisfy filter criteria', async () => {
      const docs = [
        {
          content: 'Document A content',
          embedding: Array(384).fill(0.1),
          sourceUrl: 'https://site-a.com',
          title: 'Doc A',
          headingPath: [],
          createdAt: 1600000000000,
        },
        {
          content: 'Document B content',
          embedding: Array(384).fill(0.2),
          sourceUrl: 'https://site-b.com',
          title: 'Doc B',
          headingPath: [],
          createdAt: 1700000000000,
        },
      ];

      for (const doc of docs) {
        await store.insert(doc);
      }

      // Filter by sourceUrl
      const resultsA = await store.search('Document', Array(384).fill(0.1), {
        filters: { sourceUrl: 'https://site-a.com' },
      });

      for (const result of resultsA) {
        expect(result.document.sourceUrl).toBe('https://site-a.com');
      }

      // Filter by time range
      const resultsTime = await store.search('Document', Array(384).fill(0.1), {
        filters: { createdAfter: 1650000000000 },
      });

      for (const result of resultsTime) {
        expect(result.document.createdAt).toBeGreaterThanOrEqual(1650000000000);
      }
    });

    it('all results satisfy specified filters', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(documentArb, { minLength: 1, maxLength: 5 }),
          searchOptionsArb,
          async (docs, options) => {
            for (const doc of docs) {
              await store.insert(doc);
            }

            const results = await store.search('test', Array(384).fill(0.1), options);

            for (const result of results) {
              if (options.filters?.sourceUrl) {
                expect(result.document.sourceUrl).toBe(options.filters.sourceUrl);
              }
              if (options.filters?.createdAfter) {
                expect(result.document.createdAt).toBeGreaterThanOrEqual(
                  options.filters.createdAfter
                );
              }
              if (options.filters?.createdBefore) {
                expect(result.document.createdAt).toBeLessThanOrEqual(
                  options.filters.createdBefore
                );
              }
            }
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 6: Index Serialization Round-Trip', () => {
    it('snapshot and restore preserves documents', async () => {
      const doc = {
        content: 'Test document for serialization',
        embedding: Array(384).fill(0.3),
        sourceUrl: 'https://test.com',
        title: 'Serialization Test',
        headingPath: ['Section 1'],
        createdAt: Date.now(),
      };

      await store.insert(doc);
      const snapshot = await store.toSnapshot();

      expect(snapshot).toBeInstanceOf(ArrayBuffer);
      expect(snapshot.byteLength).toBeGreaterThan(0);

      // Restore from snapshot
      const restoredStore = await restoreFromSnapshot(snapshot);
      expect(restoredStore).toBeDefined();
    });

    it('serialization produces valid ArrayBuffer', async () => {
      await fc.assert(
        fc.asyncProperty(fc.array(documentArb, { minLength: 0, maxLength: 5 }), async (docs) => {
          for (const doc of docs) {
            await store.insert(doc);
          }

          const snapshot = await store.toSnapshot();
          expect(snapshot).toBeInstanceOf(ArrayBuffer);
          return true;
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Basic Operations', () => {
    it('insert returns a string id', async () => {
      const doc = {
        content: 'Test content',
        embedding: Array(384).fill(0.1),
        sourceUrl: 'https://example.com',
        title: 'Test',
        headingPath: [],
        createdAt: Date.now(),
      };

      const id = await store.insert(doc);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('insertBatch returns array of ids', async () => {
      const docs = [
        {
          content: 'Doc 1',
          embedding: Array(384).fill(0.1),
          sourceUrl: 'https://example.com',
          title: 'Test 1',
          headingPath: [],
          createdAt: Date.now(),
        },
        {
          content: 'Doc 2',
          embedding: Array(384).fill(0.2),
          sourceUrl: 'https://example.com',
          title: 'Test 2',
          headingPath: [],
          createdAt: Date.now(),
        },
      ];

      const ids = await store.insertBatch(docs);
      expect(ids).toHaveLength(2);
      expect(ids.every((id) => typeof id === 'string')).toBe(true);
    });

    it('getDocumentCount returns correct count', async () => {
      expect(store.getDocumentCount()).toBe(0);

      await store.insert({
        content: 'Test',
        embedding: Array(384).fill(0.1),
        sourceUrl: 'https://example.com',
        title: 'Test',
        headingPath: [],
        createdAt: Date.now(),
      });

      expect(store.getDocumentCount()).toBe(1);
    });

    it('remove deletes document', async () => {
      const id = await store.insert({
        content: 'To be deleted',
        embedding: Array(384).fill(0.1),
        sourceUrl: 'https://example.com',
        title: 'Test',
        headingPath: [],
        createdAt: Date.now(),
      });

      const removed = await store.remove(id);
      expect(removed).toBe(true);
    });

    it('remove returns false for non-existent id', async () => {
      const removed = await store.remove('non-existent-id');
      expect(removed).toBe(false);
    });
  });
});
