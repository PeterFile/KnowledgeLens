import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { truncateToTokens, countTokens } from '../../src/lib/tokenizer';

/**
 * **Feature: knowledge-lens, Property 14: Content truncation respects limits**
 * **Validates: Requirements 10.3**
 *
 * For any text content and token limit, the truncated output SHALL have
 * a token count less than or equal to the specified limit.
 */
describe('Property 14: Content truncation respects limits', () => {
  it('truncated text token count is always <= maxTokens', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 5000 }),
        fc.integer({ min: 1, max: 1000 }),
        (text, maxTokens) => {
          const truncated = truncateToTokens(text, maxTokens);
          const tokenCount = countTokens(truncated);

          return tokenCount <= maxTokens;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('truncation preserves original text when under limit', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (text) => {
        const originalTokens = countTokens(text);
        // Use a limit larger than the text
        const maxTokens = originalTokens + 100;
        const truncated = truncateToTokens(text, maxTokens);

        return truncated === text;
      }),
      { numRuns: 100 }
    );
  });

  it('empty or zero limit returns empty string', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: -100, max: 0 }),
        (text, maxTokens) => {
          const truncated = truncateToTokens(text, maxTokens);
          return truncated === '';
        }
      ),
      { numRuns: 100 }
    );
  });
});
