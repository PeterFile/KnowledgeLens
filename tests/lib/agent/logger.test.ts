import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createTrajectoryLog,
  logStep,
  logThought,
  logToolCall,
  logToolResult,
  logObservation,
  logReflection,
  logError,
  updateTokenUsage,
  calculateEfficiency,
  setOptimalSteps,
  exportLog,
  exportLogAsJson,
  getEntriesByType,
  getEntriesForStep,
  hasErrors,
  getLastEntry,
} from '../../../src/lib/agent/logger';
import type {
  ToolCall,
  ToolResult,
  LogEntryType,
  TrajectoryLog,
} from '../../../src/lib/agent/types';

describe('Trajectory Logger', () => {
  describe('createTrajectoryLog', () => {
    it('creates a new log with empty entries and zero metrics', () => {
      const log = createTrajectoryLog('test-request-123');

      expect(log.requestId).toBe('test-request-123');
      expect(log.entries).toEqual([]);
      expect(log.metrics.totalSteps).toBe(0);
      expect(log.metrics.totalTokens).toEqual({ input: 0, output: 0 });
      expect(log.metrics.duration).toBe(0);
      expect(log.metrics.errorCount).toBe(0);
    });
  });

  describe('logStep', () => {
    it('adds an entry with timestamp', () => {
      const log = createTrajectoryLog('test-123');
      const updated = logStep(log, {
        stepNumber: 1,
        type: 'thought',
        content: 'Analyzing the request',
      });

      expect(updated.entries).toHaveLength(1);
      expect(updated.entries[0].stepNumber).toBe(1);
      expect(updated.entries[0].type).toBe('thought');
      expect(updated.entries[0].content).toBe('Analyzing the request');
      expect(updated.entries[0].timestamp).toBeGreaterThan(0);
    });

    it('updates totalSteps metric', () => {
      let log = createTrajectoryLog('test-123');
      log = logStep(log, { stepNumber: 1, type: 'thought', content: 'Step 1' });
      log = logStep(log, { stepNumber: 2, type: 'thought', content: 'Step 2' });
      log = logStep(log, { stepNumber: 3, type: 'thought', content: 'Step 3' });

      expect(log.metrics.totalSteps).toBe(3);
    });

    it('increments errorCount for error entries', () => {
      let log = createTrajectoryLog('test-123');
      log = logStep(log, { stepNumber: 1, type: 'error', content: 'Error 1' });
      log = logStep(log, { stepNumber: 2, type: 'error', content: 'Error 2' });

      expect(log.metrics.errorCount).toBe(2);
    });

    it('does not mutate the original log', () => {
      const original = createTrajectoryLog('test-123');
      const updated = logStep(original, {
        stepNumber: 1,
        type: 'thought',
        content: 'Test',
      });

      expect(original.entries).toHaveLength(0);
      expect(updated.entries).toHaveLength(1);
    });

    it('truncates oldest entries when exceeding max limit', () => {
      let log = createTrajectoryLog('test-123');

      // Add 205 entries (exceeds MAX_LOG_ENTRIES of 200)
      for (let i = 1; i <= 205; i++) {
        log = logStep(log, { stepNumber: i, type: 'thought', content: `Entry ${i}` });
      }

      // Should be capped at 200
      expect(log.entries).toHaveLength(200);
      // Oldest entries should be removed, keeping the newest
      expect(log.entries[0].content).toBe('Entry 6');
      expect(log.entries[199].content).toBe('Entry 205');
    });
  });

  describe('logThought', () => {
    it('logs a thought entry', () => {
      const log = createTrajectoryLog('test-123');
      const updated = logThought(log, 1, 'I need to search for information');

      expect(updated.entries[0].type).toBe('thought');
      expect(updated.entries[0].content).toBe('I need to search for information');
    });

    it('includes metadata when provided', () => {
      const log = createTrajectoryLog('test-123');
      const updated = logThought(log, 1, 'Thinking...', { confidence: 0.9 });

      expect(updated.entries[0].metadata).toEqual({ confidence: 0.9 });
    });
  });

  describe('logToolCall', () => {
    it('logs a tool call with name and reasoning', () => {
      const log = createTrajectoryLog('test-123');
      const toolCall: ToolCall = {
        name: 'search_web_for_info',
        parameters: { query: 'test query' },
        reasoning: 'Need to find more information',
      };

      const updated = logToolCall(log, 1, toolCall);

      expect(updated.entries[0].type).toBe('tool_call');
      expect(updated.entries[0].content).toContain('search_web_for_info');
      expect(updated.entries[0].content).toContain('Need to find more information');
      expect(updated.entries[0].metadata?.toolName).toBe('search_web_for_info');
      expect(updated.entries[0].metadata?.parameters).toEqual({ query: 'test query' });
    });
  });

  describe('logToolResult', () => {
    it('logs a successful tool result', () => {
      const log = createTrajectoryLog('test-123');
      const toolResult: ToolResult = {
        success: true,
        data: { results: ['item1', 'item2'] },
        tokenCount: 150,
      };

      const updated = logToolResult(log, 1, toolResult);

      expect(updated.entries[0].type).toBe('tool_result');
      expect(updated.entries[0].content).toContain('Success');
      expect(updated.entries[0].metadata?.success).toBe(true);
      expect(updated.entries[0].metadata?.tokenCount).toBe(150);
    });

    it('logs a failed tool result', () => {
      const log = createTrajectoryLog('test-123');
      const toolResult: ToolResult = {
        success: false,
        error: 'API rate limit exceeded',
        tokenCount: 0,
      };

      const updated = logToolResult(log, 1, toolResult);

      expect(updated.entries[0].content).toContain('Error');
      expect(updated.entries[0].content).toContain('API rate limit exceeded');
      expect(updated.entries[0].metadata?.success).toBe(false);
    });
  });

  describe('logObservation', () => {
    it('logs an observation entry', () => {
      const log = createTrajectoryLog('test-123');
      const updated = logObservation(log, 1, 'The search results are relevant');

      expect(updated.entries[0].type).toBe('observation');
      expect(updated.entries[0].content).toBe('The search results are relevant');
    });
  });

  describe('logReflection', () => {
    it('logs a reflection with trigger condition', () => {
      const log = createTrajectoryLog('test-123');
      const updated = logReflection(
        log,
        1,
        'The search query was too broad',
        'low_relevance_results'
      );

      expect(updated.entries[0].type).toBe('reflection');
      expect(updated.entries[0].content).toBe('The search query was too broad');
      expect(updated.entries[0].metadata?.triggerCondition).toBe('low_relevance_results');
    });
  });

  describe('logError', () => {
    it('logs an error with context state', () => {
      const log = createTrajectoryLog('test-123');
      const contextState = { currentGoal: 'summarize page', step: 3 };
      const updated = logError(log, 3, 'LLM API timeout', contextState);

      expect(updated.entries[0].type).toBe('error');
      expect(updated.entries[0].content).toBe('LLM API timeout');
      expect(updated.entries[0].metadata?.contextState).toEqual(contextState);
      expect(updated.metrics.errorCount).toBe(1);
    });
  });

  describe('updateTokenUsage', () => {
    it('accumulates token usage', () => {
      let log = createTrajectoryLog('test-123');
      log = updateTokenUsage(log, { input: 100, output: 50 });
      log = updateTokenUsage(log, { input: 200, output: 100 });

      expect(log.metrics.totalTokens).toEqual({ input: 300, output: 150 });
    });
  });

  describe('calculateEfficiency', () => {
    it('returns 1.0 for optimal execution', () => {
      let log = createTrajectoryLog('test-123');
      log = logStep(log, { stepNumber: 1, type: 'thought', content: 'Step 1' });
      log = logStep(log, { stepNumber: 2, type: 'thought', content: 'Step 2' });

      const efficiency = calculateEfficiency(log, 2);
      expect(efficiency).toBe(1.0);
    });

    it('returns less than 1.0 for suboptimal execution', () => {
      let log = createTrajectoryLog('test-123');
      log = logStep(log, { stepNumber: 1, type: 'thought', content: 'Step 1' });
      log = logStep(log, { stepNumber: 2, type: 'thought', content: 'Step 2' });
      log = logStep(log, { stepNumber: 3, type: 'thought', content: 'Step 3' });
      log = logStep(log, { stepNumber: 4, type: 'thought', content: 'Step 4' });

      const efficiency = calculateEfficiency(log, 2);
      expect(efficiency).toBe(0.5);
    });

    it('returns 1.0 for empty log', () => {
      const log = createTrajectoryLog('test-123');
      const efficiency = calculateEfficiency(log, 2);
      expect(efficiency).toBe(1.0);
    });

    it('clamps efficiency to 1.0 maximum', () => {
      let log = createTrajectoryLog('test-123');
      log = logStep(log, { stepNumber: 1, type: 'thought', content: 'Step 1' });

      // Optimal is 5, actual is 1 - would be 5.0 but clamped to 1.0
      const efficiency = calculateEfficiency(log, 5);
      expect(efficiency).toBe(1.0);
    });
  });

  describe('setOptimalSteps', () => {
    it('sets optimal steps and calculates efficiency', () => {
      let log = createTrajectoryLog('test-123');
      log = logStep(log, { stepNumber: 1, type: 'thought', content: 'Step 1' });
      log = logStep(log, { stepNumber: 2, type: 'thought', content: 'Step 2' });
      log = logStep(log, { stepNumber: 3, type: 'thought', content: 'Step 3' });

      const updated = setOptimalSteps(log, 2);

      expect(updated.metrics.optimalSteps).toBe(2);
      expect(updated.metrics.efficiency).toBeCloseTo(0.667, 2);
    });
  });

  describe('exportLog', () => {
    it('exports a formatted string representation', () => {
      let log = createTrajectoryLog('test-request-456');
      log = logThought(log, 1, 'Analyzing request');
      log = logToolCall(log, 1, {
        name: 'search_web',
        parameters: { query: 'test' },
        reasoning: 'Need info',
      });
      log = updateTokenUsage(log, { input: 100, output: 50 });
      log = setOptimalSteps(log, 1);

      const exported = exportLog(log);

      expect(exported).toContain('TRAJECTORY LOG: test-request-456');
      expect(exported).toContain('Total Steps:');
      expect(exported).toContain('THOUGHT');
      expect(exported).toContain('TOOL CALL');
      expect(exported).toContain('Analyzing request');
    });
  });

  describe('exportLogAsJson', () => {
    it('exports valid JSON', () => {
      let log = createTrajectoryLog('test-123');
      log = logThought(log, 1, 'Test thought');

      const json = exportLogAsJson(log);
      const parsed = JSON.parse(json);

      expect(parsed.requestId).toBe('test-123');
      expect(parsed.entries).toHaveLength(1);
    });
  });

  describe('getEntriesByType', () => {
    it('filters entries by type', () => {
      let log = createTrajectoryLog('test-123');
      log = logThought(log, 1, 'Thought 1');
      log = logObservation(log, 1, 'Observation 1');
      log = logThought(log, 2, 'Thought 2');
      log = logError(log, 2, 'Error 1');

      const thoughts = getEntriesByType(log, 'thought');
      expect(thoughts).toHaveLength(2);

      const errors = getEntriesByType(log, 'error');
      expect(errors).toHaveLength(1);
    });
  });

  describe('getEntriesForStep', () => {
    it('filters entries by step number', () => {
      let log = createTrajectoryLog('test-123');
      log = logThought(log, 1, 'Thought 1');
      log = logToolCall(log, 1, {
        name: 'tool1',
        parameters: {},
        reasoning: 'reason',
      });
      log = logThought(log, 2, 'Thought 2');

      const step1Entries = getEntriesForStep(log, 1);
      expect(step1Entries).toHaveLength(2);

      const step2Entries = getEntriesForStep(log, 2);
      expect(step2Entries).toHaveLength(1);
    });
  });

  describe('hasErrors', () => {
    it('returns true when errors exist', () => {
      let log = createTrajectoryLog('test-123');
      log = logError(log, 1, 'Some error');

      expect(hasErrors(log)).toBe(true);
    });

    it('returns false when no errors', () => {
      let log = createTrajectoryLog('test-123');
      log = logThought(log, 1, 'Just a thought');

      expect(hasErrors(log)).toBe(false);
    });
  });

  describe('getLastEntry', () => {
    it('returns the last entry', () => {
      let log = createTrajectoryLog('test-123');
      log = logThought(log, 1, 'First');
      log = logThought(log, 2, 'Second');
      log = logThought(log, 3, 'Third');

      const last = getLastEntry(log);
      expect(last?.content).toBe('Third');
    });

    it('returns undefined for empty log', () => {
      const log = createTrajectoryLog('test-123');
      expect(getLastEntry(log)).toBeUndefined();
    });
  });
});

