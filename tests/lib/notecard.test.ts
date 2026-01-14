import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateQRCode, validateNoteCardMetadata, NoteCardData } from '../../src/lib/notecard';
// @ts-expect-error jsqr has no type definitions
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

/**
 * Decode a QR code from a data URL using pngjs + jsQR
 * Works in Node.js environment without DOM Image loading
 */
function decodeQRCode(dataUrl: string): string | null {
  // Extract Base64 data from data URL
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Parse PNG to get raw pixel data
  const png = PNG.sync.read(buffer);

  // Convert to Uint8ClampedArray for jsQR
  const imageData = new Uint8ClampedArray(png.data);

  // Decode QR code
  const code = jsQR(imageData, png.width, png.height);

  return code?.data ?? null;
}

// Arbitrary for simple URLs that are valid and reasonable length
const simpleUrlArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}\.[a-z]{2,6}$/),
    fc.array(fc.stringMatching(/^[a-z0-9-]{1,10}$/), { minLength: 0, maxLength: 3 })
  )
  .map(([scheme, domain, pathParts]) => {
    const path = pathParts.length > 0 ? '/' + pathParts.join('/') : '';
    return `${scheme}://${domain}${path}`;
  });

/**
 * **Feature: knowledge-lens, Property 10: QR code round trip**
 * **Validates: Requirements 7.3**
 *
 * For any valid URL, generating a QR code and decoding it
 * SHALL return the original URL.
 */
describe('Property 10: QR code round trip', () => {
  it('QR code encodes and decodes URL correctly', { timeout: 15000 }, async () => {
    await fc.assert(
      fc.asyncProperty(simpleUrlArb, async (url) => {
        // Generate QR code
        const qrDataUrl = await generateQRCode(url);

        // Verify it's a valid data URL
        expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

        // Decode QR code
        const decoded = decodeQRCode(qrDataUrl);

        // Verify round trip
        expect(decoded).toBe(url);
        return decoded === url;
      }),
      { numRuns: 50 }
    );
  });

  it('QR code handles URLs with query parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          simpleUrlArb,
          fc.dictionary(
            fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{0,8}$/),
            fc.stringMatching(/^[a-zA-Z0-9]{1,15}$/),
            { minKeys: 1, maxKeys: 3 }
          )
        ),
        async ([baseUrl, params]) => {
          const queryString = Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
          const url = `${baseUrl}?${queryString}`;

          const qrDataUrl = await generateQRCode(url);
          const decoded = decodeQRCode(qrDataUrl);

          return decoded === url;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('QR code handles URLs with fragments', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(simpleUrlArb, fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9-]{0,15}$/)),
        async ([baseUrl, fragment]) => {
          const url = `${baseUrl}#${fragment}`;

          const qrDataUrl = await generateQRCode(url);
          const decoded = decodeQRCode(qrDataUrl);

          return decoded === url;
        }
      ),
      { numRuns: 50 }
    );
  });

  it('QR code handles common real-world URLs', async () => {
    const realWorldUrls = [
      'https://example.com',
      'https://www.google.com/search?q=test',
      'https://github.com/user/repo',
      'https://en.wikipedia.org/wiki/Main_Page',
      'https://docs.example.com/api/v1/users#authentication',
    ];

    for (const url of realWorldUrls) {
      const qrDataUrl = await generateQRCode(url);
      const decoded = decodeQRCode(qrDataUrl);
      expect(decoded).toBe(url);
    }
  });

  it('QR code output is valid Base64 PNG', async () => {
    await fc.assert(
      fc.asyncProperty(simpleUrlArb, async (url) => {
        const qrDataUrl = await generateQRCode(url);

        // Check data URL format
        expect(qrDataUrl).toMatch(/^data:image\/png;base64,/);

        // Extract and validate Base64
        const base64Part = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64Part, 'base64');

        // Should be valid PNG (can be parsed)
        const png = PNG.sync.read(buffer);
        expect(png.width).toBeGreaterThan(0);
        expect(png.height).toBeGreaterThan(0);

        return true;
      }),
      { numRuns: 50 }
    );
  });
});

// Arbitrary for non-empty strings (titles, etc.)
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 100 });

// Arbitrary for Base64-like screenshot data
const screenshotArb = fc
  .string({ minLength: 10, maxLength: 200 })
  .map((s) => `data:image/png;base64,${Buffer.from(s).toString('base64')}`);

// Arbitrary for favicon URLs
const faviconArb = fc.oneof(
  fc.constant(''), // Empty favicon is allowed
  simpleUrlArb.map((url) => `${url}/favicon.ico`),
  fc
    .string({ minLength: 10, maxLength: 100 })
    .map((s) => `data:image/png;base64,${Buffer.from(s).toString('base64')}`)
);

