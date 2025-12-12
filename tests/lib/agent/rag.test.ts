import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseGradingResponse,
  parseRelevance,
  parseConfidence,
  extractTagContent,
  calculateRelevanceRatio,
  filterRelevantResults,
} from '../../../src/lib/agent/rag';
import type { SearchResult } from '../../../src/types';
import type { GradedResult, RelevanceGrade } from '../../../src/lib/agent/types';

// ============================================================================
// Arbitraries for generating test data
// ============================================================================

// Generate valid URL strings
const urlArb = fc.webUrl();

// Generate non-empty strings for titles and snippets
const titleArb = fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0);
const snippetArb = fc.string({ minLength: 1, maxLength: 500 }).filter((s) => s.trim().length > 0);

// Generate a valid SearchResult
const searchResultArb: fc.Arbitrary<SearchResult> = fc.record({
  title: titleArb,
  snippet: snippetArb,
  url: urlArb,
});

// Generate an array of SearchResults (1-10 results)
const searchResultsArb = fc.array(searchResultArb, { minLength: 1, maxLength: 10 });

// Generate relevance grade
const relevanceGradeArb: fc.Arbitrary<RelevanceGrade> = fc.constantFrom('relevant', 'not_relevant');

// Generate confidence value (0-1)
const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true });

// Generate reasoning string
const reasoningArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

/**
 * Generate a well-formed LLM grading response for given search results.
 * This simulates what the LLM would return.
 */
function generateGradingResponse(
  results: SearchResult[],
  grades: { relevance: RelevanceGrade; confidence: number; reasoning: string }[]
): string {
  return results
    .map((_, i) => {
      const grade = grades[i] || { relevance: 'relevant', confidence: 0.5, reasoning: 'Default' };
      const relevanceStr = grade.relevance === 'not_relevant' ? 'NOT_RELEVANT' : 'RELEVANT';
      return `<result index="${i}">
  <relevance>${relevanceStr}</relevance>
  <confidence>${grade.confidence.toFixed(2)}</confidence>
  <reasoning>${grade.reasoning}</reasoning>
</result>`;
    })
    .join('\n');
}

// ============================================================================
// Unit Tests
// ============================================================================

