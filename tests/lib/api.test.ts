import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractKeywords } from '../../src/lib/api';

/**
 * **Feature: knowledge-lens, Property 5: Keyword extraction produces valid substrings**
 * **Validates: Requirements 4.1**
 *
 * For any input text, the extractKeywords function SHALL return keywords that:
 * 1. Are substrings of the original text (case-insensitive)
 * 2. Are non-empty and have length > 2
 * 3. Do not exceed the specified maxKeywords limit
 * 4. Are unique (no duplicates)
 */
describe('Property 5: Keyword extraction produces valid substrings', () => {
  // Generate text with meaningful words
  const textWithWordsArb = fc.array(
    fc.string({ minLength: 3, maxLength: 15 }).map((s) =>
      s.replace(/[^a-zA-Z]/g, 'a') || 'word'
    ),
    { minLength: 1, maxLength: 50 }
  ).map((words) => words.join(' '));

  it('all keywords are substrings of the original text (case-insensitive)', () => {
    fc.assert(
      fc.property(textWithWordsArb, (text) => {
        const keywords = extractKeywords(text);
        const lowerText = text.toLowerCase();

        // Every keyword should appear in the original text
        return keywords.every((keyword) => lowerText.includes(keyword));
      }),
      { numRuns: 100 }
    );
  });

  it('all keywords have length greater than 2', () => {
    fc.assert(
      fc.property(textWithWordsArb, (text) => {
        const keywords = extractKeywords(text);

        return keywords.every((keyword) => keyword.length > 2);
      }),
      { numRuns: 100 }
    );
  });

  it('number of keywords does not exceed maxKeywords limit', () => {
    fc.assert(
      fc.property(
        textWithWordsArb,
        fc.integer({ min: 1, max: 20 }),
        (text, maxKeywords) => {
          const keywords = extractKeywords(text, maxKeywords);

          return keywords.length <= maxKeywords;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('keywords are unique (no duplicates)', () => {
    fc.assert(
      fc.property(textWithWordsArb, (text) => {
        const keywords = extractKeywords(text);
        const uniqueKeywords = new Set(keywords);

        return keywords.length === uniqueKeywords.size;
      }),
      { numRuns: 100 }
    );
  });

  it('keywords are lowercase', () => {
    fc.assert(
      fc.property(textWithWordsArb, (text) => {
        const keywords = extractKeywords(text);

        return keywords.every((keyword) => keyword === keyword.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  it('keywords do not contain stop words', () => {
    const stopWords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
      'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
      'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where',
      'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
      'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
      'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
    ]);

    fc.assert(
      fc.property(textWithWordsArb, (text) => {
        const keywords = extractKeywords(text);

        return keywords.every((keyword) => !stopWords.has(keyword));
      }),
      { numRuns: 100 }
    );
  });

  it('returns empty array for text with only stop words', () => {
    const stopWordsText = 'the and or but in on at to for of with by from';
    const keywords = extractKeywords(stopWordsText);

    expect(keywords).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(extractKeywords('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(extractKeywords('   \n\t  ')).toEqual([]);
  });

  it('handles text with special characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 200 }),
        (text) => {
          // Should not throw and should return valid keywords
          const keywords = extractKeywords(text);

          // All returned keywords should be valid (word characters include underscore)
          return keywords.every(
            (k) => k.length > 2 && k === k.toLowerCase() && /^[a-z0-9_]+$/.test(k)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('more frequent words appear earlier in results', () => {
    // Text with clear frequency differences
    const text = 'apple apple apple banana banana cherry';
    const keywords = extractKeywords(text, 3);

    // Apple should come first (3 occurrences), then banana (2), then cherry (1)
    expect(keywords[0]).toBe('apple');
    expect(keywords[1]).toBe('banana');
    expect(keywords[2]).toBe('cherry');
  });

  it('default maxKeywords is 5', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    const keywords = extractKeywords(text);

    expect(keywords.length).toBeLessThanOrEqual(5);
  });
});
