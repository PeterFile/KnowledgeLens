import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  estimateTokens,
  trackUsage,
  isBudgetExceeded,
  isWarningThreshold,
  formatUsage,
  createTokenUsage,
  resetCurrentOperation,
  getRemainingBudget,
} from '../../../src/lib/agent/tokens';
import type { TokenUsage } from '../../../src/lib/agent/types';

describe('Token Tracker', () => {
  describe('estimateTokens', () => {
    it('estimates input tokens from prompt text', () => {
      const estimate = estimateTokens('Hello, world!');
      expect(estimate.input).toBeGreaterThan(0);
      expect(estimate.total).toBe(estimate.input + estimate.output);
    });

    it('uses expected output length when provided', () => {
      const estimate = estimateTokens('Hello', 100);
      expect(estimate.output).toBeGreaterThan(0);
    });

    it('returns zero for empty prompt', () => {
      const estimate = estimateTokens('');
      expect(estimate.input).toBe(0);
    });
  });

  describe('trackUsage', () => {
    it('accumulates token usage correctly', () => {
      const initial = createTokenUsage(10000);
      const updated = trackUsage(initial, { input: 100, output: 50 });

      expect(updated.sessionTotal.input).toBe(100);
      expect(updated.sessionTotal.output).toBe(50);
      expect(updated.currentOperation.input).toBe(100);
      expect(updated.currentOperation.output).toBe(50);
    });

    it('accumulates multiple tracking calls', () => {
      let usage = createTokenUsage(10000);
      usage = trackUsage(usage, { input: 100, output: 50 });
      usage = trackUsage(usage, { input: 200, output: 100 });

      expect(usage.sessionTotal.input).toBe(300);
      expect(usage.sessionTotal.output).toBe(150);
    });
  });

  describe('isBudgetExceeded', () => {
    it('returns false when under budget', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 100, output: 50 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(isBudgetExceeded(usage)).toBe(false);
    });

    it('returns true when at budget', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 500, output: 500 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(isBudgetExceeded(usage)).toBe(true);
    });

    it('returns true when over budget', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 600, output: 500 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(isBudgetExceeded(usage)).toBe(true);
    });
  });

  describe('isWarningThreshold', () => {
    it('returns false when under threshold', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 100, output: 50 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(isWarningThreshold(usage)).toBe(false);
    });

    it('returns true when at threshold', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 400, output: 400 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(isWarningThreshold(usage)).toBe(true);
    });

    it('returns true when over threshold', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 500, output: 400 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(isWarningThreshold(usage)).toBe(true);
    });
  });

  describe('formatUsage', () => {
    it('formats usage with input/output breakdown', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 1000, output: 500 },
        currentOperation: { input: 0, output: 0 },
        budget: 10000,
        warningThreshold: 8000,
      };
      const formatted = formatUsage(usage);

      expect(formatted).toContain('1,000 in');
      expect(formatted).toContain('500 out');
      expect(formatted).toContain('1,500 total');
      expect(formatted).toContain('15%');
    });

    it('handles zero budget gracefully', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 100, output: 50 },
        currentOperation: { input: 0, output: 0 },
        budget: 0,
        warningThreshold: 0,
      };
      const formatted = formatUsage(usage);
      expect(formatted).toContain('0%');
    });
  });

  describe('createTokenUsage', () => {
    it('creates usage with default warning ratio', () => {
      const usage = createTokenUsage(10000);
      expect(usage.budget).toBe(10000);
      expect(usage.warningThreshold).toBe(8000);
      expect(usage.sessionTotal.input).toBe(0);
      expect(usage.sessionTotal.output).toBe(0);
    });

    it('creates usage with custom warning ratio', () => {
      const usage = createTokenUsage(10000, 0.5);
      expect(usage.warningThreshold).toBe(5000);
    });
  });

  describe('resetCurrentOperation', () => {
    it('resets current operation while preserving session total', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 500, output: 250 },
        currentOperation: { input: 100, output: 50 },
        budget: 10000,
        warningThreshold: 8000,
      };
      const reset = resetCurrentOperation(usage);

      expect(reset.sessionTotal.input).toBe(500);
      expect(reset.sessionTotal.output).toBe(250);
      expect(reset.currentOperation.input).toBe(0);
      expect(reset.currentOperation.output).toBe(0);
    });
  });

  describe('getRemainingBudget', () => {
    it('calculates remaining budget correctly', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 300, output: 200 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(getRemainingBudget(usage)).toBe(500);
    });

    it('returns zero when budget exceeded', () => {
      const usage: TokenUsage = {
        sessionTotal: { input: 600, output: 500 },
        currentOperation: { input: 0, output: 0 },
        budget: 1000,
        warningThreshold: 800,
      };
      expect(getRemainingBudget(usage)).toBe(0);
    });
  });
});