// ============================================================================
// Arbitrary Generators for Property-Based Tests
// ============================================================================

// Generate valid request IDs
const requestIdArb = fc.uuid();

// Generate non-empty strings for content
const contentArb = fc.string({ minLength: 1, maxLength: 200 });

// Generate step numbers (positive integers)
const stepNumberArb = fc.integer({ min: 1, max: 20 });

// Generate valid tool names
const toolNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,29}$/);

// Generate a valid ToolCall
const toolCallArb: fc.Arbitrary<ToolCall> = fc.record({
  name: toolNameArb,
  parameters: fc.object({ maxDepth: 2 }),
  reasoning: contentArb,
});

// Generate a valid successful ToolResult
const successToolResultArb: fc.Arbitrary<ToolResult> = fc.record({
  success: fc.constant(true),
  data: fc.oneof(
    fc.string(),
    fc.integer(),
    fc.array(fc.string(), { maxLength: 5 }),
    fc.object({ maxDepth: 1 })
  ),
  tokenCount: fc.integer({ min: 0, max: 10000 }),
});

// Generate a valid failed ToolResult
const failedToolResultArb: fc.Arbitrary<ToolResult> = fc.record({
  success: fc.constant(false),
  error: contentArb,
  tokenCount: fc.integer({ min: 0, max: 100 }),
});