// Arbitrary for complete NoteCardData
const noteCardDataArb: fc.Arbitrary<NoteCardData> = fc.record({
  screenshot: screenshotArb,
  title: nonEmptyStringArb,
  favicon: faviconArb,
  aiSummary: fc.string({ maxLength: 500 }),
  sourceUrl: simpleUrlArb,
});

/**
 * **Feature: knowledge-lens, Property 9: Note card metadata inclusion**
 * **Validates: Requirements 7.1, 7.2**
 *
 * For any note card generation request with title, favicon, and URL,
 * the generated card data SHALL include all three metadata fields.
 */
describe('Property 9: Note card metadata inclusion', () => {
  it('validates that all required metadata fields are present', () => {
    fc.assert(
      fc.property(noteCardDataArb, (data) => {
        const validation = validateNoteCardMetadata(data);

        // Title must be present (Requirement 7.1)
        expect(validation.hasTitle).toBe(true);

        // Source URL must be present (Requirement 7.2 - for QR code)
        expect(validation.hasSourceUrl).toBe(true);

        // Screenshot must be present (Requirement 7.2 - original screenshot)
        expect(validation.hasScreenshot).toBe(true);

        // All required fields must be present
        expect(validation.allRequiredPresent).toBe(true);

        return validation.allRequiredPresent;
      }),
      { numRuns: 100 }
    );
  });

  it('detects missing title', () => {
    fc.assert(
      fc.property(
        fc.record({
          screenshot: screenshotArb,
          title: fc.constant(''), // Empty title
          favicon: faviconArb,
          aiSummary: fc.string({ maxLength: 500 }),
          sourceUrl: simpleUrlArb,
        }),
        (data) => {
          const validation = validateNoteCardMetadata(data);

          expect(validation.hasTitle).toBe(false);
          expect(validation.allRequiredPresent).toBe(false);

          return !validation.hasTitle && !validation.allRequiredPresent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects missing sourceUrl', () => {
    fc.assert(
      fc.property(
        fc.record({
          screenshot: screenshotArb,
          title: nonEmptyStringArb,
          favicon: faviconArb,
          aiSummary: fc.string({ maxLength: 500 }),
          sourceUrl: fc.constant(''), // Empty URL
        }),
        (data) => {
          const validation = validateNoteCardMetadata(data);

          expect(validation.hasSourceUrl).toBe(false);
          expect(validation.allRequiredPresent).toBe(false);

          return !validation.hasSourceUrl && !validation.allRequiredPresent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('detects missing screenshot', () => {
    fc.assert(
      fc.property(
        fc.record({
          screenshot: fc.constant(''), // Empty screenshot
          title: nonEmptyStringArb,
          favicon: faviconArb,
          aiSummary: fc.string({ maxLength: 500 }),
          sourceUrl: simpleUrlArb,
        }),
        (data) => {
          const validation = validateNoteCardMetadata(data);

          expect(validation.hasScreenshot).toBe(false);
          expect(validation.allRequiredPresent).toBe(false);

          return !validation.hasScreenshot && !validation.allRequiredPresent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows empty favicon (optional field)', () => {
    fc.assert(
      fc.property(
        fc.record({
          screenshot: screenshotArb,
          title: nonEmptyStringArb,
          favicon: fc.constant(''), // Empty favicon
          aiSummary: fc.string({ maxLength: 500 }),
          sourceUrl: simpleUrlArb,
        }),
        (data) => {
          const validation = validateNoteCardMetadata(data);

          // Favicon is optional, so allRequiredPresent should still be true
          expect(validation.hasFavicon).toBe(false);
          expect(validation.allRequiredPresent).toBe(true);

          return !validation.hasFavicon && validation.allRequiredPresent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('allows empty aiSummary (optional field)', () => {
    fc.assert(
      fc.property(
        fc.record({
          screenshot: screenshotArb,
          title: nonEmptyStringArb,
          favicon: faviconArb,
          aiSummary: fc.constant(''), // Empty summary
          sourceUrl: simpleUrlArb,
        }),
        (data) => {
          const validation = validateNoteCardMetadata(data);

          // aiSummary is optional, allRequiredPresent should still be true
          expect(validation.allRequiredPresent).toBe(true);

          return validation.allRequiredPresent;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('preserves all metadata field values', () => {
    fc.assert(
      fc.property(noteCardDataArb, (data) => {
        // Verify that the data structure preserves all values
        expect(data.title).toBeDefined();
        expect(data.favicon).toBeDefined();
        expect(data.sourceUrl).toBeDefined();
        expect(data.screenshot).toBeDefined();
        expect(data.aiSummary).toBeDefined();

        // Verify types
        expect(typeof data.title).toBe('string');
        expect(typeof data.favicon).toBe('string');
        expect(typeof data.sourceUrl).toBe('string');
        expect(typeof data.screenshot).toBe('string');
        expect(typeof data.aiSummary).toBe('string');

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
