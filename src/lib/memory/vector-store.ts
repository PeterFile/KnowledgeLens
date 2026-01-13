// Vector store using Orama for hybrid search
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.1

import { create, insert, search, remove, count, type Orama } from '@orama/orama';
import { persist, restore } from '@orama/plugin-data-persistence';
import type { DocumentType, PreferenceType } from './types';

export interface Document {
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
  document: Document;
  score: number;
}

const SCHEMA = {
  id: 'string',
  content: 'string',
  embedding: 'vector[384]',
  sourceUrl: 'string',
  title: 'string',
  headingPath: 'string[]',
  createdAt: 'number',
  docType: 'string',
  preferenceType: 'string',
} as const;

type OramaDB = Orama<typeof SCHEMA>;

export interface VectorStore {
  insert(doc: Omit<Document, 'id'>): Promise<string>;
  insertBatch(docs: Omit<Document, 'id'>[]): Promise<string[]>;
  search(query: string, embedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
  searchByFilter(filters: SearchOptions['filters'], limit?: number): Promise<SearchResult[]>;
  remove(id: string): Promise<boolean>;
  removeByFilter(filters: SearchOptions['filters']): Promise<number>;
  getDocumentCount(): number;
  toSnapshot(): Promise<ArrayBuffer>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function buildWhereClause(filters?: SearchOptions['filters']) {
  if (!filters) return undefined;

  const where: Record<string, unknown> = {};

  if (filters.sourceUrl) {
    where.sourceUrl = filters.sourceUrl;
  }

  if (filters.docType) {
    where.docType = filters.docType;
  }

  if (filters.preferenceType) {
    where.preferenceType = filters.preferenceType;
  }

  if (filters.createdAfter || filters.createdBefore) {
    where.createdAt = {};
    if (filters.createdAfter) {
      (where.createdAt as Record<string, number>).gte = filters.createdAfter;
    }
    if (filters.createdBefore) {
      (where.createdAt as Record<string, number>).lte = filters.createdBefore;
    }
  }

  return Object.keys(where).length > 0 ? where : undefined;
}

export async function createVectorStore(): Promise<VectorStore> {
  const db: OramaDB = await create({ schema: SCHEMA });
  return wrapDatabase(db);
}

export async function restoreFromSnapshot(data: ArrayBuffer): Promise<VectorStore> {
  const db = await restore('binary', data as unknown as string);
  return wrapDatabase(db as OramaDB);
}

function wrapDatabase(db: OramaDB): VectorStore {
  return {
    async insert(doc) {
      const id = generateId();
      await insert(db, { ...doc, id });
      return id;
    },

    async insertBatch(docs) {
      const ids: string[] = [];
      for (const doc of docs) {
        const id = generateId();
        await insert(db, { ...doc, id });
        ids.push(id);
      }
      return ids;
    },

    async search(query, embedding, options = {}) {
      const { limit = 10, mode = 'hybrid', hybridWeights, filters } = options;
      const where = buildWhereClause(filters);

      let results;

      if (mode === 'fulltext') {
        results = await search(db, {
          term: query,
          limit,
          where,
        });
      } else if (mode === 'vector') {
        results = await search(db, {
          mode: 'vector',
          vector: { value: embedding, property: 'embedding' },
          limit,
          where,
          similarity: 0.5,
        });
      } else {
        // Hybrid mode
        results = await search(db, {
          mode: 'hybrid',
          term: query,
          vector: { value: embedding, property: 'embedding' },
          limit,
          where,
          similarity: 0.5,
          hybridWeights: hybridWeights || { text: 0.5, vector: 0.5 },
        });
      }

      return results.hits.map((hit) => ({
        document: hit.document as Document,
        score: hit.score,
      }));
    },

    async remove(id) {
      try {
        await remove(db, id);
        return true;
      } catch {
        return false;
      }
    },

    async searchByFilter(filters, limit = 1000) {
      const where = buildWhereClause(filters);
      if (!where) return [];

      // Use fulltext search with empty term to get all matching documents
      const results = await search(db, {
        term: '',
        limit,
        where,
      });

      return results.hits.map((hit) => ({
        document: hit.document as Document,
        score: hit.score,
      }));
    },

    async removeByFilter(filters) {
      const where = buildWhereClause(filters);
      if (!where) return 0;

      // First find all matching documents
      const results = await search(db, {
        term: '',
        limit: 10000, // High limit to get all matching docs
        where,
      });

      // Remove each document
      let removedCount = 0;
      for (const hit of results.hits) {
        try {
          await remove(db, hit.id);
          removedCount++;
        } catch {
          // Ignore removal errors for individual documents
        }
      }

      return removedCount;
    },

    getDocumentCount() {
      return count(db);
    },

    async toSnapshot(): Promise<ArrayBuffer> {
      const data = await persist(db, 'binary');
      return (data as Uint8Array).buffer as ArrayBuffer;
    },
  };
}