// Generate any ToolResult
const toolResultArb: fc.Arbitrary<ToolResult> = fc.oneof(successToolResultArb, failedToolResultArb);

// Generate trigger conditions for reflections
const triggerConditionArb = fc.constantFrom(
  'low_relevance_results',
  'tool_execution_failed',
  'goal_not_achieved',
  'repeated_error',
  'timeout'
);

// Represents a single agent action that should be logged
type AgentAction =
  | { type: 'thought'; stepNumber: number; content: string }
  | { type: 'tool_call'; stepNumber: number; toolCall: ToolCall }
  | { type: 'tool_result'; stepNumber: number; toolResult: ToolResult }
  | { type: 'observation'; stepNumber: number; content: string }
  | { type: 'reflection'; stepNumber: number; content: string; triggerCondition: string };

// Generate a thought action
const thoughtActionArb: fc.Arbitrary<AgentAction> = fc
  .tuple(stepNumberArb, contentArb)
  .map(([stepNumber, content]) => ({ type: 'thought' as const, stepNumber, content }));

// Generate a tool_call action
const toolCallActionArb: fc.Arbitrary<AgentAction> = fc
  .tuple(stepNumberArb, toolCallArb)
  .map(([stepNumber, toolCall]) => ({ type: 'tool_call' as const, stepNumber, toolCall }));

