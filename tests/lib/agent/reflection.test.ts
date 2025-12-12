// Tests for Reflection Manager
// Requirements: 3.1, 3.2, 3.3, 3.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createEpisodicMemory,
  extractErrorType,
  storeReflection,
  getRelevantReflections,
  formatReflectionsForContext,
  isRepeatedError,
  getErrorCount,
  markReflectionApplied,
  getUnappliedReflections,
  clearReflections,
  getMemorySummary,
} from '../../../src/lib/agent/reflection';
import type { Reflection, ToolCall, EpisodicMemory } from '../../../src/lib/agent/types';

// Mock the API module
vi.mock('../../../src/lib/api', () => ({
  callLLMWithMessages: vi.fn(),
}));

describe('Reflection Manager', () => {
  // ============================================================================
  // Episodic Memory Creation
  // ============================================================================

  describe('createEpisodicMemory', () => {
    it('creates memory with correct session ID', () => {
      const memory = createEpisodicMemory('session-123');
      expect(memory.sessionId).toBe('session-123');
    });

    it('creates memory with empty reflections', () => {
      const memory = createEpisodicMemory('session-123');
      expect(memory.reflections).toEqual([]);
    });

    it('creates memory with empty error counts', () => {
      const memory = createEpisodicMemory('session-123');
      expect(memory.errorCounts.size).toBe(0);
    });
  });

  // ============================================================================
  // Error Type Extraction
  // ============================================================================

  describe('extractErrorType', () => {
    const mockAction: ToolCall = {
      name: 'search_web',
      parameters: { query: 'test' },
      reasoning: 'Testing',
    };

    it('extracts timeout error type', () => {
      const errorType = extractErrorType('Request timeout after 30s', mockAction);
      expect(errorType).toBe('timeout:search_web');
    });

    it('extracts rate limit error type', () => {
      const errorType = extractErrorType('Rate limit exceeded', mockAction);
      expect(errorType).toBe('rate_limit');
    });

    it('extracts validation error type', () => {
      const errorType = extractErrorType('Invalid parameter: query', mockAction);
      expect(errorType).toBe('validation:search_web');
    });

    it('extracts not found error type', () => {
      const errorType = extractErrorType('Resource not found (404)', mockAction);
      expect(errorType).toBe('not_found:search_web');
    });

    it('extracts unauthorized error type', () => {
      const errorType = extractErrorType('Unauthorized (401)', mockAction);
      expect(errorType).toBe('unauthorized');
    });

    it('extracts forbidden error type', () => {
      const errorType = extractErrorType('Forbidden (403)', mockAction);
      expect(errorType).toBe('forbidden');
    });

    it('extracts network error type', () => {
      const errorType = extractErrorType('Network connection failed', mockAction);
      expect(errorType).toBe('network_error');
    });

    it('defaults to tool-specific error', () => {
      const errorType = extractErrorType('Some unknown error', mockAction);
      expect(errorType).toBe('error:search_web');
    });
  });

  // ============================================================================
  // Reflection Storage (Requirements: 3.2)
  // ============================================================================

  describe('storeReflection', () => {
    let memory: EpisodicMemory;
    let reflection: Reflection;

    beforeEach(() => {
      memory = createEpisodicMemory('session-123');
      reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: {
          name: 'search_web',
          parameters: { query: 'test' },
          reasoning: 'Testing',
        },
        analysis: 'The search timed out',
        suggestedFix: 'Try a simpler query',
        applied: false,
      };
    });

    it('adds reflection to memory', () => {
      const updated = storeReflection(memory, reflection);
      expect(updated.reflections).toHaveLength(1);
      expect(updated.reflections[0]).toEqual(reflection);
    });

    it('increments error count for new error type', () => {
      const updated = storeReflection(memory, reflection);
      expect(updated.errorCounts.get('timeout:search_web')).toBe(1);
    });

    it('increments error count for existing error type', () => {
      let updated = storeReflection(memory, reflection);
      const reflection2 = { ...reflection, id: 'ref-2' };
      updated = storeReflection(updated, reflection2);
      expect(updated.errorCounts.get('timeout:search_web')).toBe(2);
    });

    it('preserves original memory immutably', () => {
      const updated = storeReflection(memory, reflection);
      expect(memory.reflections).toHaveLength(0);
      expect(updated.reflections).toHaveLength(1);
    });
  });

  // ============================================================================
  // Relevant Reflections (Requirements: 3.3)
  // ============================================================================

  describe('getRelevantReflections', () => {
    let memory: EpisodicMemory;

    beforeEach(() => {
      memory = createEpisodicMemory('session-123');

      // Add some reflections
      const reflection1: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: {
          name: 'search_web',
          parameters: { query: 'test query' },
          reasoning: 'Testing',
        },
        analysis: 'Search timed out',
        suggestedFix: 'Try simpler query',
        applied: false,
      };

      const reflection2: Reflection = {
        id: 'ref-2',
        timestamp: Date.now(),
        errorType: 'error:summarize_page',
        failedAction: {
          name: 'summarize_page',
          parameters: { url: 'https://example.com' },
          reasoning: 'Summarizing',
        },
        analysis: 'Page too long',
        suggestedFix: 'Extract key sections first',
        applied: false,
      };

      memory = storeReflection(memory, reflection1);
      memory = storeReflection(memory, reflection2);
    });

    it('returns reflections for same tool', () => {
      const action: ToolCall = {
        name: 'search_web',
        parameters: { query: 'different query' },
        reasoning: 'New search',
      };

      const relevant = getRelevantReflections(action, memory);
      expect(relevant).toHaveLength(1);
      expect(relevant[0].failedAction.name).toBe('search_web');
    });

    it('returns reflections with same parameters', () => {
      const action: ToolCall = {
        name: 'search_web',
        parameters: { query: 'test query' },
        reasoning: 'Same query',
      };

      const relevant = getRelevantReflections(action, memory);
      expect(relevant).toHaveLength(1);
    });

    it('returns empty array for unrelated action', () => {
      const action: ToolCall = {
        name: 'explain_text',
        parameters: { text: 'some text' },
        reasoning: 'Explaining',
      };

      const relevant = getRelevantReflections(action, memory);
      expect(relevant).toHaveLength(0);
    });
  });

  // ============================================================================
  // Format Reflections for Context
  // ============================================================================

  describe('formatReflectionsForContext', () => {
    it('returns empty string for no reflections', () => {
      const formatted = formatReflectionsForContext([]);
      expect(formatted).toBe('');
    });

    it('formats single reflection correctly', () => {
      const reflections: Reflection[] = [
        {
          id: 'ref-1',
          timestamp: Date.now(),
          errorType: 'timeout:search_web',
          failedAction: {
            name: 'search_web',
            parameters: { query: 'test' },
            reasoning: 'Testing',
          },
          analysis: 'Search timed out',
          suggestedFix: 'Try simpler query',
          applied: false,
        },
      ];

      const formatted = formatReflectionsForContext(reflections);
      expect(formatted).toContain('<previous_failures>');
      expect(formatted).toContain('</previous_failures>');
      expect(formatted).toContain('Tool: search_web');
      expect(formatted).toContain('Error Type: timeout:search_web');
      expect(formatted).toContain('Analysis: Search timed out');
      expect(formatted).toContain('Suggested Fix: Try simpler query');
    });

    it('formats multiple reflections with numbering', () => {
      const reflections: Reflection[] = [
        {
          id: 'ref-1',
          timestamp: Date.now(),
          errorType: 'timeout:search_web',
          failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
          analysis: 'First error',
          suggestedFix: 'First fix',
          applied: false,
        },
        {
          id: 'ref-2',
          timestamp: Date.now(),
          errorType: 'error:summarize',
          failedAction: { name: 'summarize', parameters: {}, reasoning: '' },
          analysis: 'Second error',
          suggestedFix: 'Second fix',
          applied: false,
        },
      ];

      const formatted = formatReflectionsForContext(reflections);
      expect(formatted).toContain('[Previous Failure 1]');
      expect(formatted).toContain('[Previous Failure 2]');
    });
  });

  // ============================================================================
  // Repeated Error Detection (Requirements: 3.4)
  // ============================================================================

  describe('isRepeatedError', () => {
    let memory: EpisodicMemory;

    beforeEach(() => {
      memory = createEpisodicMemory('session-123');
    });

    it('returns false for new error type', () => {
      expect(isRepeatedError('timeout:search_web', memory)).toBe(false);
    });

    it('returns false for single occurrence', () => {
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout',
        suggestedFix: 'Retry',
        applied: false,
      };
      memory = storeReflection(memory, reflection);

      expect(isRepeatedError('timeout:search_web', memory)).toBe(false);
    });

    it('returns true after threshold (2) occurrences', () => {
      const reflection1: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout 1',
        suggestedFix: 'Retry',
        applied: false,
      };
      const reflection2: Reflection = {
        id: 'ref-2',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout 2',
        suggestedFix: 'Retry',
        applied: false,
      };

      memory = storeReflection(memory, reflection1);
      memory = storeReflection(memory, reflection2);

      expect(isRepeatedError('timeout:search_web', memory)).toBe(true);
    });
  });

  describe('getErrorCount', () => {
    it('returns 0 for unknown error type', () => {
      const memory = createEpisodicMemory('session-123');
      expect(getErrorCount('unknown_error', memory)).toBe(0);
    });

    it('returns correct count after storing reflections', () => {
      let memory = createEpisodicMemory('session-123');
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout',
        suggestedFix: 'Retry',
        applied: false,
      };

      memory = storeReflection(memory, reflection);
      memory = storeReflection(memory, { ...reflection, id: 'ref-2' });
      memory = storeReflection(memory, { ...reflection, id: 'ref-3' });

      expect(getErrorCount('timeout:search_web', memory)).toBe(3);
    });
  });

  // ============================================================================
  // Memory Utilities
  // ============================================================================

  describe('markReflectionApplied', () => {
    it('marks specific reflection as applied', () => {
      let memory = createEpisodicMemory('session-123');
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout',
        suggestedFix: 'Retry',
        applied: false,
      };

      memory = storeReflection(memory, reflection);
      memory = markReflectionApplied(memory, 'ref-1');

      expect(memory.reflections[0].applied).toBe(true);
    });

    it('does not affect other reflections', () => {
      let memory = createEpisodicMemory('session-123');
      const reflection1: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout 1',
        suggestedFix: 'Retry',
        applied: false,
      };
      const reflection2: Reflection = {
        id: 'ref-2',
        timestamp: Date.now(),
        errorType: 'error:summarize',
        failedAction: { name: 'summarize', parameters: {}, reasoning: '' },
        analysis: 'Error 2',
        suggestedFix: 'Fix',
        applied: false,
      };

      memory = storeReflection(memory, reflection1);
      memory = storeReflection(memory, reflection2);
      memory = markReflectionApplied(memory, 'ref-1');

      expect(memory.reflections[0].applied).toBe(true);
      expect(memory.reflections[1].applied).toBe(false);
    });
  });

  describe('getUnappliedReflections', () => {
    it('returns only unapplied reflections', () => {
      let memory = createEpisodicMemory('session-123');
      const reflection1: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout 1',
        suggestedFix: 'Retry',
        applied: false,
      };
      const reflection2: Reflection = {
        id: 'ref-2',
        timestamp: Date.now(),
        errorType: 'error:summarize',
        failedAction: { name: 'summarize', parameters: {}, reasoning: '' },
        analysis: 'Error 2',
        suggestedFix: 'Fix',
        applied: false,
      };

      memory = storeReflection(memory, reflection1);
      memory = storeReflection(memory, reflection2);
      memory = markReflectionApplied(memory, 'ref-1');

      const unapplied = getUnappliedReflections(memory);
      expect(unapplied).toHaveLength(1);
      expect(unapplied[0].id).toBe('ref-2');
    });
  });

  describe('clearReflections', () => {
    it('removes all reflections', () => {
      let memory = createEpisodicMemory('session-123');
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout',
        suggestedFix: 'Retry',
        applied: false,
      };

      memory = storeReflection(memory, reflection);
      memory = clearReflections(memory);

      expect(memory.reflections).toHaveLength(0);
    });

    it('resets error counts', () => {
      let memory = createEpisodicMemory('session-123');
      const reflection: Reflection = {
        id: 'ref-1',
        timestamp: Date.now(),
        errorType: 'timeout:search_web',
        failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
        analysis: 'Timeout',
        suggestedFix: 'Retry',
        applied: false,
      };

      memory = storeReflection(memory, reflection);
      memory = clearReflections(memory);

      expect(memory.errorCounts.size).toBe(0);
    });

    it('preserves session ID', () => {
      let memory = createEpisodicMemory('session-123');
      memory = clearReflections(memory);
      expect(memory.sessionId).toBe('session-123');
    });
  });

  describe('getMemorySummary', () => {
    it('returns correct summary for empty memory', () => {
      const memory = createEpisodicMemory('session-123');
      const summary = getMemorySummary(memory);

      expect(summary.sessionId).toBe('session-123');
      expect(summary.totalReflections).toBe(0);
      expect(summary.appliedReflections).toBe(0);
      expect(summary.errorTypes).toEqual([]);
      expect(summary.mostCommonError).toBeNull();
    });

    it('returns correct summary with reflections', () => {
      let memory = createEpisodicMemory('session-123');

      // Add 3 timeout errors and 1 validation error
      for (let i = 0; i < 3; i++) {
        memory = storeReflection(memory, {
          id: `ref-timeout-${i}`,
          timestamp: Date.now(),
          errorType: 'timeout:search_web',
          failedAction: { name: 'search_web', parameters: {}, reasoning: '' },
          analysis: 'Timeout',
          suggestedFix: 'Retry',
          applied: i === 0, // First one is applied
        });
      }

      memory = storeReflection(memory, {
        id: 'ref-validation',
        timestamp: Date.now(),
        errorType: 'validation:summarize',
        failedAction: { name: 'summarize', parameters: {}, reasoning: '' },
        analysis: 'Invalid',
        suggestedFix: 'Fix params',
        applied: false,
      });

      const summary = getMemorySummary(memory);

      expect(summary.totalReflections).toBe(4);
      expect(summary.appliedReflections).toBe(1);
      expect(summary.errorTypes).toContain('timeout:search_web');
      expect(summary.errorTypes).toContain('validation:summarize');
      expect(summary.mostCommonError).toBe('timeout:search_web');
    });
  });
});