/**
 * **Feature: agent-architecture-upgrade, Property 15: Token Budget Enforcement**
 * **Validates: Requirements 11.4**
 *
 * Property: For any agent execution where token usage exceeds the configured budget,
 * the system SHALL terminate (isBudgetExceeded returns true).
 */
describe('Property-Based Tests', () => {
  describe('Property 15: Token Budget Enforcement', () => {
    it('isBudgetExceeded returns true when total tokens >= budget', () => {
      fc.assert(
        fc.property(
          // Generate budget (positive integer)
          fc.integer({ min: 1, max: 1_000_000 }),
          // Generate input tokens
          fc.integer({ min: 0, max: 1_000_000 }),
          // Generate output tokens
          fc.integer({ min: 0, max: 1_000_000 }),
          (budget, inputTokens, outputTokens) => {
            const totalTokens = inputTokens + outputTokens;

            const usage: TokenUsage = {
              sessionTotal: { input: inputTokens, output: outputTokens },
              currentOperation: { input: 0, output: 0 },
              budget,
              warningThreshold: Math.floor(budget * 0.8),
            };

            const exceeded = isBudgetExceeded(usage);

            // Property: isBudgetExceeded returns true iff total >= budget
            if (totalTokens >= budget) {
              expect(exceeded).toBe(true);
            } else {
              expect(exceeded).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('trackUsage accumulation eventually triggers budget exceeded', () => {
      fc.assert(
        fc.property(
          // Generate a budget
          fc.integer({ min: 100, max: 10_000 }),
          // Generate a sequence of token increments
          fc.array(
            fc.record({
              input: fc.integer({ min: 1, max: 500 }),
              output: fc.integer({ min: 1, max: 500 }),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (budget, increments) => {
            let usage = createTokenUsage(budget);
            let totalAccumulated = 0;

            for (const increment of increments) {
              usage = trackUsage(usage, increment);
              totalAccumulated += increment.input + increment.output;

              const exceeded = isBudgetExceeded(usage);

              // Property: Once total >= budget, isBudgetExceeded must be true
              if (totalAccumulated >= budget) {
                expect(exceeded).toBe(true);
              }

              // Property: If exceeded is true, total must be >= budget
              if (exceeded) {
                expect(totalAccumulated).toBeGreaterThanOrEqual(budget);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('budget enforcement is consistent regardless of input/output distribution', () => {
      fc.assert(
        fc.property(
          // Generate total tokens and budget
          fc.integer({ min: 0, max: 100_000 }),
          fc.integer({ min: 1, max: 100_000 }),
          // Generate split ratio (0-100%)
          fc.integer({ min: 0, max: 100 }),
          (totalTokens, budget, splitPercent) => {
            // Split total tokens between input and output
            const inputTokens = Math.floor((totalTokens * splitPercent) / 100);
            const outputTokens = totalTokens - inputTokens;

            const usage: TokenUsage = {
              sessionTotal: { input: inputTokens, output: outputTokens },
              currentOperation: { input: 0, output: 0 },
              budget,
              warningThreshold: Math.floor(budget * 0.8),
            };

            const exceeded = isBudgetExceeded(usage);

            // Property: Budget enforcement depends only on total, not distribution
            expect(exceeded).toBe(totalTokens >= budget);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
