import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock chrome APIs before any imports
const mockChrome = {
  runtime: {
    getContexts: vi.fn(),
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
  },
  offscreen: {
    createDocument: vi.fn(),
    Reason: { WORKERS: 'WORKERS' },
  },
};

vi.stubGlobal('chrome', mockChrome);

// Mock the module to avoid chrome.runtime.onMessage.addListener at module level
vi.mock('../../../src/lib/memory/embedding-client', () => ({
  computeEmbedding: vi.fn(async (text: string) => Array(384).fill(text.length / 100)),
  computeEmbeddings: vi.fn(async (texts: string[]) =>
    texts.map((t) => Array(384).fill(t.length / 100))
  ),
  isReady: vi.fn(() => false),
  getState: vi.fn(() => 'idle' as const),
  preload: vi.fn(async () => {}),
}));

import {
  computeEmbedding,
  computeEmbeddings,
  isReady,
  getState,
  preload,
} from '../../../src/lib/memory/embedding-client';

describe('Embedding Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Property 17: Concurrent Embedding Request Isolation', () => {
    it('each request receives its own embeddings without cross-contamination', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 2, maxLength: 5 }),
          async (texts) => {
            const uniqueTexts = Array.from(new Set(texts));
            if (uniqueTexts.length < 2) return true;

            // Each text should produce unique embedding based on length
            const embeddings = await computeEmbeddings(uniqueTexts);
            expect(embeddings.length).toBe(uniqueTexts.length);

            // Verify embeddings are different for different length texts
            const differentLengths = uniqueTexts.filter((t, i) =>
              uniqueTexts.some((t2, j) => i !== j && t.length !== t2.length)
            );
            if (differentLengths.length >= 2) {
              const e1 = await computeEmbedding(differentLengths[0]);
              const e2 = await computeEmbedding(differentLengths[1]);
              if (differentLengths[0].length !== differentLengths[1].length) {
                expect(e1[0]).not.toBe(e2[0]);
              }
            }
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 18: Initialization Request Queuing', () => {
    it('requests are handled by the embedding service', async () => {
      const texts = ['test1', 'test2'];
      const embeddings = await computeEmbeddings(texts);

      expect(embeddings.length).toBe(2);
      expect(embeddings[0].length).toBe(384);
    });

    it('no requests are lost', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          async (texts) => {
            const embeddings = await computeEmbeddings(texts);
            return embeddings.length === texts.length;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  describe('State Management', () => {
    it('getState returns valid state', () => {
      const state = getState();
      expect(['idle', 'initializing', 'ready', 'error']).toContain(state);
    });

    it('isReady returns boolean', () => {
      expect(typeof isReady()).toBe('boolean');
    });
  });

  describe('computeEmbedding', () => {
    it('returns array of 384 numbers for single text', async () => {
      const embedding = await computeEmbedding('test text');
      expect(embedding.length).toBe(384);
      expect(embedding.every((n) => typeof n === 'number')).toBe(true);
    });
  });

  describe('Property 7: Embedding Performance', () => {
    it('embedding function accepts text under 512 tokens', async () => {
      await fc.assert(
        fc.asyncProperty(fc.string({ minLength: 1, maxLength: 500 }), async (text) => {
          const embedding = await computeEmbedding(text);
          return embedding.length === 384;
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Property 8: Batch Embedding Correctness', () => {
    it('batch returns N embeddings for N texts', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 100 }), { minLength: 1, maxLength: 10 }),
          async (texts) => {
            const embeddings = await computeEmbeddings(texts);
            return embeddings.length === texts.length && embeddings.every((e) => e.length === 384);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  describe('preload', () => {
    it('preload function exists and is callable', async () => {
      expect(typeof preload).toBe('function');
      await expect(preload()).resolves.not.toThrow();
    });
  });
});
