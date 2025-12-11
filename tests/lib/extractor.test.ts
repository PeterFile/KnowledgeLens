import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { cleanHtml, extractContextWindow, CONTEXT_WINDOW_SIZE } from '../../src/lib/extractor';

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


/**
 * **Feature: knowledge-lens, Property 4: Context window extraction**
 * **Validates: Requirements 3.1**
 *
 * For any text selection within a document, the context extraction function
 * SHALL return exactly up to 500 characters before and 500 characters after
 * the selection (or less if at document boundaries).
 */
describe('Property 4: Context window extraction', () => {
  // Generate non-empty text strings
  const nonEmptyTextArb = fc.string({ minLength: 1, maxLength: 200 }).map((s) =>
    s.replace(/[^\w\s]/g, 'a') || 'text'
  );

  // Generate a document with selection position
  const documentWithSelectionArb = fc.tuple(
    fc.string({ minLength: 10, maxLength: 2000 }).map((s) => s.replace(/[^\w\s]/g, 'a') || 'document text'),
    fc.nat({ max: 100 }).map((n) => Math.max(1, n)) // selection length
  ).chain(([fullText, selLen]) => {
    const maxStart = Math.max(0, fullText.length - selLen);
    return fc.tuple(
      fc.constant(fullText),
      fc.nat({ max: maxStart }),
      fc.constant(Math.min(selLen, fullText.length))
    );
  });

  it('context before is at most CONTEXT_WINDOW_SIZE characters', () => {
    fc.assert(
      fc.property(documentWithSelectionArb, ([fullText, selectionStart, selLen]) => {
        const selectedText = fullText.slice(selectionStart, selectionStart + selLen);
        const result = extractContextWindow(selectedText, fullText, selectionStart);

        return result.contextBefore.length <= CONTEXT_WINDOW_SIZE;
      }),
      { numRuns: 100 }
    );
  });

  it('context after is at most CONTEXT_WINDOW_SIZE characters', () => {
    fc.assert(
      fc.property(documentWithSelectionArb, ([fullText, selectionStart, selLen]) => {
        const selectedText = fullText.slice(selectionStart, selectionStart + selLen);
        const result = extractContextWindow(selectedText, fullText, selectionStart);

        return result.contextAfter.length <= CONTEXT_WINDOW_SIZE;
      }),
      { numRuns: 100 }
    );
  });

  it('context before equals available characters when less than CONTEXT_WINDOW_SIZE', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 400 }).map((s) => s.replace(/[^\w\s]/g, 'a') || 'text'),
        fc.nat({ max: 50 }),
        (fullText, startOffset) => {
          // Selection near the start of document
          const selectionStart = Math.min(startOffset, fullText.length - 1);
          const selectedText = fullText.slice(selectionStart, selectionStart + 5) || 'x';
          const result = extractContextWindow(selectedText, fullText, selectionStart);

          // Context before should be exactly the available characters (up to selectionStart)
          const expectedLength = Math.min(selectionStart, CONTEXT_WINDOW_SIZE);
          return result.contextBefore.length === expectedLength;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('context after equals available characters when less than CONTEXT_WINDOW_SIZE', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 10, maxLength: 400 }).map((s) => s.replace(/[^\w\s]/g, 'a') || 'text'),
        fc.nat({ max: 50 }),
        (fullText, endOffset) => {
          // Selection near the end of document
          const selectionEnd = Math.max(fullText.length - endOffset, 1);
          const selectionStart = Math.max(0, selectionEnd - 5);
          const selectedText = fullText.slice(selectionStart, selectionEnd) || 'x';
          const result = extractContextWindow(selectedText, fullText, selectionStart);

          // Context after should be exactly the available characters
          const actualSelectionEnd = selectionStart + selectedText.length;
          const availableAfter = fullText.length - actualSelectionEnd;
          const expectedLength = Math.min(availableAfter, CONTEXT_WINDOW_SIZE);
          return result.contextAfter.length === expectedLength;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fullContext contains selectedText, contextBefore, and contextAfter in order', () => {
    fc.assert(
      fc.property(documentWithSelectionArb, ([fullText, selectionStart, selLen]) => {
        const selectedText = fullText.slice(selectionStart, selectionStart + selLen);
        const result = extractContextWindow(selectedText, fullText, selectionStart);

        // Full context should be the concatenation
        const expectedFullContext = result.contextBefore + result.selectedText + result.contextAfter;
        return result.fullContext === expectedFullContext;
      }),
      { numRuns: 100 }
    );
  });

  it('extracted context matches the original document text', () => {
    fc.assert(
      fc.property(documentWithSelectionArb, ([fullText, selectionStart, selLen]) => {
        const selectedText = fullText.slice(selectionStart, selectionStart + selLen);
        const result = extractContextWindow(selectedText, fullText, selectionStart);

        // The full context should be a substring of the original document
        return fullText.includes(result.fullContext);
      }),
      { numRuns: 100 }
    );
  });

  it('handles empty selection gracefully', () => {
    const result = extractContextWindow('', 'some document text', 5);
    expect(result.selectedText).toBe('');
    expect(result.contextBefore).toBe('');
    expect(result.contextAfter).toBe('');
    expect(result.fullContext).toBe('');
  });

  it('handles empty document gracefully', () => {
    const result = extractContextWindow('selection', '', 0);
    expect(result.selectedText).toBe('selection');
    expect(result.contextBefore).toBe('');
    expect(result.contextAfter).toBe('');
    expect(result.fullContext).toBe('selection');
  });
});
