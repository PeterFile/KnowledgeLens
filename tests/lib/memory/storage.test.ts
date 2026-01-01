import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openDatabase,
  saveSnapshot,
  loadLatestSnapshot,
  deleteOldSnapshots,
  getMetadata,
  setMetadata,
} from '../../../src/lib/memory/storage';

// Mock idb module
const mockStore = new Map<string, unknown>();
const mockMetadataStore = new Map<string, unknown>();

vi.mock('idb', () => ({
  openDB: vi.fn(async () => ({
    put: vi.fn(async (storeName: string, value: unknown, key?: string) => {
      if (storeName === 'snapshots') {
        mockStore.set((value as { id: string }).id, value);
      } else if (storeName === 'metadata') {
        mockMetadataStore.set(key!, value);
      }
    }),
    get: vi.fn(async (storeName: string, key: string) => {
      if (storeName === 'metadata') {
        return mockMetadataStore.get(key);
      }
      return mockStore.get(key);
    }),
    getAllFromIndex: vi.fn(async () => {
      const values = Array.from(mockStore.values()) as Array<{ createdAt: number }>;
      return values.sort((a, b) => a.createdAt - b.createdAt);
    }),
    getAllKeysFromIndex: vi.fn(async () => {
      const values = Array.from(mockStore.values()) as Array<{ id: string; createdAt: number }>;
      return values.sort((a, b) => a.createdAt - b.createdAt).map((v) => v.id);
    }),
    transaction: vi.fn(() => ({
      store: {
        delete: vi.fn(async (key: string) => {
          mockStore.delete(key);
        }),
      },
      done: Promise.resolve(),
    })),
  })),
}));

describe('IndexedDB Storage Module', () => {
  beforeEach(() => {
    mockStore.clear();
    mockMetadataStore.clear();
    vi.clearAllMocks();
  });

  describe('openDatabase', () => {
    it('returns a database instance', async () => {
      const db = await openDatabase();
      expect(db).toBeDefined();
    });

    it('returns the same instance on subsequent calls', async () => {
      const db1 = await openDatabase();
      const db2 = await openDatabase();
      expect(db1).toBe(db2);
    });
  });

  describe('saveSnapshot and loadLatestSnapshot', () => {
    it('saves and loads snapshot correctly', async () => {
      const data = new ArrayBuffer(100);
      const view = new Uint8Array(data);
      view[0] = 42;
      view[99] = 255;

      await saveSnapshot('test-snapshot', data, 10);
      const loaded = await loadLatestSnapshot();

      expect(loaded).not.toBeNull();
      expect(loaded!.documentCount).toBe(10);
      expect(new Uint8Array(loaded!.data)[0]).toBe(42);
      expect(new Uint8Array(loaded!.data)[99]).toBe(255);
    });

    it('returns null when no snapshots exist', async () => {
      const loaded = await loadLatestSnapshot();
      expect(loaded).toBeNull();
    });

    it('returns the latest snapshot when multiple exist', async () => {
      const data1 = new ArrayBuffer(10);
      const data2 = new ArrayBuffer(20);

      await saveSnapshot('snapshot-1', data1, 5);
      await new Promise((r) => setTimeout(r, 10));
      await saveSnapshot('snapshot-2', data2, 15);

      const loaded = await loadLatestSnapshot();
      expect(loaded!.documentCount).toBe(15);
    });
  });

  describe('deleteOldSnapshots', () => {
    it('keeps the specified number of snapshots', async () => {
      for (let i = 0; i < 5; i++) {
        await saveSnapshot(`snapshot-${i}`, new ArrayBuffer(10), i);
        await new Promise((r) => setTimeout(r, 5));
      }

      await deleteOldSnapshots(2);
      expect(mockStore.size).toBe(2);
    });

    it('does nothing when fewer snapshots than keepCount', async () => {
      await saveSnapshot('snapshot-1', new ArrayBuffer(10), 1);
      await deleteOldSnapshots(5);
      expect(mockStore.size).toBe(1);
    });
  });

  describe('metadata operations', () => {
    it('saves and retrieves metadata', async () => {
      await setMetadata('testKey', { value: 123 });
      const result = await getMetadata<{ value: number }>('testKey');
      expect(result).toEqual({ value: 123 });
    });

    it('returns null for non-existent metadata', async () => {
      const result = await getMetadata('nonexistent');
      expect(result).toBeNull();
    });

    it('overwrites existing metadata', async () => {
      await setMetadata('key', 'first');
      await setMetadata('key', 'second');
      const result = await getMetadata<string>('key');
      expect(result).toBe('second');
    });
  });
});