// Generate a tool_result action
const toolResultActionArb: fc.Arbitrary<AgentAction> = fc
  .tuple(stepNumberArb, toolResultArb)
  .map(([stepNumber, toolResult]) => ({ type: 'tool_result' as const, stepNumber, toolResult }));

// Generate an observation action
const observationActionArb: fc.Arbitrary<AgentAction> = fc
  .tuple(stepNumberArb, contentArb)
  .map(([stepNumber, content]) => ({ type: 'observation' as const, stepNumber, content }));

// Generate a reflection action
const reflectionActionArb: fc.Arbitrary<AgentAction> = fc
  .tuple(stepNumberArb, contentArb, triggerConditionArb)
  .map(([stepNumber, content, triggerCondition]) => ({
    type: 'reflection' as const,
    stepNumber,
    content,
    triggerCondition,
  }));

// Generate any agent action
const agentActionArb: fc.Arbitrary<AgentAction> = fc.oneof(
  thoughtActionArb,
  toolCallActionArb,
  toolResultActionArb,
  observationActionArb,
  reflectionActionArb
);

// Generate a sequence of agent actions (simulating an agent execution)
const agentActionsArb: fc.Arbitrary<AgentAction[]> = fc.array(agentActionArb, {
  minLength: 1,
  maxLength: 15,
});

// Helper function to apply an action to a log
function applyAction(log: TrajectoryLog, action: AgentAction): TrajectoryLog {
  switch (action.type) {
    case 'thought':
      return logThought(log, action.stepNumber, action.content);
    case 'tool_call':
      return logToolCall(log, action.stepNumber, action.toolCall);
    case 'tool_result':
      return logToolResult(log, action.stepNumber, action.toolResult);
    case 'observation':
      return logObservation(log, action.stepNumber, action.content);
    case 'reflection':
      return logReflection(log, action.stepNumber, action.content, action.triggerCondition);
  }
}

// Map action type to log entry type
function actionTypeToLogEntryType(actionType: AgentAction['type']): LogEntryType {
  switch (actionType) {
    case 'thought':
      return 'thought';
    case 'tool_call':
      return 'tool_call';
    case 'tool_result':
      return 'tool_result';
    case 'observation':
      return 'observation';
    case 'reflection':
      return 'reflection';
  }
}

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * **Feature: agent-architecture-upgrade, Property 13: Trajectory Logging Completeness**
 * **Validates: Requirements 7.1, 7.2, 7.3**
 *
 * Property: For any completed agent execution, the trajectory log SHALL contain
 * entries for all thoughts, tool calls, tool results, and observations with
 * timestamps and step numbers.
 */
