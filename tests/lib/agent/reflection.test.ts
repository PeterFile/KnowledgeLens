// Tests for Reflection Manager
// Requirements: 3.1, 3.2, 3.3, 3.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
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

    // Fuzzy matching tests
    it('matches parameters with different key order', () => {
      // Add reflection with specific key order
      const reflection: Reflection = {
        id: 'ref-order',
        timestamp: Date.now(),
        errorType: 'error:other_tool',
        failedAction: {
          name: 'other_tool',
          parameters: { q: 'foo', k: 5 },
          reasoning: 'Testing',
        },
        analysis: 'Failed',
        suggestedFix: 'Fix it',
        applied: false,
      };
      memory = storeReflection(memory, reflection);

      // Action with same values but different key order
      const action: ToolCall = {
        name: 'different_tool',
        parameters: { k: 5, q: 'foo' },
        reasoning: 'Testing',
      };

      const relevant = getRelevantReflections(action, memory);
      expect(relevant.some((r) => r.id === 'ref-order')).toBe(true);
    });

    it('matches parameters with extra whitespace in strings', () => {
      const action: ToolCall = {
        name: 'different_tool',
        parameters: { query: '  test   query  ' },
        reasoning: 'Testing with whitespace',
      };

      const relevant = getRelevantReflections(action, memory);
      expect(relevant.some((r) => r.id === 'ref-1')).toBe(true);
    });

    it('matches parameters case-insensitively', () => {
      const action: ToolCall = {
        name: 'different_tool',
        parameters: { query: 'TEST QUERY' },
        reasoning: 'Testing with uppercase',
      };

      const relevant = getRelevantReflections(action, memory);
      expect(relevant.some((r) => r.id === 'ref-1')).toBe(true);
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

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * **Feature: agent-architecture-upgrade, Property 6: Reflection Storage**
 * **Validates: Requirements 3.2, 3.3**
 *
 * Property: For any failed action that triggers reflection, the generated reflection
 * SHALL be stored in episodic memory and retrievable for subsequent retries.
 */
describe('Property 6: Reflection Storage', () => {
  // Arbitrary for generating valid tool names
  const toolNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,29}$/);

  // Arbitrary for generating non-empty content strings
  const contentArb = fc.string({ minLength: 1, maxLength: 200 });

  // Arbitrary for generating timestamps
  const timestampArb = fc.integer({ min: 1700000000000, max: 1800000000000 });

  // Arbitrary for generating valid ToolCall
  const toolCallArb: fc.Arbitrary<ToolCall> = fc.record({
    name: toolNameArb,
    parameters: fc.dictionary(
      fc.stringMatching(/^[a-z][a-z0-9_]{0,19}$/),
      fc.oneof(fc.string({ maxLength: 100 }), fc.integer(), fc.boolean())
    ),
    reasoning: contentArb,
  });

  // Arbitrary for generating valid error types
  const errorTypeArb = fc.oneof(
    toolNameArb.map((name) => `timeout:${name}`),
    toolNameArb.map((name) => `validation:${name}`),
    toolNameArb.map((name) => `not_found:${name}`),
    toolNameArb.map((name) => `error:${name}`),
    fc.constant('rate_limit'),
    fc.constant('unauthorized'),
    fc.constant('forbidden'),
    fc.constant('network_error')
  );

  // Arbitrary for generating valid Reflection
  const reflectionArb: fc.Arbitrary<Reflection> = fc.record({
    id: fc.uuid(),
    timestamp: timestampArb,
    errorType: errorTypeArb,
    failedAction: toolCallArb,
    analysis: contentArb,
    suggestedFix: contentArb,
    applied: fc.boolean(),
  });

  // Arbitrary for generating a list of reflections with unique IDs
  const reflectionListArb = fc
    .array(reflectionArb, { minLength: 1, maxLength: 10 })
    .map((reflections) => {
      // Ensure unique IDs
      return reflections.map((r, i) => ({ ...r, id: `ref-${i}-${r.id}` }));
    });

  // Arbitrary for session IDs
  const sessionIdArb = fc.stringMatching(/^session_[a-z0-9]{5,15}$/);

  it('stored reflections are retrievable from memory', () => {
    fc.assert(
      fc.property(sessionIdArb, reflectionListArb, (sessionId, reflections) => {
        let memory = createEpisodicMemory(sessionId);

        // Store all reflections
        for (const reflection of reflections) {
          memory = storeReflection(memory, reflection);
        }

        // Property: All stored reflections should be in memory
        expect(memory.reflections).toHaveLength(reflections.length);

        // Property: Each reflection should be retrievable by ID
        for (const reflection of reflections) {
          const found = memory.reflections.find((r) => r.id === reflection.id);
          expect(found).toBeDefined();
          expect(found!.errorType).toBe(reflection.errorType);
          expect(found!.analysis).toBe(reflection.analysis);
          expect(found!.suggestedFix).toBe(reflection.suggestedFix);
          expect(found!.failedAction.name).toBe(reflection.failedAction.name);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('reflections for same tool are retrievable for retries', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        toolCallArb,
        reflectionArb,
        (sessionId, retryAction, reflection) => {
          let memory = createEpisodicMemory(sessionId);

          // Create a reflection for the same tool as the retry action
          const storedReflection: Reflection = {
            ...reflection,
            failedAction: {
              ...reflection.failedAction,
              name: retryAction.name, // Same tool name
            },
          };

          memory = storeReflection(memory, storedReflection);

          // Property: When retrying with the same tool, the reflection should be retrievable
          const relevant = getRelevantReflections(retryAction, memory);

          expect(relevant.length).toBeGreaterThanOrEqual(1);
          expect(relevant.some((r) => r.id === storedReflection.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reflections with matching parameters are retrievable for retries', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.stringMatching(/^[a-z][a-z0-9_]{2,19}$/), // shared param key
        fc.string({ minLength: 1, maxLength: 50 }), // shared param value
        reflectionArb,
        (sessionId, sharedKey, sharedValue, reflection) => {
          let memory = createEpisodicMemory(sessionId);

          // Create a reflection with a specific parameter
          const storedReflection: Reflection = {
            ...reflection,
            failedAction: {
              ...reflection.failedAction,
              parameters: { [sharedKey]: sharedValue },
            },
          };

          memory = storeReflection(memory, storedReflection);

          // Create a retry action with the same parameter (different tool)
          const retryAction: ToolCall = {
            name: 'different_tool_name',
            parameters: { [sharedKey]: sharedValue },
            reasoning: 'Retry with same parameter',
          };

          // Property: Reflection with matching parameter should be retrievable
          const relevant = getRelevantReflections(retryAction, memory);

          expect(relevant.some((r) => r.id === storedReflection.id)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('error counts are correctly tracked for stored reflections', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        errorTypeArb,
        fc.integer({ min: 1, max: 10 }),
        (sessionId, errorType, count) => {
          let memory = createEpisodicMemory(sessionId);

          // Store multiple reflections with the same error type
          for (let i = 0; i < count; i++) {
            const reflection: Reflection = {
              id: `ref-${i}`,
              timestamp: Date.now(),
              errorType,
              failedAction: { name: 'test_tool', parameters: {}, reasoning: 'test' },
              analysis: `Analysis ${i}`,
              suggestedFix: `Fix ${i}`,
              applied: false,
            };
            memory = storeReflection(memory, reflection);
          }

          // Property: Error count should match the number of stored reflections
          expect(getErrorCount(errorType, memory)).toBe(count);

          // Property: isRepeatedError should return true when count >= 2
          expect(isRepeatedError(errorType, memory)).toBe(count >= 2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('storing reflections is immutable - original memory unchanged', () => {
    fc.assert(
      fc.property(sessionIdArb, reflectionArb, (sessionId, reflection) => {
        const originalMemory = createEpisodicMemory(sessionId);
        const originalReflectionsLength = originalMemory.reflections.length;
        const originalErrorCountsSize = originalMemory.errorCounts.size;

        // Store a reflection
        const updatedMemory = storeReflection(originalMemory, reflection);

        // Property: Original memory should be unchanged
        expect(originalMemory.reflections.length).toBe(originalReflectionsLength);
        expect(originalMemory.errorCounts.size).toBe(originalErrorCountsSize);

        // Property: Updated memory should have the new reflection
        expect(updatedMemory.reflections.length).toBe(originalReflectionsLength + 1);
      }),
      { numRuns: 100 }
    );
  });

  it('reflections preserve all fields after storage', () => {
    fc.assert(
      fc.property(sessionIdArb, reflectionArb, (sessionId, reflection) => {
        let memory = createEpisodicMemory(sessionId);
        memory = storeReflection(memory, reflection);

        const stored = memory.reflections.find((r) => r.id === reflection.id);

        // Property: All fields should be preserved exactly
        expect(stored).toBeDefined();
        expect(stored!.id).toBe(reflection.id);
        expect(stored!.timestamp).toBe(reflection.timestamp);
        expect(stored!.errorType).toBe(reflection.errorType);
        expect(stored!.analysis).toBe(reflection.analysis);
        expect(stored!.suggestedFix).toBe(reflection.suggestedFix);
        expect(stored!.applied).toBe(reflection.applied);
        expect(stored!.failedAction.name).toBe(reflection.failedAction.name);
        expect(stored!.failedAction.reasoning).toBe(reflection.failedAction.reasoning);
        expect(stored!.failedAction.parameters).toEqual(reflection.failedAction.parameters);
      }),
      { numRuns: 100 }
    );
  });

  it('multiple reflections for different tools are independently retrievable', () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc
          .array(toolNameArb, { minLength: 2, maxLength: 5 })
          .filter((names) => new Set(names).size === names.length),
        (sessionId, toolNames) => {
          let memory = createEpisodicMemory(sessionId);

          // Store one reflection per tool
          const storedReflections: Reflection[] = toolNames.map((name, i) => ({
            id: `ref-${i}`,
            timestamp: Date.now(),
            errorType: `error:${name}`,
            failedAction: { name, parameters: {}, reasoning: `Testing ${name}` },
            analysis: `Analysis for ${name}`,
            suggestedFix: `Fix for ${name}`,
            applied: false,
          }));

          for (const reflection of storedReflections) {
            memory = storeReflection(memory, reflection);
          }

          // Property: Each tool's reflection should be retrievable independently
          for (const toolName of toolNames) {
            const retryAction: ToolCall = {
              name: toolName,
              parameters: {},
              reasoning: 'Retry',
            };

            const relevant = getRelevantReflections(retryAction, memory);

            // Should find exactly the reflection for this tool
            expect(relevant.some((r) => r.failedAction.name === toolName)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('formatted reflections contain all stored reflection data', () => {
    fc.assert(
      fc.property(sessionIdArb, reflectionListArb, (sessionId, reflections) => {
        let memory = createEpisodicMemory(sessionId);

        for (const reflection of reflections) {
          memory = storeReflection(memory, reflection);
        }

        const formatted = formatReflectionsForContext(memory.reflections);

        // Property: Formatted output should contain data from all reflections
        if (reflections.length > 0) {
          expect(formatted).toContain('<previous_failures>');
          expect(formatted).toContain('</previous_failures>');

          for (const reflection of reflections) {
            expect(formatted).toContain(`Tool: ${reflection.failedAction.name}`);
            expect(formatted).toContain(`Error Type: ${reflection.errorType}`);
            expect(formatted).toContain(`Analysis: ${reflection.analysis}`);
            expect(formatted).toContain(`Suggested Fix: ${reflection.suggestedFix}`);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
