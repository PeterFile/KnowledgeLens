import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { cleanHtml } from '../../src/lib/extractor';

/**
 * **Feature: knowledge-lens, Property 1: Content extraction removes unwanted elements**
 * **Validates: Requirements 1.2, 10.1**
 *
 * For any HTML document containing script, style, or navigation elements,
 * the cleanHtml function SHALL return text that contains none of these elements
 * while preserving visible text content.
 */
describe('Property 1: Content extraction removes unwanted elements', () => {
  // Generate alphanumeric text for visible content
  const alphanumericArb = fc.string({ minLength: 1, maxLength: 100 }).map((s) =>
    s.replace(/[^a-zA-Z0-9 ]/g, 'x').trim() || 'text'
  );

  it('removes script elements and their content', () => {
    fc.assert(
      fc.property(alphanumericArb, (visibleText) => {
        // Use a unique marker that won't appear in visible text
        const scriptContent = 'SCRIPT_MARKER_12345';
        const html = `<div>${visibleText}<script>${scriptContent}</script></div>`;
        const cleaned = cleanHtml(html);

        // Script content should not appear in output
        const hasScriptContent = cleaned.includes(scriptContent);
        // Visible text should be preserved
        const hasVisibleText = visibleText.trim().length === 0 || cleaned.includes(visibleText.trim());

        return !hasScriptContent && hasVisibleText;
      }),
      { numRuns: 100 }
    );
  });

  it('removes style elements and their content', () => {
    fc.assert(
      fc.property(alphanumericArb, (visibleText) => {
        const styleContent = '.class { color: red; }';
        const html = `<div>${visibleText}<style>${styleContent}</style></div>`;
        const cleaned = cleanHtml(html);

        // Style content should not appear
        const hasStyleContent = cleaned.includes('color: red');
        // Visible text should be preserved (normalized - multiple spaces become single space)
        const normalizedVisible = visibleText.replace(/\s+/g, ' ').trim();
        const hasVisibleText = normalizedVisible.length === 0 || cleaned.includes(normalizedVisible);

        return !hasStyleContent && hasVisibleText;
      }),
      { numRuns: 100 }
    );
  });

  it('removes navigation elements', () => {
    fc.assert(
      fc.property(alphanumericArb, (mainText) => {
        // Use a unique marker that won't appear in main text
        const navText = 'NAV_MARKER_67890';
        const html = `<div><main>${mainText}</main><nav>${navText}</nav></div>`;
        const cleaned = cleanHtml(html);

        // Nav content should be removed
        const hasNavText = cleaned.includes(navText);
        // Main content should be preserved (normalize whitespace for comparison)
        const normalizedMain = mainText.replace(/\s+/g, ' ').trim();
        const hasMainText = normalizedMain.length === 0 || cleaned.includes(normalizedMain);

        return !hasNavText && hasMainText;
      }),
      { numRuns: 100 }
    );
  });

  it('removes multiple unwanted element types simultaneously', () => {
    fc.assert(
      fc.property(alphanumericArb, (visibleText) => {
        const html = `
          <div>
            ${visibleText}
            <script>alert('xss')</script>
            <style>.hidden { display: none; }</style>
            <noscript>Enable JS</noscript>
            <iframe src="ad.html"></iframe>
          </div>
        `;
        const cleaned = cleanHtml(html);

        // None of the unwanted content should appear
        const hasScript = cleaned.includes("alert('xss')");
        const hasStyle = cleaned.includes('display: none');
        const hasNoscript = cleaned.includes('Enable JS');
        const hasIframe = cleaned.includes('ad.html');

        // Visible text should be preserved
        const hasVisibleText = visibleText.trim().length === 0 || cleaned.includes(visibleText.trim());

        return !hasScript && !hasStyle && !hasNoscript && !hasIframe && hasVisibleText;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: knowledge-lens, Property 13: HTML cleaning preserves visible text**
 * **Validates: Requirements 10.2**
 *
 * For any HTML document with visible text content, the cleaned output
 * SHALL contain all text that would be visible to a user viewing the page.
 */
describe('Property 13: HTML cleaning preserves visible text', () => {
  // Generate safe alphanumeric text
  const safeTextArb = fc.string({ minLength: 1, maxLength: 100 }).map((s) =>
    s.replace(/[^a-zA-Z0-9 ]/g, 'a').trim() || 'text'
  );

  it('preserves text in paragraph elements', () => {
    fc.assert(
      fc.property(safeTextArb, (text) => {
        const html = `<p>${text}</p>`;
        const cleaned = cleanHtml(html);

        // Normalized text should be preserved
        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        return normalizedInput.length === 0 || cleaned.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('preserves text across multiple elements', () => {
    fc.assert(
      fc.property(safeTextArb, safeTextArb, safeTextArb, (text1, text2, text3) => {
        const html = `<div><p>${text1}</p><span>${text2}</span><div>${text3}</div></div>`;
        const cleaned = cleanHtml(html);

        // All text pieces should be in the output (normalized)
        const norm1 = text1.replace(/\s+/g, ' ').trim();
        const norm2 = text2.replace(/\s+/g, ' ').trim();
        const norm3 = text3.replace(/\s+/g, ' ').trim();

        const has1 = norm1.length === 0 || cleaned.includes(norm1);
        const has2 = norm2.length === 0 || cleaned.includes(norm2);
        const has3 = norm3.length === 0 || cleaned.includes(norm3);

        return has1 && has2 && has3;
      }),
      { numRuns: 100 }
    );
  });

  it('preserves text in nested structures', () => {
    fc.assert(
      fc.property(safeTextArb, (text) => {
        const html = `<article><section><div><p>${text}</p></div></section></article>`;
        const cleaned = cleanHtml(html);

        const normalized = text.replace(/\s+/g, ' ').trim();
        return normalized.length === 0 || cleaned.includes(normalized);
      }),
      { numRuns: 100 }
    );
  });

  it('preserves text with inline formatting', () => {
    fc.assert(
      fc.property(safeTextArb, safeTextArb, (text1, text2) => {
        const html = `<p><strong>${text1}</strong> and <em>${text2}</em></p>`;
        const cleaned = cleanHtml(html);

        const norm1 = text1.replace(/\s+/g, ' ').trim();
        const norm2 = text2.replace(/\s+/g, ' ').trim();

        const has1 = norm1.length === 0 || cleaned.includes(norm1);
        const has2 = norm2.length === 0 || cleaned.includes(norm2);

        return has1 && has2;
      }),
      { numRuns: 100 }
    );
  });

  it('handles empty input gracefully', () => {
    expect(cleanHtml('')).toBe('');
    expect(cleanHtml('<div></div>')).toBe('');
  });
});
