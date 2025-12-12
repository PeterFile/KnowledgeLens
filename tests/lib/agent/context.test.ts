// Context Manager Tests
// Tests for context management functions
// Requirements: 5.1, 5.2, 5.3, 5.4

import { describe, it, expect } from 'vitest';
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
} from '../../../src/lib/agent/context';
import type { Reflection } from '../../../src/lib/agent/types';

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
