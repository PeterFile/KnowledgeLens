// Memory Manager - unified interface for memory operations
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 3.4, 3.5

import {
  saveSnapshot,
  loadLatestSnapshot,
  deleteOldSnapshots,
  setMetadata,
  getMetadata,
  clearSnapshots,
  clearMetadata,
} from './storage';
import {
  createVectorStore,
  restoreFromSnapshot,
  type VectorStore,
  type VectorStoreSnapshot,
} from './vector-store';
import { chunkHtmlContent } from './chunker';
import { computeEmbedding, computeEmbeddings, isReady, preload } from './embedding-client';
import type { Chunk, SearchOptions, SearchResult, MemoryStats, AddDocumentOptions } from './types';

const SNAPSHOT_ID_PREFIX = 'snapshot_';
const MAX_SNAPSHOTS = 3;

interface MemoryManager {
  addDocument(content: string, metadata: AddDocumentOptions): Promise<string[]>;
  addChunks(chunks: Chunk[], metadata: AddDocumentOptions): Promise<string[]>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  removeById(id: string): Promise<boolean>;
  removeBySourceUrl(sourceUrl: string): Promise<number>;
  searchBySourceUrl(sourceUrl: string, limit?: number): Promise<SearchResult[]>;
  clearAll(): Promise<void>;
  sync(): Promise<void>;
  getStats(): MemoryStats;
}

let instance: MemoryManager | null = null;
let vectorStore: VectorStore | null = null;
let lastSyncTime: number | null = null;
let indexSizeBytes = 0;

function estimateSnapshotSize(data: VectorStoreSnapshot | null): number {
  if (!data) return 0;
  try {
    const json = JSON.stringify(data);
    if (!json) return 0;
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).byteLength;
    }
    return json.length;
  } catch {
    return 0;
  }
}

async function initialize(): Promise<void> {
  if (vectorStore) return;

  const snapshot = await loadLatestSnapshot();
  if (snapshot) {
    vectorStore = await restoreFromSnapshot(snapshot.data as VectorStoreSnapshot);
    indexSizeBytes = estimateSnapshotSize(snapshot.data as VectorStoreSnapshot);
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
        docType: metadata.docType ?? 'content',
        preferenceType: metadata.preferenceType ?? 'custom',
      }));

      return vectorStore.insertBatch(docs);
    },

    async search(query, options = {}) {
      if (!vectorStore) throw new Error('Memory not initialized');

      const embedding = await computeEmbedding(query);
      return vectorStore.search(query, embedding, options);
    },

    async removeById(id) {
      if (!vectorStore) throw new Error('Memory not initialized');
      return vectorStore.remove(id);
    },

    async removeBySourceUrl(sourceUrl) {
      if (!vectorStore) throw new Error('Memory not initialized');
      return vectorStore.removeByFilter({ sourceUrl });
    },

    async searchBySourceUrl(sourceUrl, limit = 100) {
      if (!vectorStore) throw new Error('Memory not initialized');
      return vectorStore.searchByFilter({ sourceUrl }, limit);
    },

    async clearAll() {
      if (!vectorStore) throw new Error('Memory not initialized');

      await clearSnapshots();
      await clearMetadata();

      vectorStore = await createVectorStore();
      lastSyncTime = null;
      indexSizeBytes = 0;
    },

    async sync() {
      if (!vectorStore) return;

      const snapshot = await vectorStore.toSnapshot();
      const snapshotId = `${SNAPSHOT_ID_PREFIX}${Date.now()}`;

      await saveSnapshot(snapshotId, snapshot, vectorStore.getDocumentCount());
      await deleteOldSnapshots(MAX_SNAPSHOTS);

      lastSyncTime = Date.now();
      indexSizeBytes = estimateSnapshotSize(snapshot);
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
export type {
  Chunk,
  SearchOptions,
  SearchResult,
  MemoryStats,
  AddDocumentOptions,
  DocumentType,
  PreferenceType,
} from './types';
export { chunkHtmlContent } from './chunker';
