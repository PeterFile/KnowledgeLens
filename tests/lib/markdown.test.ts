import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { markdownToHtml, extractTextFromHtml, extractTextFromMarkdown } from '../../src/lib/markdown';

/**
 * **Feature: knowledge-lens, Property 2: Markdown rendering preserves content**
 * **Validates: Requirements 1.4, 3.3**
 *
 * For any valid markdown string, rendering it to HTML and extracting text content
 * SHALL preserve all original text (ignoring formatting).
 */
describe('Property 2: Markdown rendering preserves content', () => {
  // Generate safe alphanumeric text that won't be interpreted as markdown syntax
  const plainTextArb = fc.string({ minLength: 1, maxLength: 100 }).map((s) =>
    // Remove characters that could be interpreted as markdown syntax
    s.replace(/[*`#\-\d\.\n\r<>]/g, 'a').trim() || 'text'
  );

  it('plain text is preserved after markdown to HTML conversion', () => {
    fc.assert(
      fc.property(plainTextArb, (text) => {
        const html = markdownToHtml(text);
        const extracted = extractTextFromHtml(html);

        // Normalize whitespace for comparison
        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        const normalizedOutput = extracted.replace(/\s+/g, ' ').trim();

        return normalizedOutput.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('bold text content is preserved', () => {
    fc.assert(
      fc.property(plainTextArb, (text) => {
        const markdown = `**${text}**`;
        const extracted = extractTextFromMarkdown(markdown);

        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        return extracted.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('italic text content is preserved', () => {
    fc.assert(
      fc.property(plainTextArb, (text) => {
        const markdown = `*${text}*`;
        const extracted = extractTextFromMarkdown(markdown);

        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        return extracted.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('header text content is preserved', () => {
    fc.assert(
      fc.property(
        plainTextArb,
        fc.integer({ min: 1, max: 3 }),
        (text, level) => {
          const prefix = '#'.repeat(level);
          const markdown = `${prefix} ${text}`;
          const extracted = extractTextFromMarkdown(markdown);

          const normalizedInput = text.replace(/\s+/g, ' ').trim();
          return extracted.includes(normalizedInput);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('inline code content is preserved', () => {
    fc.assert(
      fc.property(plainTextArb, (text) => {
        const markdown = `\`${text}\``;
        const extracted = extractTextFromMarkdown(markdown);

        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        return extracted.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('code block content is preserved', () => {
    fc.assert(
      fc.property(plainTextArb, (text) => {
        const markdown = `\`\`\`\n${text}\n\`\`\``;
        const extracted = extractTextFromMarkdown(markdown);

        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        return extracted.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('list item content is preserved', () => {
    fc.assert(
      fc.property(plainTextArb, (text) => {
        const markdown = `- ${text}`;
        const extracted = extractTextFromMarkdown(markdown);

        const normalizedInput = text.replace(/\s+/g, ' ').trim();
        return extracted.includes(normalizedInput);
      }),
      { numRuns: 100 }
    );
  });

  it('multiple formatted elements preserve all text', () => {
    fc.assert(
      fc.property(plainTextArb, plainTextArb, plainTextArb, (text1, text2, text3) => {
        const markdown = `# ${text1}\n\n**${text2}**\n\n\`${text3}\``;
        const extracted = extractTextFromMarkdown(markdown);

        const norm1 = text1.replace(/\s+/g, ' ').trim();
        const norm2 = text2.replace(/\s+/g, ' ').trim();
        const norm3 = text3.replace(/\s+/g, ' ').trim();

        return extracted.includes(norm1) && extracted.includes(norm2) && extracted.includes(norm3);
      }),
      { numRuns: 100 }
    );
  });

  it('handles empty input gracefully', () => {
    expect(markdownToHtml('')).toBe('');
    expect(extractTextFromHtml('')).toBe('');
    expect(extractTextFromMarkdown('')).toBe('');
  });

  it('handles whitespace-only input', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(' ', '\t'), { minLength: 1, maxLength: 50 }).map((arr) => arr.join('')),
        (whitespace) => {
          const html = markdownToHtml(whitespace);
          const extracted = extractTextFromHtml(html);
          // Whitespace-only input should result in empty or whitespace output
          return extracted.trim() === '' || extracted === whitespace.trim();
        }
      ),
      { numRuns: 100 }
    );
  });
});
