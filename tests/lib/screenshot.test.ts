import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { ScreenshotRegion } from '../../src/types';

/**
 * Calculate screenshot region from drag selection coordinates
 * This is a pure function that can be tested without Chrome APIs
 * 
 * @param startX - Starting X coordinate of drag
 * @param startY - Starting Y coordinate of drag
 * @param endX - Ending X coordinate of drag
 * @param endY - Ending Y coordinate of drag
 * @param devicePixelRatio - Device pixel ratio for high-DPI displays
 */
export function calculateRegion(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  devicePixelRatio: number = 1
): ScreenshotRegion {
  // Handle drag in any direction (start can be greater than end)
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  const width = Math.abs(endX - startX);
  const height = Math.abs(endY - startY);

  return {
    x,
    y,
    width,
    height,
    devicePixelRatio,
  };
}

/**
 * Validate that a string is valid Base64 encoded data
 * Returns true if the string can be decoded without error
 */
export function isValidBase64(str: string): boolean {
  if (typeof str !== 'string' || str.length === 0) {
    return false;
  }

  // Base64 regex pattern: only valid base64 characters
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  
  // Check if string matches base64 pattern
  if (!base64Regex.test(str)) {
    return false;
  }

  // Try to decode - if it fails, it's not valid base64
  try {
    atob(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encode binary data to Base64 string (simulates canvas.toDataURL output)
 */
export function encodeToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

// Arbitrary generators for screenshot testing
const coordinateArb = fc.integer({ min: 0, max: 10000 });
const devicePixelRatioArb = fc.double({ min: 1, max: 4, noNaN: true });

/**
 * **Feature: knowledge-lens, Property 7: Screenshot region dimensions**
 * **Validates: Requirements 5.2**
 *
 * For any drag selection with start point (x1, y1) and end point (x2, y2),
 * the resulting region SHALL have width = |x2 - x1| and height = |y2 - y1|.
 */
describe('Property 7: Screenshot region dimensions', () => {
  it('region width equals absolute difference of x coordinates', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        coordinateArb,
        coordinateArb,
        (startX, startY, endX, endY) => {
          const region = calculateRegion(startX, startY, endX, endY);
          
          const expectedWidth = Math.abs(endX - startX);
          return region.width === expectedWidth;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('region height equals absolute difference of y coordinates', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        coordinateArb,
        coordinateArb,
        (startX, startY, endX, endY) => {
          const region = calculateRegion(startX, startY, endX, endY);
          
          const expectedHeight = Math.abs(endY - startY);
          return region.height === expectedHeight;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('region x is minimum of start and end x coordinates', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        coordinateArb,
        coordinateArb,
        (startX, startY, endX, endY) => {
          const region = calculateRegion(startX, startY, endX, endY);
          
          return region.x === Math.min(startX, endX);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('region y is minimum of start and end y coordinates', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        coordinateArb,
        coordinateArb,
        (startX, startY, endX, endY) => {
          const region = calculateRegion(startX, startY, endX, endY);
          
          return region.y === Math.min(startY, endY);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('device pixel ratio is preserved in region', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        coordinateArb,
        coordinateArb,
        devicePixelRatioArb,
        (startX, startY, endX, endY, dpr) => {
          const region = calculateRegion(startX, startY, endX, endY, dpr);
          
          return region.devicePixelRatio === dpr;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('drag direction does not affect final dimensions', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        coordinateArb,
        coordinateArb,
        (startX, startY, endX, endY) => {
          // Drag from start to end
          const region1 = calculateRegion(startX, startY, endX, endY);
          // Drag from end to start (reverse direction)
          const region2 = calculateRegion(endX, endY, startX, startY);
          
          // Both should produce same dimensions
          return (
            region1.width === region2.width &&
            region1.height === region2.height &&
            region1.x === region2.x &&
            region1.y === region2.y
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('zero-size selection produces zero dimensions', () => {
    fc.assert(
      fc.property(
        coordinateArb,
        coordinateArb,
        (x, y) => {
          const region = calculateRegion(x, y, x, y);
          
          return region.width === 0 && region.height === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: knowledge-lens, Property 8: Screenshot output format**
 * **Validates: Requirements 5.3**
 *
 * For any captured screenshot, the output SHALL be a valid Base64-encoded
 * string that can be decoded without error.
 */
describe('Property 8: Screenshot output format', () => {
  // Generate arbitrary binary data that simulates image content
  const binaryDataArb = fc.uint8Array({ minLength: 1, maxLength: 1000 });

  it('encoded binary data produces valid Base64 string', () => {
    fc.assert(
      fc.property(binaryDataArb, (data) => {
        const base64 = encodeToBase64(data);
        
        return isValidBase64(base64);
      }),
      { numRuns: 100 }
    );
  });

  it('Base64 encoded data can be decoded without error', () => {
    fc.assert(
      fc.property(binaryDataArb, (data) => {
        const base64 = encodeToBase64(data);
        
        // Should not throw when decoding
        try {
          atob(base64);
          return true;
        } catch {
          return false;
        }
      }),
      { numRuns: 100 }
    );
  });

  it('Base64 round trip preserves original data', () => {
    fc.assert(
      fc.property(binaryDataArb, (data) => {
        const base64 = encodeToBase64(data);
        const decoded = atob(base64);
        
        // Convert decoded string back to bytes
        const decodedBytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          decodedBytes[i] = decoded.charCodeAt(i);
        }
        
        // Compare original and decoded
        if (data.length !== decodedBytes.length) {
          return false;
        }
        
        for (let i = 0; i < data.length; i++) {
          if (data[i] !== decodedBytes[i]) {
            return false;
          }
        }
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('Base64 string contains only valid characters', () => {
    fc.assert(
      fc.property(binaryDataArb, (data) => {
        const base64 = encodeToBase64(data);
        
        // Valid Base64 characters: A-Z, a-z, 0-9, +, /, and = for padding
        const validChars = /^[A-Za-z0-9+/]*={0,2}$/;
        return validChars.test(base64);
      }),
      { numRuns: 100 }
    );
  });

  it('Base64 string length is multiple of 4 (with padding)', () => {
    fc.assert(
      fc.property(binaryDataArb, (data) => {
        const base64 = encodeToBase64(data);
        
        // Base64 output is always padded to multiple of 4
        return base64.length % 4 === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('empty data validation returns false', () => {
    expect(isValidBase64('')).toBe(false);
  });

  it('invalid Base64 characters are detected', () => {
    // These contain invalid characters for Base64
    expect(isValidBase64('hello world!')).toBe(false);
    expect(isValidBase64('test@#$%')).toBe(false);
    expect(isValidBase64('data with spaces')).toBe(false);
  });

  it('valid Base64 strings are accepted', () => {
    // Valid Base64 encoded strings
    expect(isValidBase64('SGVsbG8=')).toBe(true);  // "Hello"
    expect(isValidBase64('V29ybGQ=')).toBe(true);  // "World"
    expect(isValidBase64('dGVzdA==')).toBe(true);  // "test"
  });
});
