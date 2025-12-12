// Context Manager Tests
// Tests for context management functions
// Requirements: 5.1, 5.2, 5.3, 5.4

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createContext,
  createContextEntry,
  addToContext,
  addReflectionToContext,
  markSubtaskComplete,
  recordKeyDecision,
  setUserPreference,
  needsCompaction,
  getContextUtilization,
  generateGrounding,
  serializeContext,
  getContextSummary,
  compactContext,
} from '../../../src/lib/agent/context';
import type { Reflection, AgentContext, ContextEntryType } from '../../../src/lib/agent/types';
import type { LLMConfig } from '../../../src/types';
import * as api from '../../../src/lib/api';

describe('Context Manager', () => {
  describe('createContext', () => {
    it('creates context with goal in grounding', () => {
      const context = createContext('Summarize this article', 10000);

      expect(context.grounding.currentGoal).toBe('Summarize this article');
      expect(context.maxTokens).toBe(10000);
      expect(context.history).toHaveLength(0);
      expect(context.reflections).toHaveLength(0);
    });

    it('initializes empty arrays for subtasks and decisions', () => {
      const context = createContext('Test goal', 5000);

      expect(context.grounding.completedSubtasks).toEqual([]);
      expect(context.grounding.keyDecisions).toEqual([]);
      expect(context.grounding.userPreferences).toEqual({});
    });

    it('calculates initial token count from grounding', () => {
      const context = createContext('Test goal', 5000);

      expect(context.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('createContextEntry', () => {
    it('creates entry with correct type and content', () => {
      const entry = createContextEntry('user', 'Hello, can you help me?');

      expect(entry.type).toBe('user');
      expect(entry.content).toBe('Hello, can you help me?');
      expect(entry.compacted).toBe(false);
    });

    it('calculates token count for entry', () => {
      const entry = createContextEntry('assistant', 'This is a response');

      expect(entry.tokenCount).toBeGreaterThan(0);
    });

    it('sets timestamp', () => {
      const before = Date.now();
      const entry = createContextEntry('tool', 'Tool result');
      const after = Date.now();

      expect(entry.timestamp).toBeGreaterThanOrEqual(before);
      expect(entry.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('addToContext', () => {
    it('adds entry to history', () => {
      const context = createContext('Test', 10000);
      const entry = createContextEntry('user', 'Test message');

      const updated = addToContext(context, entry);

      expect(updated.history).toHaveLength(1);
      expect(updated.history[0]).toBe(entry);
    });

    it('updates token count', () => {
      const context = createContext('Test', 10000);
      const initialTokens = context.tokenCount;
      const entry = createContextEntry('user', 'Test message');

      const updated = addToContext(context, entry);

      expect(updated.tokenCount).toBe(initialTokens + entry.tokenCount);
    });

    it('preserves existing history', () => {
      const context = createContext('Test', 10000);
      const entry1 = createContextEntry('user', 'First');
      const entry2 = createContextEntry('assistant', 'Second');

      const updated1 = addToContext(context, entry1);
      const updated2 = addToContext(updated1, entry2);

      expect(updated2.history).toHaveLength(2);
      expect(updated2.history[0].content).toBe('First');
      expect(updated2.history[1].content).toBe('Second');
    });
  });

  describe('addReflectionToContext', () => {
    it('adds reflection to context', () => {
      const context = createContext('Test', 10000);
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'search_failed',
        failedAction: {
          name: 'search_web',
          parameters: { query: 'test' },
          reasoning: 'Need more info',
        },
        analysis: 'Search API returned no results',
        suggestedFix: 'Try broader search terms',
        applied: false,
      };

      const updated = addReflectionToContext(context, reflection);

      expect(updated.reflections).toHaveLength(1);
      expect(updated.reflections[0].id).toBe('ref-1');
    });

    it('updates token count for reflection', () => {
      const context = createContext('Test', 10000);
      const initialTokens = context.tokenCount;
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'error',
        failedAction: { name: 'test', parameters: {}, reasoning: 'test' },
        analysis: 'Analysis text',
        suggestedFix: 'Fix suggestion',
        applied: false,
      };

      const updated = addReflectionToContext(context, reflection);

      expect(updated.tokenCount).toBeGreaterThan(initialTokens);
    });
  });

  describe('markSubtaskComplete', () => {
    it('adds subtask to completed list', () => {
      const context = createContext('Main goal', 10000);

      const updated = markSubtaskComplete(context, 'Extracted page content');

      expect(updated.grounding.completedSubtasks).toContain('Extracted page content');
    });

    it('preserves existing subtasks', () => {
      let context = createContext('Main goal', 10000);
      context = markSubtaskComplete(context, 'First subtask');
      context = markSubtaskComplete(context, 'Second subtask');

      expect(context.grounding.completedSubtasks).toHaveLength(2);
      expect(context.grounding.completedSubtasks).toContain('First subtask');
      expect(context.grounding.completedSubtasks).toContain('Second subtask');
    });
  });

  describe('recordKeyDecision', () => {
    it('adds decision to grounding', () => {
      const context = createContext('Test', 10000);

      const updated = recordKeyDecision(context, 'Using search for additional context');

      expect(updated.grounding.keyDecisions).toContain('Using search for additional context');
    });
  });

  describe('setUserPreference', () => {
    it('sets user preference', () => {
      const context = createContext('Test', 10000);

      const updated = setUserPreference(context, 'responseStyle', 'concise');

      expect(updated.grounding.userPreferences.responseStyle).toBe('concise');
    });

    it('overwrites existing preference', () => {
      let context = createContext('Test', 10000);
      context = setUserPreference(context, 'language', 'en');
      context = setUserPreference(context, 'language', 'zh');

      expect(context.grounding.userPreferences.language).toBe('zh');
    });
  });

  describe('needsCompaction', () => {
    it('returns false when below threshold', () => {
      const context = createContext('Test', 100000);

      expect(needsCompaction(context)).toBe(false);
    });

    it('returns true when at or above 80% capacity', () => {
      const context = createContext('Test', 100);
      // Add entries to push over 80%
      let updated = context;
      for (let i = 0; i < 20; i++) {
        const entry = createContextEntry('user', 'This is a test message that adds tokens');
        updated = addToContext(updated, entry);
      }

      // Should be over threshold now
      expect(getContextUtilization(updated)).toBeGreaterThanOrEqual(0.8);
      expect(needsCompaction(updated)).toBe(true);
    });
  });

  describe('getContextUtilization', () => {
    it('returns ratio of used to max tokens', () => {
      const context = createContext('Test', 1000);
      const utilization = getContextUtilization(context);

      expect(utilization).toBeGreaterThan(0);
      expect(utilization).toBeLessThan(1);
    });

    it('returns 0 for zero maxTokens', () => {
      const context = createContext('Test', 0);

      expect(getContextUtilization(context)).toBe(0);
    });
  });

  describe('generateGrounding', () => {
    it('includes goal in output', () => {
      const context = createContext('Summarize the article', 10000);
      const grounding = generateGrounding(context);

      expect(grounding).toContain('Summarize the article');
      expect(grounding).toContain('<goal>');
    });

    it('includes completed subtasks', () => {
      let context = createContext('Test', 10000);
      context = markSubtaskComplete(context, 'Step 1 done');

      const grounding = generateGrounding(context);

      expect(grounding).toContain('Step 1 done');
      expect(grounding).toContain('<completed_subtasks>');
    });

    it('includes key decisions', () => {
      let context = createContext('Test', 10000);
      context = recordKeyDecision(context, 'Decided to use search');

      const grounding = generateGrounding(context);

      expect(grounding).toContain('Decided to use search');
      expect(grounding).toContain('<key_decisions>');
    });

    it('includes user preferences', () => {
      let context = createContext('Test', 10000);
      context = setUserPreference(context, 'style', 'detailed');

      const grounding = generateGrounding(context);

      expect(grounding).toContain('style: detailed');
      expect(grounding).toContain('<user_preferences>');
    });
  });

  describe('serializeContext', () => {
    it('includes grounding section', () => {
      const context = createContext('Test goal', 10000);
      const serialized = serializeContext(context);

      expect(serialized).toContain('<grounding>');
      expect(serialized).toContain('Test goal');
    });

    it('includes conversation history', () => {
      let context = createContext('Test', 10000);
      context = addToContext(context, createContextEntry('user', 'Hello'));
      context = addToContext(context, createContextEntry('assistant', 'Hi there'));

      const serialized = serializeContext(context);

      expect(serialized).toContain('<conversation_history>');
      expect(serialized).toContain('Hello');
      expect(serialized).toContain('Hi there');
    });

    it('includes reflections', () => {
      let context = createContext('Test', 10000);
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'api_error',
        failedAction: { name: 'test', parameters: {}, reasoning: 'test' },
        analysis: 'API timed out',
        suggestedFix: 'Retry with shorter context',
        applied: false,
      };
      context = addReflectionToContext(context, reflection);

      const serialized = serializeContext(context);

      expect(serialized).toContain('<reflections>');
      expect(serialized).toContain('API timed out');
    });
  });

  describe('getContextSummary', () => {
    it('returns correct summary stats', () => {
      let context = createContext('Test', 10000);
      context = addToContext(context, createContextEntry('user', 'Message 1'));
      context = addToContext(context, createContextEntry('assistant', 'Message 2'));

      const summary = getContextSummary(context);

      expect(summary.maxTokens).toBe(10000);
      expect(summary.historyEntries).toBe(2);
      expect(summary.compactedEntries).toBe(0);
      expect(summary.reflectionCount).toBe(0);
      expect(summary.utilization).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * **Feature: agent-architecture-upgrade, Property 10: Context Compaction Reduces Tokens**
 * **Validates: Requirements 5.5**
 *
 * Property: For any context compaction operation, the resulting context token count
 * SHALL be at least 20% smaller than the original.
 */
describe('Property-Based Tests', () => {
  // Mock LLM config for testing
  const mockLLMConfig: LLMConfig = {
    provider: 'openai',
    apiKey: 'test-key',
    model: 'gpt-4o',
  };

  // Arbitrary for generating valid context entry types
  const contextEntryTypeArb: fc.Arbitrary<ContextEntryType> = fc.constantFrom(
    'user',
    'assistant',
    'tool',
    'observation'
  );

  // Helper to create a context that is guaranteed to need compaction
  function createCompactableContext(
    goal: string,
    maxTokens: number,
    entries: Array<[ContextEntryType, string]>
  ): AgentContext {
    let context = createContext(goal, maxTokens);

    // Add entries until we exceed the compaction threshold
    for (const [type, content] of entries) {
      const entry = createContextEntry(type, content);
      context = addToContext(context, entry);

      // Stop once we've exceeded the threshold
      if (needsCompaction(context)) {
        break;
      }
    }

    // If still not needing compaction, add more entries
    while (!needsCompaction(context)) {
      const entry = createContextEntry(
        'user',
        'Additional padding content to trigger compaction threshold'
      );
      context = addToContext(context, entry);
    }

    return context;
  }

  // Efficient arbitrary that always produces compactable contexts
  const compactableContextArb: fc.Arbitrary<AgentContext> = fc
    .tuple(
      // Goal - use alphanumeric to avoid filter rejections
      fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{4,49}$/),
      // Max tokens (small to ensure compaction is needed quickly)
      fc.integer({ min: 200, max: 500 }),
      // Entry contents - use alphanumeric strings
      fc.array(fc.tuple(contextEntryTypeArb, fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{19,99}$/)), {
        minLength: 3,
        maxLength: 10,
      })
    )
    .map(([goal, maxTokens, entries]) => createCompactableContext(goal, maxTokens, entries));

  describe('Property 10: Context Compaction Reduces Tokens', () => {
    beforeEach(() => {
      // Mock the LLM call to return a short summary
      vi.spyOn(api, 'callLLMWithMessages').mockImplementation(
        async (_messages, _config, onToken) => {
          // Return a very short summary to ensure 20% reduction
          const shortSummary = 'Summary.';
          onToken(shortSummary);
          return {
            content: shortSummary,
            usage: { promptTokens: 100, completionTokens: 10 },
          };
        }
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('compaction achieves at least 20% token reduction', async () => {
      await fc.assert(
        fc.asyncProperty(compactableContextArb, async (context) => {
          const originalTokenCount = context.tokenCount;

          // Perform compaction
          const compacted = await compactContext(context, mockLLMConfig);

          // Property: Token count should be at least 20% smaller
          const reduction = 1 - compacted.tokenCount / originalTokenCount;

          // The compaction should achieve at least 20% reduction
          expect(reduction).toBeGreaterThanOrEqual(0.2);
        }),
        { numRuns: 100 }
      );
    });

    it('compaction preserves grounding information', async () => {
      await fc.assert(
        fc.asyncProperty(compactableContextArb, async (context) => {
          const compacted = await compactContext(context, mockLLMConfig);

          // Property: Grounding should be preserved
          expect(compacted.grounding.currentGoal).toBe(context.grounding.currentGoal);
          expect(compacted.grounding.completedSubtasks).toEqual(
            context.grounding.completedSubtasks
          );
          expect(compacted.grounding.keyDecisions).toEqual(context.grounding.keyDecisions);
          expect(compacted.grounding.userPreferences).toEqual(context.grounding.userPreferences);
        }),
        { numRuns: 100 }
      );
    });

    it('compaction produces valid context structure', async () => {
      await fc.assert(
        fc.asyncProperty(compactableContextArb, async (context) => {
          const compacted = await compactContext(context, mockLLMConfig);

          // Property: Compacted context should have valid structure
          expect(compacted.tokenCount).toBeGreaterThan(0);
          expect(compacted.maxTokens).toBe(context.maxTokens);
          expect(Array.isArray(compacted.history)).toBe(true);
          expect(Array.isArray(compacted.reflections)).toBe(true);

          // History should contain compacted entries
          if (compacted.history.length > 0) {
            const hasCompactedEntry = compacted.history.some((e) => e.compacted);
            expect(hasCompactedEntry).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('compaction is idempotent when below threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.tuple(
            fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9 ]{4,29}$/),
            fc.integer({ min: 100000, max: 500000 })
          ),
          async ([goal, maxTokens]) => {
            // Create a context that doesn't need compaction
            const context = createContext(goal, maxTokens);

            const result = await compactContext(context, mockLLMConfig);

            // Property: Context should be unchanged when below threshold
            expect(result.tokenCount).toBe(context.tokenCount);
            expect(result.history).toEqual(context.history);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple compactions maintain 20% reduction invariant', async () => {
      await fc.assert(
        fc.asyncProperty(compactableContextArb, async (context) => {
          const originalTokenCount = context.tokenCount;

          // First compaction
          const compacted1 = await compactContext(context, mockLLMConfig);
          const reduction1 = 1 - compacted1.tokenCount / originalTokenCount;
          expect(reduction1).toBeGreaterThanOrEqual(0.2);

          // Add more entries to trigger another compaction
          let contextWithMore = compacted1;
          for (let i = 0; i < 10; i++) {
            const entry = createContextEntry('user', `Additional message ${i} with some content`);
            contextWithMore = addToContext(contextWithMore, entry);
          }

          // If it needs compaction again, verify reduction
          if (needsCompaction(contextWithMore)) {
            const beforeSecond = contextWithMore.tokenCount;
            const compacted2 = await compactContext(contextWithMore, mockLLMConfig);
            const reduction2 = 1 - compacted2.tokenCount / beforeSecond;
            expect(reduction2).toBeGreaterThanOrEqual(0.2);
          }
        }),
        { numRuns: 50 }
      );
    });
  });
});
