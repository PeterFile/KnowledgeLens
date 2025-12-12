import { describe, it, expect } from 'vitest';
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
import type { ToolCall, ToolResult } from '../../../src/lib/agent/types';

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
