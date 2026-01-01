// Memory types
// Requirements: 6.1, 6.2, 6.3

export interface Chunk {
  content: string;
  headingPath: string[];
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

export interface MemoryDocument {
  id: string;
  content: string;
  embedding: number[];
  sourceUrl: string;
  title: string;
  headingPath: string[];
  createdAt: number;
}

export interface SearchOptions {
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
  hybridWeights?: { text: number; vector: number };
  filters?: {
    sourceUrl?: string;
    createdAfter?: number;
    createdBefore?: number;
  };
}

export interface SearchResult {
  document: MemoryDocument;
  score: number;
}

export interface MemoryStats {
  documentCount: number;
  indexSizeBytes: number;
  lastSyncTime: number | null;
  embeddingModelLoaded: boolean;
}

export interface AddDocumentOptions {
  sourceUrl: string;
  title: string;
}