describe('RAG Parsing Functions', () => {
  describe('extractTagContent', () => {
    it('extracts content from XML tags', () => {
      expect(extractTagContent('<tag>content</tag>', 'tag')).toBe('content');
      expect(extractTagContent('<TAG>CONTENT</TAG>', 'tag')).toBe('CONTENT');
      expect(extractTagContent('prefix<tag>value</tag>suffix', 'tag')).toBe('value');
    });

    it('returns empty string for missing tags', () => {
      expect(extractTagContent('no tags here', 'tag')).toBe('');
      expect(extractTagContent('<other>content</other>', 'tag')).toBe('');
    });

    it('trims whitespace from extracted content', () => {
      expect(extractTagContent('<tag>  content  </tag>', 'tag')).toBe('content');
      expect(extractTagContent('<tag>\n  content\n  </tag>', 'tag')).toBe('content');
    });
  });

  describe('parseRelevance', () => {
    it('parses NOT_RELEVANT correctly', () => {
      expect(parseRelevance('NOT_RELEVANT')).toBe('not_relevant');
      expect(parseRelevance('not_relevant')).toBe('not_relevant');
      expect(parseRelevance('  NOT_RELEVANT  ')).toBe('not_relevant');
    });

    it('defaults to relevant for other values', () => {
      expect(parseRelevance('RELEVANT')).toBe('relevant');
      expect(parseRelevance('relevant')).toBe('relevant');
      expect(parseRelevance('')).toBe('relevant');
      expect(parseRelevance('unknown')).toBe('relevant');
    });
  });

  describe('parseConfidence', () => {
    it('parses valid confidence values', () => {
      expect(parseConfidence('0.5')).toBe(0.5);
      expect(parseConfidence('0.0')).toBe(0);
      expect(parseConfidence('1.0')).toBe(1);
      expect(parseConfidence('0.75')).toBe(0.75);
    });

    it('clamps values to [0, 1]', () => {
      expect(parseConfidence('1.5')).toBe(1);
      expect(parseConfidence('-0.5')).toBe(0);
      expect(parseConfidence('2.0')).toBe(1);
    });

    it('defaults to 0.5 for invalid values', () => {
      expect(parseConfidence('')).toBe(0.5);
      expect(parseConfidence('invalid')).toBe(0.5);
      expect(parseConfidence('NaN')).toBe(0.5);
    });
  });

  describe('parseGradingResponse', () => {
    it('parses well-formed response', () => {
      const results: SearchResult[] = [
        { title: 'Result 1', snippet: 'Snippet 1', url: 'https://example.com/1' },
        { title: 'Result 2', snippet: 'Snippet 2', url: 'https://example.com/2' },
      ];

      const response = `
        <result index="0">
          <relevance>RELEVANT</relevance>
          <confidence>0.9</confidence>
          <reasoning>Highly relevant to query</reasoning>
        </result>
        <result index="1">
          <relevance>NOT_RELEVANT</relevance>
          <confidence>0.8</confidence>
          <reasoning>Off topic</reasoning>
        </result>
      `;

      const graded = parseGradingResponse(response, results);

      expect(graded).toHaveLength(2);
      expect(graded[0].relevance).toBe('relevant');
      expect(graded[0].confidence).toBe(0.9);
      expect(graded[0].reasoning).toBe('Highly relevant to query');
      expect(graded[1].relevance).toBe('not_relevant');
      expect(graded[1].confidence).toBe(0.8);
    });

    it('handles single quotes in index attribute', () => {
      const results: SearchResult[] = [
        { title: 'Result', snippet: 'Snippet', url: 'https://example.com' },
      ];

      const response = `<result index='0'>
        <relevance>RELEVANT</relevance>
        <confidence>0.7</confidence>
        <reasoning>Good match</reasoning>
      </result>`;

      const graded = parseGradingResponse(response, results);
      expect(graded).toHaveLength(1);
      expect(graded[0].relevance).toBe('relevant');
    });

    it('handles no quotes in index attribute', () => {
      const results: SearchResult[] = [
        { title: 'Result', snippet: 'Snippet', url: 'https://example.com' },
      ];

      const response = `<result index=0>
        <relevance>RELEVANT</relevance>
        <confidence>0.7</confidence>
        <reasoning>Good match</reasoning>
      </result>`;

      const graded = parseGradingResponse(response, results);
      expect(graded).toHaveLength(1);
    });

    it('falls back to all relevant when parsing fails', () => {
      const results: SearchResult[] = [
        { title: 'Result 1', snippet: 'Snippet 1', url: 'https://example.com/1' },
        { title: 'Result 2', snippet: 'Snippet 2', url: 'https://example.com/2' },
      ];

      const response = 'This is not valid XML grading response';

      const graded = parseGradingResponse(response, results);

      expect(graded).toHaveLength(2);
      expect(graded[0].relevance).toBe('relevant');
      expect(graded[0].confidence).toBe(0.5);
      expect(graded[1].relevance).toBe('relevant');
    });

    it('returns empty array for empty results', () => {
      const graded = parseGradingResponse('any response', []);
      expect(graded).toHaveLength(0);
    });
  });

  describe('calculateRelevanceRatio', () => {
    it('calculates ratio correctly', () => {
      const results: GradedResult[] = [
        {
          result: { title: 'R1', snippet: 'S1', url: 'https://example.com/1' },
          relevance: 'relevant',
          confidence: 0.9,
          reasoning: 'Good',
        },
        {
          result: { title: 'R2', snippet: 'S2', url: 'https://example.com/2' },
          relevance: 'not_relevant',
          confidence: 0.8,
          reasoning: 'Bad',
        },
      ];

      expect(calculateRelevanceRatio(results)).toBe(0.5);
    });

    it('returns 0 for empty array', () => {
      expect(calculateRelevanceRatio([])).toBe(0);
    });

    it('returns 1 for all relevant', () => {
      const results: GradedResult[] = [
        {
          result: { title: 'R1', snippet: 'S1', url: 'https://example.com/1' },
          relevance: 'relevant',
          confidence: 0.9,
          reasoning: 'Good',
        },
      ];

      expect(calculateRelevanceRatio(results)).toBe(1);
    });
  });

  describe('filterRelevantResults', () => {
    it('filters to only relevant results', () => {
      const results: GradedResult[] = [
        {
          result: { title: 'R1', snippet: 'S1', url: 'https://example.com/1' },
          relevance: 'relevant',
          confidence: 0.9,
          reasoning: 'Good',
        },
        {
          result: { title: 'R2', snippet: 'S2', url: 'https://example.com/2' },
          relevance: 'not_relevant',
          confidence: 0.8,
          reasoning: 'Bad',
        },
        {
          result: { title: 'R3', snippet: 'S3', url: 'https://example.com/3' },
          relevance: 'relevant',
          confidence: 0.7,
          reasoning: 'OK',
        },
      ];

      const filtered = filterRelevantResults(results);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((r) => r.relevance === 'relevant')).toBe(true);
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * **Feature: agent-architecture-upgrade, Property 7: Search Result Grading**
 * **Validates: Requirements 4.1**
 *
 * Property: For any set of search results, the grading function SHALL assign
 * a relevance grade ('relevant' or 'not_relevant') to each result.
 */
describe('Property-Based Tests', () => {
  describe('Property 7: Search Result Grading', () => {
    it('every result receives a valid relevance grade', () => {
      fc.assert(
        fc.property(
          searchResultsArb,
          fc.array(
            fc.record({
              relevance: relevanceGradeArb,
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (results, grades) => {
            // Generate a well-formed LLM response
            const response = generateGradingResponse(results, grades);

            // Parse the response
            const gradedResults = parseGradingResponse(response, results);

            // Property: Every result should have a grade
            expect(gradedResults.length).toBeGreaterThan(0);

            // Property: Each graded result has a valid relevance grade
            for (const graded of gradedResults) {
              expect(['relevant', 'not_relevant']).toContain(graded.relevance);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('graded results preserve original search result data', () => {
      fc.assert(
        fc.property(
          searchResultsArb,
          fc.array(
            fc.record({
              relevance: relevanceGradeArb,
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (results, grades) => {
            const response = generateGradingResponse(results, grades);
            const gradedResults = parseGradingResponse(response, results);

            // Property: Each graded result contains the original SearchResult
            for (const graded of gradedResults) {
              expect(graded.result).toBeDefined();
              expect(graded.result.title).toBeDefined();
              expect(graded.result.snippet).toBeDefined();
              expect(graded.result.url).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('confidence values are always in [0, 1] range', () => {
      fc.assert(
        fc.property(
          searchResultsArb,
          fc.array(
            fc.record({
              relevance: relevanceGradeArb,
              confidence: fc.double({ min: -10, max: 10, noNaN: true }), // Include out-of-range values
              reasoning: reasoningArb,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (results, grades) => {
            const response = generateGradingResponse(results, grades);
            const gradedResults = parseGradingResponse(response, results);

            // Property: Confidence is always clamped to [0, 1]
            for (const graded of gradedResults) {
              expect(graded.confidence).toBeGreaterThanOrEqual(0);
              expect(graded.confidence).toBeLessThanOrEqual(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('graceful degradation: unparseable response grades all as relevant', () => {
      fc.assert(
        fc.property(
          searchResultsArb,
          fc.string({ minLength: 0, maxLength: 500 }).filter((s) => !s.includes('<result')),
          (results, invalidResponse) => {
            // Parse an invalid response (no <result> tags)
            const gradedResults = parseGradingResponse(invalidResponse, results);

            // Property: All results should be graded as relevant (graceful degradation)
            expect(gradedResults).toHaveLength(results.length);
            for (const graded of gradedResults) {
              expect(graded.relevance).toBe('relevant');
              expect(graded.confidence).toBe(0.5);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('parseRelevance always returns valid RelevanceGrade', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = parseRelevance(input);
          expect(['relevant', 'not_relevant']).toContain(result);
        }),
        { numRuns: 100 }
      );
    });

    it('parseConfidence always returns number in [0, 1]', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          const result = parseConfidence(input);
          expect(typeof result).toBe('number');
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(1);
          expect(Number.isNaN(result)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('calculateRelevanceRatio returns value in [0, 1]', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: relevanceGradeArb,
              confidence: confidenceArb,
              reasoning: reasoningArb,
            })
          ),
          (gradedResults) => {
            const ratio = calculateRelevanceRatio(gradedResults);
            expect(ratio).toBeGreaterThanOrEqual(0);
            expect(ratio).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filterRelevantResults only returns results with relevant grade', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: relevanceGradeArb,
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 0, maxLength: 20 }
          ),
          (gradedResults) => {
            const filtered = filterRelevantResults(gradedResults);

            // Property: All filtered results have 'relevant' grade
            for (const result of filtered) {
              expect(result.relevance).toBe('relevant');
            }

            // Property: Count matches expected
            const expectedCount = gradedResults.filter((r) => r.relevance === 'relevant').length;
            expect(filtered).toHaveLength(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
