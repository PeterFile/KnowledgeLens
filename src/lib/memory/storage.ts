// IndexedDB storage layer for memory snapshots
// Requirements: 1.1, 1.2, 1.5, 1.6

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'knowledgelens_memory';
const DB_VERSION = 1;

export type SnapshotData = unknown;

interface MemoryDB {
  snapshots: {
    key: string;
    value: {
      id: string;
      data: SnapshotData;
      createdAt: number;
      documentCount: number;
    };
    indexes: { createdAt: number };
  };
  metadata: {
    key: string;
    value: unknown;
  };
}

let dbInstance: IDBPDatabase<MemoryDB> | null = null;

export async function openDatabase(): Promise<IDBPDatabase<MemoryDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<MemoryDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('snapshots')) {
        const store = db.createObjectStore('snapshots', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata');
      }
    },
  });

  return dbInstance;
}

export async function saveSnapshot(
  id: string,
  data: SnapshotData,
  documentCount: number
): Promise<void> {
  try {
    const db = await openDatabase();
    await db.put('snapshots', {
      id,
      data,
      createdAt: Date.now(),
      documentCount,
    });
  } catch (error) {
    console.error('[Memory] Failed to save snapshot:', error);
  }
}

export async function loadLatestSnapshot(): Promise<{
  data: SnapshotData;
  documentCount: number;
} | null> {
  try {
    const db = await openDatabase();
    const all = await db.getAllFromIndex('snapshots', 'createdAt');
    if (all.length === 0) return null;

    const latest = all[all.length - 1];
    return { data: latest.data, documentCount: latest.documentCount };
  } catch (error) {
    console.error('[Memory] Failed to load snapshot:', error);
    return null;
  }
}

export async function deleteOldSnapshots(keepCount: number): Promise<void> {
  try {
    const db = await openDatabase();
    const all = await db.getAllKeysFromIndex('snapshots', 'createdAt');

    if (all.length <= keepCount) return;

    const toDelete = all.slice(0, all.length - keepCount);
    const tx = db.transaction('snapshots', 'readwrite');
    await Promise.all(toDelete.map((key) => tx.store.delete(key)));
    await tx.done;
  } catch (error) {
    console.error('[Memory] Failed to delete old snapshots:', error);
  }
}

export async function clearSnapshots(): Promise<void> {
  try {
    const db = await openDatabase();
    await db.clear('snapshots');
  } catch (error) {
    console.error('[Memory] Failed to clear snapshots:', error);
    throw error instanceof Error ? error : new Error('Failed to clear snapshots');
  }
}

export async function getMetadata<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    const value = await db.get('metadata', key);
    return (value as T) ?? null;
  } catch (error) {
    console.error('[Memory] Failed to get metadata:', error);
    return null;
  }
}

export async function setMetadata<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await db.put('metadata', value, key);
  } catch (error) {
    console.error('[Memory] Failed to set metadata:', error);
  }
}

export async function clearMetadata(): Promise<void> {
  try {
    const db = await openDatabase();
    await db.clear('metadata');
  } catch (error) {
    console.error('[Memory] Failed to clear metadata:', error);
    throw error instanceof Error ? error : new Error('Failed to clear metadata');
  }
}
