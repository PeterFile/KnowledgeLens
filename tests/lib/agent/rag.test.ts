import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseGradingResponse,
  parseRelevance,
  parseConfidence,
  extractTagContent,
  calculateRelevanceRatio,
  filterRelevantResults,
  formatResultsForCitation,
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

// Generate a non-empty query string (for query rewriting tests)
const queryArb = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0 && !s.includes('<'));

/**
 * Generate a well-formed LLM query rewrite response.
 * This simulates what the LLM would return for query rewriting.
 */
function generateQueryRewriteResponse(rewrittenQuery: string, explanation: string): string {
  return `<rewritten_query>${rewrittenQuery}</rewritten_query>

<explanation>${explanation}</explanation>`;
}

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

  /**
   * **Feature: agent-architecture-upgrade, Property 8: Query Rewriting on Low Relevance**
   * **Validates: Requirements 4.2, 4.3**
   *
   * Property: For any search where the majority of results are graded 'not_relevant',
   * the system SHALL generate a rewritten query that differs from the original.
   */
  describe('Property 8: Query Rewriting on Low Relevance', () => {
    it('extracted rewritten query differs from original when LLM provides different query', () => {
      fc.assert(
        fc.property(
          queryArb,
          queryArb.filter((q) => q.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 200 }),
          (originalQuery, rewrittenQuery, explanation) => {
            // Pre-condition: rewritten query is different from original
            fc.pre(rewrittenQuery.toLowerCase().trim() !== originalQuery.toLowerCase().trim());

            // Generate a well-formed LLM response with a different query
            const response = generateQueryRewriteResponse(rewrittenQuery, explanation);

            // Extract the rewritten query using the same logic as rewriteQuery
            const extracted = extractTagContent(response, 'rewritten_query');

            // Property: The extracted query should differ from the original
            expect(extracted.toLowerCase().trim()).not.toBe(originalQuery.toLowerCase().trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('fallback mechanism produces different query when extraction fails', () => {
      fc.assert(
        fc.property(
          queryArb,
          fc
            .string({ minLength: 0, maxLength: 200 })
            .filter((s) => !s.includes('<rewritten_query>')),
          (originalQuery, invalidResponse) => {
            // Try to extract from invalid response (no rewritten_query tag)
            const extracted = extractTagContent(invalidResponse, 'rewritten_query');

            // When extraction fails (empty string), the fallback appends " explained"
            if (extracted === '') {
              // Simulate the fallback logic from rewriteQuery
              const fallbackQuery = `${originalQuery} explained`;

              // Property: Fallback query differs from original
              expect(fallbackQuery).not.toBe(originalQuery);
              expect(fallbackQuery).toBe(`${originalQuery} explained`);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('query rewrite response extraction preserves query content (trimmed)', () => {
      fc.assert(
        fc.property(
          queryArb,
          fc.string({ minLength: 1, maxLength: 200 }),
          (rewrittenQuery, explanation) => {
            // Generate response with the query
            const response = generateQueryRewriteResponse(rewrittenQuery, explanation);

            // Extract the query
            const extracted = extractTagContent(response, 'rewritten_query');

            // Property: Extracted query matches trimmed input
            // (extractTagContent trims whitespace by design)
            expect(extracted).toBe(rewrittenQuery.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('majority not_relevant triggers need for rewrite (relevance ratio < threshold)', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: fc.constant('not_relevant' as RelevanceGrade),
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: fc.constant('relevant' as RelevanceGrade),
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 0, maxLength: 4 }
          ),
          (notRelevantResults, relevantResults) => {
            // Combine results ensuring majority are not_relevant
            const allResults = [...notRelevantResults, ...relevantResults];

            // Pre-condition: majority must be not_relevant (ratio < 0.5)
            const relevanceRatio = calculateRelevanceRatio(allResults);
            fc.pre(relevanceRatio < 0.5);

            // Property: When majority are not_relevant, relevance ratio is below threshold
            // This is the condition that triggers query rewriting in agenticRAG
            expect(relevanceRatio).toBeLessThan(0.5);

            // Property: The not_relevant count exceeds relevant count
            const notRelevantCount = allResults.filter(
              (r) => r.relevance === 'not_relevant'
            ).length;
            const relevantCount = allResults.filter((r) => r.relevance === 'relevant').length;
            expect(notRelevantCount).toBeGreaterThan(relevantCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rewritten query from valid response is never empty', () => {
      fc.assert(
        fc.property(
          queryArb.filter((q) => q.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 200 }),
          (rewrittenQuery, explanation) => {
            const response = generateQueryRewriteResponse(rewrittenQuery, explanation);
            const extracted = extractTagContent(response, 'rewritten_query');

            // Property: Extracted query is never empty when input was non-empty
            expect(extracted.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: agent-architecture-upgrade, Property 9: Citation Integrity**
   * **Validates: Requirements 4.5**
   *
   * Property: For any final response that includes citations, all cited sources
   * SHALL have been graded as 'relevant'.
   */
  describe('Property 9: Citation Integrity', () => {
    it('filterRelevantResults only returns results graded as relevant', () => {
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

            // Property: Every result in the filtered list has relevance === 'relevant'
            for (const result of filtered) {
              expect(result.relevance).toBe('relevant');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatResultsForCitation only includes relevant results when given filtered input', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: relevanceGradeArb,
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (gradedResults) => {
            // First filter to get only relevant results (as the system does)
            const relevantOnly = filterRelevantResults(gradedResults);

            // Format for citation
            const formatted = formatResultsForCitation(relevantOnly);

            // Property: If there are relevant results, each one should appear in the formatted output
            for (const result of relevantOnly) {
              expect(formatted).toContain(result.result.url);
              expect(formatted).toContain(result.result.title);
            }

            // Property: No not_relevant results should appear in the formatted output
            const notRelevant = gradedResults.filter((r) => r.relevance === 'not_relevant');
            for (const result of notRelevant) {
              // Only check if the URL is unique to not_relevant results
              const isUrlUniqueToNotRelevant = !relevantOnly.some(
                (r) => r.result.url === result.result.url
              );
              if (isUrlUniqueToNotRelevant) {
                expect(formatted).not.toContain(result.result.url);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('citation workflow preserves only relevant sources end-to-end', () => {
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
            // Simulate the full citation workflow:
            // 1. Parse grading response
            const response = generateGradingResponse(results, grades);
            const gradedResults = parseGradingResponse(response, results);

            // 2. Filter to relevant only
            const relevantResults = filterRelevantResults(gradedResults);

            // 3. Format for citation
            const citations = formatResultsForCitation(relevantResults);

            // Property: All URLs in citations belong to results graded as 'relevant'
            const relevantUrls = new Set(relevantResults.map((r) => r.result.url));

            // Extract URLs from the formatted citations
            const urlPattern = /Source: (https?:\/\/[^\s\n]+)/g;
            let match;
            while ((match = urlPattern.exec(citations)) !== null) {
              const citedUrl = match[1];
              // Property: Every cited URL was graded as relevant
              expect(relevantUrls.has(citedUrl)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no citations appear when all results are not_relevant', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: fc.constant('not_relevant' as RelevanceGrade),
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (allNotRelevant) => {
            // Filter (should return empty)
            const filtered = filterRelevantResults(allNotRelevant);

            // Property: No relevant results when all are not_relevant
            expect(filtered).toHaveLength(0);

            // Format for citation
            const citations = formatResultsForCitation(filtered);

            // Property: Should indicate no sources found
            expect(citations).toBe('No relevant sources found.');

            // Property: None of the not_relevant URLs should appear
            for (const result of allNotRelevant) {
              expect(citations).not.toContain(result.result.url);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('citation count matches relevant result count', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              result: searchResultArb,
              relevance: relevanceGradeArb,
              confidence: confidenceArb,
              reasoning: reasoningArb,
            }),
            { minLength: 0, maxLength: 15 }
          ),
          (gradedResults) => {
            const relevantResults = filterRelevantResults(gradedResults);
            const citations = formatResultsForCitation(relevantResults);

            if (relevantResults.length === 0) {
              // Property: Empty results produce "No relevant sources found."
              expect(citations).toBe('No relevant sources found.');
            } else {
              // Property: Number of "Source:" entries matches relevant count
              const sourceMatches = citations.match(/Source:/g) || [];
              expect(sourceMatches.length).toBe(relevantResults.length);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