describe('Property 13: Trajectory Logging Completeness', () => {
  it('all logged actions appear in the trajectory with correct types', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        // Create a fresh log
        let log = createTrajectoryLog(requestId);

        // Apply all actions
        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Verify: number of entries matches number of actions
        expect(log.entries.length).toBe(actions.length);

        // Verify: each action has a corresponding entry with correct type
        for (let i = 0; i < actions.length; i++) {
          const action = actions[i];
          const entry = log.entries[i];

          const expectedType = actionTypeToLogEntryType(action.type);
          expect(entry.type).toBe(expectedType);
          expect(entry.stepNumber).toBe(action.stepNumber);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('all entries have valid timestamps', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Verify: all entries have timestamps
        for (const entry of log.entries) {
          expect(entry.timestamp).toBeGreaterThan(0);
          expect(typeof entry.timestamp).toBe('number');
        }

        // Verify: timestamps are in non-decreasing order (entries logged sequentially)
        for (let i = 1; i < log.entries.length; i++) {
          expect(log.entries[i].timestamp).toBeGreaterThanOrEqual(log.entries[i - 1].timestamp);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('all entries have valid step numbers', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Verify: all entries have positive step numbers
        for (const entry of log.entries) {
          expect(entry.stepNumber).toBeGreaterThan(0);
          expect(Number.isInteger(entry.stepNumber)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('thought entries contain the original content', () => {
    fc.assert(
      fc.property(
        requestIdArb,
        fc.array(thoughtActionArb, { minLength: 1, maxLength: 10 }),
        (requestId, thoughtActions) => {
          let log = createTrajectoryLog(requestId);

          for (const action of thoughtActions) {
            log = applyAction(log, action);
          }

          // Verify: each thought entry contains the original content
          for (let i = 0; i < thoughtActions.length; i++) {
            const action = thoughtActions[i];
            const entry = log.entries[i];

            expect(entry.type).toBe('thought');
            expect(entry.content).toBe(action.content);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tool call entries contain tool name and reasoning', () => {
    fc.assert(
      fc.property(
        requestIdArb,
        fc.array(toolCallActionArb, { minLength: 1, maxLength: 10 }),
        (requestId, toolCallActions) => {
          let log = createTrajectoryLog(requestId);

          for (const action of toolCallActions) {
            log = applyAction(log, action);
          }

          // Verify: each tool_call entry contains tool name and reasoning
          for (let i = 0; i < toolCallActions.length; i++) {
            const action = toolCallActions[i];
            const entry = log.entries[i];

            expect(entry.type).toBe('tool_call');
            expect(entry.content).toContain(action.toolCall.name);
            expect(entry.content).toContain(action.toolCall.reasoning);
            expect(entry.metadata?.toolName).toBe(action.toolCall.name);
            expect(entry.metadata?.parameters).toEqual(action.toolCall.parameters);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tool result entries contain success status and token count', () => {
    fc.assert(
      fc.property(
        requestIdArb,
        fc.array(toolResultActionArb, { minLength: 1, maxLength: 10 }),
        (requestId, toolResultActions) => {
          let log = createTrajectoryLog(requestId);

          for (const action of toolResultActions) {
            log = applyAction(log, action);
          }

          // Verify: each tool_result entry contains success status and token count
          for (let i = 0; i < toolResultActions.length; i++) {
            const action = toolResultActions[i];
            const entry = log.entries[i];

            expect(entry.type).toBe('tool_result');
            expect(entry.metadata?.success).toBe(action.toolResult.success);
            expect(entry.metadata?.tokenCount).toBe(action.toolResult.tokenCount);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('observation entries contain the original content', () => {
    fc.assert(
      fc.property(
        requestIdArb,
        fc.array(observationActionArb, { minLength: 1, maxLength: 10 }),
        (requestId, observationActions) => {
          let log = createTrajectoryLog(requestId);

          for (const action of observationActions) {
            log = applyAction(log, action);
          }

          // Verify: each observation entry contains the original content
          for (let i = 0; i < observationActions.length; i++) {
            const action = observationActions[i];
            const entry = log.entries[i];

            expect(entry.type).toBe('observation');
            expect(entry.content).toBe(action.content);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reflection entries contain content and trigger condition', () => {
    fc.assert(
      fc.property(
        requestIdArb,
        fc.array(reflectionActionArb, { minLength: 1, maxLength: 10 }),
        (requestId, reflectionActions) => {
          let log = createTrajectoryLog(requestId);

          for (const action of reflectionActions) {
            log = applyAction(log, action);
          }

          // Verify: each reflection entry contains content and trigger condition
          for (let i = 0; i < reflectionActions.length; i++) {
            const action = reflectionActions[i];
            const entry = log.entries[i];

            expect(entry.type).toBe('reflection');
            expect(entry.content).toBe(action.content);
            expect(entry.metadata?.triggerCondition).toBe(action.triggerCondition);
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('totalSteps metric reflects the maximum step number logged', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Calculate expected max step number
        const maxStepNumber = Math.max(...actions.map((a) => a.stepNumber));

        // Verify: totalSteps equals the maximum step number
        expect(log.metrics.totalSteps).toBe(maxStepNumber);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('entries can be retrieved by type', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Count actions by type
        const thoughtCount = actions.filter((a) => a.type === 'thought').length;
        const toolCallCount = actions.filter((a) => a.type === 'tool_call').length;
        const toolResultCount = actions.filter((a) => a.type === 'tool_result').length;
        const observationCount = actions.filter((a) => a.type === 'observation').length;
        const reflectionCount = actions.filter((a) => a.type === 'reflection').length;

        // Verify: getEntriesByType returns correct counts
        expect(getEntriesByType(log, 'thought').length).toBe(thoughtCount);
        expect(getEntriesByType(log, 'tool_call').length).toBe(toolCallCount);
        expect(getEntriesByType(log, 'tool_result').length).toBe(toolResultCount);
        expect(getEntriesByType(log, 'observation').length).toBe(observationCount);
        expect(getEntriesByType(log, 'reflection').length).toBe(reflectionCount);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('entries can be retrieved by step number', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // For each unique step number, verify getEntriesForStep returns correct entries
        const uniqueStepNumbers = [...new Set(actions.map((a) => a.stepNumber))];

        for (const stepNum of uniqueStepNumbers) {
          const expectedCount = actions.filter((a) => a.stepNumber === stepNum).length;
          const actualEntries = getEntriesForStep(log, stepNum);

          expect(actualEntries.length).toBe(expectedCount);
          expect(actualEntries.every((e) => e.stepNumber === stepNum)).toBe(true);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('exported log contains all entries', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Export as string
        const exported = exportLog(log);

        // Verify: exported log contains the request ID
        expect(exported).toContain(requestId);

        // Verify: exported log contains entry type labels for each action type present
        const hasThoughts = actions.some((a) => a.type === 'thought');
        const hasToolCalls = actions.some((a) => a.type === 'tool_call');
        const hasToolResults = actions.some((a) => a.type === 'tool_result');
        const hasObservations = actions.some((a) => a.type === 'observation');
        const hasReflections = actions.some((a) => a.type === 'reflection');

        if (hasThoughts) expect(exported).toContain('THOUGHT');
        if (hasToolCalls) expect(exported).toContain('TOOL CALL');
        if (hasToolResults) expect(exported).toContain('TOOL RESULT');
        if (hasObservations) expect(exported).toContain('OBSERVATION');
        if (hasReflections) expect(exported).toContain('REFLECTION');

        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('JSON export can be parsed back to equivalent structure', () => {
    fc.assert(
      fc.property(requestIdArb, agentActionsArb, (requestId, actions) => {
        let log = createTrajectoryLog(requestId);

        for (const action of actions) {
          log = applyAction(log, action);
        }

        // Export as JSON and parse back
        const json = exportLogAsJson(log);
        const parsed = JSON.parse(json) as TrajectoryLog;

        // Verify: parsed structure matches original
        expect(parsed.requestId).toBe(log.requestId);
        expect(parsed.entries.length).toBe(log.entries.length);
        expect(parsed.metrics.totalSteps).toBe(log.metrics.totalSteps);

        // Verify: each entry matches
        for (let i = 0; i < log.entries.length; i++) {
          expect(parsed.entries[i].type).toBe(log.entries[i].type);
          expect(parsed.entries[i].stepNumber).toBe(log.entries[i].stepNumber);
          expect(parsed.entries[i].content).toBe(log.entries[i].content);
          expect(parsed.entries[i].timestamp).toBe(log.entries[i].timestamp);
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
