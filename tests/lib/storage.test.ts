import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { saveSettings, loadSettings, clearSettings } from '../../src/lib/storage';
import type { StoredSettings, LLMConfig, SearchConfig } from '../../src/types';

// Mock chrome.storage.local API
const mockStorage = new Map<string, unknown>();

const mockChromeStorage = {
  local: {
    get: vi.fn(async (keys: string[]) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        if (mockStorage.has(key)) {
          result[key] = mockStorage.get(key);
        }
      }
      return result;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        mockStorage.set(key, value);
      }
    }),
    remove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        mockStorage.delete(key);
      }
    }),
  },
};

// Install mock before tests
vi.stubGlobal('chrome', { storage: mockChromeStorage });

// Arbitrary generators for settings
const llmProviderArb = fc.constantFrom('openai', 'anthropic', 'gemini') as fc.Arbitrary<'openai' | 'anthropic' | 'gemini'>;
const searchProviderArb = fc.constantFrom('serpapi', 'google') as fc.Arbitrary<'serpapi' | 'google'>;

const apiKeyArb = fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim().length > 0);

const llmConfigArb: fc.Arbitrary<LLMConfig> = fc.record({
  provider: llmProviderArb,
  apiKey: apiKeyArb,
  model: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  maxContextTokens: fc.option(fc.integer({ min: 1000, max: 128000 }), { nil: undefined }),
});

const searchConfigArb: fc.Arbitrary<SearchConfig> = fc.record({
  provider: searchProviderArb,
  apiKey: apiKeyArb,
  searchEngineId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

const storedSettingsArb: fc.Arbitrary<StoredSettings> = fc.record({
  llmConfig: fc.option(llmConfigArb, { nil: undefined }),
  searchConfig: fc.option(searchConfigArb, { nil: undefined }),
});

/**
 * **Feature: knowledge-lens, Property 11: API key storage round trip**
 * **Validates: Requirements 8.2**
 *
 * For any valid API key string, saving it to storage and loading it back
 * SHALL return the identical string.
 */
describe('Property 11: API key storage round trip', () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it('saved settings can be loaded back identically', async () => {
    await fc.assert(
      fc.asyncProperty(storedSettingsArb, async (settings) => {
        // Save settings
        await saveSettings(settings);

        // Load settings back
        const loaded = await loadSettings();

        // Verify round trip
        expect(loaded).toEqual(settings);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('LLM API key is preserved exactly after round trip', async () => {
    await fc.assert(
      fc.asyncProperty(llmConfigArb, async (llmConfig) => {
        const settings: StoredSettings = { llmConfig };

        await saveSettings(settings);
        const loaded = await loadSettings();

        // API key must be identical
        return loaded?.llmConfig?.apiKey === llmConfig.apiKey;
      }),
      { numRuns: 100 }
    );
  });

  it('Search API key is preserved exactly after round trip', async () => {
    await fc.assert(
      fc.asyncProperty(searchConfigArb, async (searchConfig) => {
        const settings: StoredSettings = { searchConfig };

        await saveSettings(settings);
        const loaded = await loadSettings();

        // API key must be identical
        return loaded?.searchConfig?.apiKey === searchConfig.apiKey;
      }),
      { numRuns: 100 }
    );
  });

  it('multiple saves overwrite previous values correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        storedSettingsArb,
        storedSettingsArb,
        async (settings1, settings2) => {
          // Save first settings
          await saveSettings(settings1);

          // Save second settings (should overwrite)
          await saveSettings(settings2);

          // Load should return the second settings
          const loaded = await loadSettings();
          expect(loaded).toEqual(settings2);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('empty settings object round trips correctly', async () => {
    const emptySettings: StoredSettings = {};

    await saveSettings(emptySettings);
    const loaded = await loadSettings();

    expect(loaded).toEqual(emptySettings);
  });

  it('settings with only llmConfig round trips correctly', async () => {
    await fc.assert(
      fc.asyncProperty(llmConfigArb, async (llmConfig) => {
        const settings: StoredSettings = { llmConfig };

        await saveSettings(settings);
        const loaded = await loadSettings();

        expect(loaded).toEqual(settings);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('settings with only searchConfig round trips correctly', async () => {
    await fc.assert(
      fc.asyncProperty(searchConfigArb, async (searchConfig) => {
        const settings: StoredSettings = { searchConfig };

        await saveSettings(settings);
        const loaded = await loadSettings();

        expect(loaded).toEqual(settings);
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: knowledge-lens, Property 12: API key deletion**
 * **Validates: Requirements 8.4**
 *
 * For any stored API key, after calling the clear function,
 * loading SHALL return null or undefined.
 */
describe('Property 12: API key deletion', () => {
  beforeEach(() => {
    mockStorage.clear();
    vi.clearAllMocks();
  });

  it('clearSettings removes all stored settings', async () => {
    await fc.assert(
      fc.asyncProperty(storedSettingsArb, async (settings) => {
        // Save settings first
        await saveSettings(settings);

        // Verify settings exist
        const beforeClear = await loadSettings();
        expect(beforeClear).toEqual(settings);

        // Clear settings
        await clearSettings();

        // Verify settings are gone
        const afterClear = await loadSettings();
        return afterClear === null;
      }),
      { numRuns: 100 }
    );
  });

  it('clearSettings on empty storage does not throw', async () => {
    // Should not throw when storage is already empty
    await expect(clearSettings()).resolves.not.toThrow();

    const loaded = await loadSettings();
    expect(loaded).toBeNull();
  });

  it('loadSettings returns null when no settings exist', async () => {
    const loaded = await loadSettings();
    expect(loaded).toBeNull();
  });

  it('clearSettings removes LLM API key completely', async () => {
    await fc.assert(
      fc.asyncProperty(llmConfigArb, async (llmConfig) => {
        const settings: StoredSettings = { llmConfig };

        await saveSettings(settings);
        await clearSettings();

        const loaded = await loadSettings();
        return loaded === null;
      }),
      { numRuns: 100 }
    );
  });

  it('clearSettings removes Search API key completely', async () => {
    await fc.assert(
      fc.asyncProperty(searchConfigArb, async (searchConfig) => {
        const settings: StoredSettings = { searchConfig };

        await saveSettings(settings);
        await clearSettings();

        const loaded = await loadSettings();
        return loaded === null;
      }),
      { numRuns: 100 }
    );
  });

  it('save after clear works correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        storedSettingsArb,
        storedSettingsArb,
        async (settings1, settings2) => {
          // Save, clear, then save again
          await saveSettings(settings1);
          await clearSettings();
          await saveSettings(settings2);

          const loaded = await loadSettings();
          expect(loaded).toEqual(settings2);
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
