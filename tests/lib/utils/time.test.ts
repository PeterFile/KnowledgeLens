// Time Utilities Tests
// Tests for time formatting functions
// Requirements: 7.6

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatRelativeTime, formatBytes } from '../../../src/lib/utils/time';

// ============================================================================
// Unit Tests
// ============================================================================

describe('Time Utilities', () => {
  describe('formatRelativeTime', () => {
    it('returns null for null input', () => {
      expect(formatRelativeTime(null)).toBeNull();
    });

    it('returns "just now" for very recent timestamps', () => {
      const now = Date.now();
      expect(formatRelativeTime(now, now)).toBe('just now');
      expect(formatRelativeTime(now - 500, now)).toBe('just now');
    });

    it('formats seconds correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 1000, now)).toBe('1 second ago');
      expect(formatRelativeTime(now - 30000, now)).toBe('30 seconds ago');
      expect(formatRelativeTime(now - 59000, now)).toBe('59 seconds ago');
    });

    it('formats minutes correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 60000, now)).toBe('1 minute ago');
      expect(formatRelativeTime(now - 120000, now)).toBe('2 minutes ago');
      expect(formatRelativeTime(now - 3540000, now)).toBe('59 minutes ago');
    });

    it('formats hours correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 3600000, now)).toBe('1 hour ago');
      expect(formatRelativeTime(now - 7200000, now)).toBe('2 hours ago');
      expect(formatRelativeTime(now - 82800000, now)).toBe('23 hours ago');
    });

    it('formats days correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 86400000, now)).toBe('1 day ago');
      expect(formatRelativeTime(now - 172800000, now)).toBe('2 days ago');
      expect(formatRelativeTime(now - 518400000, now)).toBe('6 days ago');
    });

    it('formats weeks correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 604800000, now)).toBe('1 week ago');
      expect(formatRelativeTime(now - 1209600000, now)).toBe('2 weeks ago');
    });

    it('formats months correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 2592000000, now)).toBe('1 month ago');
      expect(formatRelativeTime(now - 5184000000, now)).toBe('2 months ago');
    });

    it('formats years correctly', () => {
      const now = Date.now();
      expect(formatRelativeTime(now - 31536000000, now)).toBe('1 year ago');
      expect(formatRelativeTime(now - 63072000000, now)).toBe('2 years ago');
    });
  });

  describe('formatBytes', () => {
    it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats bytes', () => {
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10.0 KB');
    });

    it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });

    it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1.0 GB');
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

describe('Property-Based Tests', () => {
  /**
   * **Feature: agent-memory-integration, Property 13: Relative Time Formatting**
   * **Validates: Requirements 7.6**
   *
   * *For any* timestamp value, the relative time formatter SHALL produce
   * human-readable output (e.g., "5 minutes ago", "2 hours ago", "3 days ago")
   * that accurately reflects the time difference from now.
   */
  describe('Property 13: Relative Time Formatting', () => {
    // Arbitrary for time differences in milliseconds
    const timeDiffArb = fc.integer({ min: 0, max: 365 * 24 * 60 * 60 * 1000 * 5 }); // Up to 5 years

    it('always produces human-readable output for valid timestamps', () => {
      fc.assert(
        fc.property(timeDiffArb, (diffMs) => {
          const now = Date.now();
          const timestamp = now - diffMs;
          const result = formatRelativeTime(timestamp, now);

          // Result should be a non-empty string
          expect(result).not.toBeNull();
          expect(typeof result).toBe('string');
          expect(result!.length).toBeGreaterThan(0);

          // Result should contain "ago" or be "just now"
          expect(result === 'just now' || result!.includes('ago')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('accurately reflects time difference categories', () => {
      fc.assert(
        fc.property(timeDiffArb, (diffMs) => {
          const now = Date.now();
          const timestamp = now - diffMs;
          const result = formatRelativeTime(timestamp, now);

          if (result === null) return;

          const seconds = Math.floor(diffMs / 1000);
          const minutes = Math.floor(seconds / 60);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);
          const weeks = Math.floor(days / 7);
          const months = Math.floor(days / 30);
          const years = Math.floor(days / 365);

          // Verify the result matches the expected time category
          if (diffMs < 1000) {
            expect(result).toBe('just now');
          } else if (years > 0) {
            expect(result).toContain('year');
          } else if (months > 0) {
            expect(result).toContain('month');
          } else if (weeks > 0) {
            expect(result).toContain('week');
          } else if (days > 0) {
            expect(result).toContain('day');
          } else if (hours > 0) {
            expect(result).toContain('hour');
          } else if (minutes > 0) {
            expect(result).toContain('minute');
          } else {
            expect(result).toContain('second');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('uses singular form for 1 unit and plural for multiple', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(
            1000, // 1 second
            60000, // 1 minute
            3600000, // 1 hour
            86400000, // 1 day
            604800000, // 1 week
            2592000000, // 1 month
            31536000000 // 1 year
          ),
          (singleUnitMs) => {
            const now = Date.now();

            // Test singular
            const singularResult = formatRelativeTime(now - singleUnitMs, now);
            expect(singularResult).toMatch(/^1 (second|minute|hour|day|week|month|year) ago$/);

            // Test plural (2 units)
            const pluralResult = formatRelativeTime(now - singleUnitMs * 2, now);
            expect(pluralResult).toMatch(/^2 (seconds|minutes|hours|days|weeks|months|years) ago$/);
          }
        ),
        { numRuns: 7 } // One for each time unit
      );
    });

    it('returns null for null input', () => {
      fc.assert(
        fc.property(fc.constant(null), (timestamp) => {
          const result = formatRelativeTime(timestamp);
          expect(result).toBeNull();
        }),
        { numRuns: 1 }
      );
    });

    it('handles edge case of exactly 0 difference', () => {
      const now = Date.now();
      const result = formatRelativeTime(now, now);
      expect(result).toBe('just now');
    });
  });

  describe('formatBytes property tests', () => {
    it('always produces human-readable output', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);

          // Result should be a non-empty string
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);

          // Result should end with a unit
          expect(result).toMatch(/(B|KB|MB|GB)$/);
        }),
        { numRuns: 100 }
      );
    });

    it('uses appropriate unit for size', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 10 * 1024 * 1024 * 1024 }), (bytes) => {
          const result = formatBytes(bytes);

          if (bytes === 0) {
            expect(result).toBe('0 B');
          } else if (bytes < 1024) {
            expect(result).toContain(' B');
          } else if (bytes < 1024 * 1024) {
            expect(result).toContain(' KB');
          } else if (bytes < 1024 * 1024 * 1024) {
            expect(result).toContain(' MB');
          } else {
            expect(result).toContain(' GB');
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
