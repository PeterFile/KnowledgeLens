// Memory Manager - unified interface for memory operations
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6

import {
  saveSnapshot,
  loadLatestSnapshot,
  deleteOldSnapshots,
  setMetadata,
  getMetadata,
} from './storage';
import { createVectorStore, restoreFromSnapshot, type VectorStore } from './vector-store';
import { chunkHtmlContent } from './chunker';
import { computeEmbedding, computeEmbeddings, isReady, preload } from './embedding-client';
import type { Chunk, SearchOptions, SearchResult, MemoryStats, AddDocumentOptions } from './types';

const SNAPSHOT_ID_PREFIX = 'snapshot_';
const MAX_SNAPSHOTS = 3;

interface MemoryManager {
  addDocument(content: string, metadata: AddDocumentOptions): Promise<string[]>;
  addChunks(chunks: Chunk[], metadata: AddDocumentOptions): Promise<string[]>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  sync(): Promise<void>;
  getStats(): MemoryStats;
}

let instance: MemoryManager | null = null;
let vectorStore: VectorStore | null = null;
let lastSyncTime: number | null = null;
let indexSizeBytes = 0;

async function initialize(): Promise<void> {
  if (vectorStore) return;

  const snapshot = await loadLatestSnapshot();
  if (snapshot) {
    vectorStore = await restoreFromSnapshot(snapshot.data);
    indexSizeBytes = snapshot.data.byteLength;
    lastSyncTime = await getMetadata<number>('lastSyncTime');
  } else {
    vectorStore = await createVectorStore();
  }

  // Start preloading embedding model
  preload().catch(console.error);
}

export async function getMemoryManager(): Promise<MemoryManager> {
  if (instance) return instance;

  await initialize();

  instance = {
    async addDocument(content, metadata) {
      const chunks = chunkHtmlContent(content);
      return this.addChunks(chunks, metadata);
    },

    async addChunks(chunks, metadata) {
      if (!vectorStore) throw new Error('Memory not initialized');
      if (chunks.length === 0) return [];

      const texts = chunks.map((c) => c.content);
      const embeddings = await computeEmbeddings(texts);

      const docs = chunks.map((chunk, i) => ({
        content: chunk.content,
        embedding: embeddings[i],
        sourceUrl: metadata.sourceUrl,
        title: metadata.title,
        headingPath: chunk.headingPath,
        createdAt: Date.now(),
      }));

      return vectorStore.insertBatch(docs);
    },

    async search(query, options = {}) {
      if (!vectorStore) throw new Error('Memory not initialized');

      const embedding = await computeEmbedding(query);
      return vectorStore.search(query, embedding, options);
    },

    async sync() {
      if (!vectorStore) return;

      const snapshot = await vectorStore.toSnapshot();
      const snapshotId = `${SNAPSHOT_ID_PREFIX}${Date.now()}`;

      await saveSnapshot(snapshotId, snapshot, vectorStore.getDocumentCount());
      await deleteOldSnapshots(MAX_SNAPSHOTS);

      lastSyncTime = Date.now();
      indexSizeBytes = snapshot.byteLength;
      await setMetadata('lastSyncTime', lastSyncTime);
    },

    getStats() {
      return {
        documentCount: vectorStore?.getDocumentCount() ?? 0,
        indexSizeBytes,
        lastSyncTime,
        embeddingModelLoaded: isReady(),
      };
    },
  };

  return instance;
}

// Re-export types and utilities
export type { Chunk, SearchOptions, SearchResult, MemoryStats, AddDocumentOptions } from './types';
export { chunkHtmlContent } from './chunker';
