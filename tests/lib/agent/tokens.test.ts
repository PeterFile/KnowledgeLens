import { describe, it, expect } from 'vitest';
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
