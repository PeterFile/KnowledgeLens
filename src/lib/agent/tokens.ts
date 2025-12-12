// Token Tracker Module
// Requirements: 11.1, 11.2, 11.3, 11.5

import type { TokenEstimate, TokenUsage } from './types';
import type { TokenizerEncoding } from '../tokenizer';
import { countTokens } from '../tokenizer';

// Default warning threshold: 80% of budget
const DEFAULT_WARNING_RATIO = 0.8;

// Average output/input ratio for estimation (based on typical LLM responses)
const DEFAULT_OUTPUT_RATIO = 0.5;

/**
 * Estimate tokens for an operation before execution.
 * Requirements: 11.1 - estimate and display maximum potential token cost
 */
export function estimateTokens(
  prompt: string,
  expectedOutputLength: number = 0,
  encoding: TokenizerEncoding = 'cl100k_base'
): TokenEstimate {
  const inputTokens = countTokens(prompt, encoding);

  // If no expected output provided, estimate based on input
  const outputTokens =
    expectedOutputLength > 0
      ? countTokens(' '.repeat(expectedOutputLength), encoding)
      : Math.ceil(inputTokens * DEFAULT_OUTPUT_RATIO);

  return {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
  };
}

/**
 * Track actual token usage by updating cumulative counters.
 * Requirements: 11.2 - track and display cumulative usage
 */
export function trackUsage(
  usage: TokenUsage,
  actual: { input: number; output: number }
): TokenUsage {
  return {
    ...usage,
    sessionTotal: {
      input: usage.sessionTotal.input + actual.input,
      output: usage.sessionTotal.output + actual.output,
    },
    currentOperation: {
      input: usage.currentOperation.input + actual.input,
      output: usage.currentOperation.output + actual.output,
    },
  };
}

/**
 * Check if token budget has been exceeded.
 * Requirements: 11.4 - terminate when budget exceeded
 */
export function isBudgetExceeded(usage: TokenUsage): boolean {
  const total = usage.sessionTotal.input + usage.sessionTotal.output;
  return total >= usage.budget;
}

/**
 * Check if warning threshold has been reached.
 * Requirements: 11.3 - warn user before proceeding when threshold exceeded
 */
export function isWarningThreshold(usage: TokenUsage): boolean {
  const total = usage.sessionTotal.input + usage.sessionTotal.output;
  return total >= usage.warningThreshold;
}

/**
 * Format token usage for UI display.
 * Requirements: 11.5 - show input and output token counts separately
 */
export function formatUsage(usage: TokenUsage): string {
  const { sessionTotal, budget } = usage;
  const total = sessionTotal.input + sessionTotal.output;
  const percentage = budget > 0 ? Math.round((total / budget) * 100) : 0;

  return `${sessionTotal.input.toLocaleString()} in / ${sessionTotal.output.toLocaleString()} out (${total.toLocaleString()} total, ${percentage}% of budget)`;
}

/**
 * Create initial token usage state.
 */
export function createTokenUsage(budget: number, warningRatio = DEFAULT_WARNING_RATIO): TokenUsage {
  return {
    sessionTotal: { input: 0, output: 0 },
    currentOperation: { input: 0, output: 0 },
    budget,
    warningThreshold: Math.floor(budget * warningRatio),
  };
}

/**
 * Reset current operation counters (call at start of new operation).
 */
export function resetCurrentOperation(usage: TokenUsage): TokenUsage {
  return {
    ...usage,
    currentOperation: { input: 0, output: 0 },
  };
}

/**
 * Get remaining token budget.
 */
export function getRemainingBudget(usage: TokenUsage): number {
  const total = usage.sessionTotal.input + usage.sessionTotal.output;
  return Math.max(0, usage.budget - total);
}
