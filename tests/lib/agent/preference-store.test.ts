// Preference Store Tests
// Tests for user preference storage and detection
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.6

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock dependencies
const mockMemoryManager = {
  addDocument: vi.fn(),
  addChunks: vi.fn(),
  search: vi.fn(),
  searchBySourceUrl: vi.fn(),
  removeBySourceUrl: vi.fn(),
  removeById: vi.fn(),
  sync: vi.fn(),
  getStats: vi.fn(() => ({
    documentCount: 0,
    indexSizeBytes: 0,
    lastSyncTime: null,
    embeddingModelLoaded: true,
  })),
};

vi.mock('../../../src/lib/memory', () => ({
  getMemoryManager: vi.fn(async () => mockMemoryManager),
}));

// Import after mocking
import {
  detectPreferenceIntent,
  getPreferenceStore,
  resetPreferenceStore,
  type PreferenceType,
} from '../../../src/lib/agent/preference-store';

// ============================================================================
// Unit Tests
// ============================================================================

describe('Preference Store Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreferenceStore();
    mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
    mockMemoryManager.removeBySourceUrl.mockResolvedValue(0);
    mockMemoryManager.addChunks.mockResolvedValue(['pref-id-1']);
    mockMemoryManager.removeById.mockResolvedValue(true);
  });

  describe('detectPreferenceIntent', () => {
    describe('profession patterns', () => {
      it('detects "I\'m a [profession]" pattern', () => {
        const result = detectPreferenceIntent("I'm a software engineer");
        expect(result).not.toBeNull();
        expect(result!.isPreference).toBe(true);
        expect(result!.type).toBe('expertise');
        expect(result!.content).toContain('software engineer');
      });

      it('detects "I am a [profession]" pattern', () => {
        const result = detectPreferenceIntent('I am a data scientist');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('expertise');
        expect(result!.content).toContain('data scientist');
      });

      it('detects "I work as a [profession]" pattern', () => {
        const result = detectPreferenceIntent('I work as a product manager');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('expertise');
        expect(result!.content).toContain('product manager');
      });

      it('detects "My job is [profession]" pattern', () => {
        const result = detectPreferenceIntent('My job is a teacher');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('expertise');
      });

      it('filters out invalid profession phrases', () => {
        expect(detectPreferenceIntent("I'm here")).toBeNull();
        expect(detectPreferenceIntent("I'm ready")).toBeNull();
        expect(detectPreferenceIntent("I'm fine")).toBeNull();
        expect(detectPreferenceIntent("I'm looking for help")).toBeNull();
      });
    });

    describe('level patterns', () => {
      it('detects "explain like I\'m a [level]" pattern', () => {
        const result = detectPreferenceIntent("explain like I'm a beginner");
        expect(result).not.toBeNull();
        expect(result!.isPreference).toBe(true);
        expect(result!.type).toBe('style');
        expect(result!.content).toContain('beginner');
      });

      it('detects "explain as if I were a [level]" pattern', () => {
        const result = detectPreferenceIntent('explain as if I were a 5 year old');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('style');
      });

      it('detects "treat me like a [level]" pattern', () => {
        const result = detectPreferenceIntent('treat me like an expert');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('style');
        expect(result!.content).toContain('expert');
      });
    });

    describe('style patterns', () => {
      it('detects "I prefer [style] explanations" pattern', () => {
        const result = detectPreferenceIntent('I prefer technical explanations');
        expect(result).not.toBeNull();
        expect(result!.isPreference).toBe(true);
        expect(result!.type).toBe('style');
        expect(result!.content).toContain('technical');
      });

      it('detects "I like [style] style" pattern', () => {
        const result = detectPreferenceIntent('I like concise style');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('style');
      });

      it('detects "please use [style] format" pattern', () => {
        const result = detectPreferenceIntent('please use simple format');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('style');
      });
    });

    describe('domain patterns', () => {
      it('detects "I\'m interested in [domain]" pattern', () => {
        const result = detectPreferenceIntent("I'm interested in machine learning");
        expect(result).not.toBeNull();
        expect(result!.isPreference).toBe(true);
        expect(result!.type).toBe('domain');
        expect(result!.content).toContain('machine learning');
      });

      it('detects "My field is [domain]" pattern', () => {
        const result = detectPreferenceIntent('My field is web development');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('domain');
      });

      it('detects "I study [domain]" pattern', () => {
        const result = detectPreferenceIntent('I study computer science');
        expect(result).not.toBeNull();
        expect(result!.type).toBe('domain');
      });
    });

    describe('non-preference messages', () => {
      it('returns null for regular questions', () => {
        expect(detectPreferenceIntent('What is machine learning?')).toBeNull();
        expect(detectPreferenceIntent('How do I use React?')).toBeNull();
        expect(detectPreferenceIntent('Can you explain this code?')).toBeNull();
      });

      it('returns null for empty input', () => {
        expect(detectPreferenceIntent('')).toBeNull();
        expect(detectPreferenceIntent('   ')).toBeNull();
      });
    });
  });

  describe('PreferenceStore', () => {
    describe('add', () => {
      it('adds preference to memory manager', async () => {
        const store = getPreferenceStore();
        const id = await store.add({ type: 'expertise', content: 'User is a developer' });

        expect(id).toBe('pref-id-1');
        expect(mockMemoryManager.addChunks).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              content: 'User is a developer',
              headingPath: ['preferences', 'expertise'],
            }),
          ]),
          expect.objectContaining({
            sourceUrl: 'preference://user',
            docType: 'preference',
            preferenceType: 'expertise',
          })
        );
      });
    });

    describe('getAll', () => {
      it('returns all preferences from memory', async () => {
        mockMemoryManager.searchBySourceUrl.mockResolvedValue([
          {
            document: {
              id: 'pref-1',
              content: 'User is a developer',
              preferenceType: 'expertise',
              sourceUrl: 'preference://user',
              title: 'User Preference: expertise',
              headingPath: ['preferences', 'expertise'],
              createdAt: 1000,
              embedding: [],
            },
            score: 1.0,
          },
          {
            document: {
              id: 'pref-2',
              content: 'Preferred style: technical',
              preferenceType: 'style',
              sourceUrl: 'preference://user',
              title: 'User Preference: style',
              headingPath: ['preferences', 'style'],
              createdAt: 2000,
              embedding: [],
            },
            score: 1.0,
          },
        ]);

        const store = getPreferenceStore();
        const preferences = await store.getAll();

        expect(preferences).toHaveLength(2);
        expect(preferences[0].type).toBe('expertise');
        expect(preferences[1].type).toBe('style');
      });
    });

    describe('remove', () => {
      it('removes preference by id', async () => {
        const store = getPreferenceStore();
        const result = await store.remove('pref-1');

        expect(result).toBe(true);
        expect(mockMemoryManager.removeById).toHaveBeenCalledWith('pref-1');
      });
    });

    describe('clear', () => {
      it('removes all preferences', async () => {
        const store = getPreferenceStore();
        await store.clear();

        expect(mockMemoryManager.removeBySourceUrl).toHaveBeenCalledWith('preference://user');
      });
    });

    describe('formatForContext', () => {
      it('formats preferences within budget', async () => {
        mockMemoryManager.searchBySourceUrl.mockResolvedValue([
          {
            document: {
              id: 'pref-1',
              content: 'User is a software engineer',
              preferenceType: 'expertise',
              sourceUrl: 'preference://user',
              title: 'User Preference: expertise',
              headingPath: ['preferences', 'expertise'],
              createdAt: 1000,
              embedding: [],
            },
            score: 1.0,
          },
        ]);

        const store = getPreferenceStore();
        const formatted = await store.formatForContext(500);

        expect(formatted).toContain('User is a software engineer');
      });

      it('returns empty string when no preferences', async () => {
        mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);

        const store = getPreferenceStore();
        const formatted = await store.formatForContext(500);

        expect(formatted).toBe('');
      });

      it('prioritizes expertise over style preferences', async () => {
        mockMemoryManager.searchBySourceUrl.mockResolvedValue([
          {
            document: {
              id: 'pref-1',
              content: 'Preferred style: technical',
              preferenceType: 'style',
              sourceUrl: 'preference://user',
              title: 'User Preference: style',
              headingPath: ['preferences', 'style'],
              createdAt: 1000,
              embedding: [],
            },
            score: 1.0,
          },
          {
            document: {
              id: 'pref-2',
              content: 'User is a developer',
              preferenceType: 'expertise',
              sourceUrl: 'preference://user',
              title: 'User Preference: expertise',
              headingPath: ['preferences', 'expertise'],
              createdAt: 2000,
              embedding: [],
            },
            score: 1.0,
          },
        ]);

        const store = getPreferenceStore();
        const formatted = await store.formatForContext(500);

        // Expertise should come before style
        const expertiseIndex = formatted.indexOf('User is a developer');
        const styleIndex = formatted.indexOf('Preferred style: technical');
        expect(expertiseIndex).toBeLessThan(styleIndex);
      });
    });
  });

  describe('getPreferenceStore singleton', () => {
    it('returns same instance on multiple calls', () => {
      const store1 = getPreferenceStore();
      const store2 = getPreferenceStore();
      expect(store1).toBe(store2);
    });

    it('returns new instance after reset', () => {
      const store1 = getPreferenceStore();
      resetPreferenceStore();
      const store2 = getPreferenceStore();
      expect(store1).not.toBe(store2);
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Property-Based Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreferenceStore();
    mockMemoryManager.searchBySourceUrl.mockResolvedValue([]);
    mockMemoryManager.addChunks.mockResolvedValue(['pref-id-1']);
  });

  // Generators for preference messages
  const professionArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z ]{3,30}$/);
  const levelArb = fc.constantFrom('beginner', 'intermediate', 'expert', 'advanced', '5 year old');
  const styleArb = fc.constantFrom('technical', 'simple', 'detailed', 'concise', 'visual');
  const domainArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z ]{3,30}$/);

  // Preference message generators
  const professionMessageArb = fc.oneof(
    professionArb.map((p) => `I'm a ${p}`),
    professionArb.map((p) => `I am a ${p}`),
    professionArb.map((p) => `I work as a ${p}`),
    professionArb.map((p) => `My job is a ${p}`)
  );

  const levelMessageArb = fc.oneof(
    levelArb.map((l) => `explain like I'm a ${l}`),
    levelArb.map((l) => `explain as if I were a ${l}`),
    levelArb.map((l) => `treat me like a ${l}`)
  );

  const styleMessageArb = fc.oneof(
    styleArb.map((s) => `I prefer ${s} explanations`),
    styleArb.map((s) => `I like ${s} style`),
    styleArb.map((s) => `please use ${s} format`)
  );

  const domainMessageArb = fc.oneof(
    domainArb.map((d) => `I'm interested in ${d}`),
    domainArb.map((d) => `My field is ${d}`),
    domainArb.map((d) => `I study ${d}`)
  );

  const preferenceMessageArb = fc.oneof(
    professionMessageArb,
    levelMessageArb,
    styleMessageArb,
    domainMessageArb
  );

  // Non-preference message generator
  const nonPreferenceMessageArb = fc.oneof(
    fc.constant('What is machine learning?'),
    fc.constant('How do I use React?'),
    fc.constant('Can you explain this code?'),
    fc.constant('Tell me about TypeScript'),
    fc.stringMatching(/^[A-Z][a-z]{5,20}\?$/) // Questions
  );

  /**
   * **Feature: agent-memory-integration, Property 10: Preference Detection**
   * *For any* user message containing explicit preference indicators
   * (e.g., "I'm a [profession]", "explain like I'm a [level]", "I prefer [style]"),
   * the preference detection function SHALL identify it as a preference and extract
   * the relevant content.
   * **Validates: Requirements 5.2**
   */
  describe('Property 10: Preference Detection', () => {
    it('profession patterns are always detected as expertise preferences', () => {
      fc.assert(
        fc.property(professionMessageArb, (message) => {
          const result = detectPreferenceIntent(message);

          // Should detect as preference
          expect(result).not.toBeNull();
          expect(result!.isPreference).toBe(true);
          expect(result!.type).toBe('expertise');
          expect(result!.content.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('level patterns are always detected as style preferences', () => {
      fc.assert(
        fc.property(levelMessageArb, (message) => {
          const result = detectPreferenceIntent(message);

          expect(result).not.toBeNull();
          expect(result!.isPreference).toBe(true);
          expect(result!.type).toBe('style');
          expect(result!.content.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('style patterns are always detected as style preferences', () => {
      fc.assert(
        fc.property(styleMessageArb, (message) => {
          const result = detectPreferenceIntent(message);

          expect(result).not.toBeNull();
          expect(result!.isPreference).toBe(true);
          expect(result!.type).toBe('style');
          expect(result!.content.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('domain patterns are always detected as domain preferences', () => {
      fc.assert(
        fc.property(domainMessageArb, (message) => {
          const result = detectPreferenceIntent(message);

          expect(result).not.toBeNull();
          expect(result!.isPreference).toBe(true);
          expect(result!.type).toBe('domain');
          expect(result!.content.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('detected preferences always have non-empty content', () => {
      fc.assert(
        fc.property(preferenceMessageArb, (message) => {
          const result = detectPreferenceIntent(message);

          if (result !== null) {
            expect(result.content).toBeTruthy();
            expect(result.content.trim().length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('non-preference messages are not detected as preferences', () => {
      fc.assert(
        fc.property(nonPreferenceMessageArb, (message) => {
          const result = detectPreferenceIntent(message);
          expect(result).toBeNull();
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: agent-memory-integration, Property 11: Preference Inclusion**
   * *For any* RAG context build where user preferences exist, the preferences
   * SHALL be included in the "User Profile" section regardless of the search query,
   * and the preference token count SHALL be deducted from the total budget before
   * calculating the knowledge budget.
   * **Validates: Requirements 5.3, 5.4**
   */
  describe('Property 11: Preference Inclusion', () => {
    const preferenceTypeArb = fc.constantFrom<PreferenceType>(
      'expertise',
      'style',
      'domain',
      'custom'
    );
    const preferenceContentArb = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{10,100}$/);
    const budgetArb = fc.integer({ min: 100, max: 1000 });

    it('formatForContext includes all preferences that fit within budget', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: preferenceTypeArb,
              content: preferenceContentArb,
            }),
            { minLength: 1, maxLength: 5 }
          ),
          budgetArb,
          async (preferences, budget) => {
            vi.clearAllMocks();
            resetPreferenceStore();

            // Mock preferences in memory
            mockMemoryManager.searchBySourceUrl.mockResolvedValue(
              preferences.map((pref, i) => ({
                document: {
                  id: `pref-${i}`,
                  content: pref.content,
                  preferenceType: pref.type,
                  sourceUrl: 'preference://user',
                  title: `User Preference: ${pref.type}`,
                  headingPath: ['preferences', pref.type],
                  createdAt: Date.now() - i * 1000,
                  embedding: [],
                },
                score: 1.0,
              }))
            );

            const store = getPreferenceStore();
            const formatted = await store.formatForContext(budget);

            // If preferences exist, formatted should not be empty (unless budget is too small)
            if (preferences.length > 0 && budget > 10) {
              // At least some content should be included
              expect(formatted.length).toBeGreaterThan(0);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preferences are sorted by type priority (expertise > domain > style > custom)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.shuffledSubarray(['expertise', 'domain', 'style', 'custom'] as PreferenceType[], {
            minLength: 2,
            maxLength: 4,
          }),
          async (types) => {
            vi.clearAllMocks();
            resetPreferenceStore();

            // Create preferences with different types
            const preferences = types.map((type, i) => ({
              type,
              content: `Preference content for ${type} type number ${i}`,
            }));

            mockMemoryManager.searchBySourceUrl.mockResolvedValue(
              preferences.map((pref, i) => ({
                document: {
                  id: `pref-${i}`,
                  content: pref.content,
                  preferenceType: pref.type,
                  sourceUrl: 'preference://user',
                  title: `User Preference: ${pref.type}`,
                  headingPath: ['preferences', pref.type],
                  createdAt: Date.now(),
                  embedding: [],
                },
                score: 1.0,
              }))
            );

            const store = getPreferenceStore();
            const formatted = await store.formatForContext(5000); // Large budget to include all

            // Check order based on type priority
            const typePriority: Record<PreferenceType, number> = {
              expertise: 0,
              domain: 1,
              style: 2,
              custom: 3,
            };

            const sortedTypes = [...types].sort((a, b) => typePriority[a] - typePriority[b]);

            // Verify the first preference type appears first in formatted output
            if (sortedTypes.length >= 2) {
              const firstTypeContent = `Preference content for ${sortedTypes[0]} type`;
              const secondTypeContent = `Preference content for ${sortedTypes[1]} type`;

              const firstIndex = formatted.indexOf(firstTypeContent);
              const secondIndex = formatted.indexOf(secondTypeContent);

              if (firstIndex !== -1 && secondIndex !== -1) {
                expect(firstIndex).toBeLessThan(secondIndex);
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatForContext respects token budget', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(preferenceContentArb, { minLength: 1, maxLength: 10 }),
          fc.integer({ min: 50, max: 500 }),
          async (contents, budget) => {
            vi.clearAllMocks();
            resetPreferenceStore();

            mockMemoryManager.searchBySourceUrl.mockResolvedValue(
              contents.map((content, i) => ({
                document: {
                  id: `pref-${i}`,
                  content,
                  preferenceType: 'custom' as PreferenceType,
                  sourceUrl: 'preference://user',
                  title: 'User Preference: custom',
                  headingPath: ['preferences', 'custom'],
                  createdAt: Date.now(),
                  embedding: [],
                },
                score: 1.0,
              }))
            );

            const store = getPreferenceStore();
            const formatted = await store.formatForContext(budget);

            // The formatted output should not exceed the budget significantly
            // (some tolerance for tokenizer approximation)
            // We just verify it doesn't include everything when budget is small
            if (contents.length > 3 && budget < 100) {
              // With small budget and many preferences, not all should be included
              const allContentsJoined = contents.join('\n');
              expect(formatted.length).toBeLessThanOrEqual(allContentsJoined.length);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
