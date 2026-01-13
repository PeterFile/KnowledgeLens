// Memory types
// Requirements: 6.1, 6.2, 6.3, 5.1

export interface Chunk {
  content: string;
  headingPath: string[];
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

// Document types for filtering
export type DocumentType = 'content' | 'preference';

// Preference types for user preferences
export type PreferenceType = 'expertise' | 'style' | 'domain' | 'custom';

export interface MemoryDocument {
  id: string;
  content: string;
  embedding: number[];
  sourceUrl: string;
  title: string;
  headingPath: string[];
  createdAt: number;
  docType?: DocumentType;
  preferenceType?: PreferenceType;
}

export interface SearchOptions {
  limit?: number;
  mode?: 'hybrid' | 'vector' | 'fulltext';
  hybridWeights?: { text: number; vector: number };
  filters?: {
    sourceUrl?: string;
    createdAfter?: number;
    createdBefore?: number;
    docType?: DocumentType;
    preferenceType?: PreferenceType;
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
