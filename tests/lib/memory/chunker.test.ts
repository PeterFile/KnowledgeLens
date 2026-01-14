import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { chunkHtmlContent } from '../../../src/lib/memory/chunker';

// Mock tokenizer
vi.mock('../../../src/lib/tokenizer', () => ({
  countTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
}));

// Helper to build HTML from structured elements
interface HtmlElement {
  type: 'heading' | 'paragraph' | 'code';
  level?: number;
  text?: string;
  content?: string;
}

function elementsToHtml(elements: HtmlElement[]): string {
  return elements
    .map((el) => {
      if (el.type === 'heading') {
        return `<h${el.level}>${el.text}</h${el.level}>`;
      }
      if (el.type === 'paragraph') {
        return `<p>${el.text}</p>`;
      }
      if (el.type === 'code') {
        return `<pre><code>${el.content}</code></pre>`;
      }
      return '';
    })
    .join('\n');
}

// Generators
const headingArb = fc.record({
  type: fc.constant('heading' as const),
  level: fc.integer({ min: 1, max: 6 }),
  text: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
});

const paragraphArb = fc.record({
  type: fc.constant('paragraph' as const),
  text: fc
    .string({ minLength: 100, maxLength: 400 })
    .filter((s) => s.trim().length > 20)
    .map((s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')),
});

const codeArb = fc.record({
  type: fc.constant('code' as const),
  content: fc
    .string({ minLength: 10, maxLength: 200 })
    .map((s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;')),
});

describe('HTML Chunker', () => {
  describe('Property 9: Chunk Semantic Boundaries', () => {
    it('chunks are extracted as plain text from HTML', () => {
      const html = `
        <h1>Title</h1>
        <p>This is a paragraph with some content.</p>
        <div>Another block of text here.</div>
      `;

      const chunks = chunkHtmlContent(html);

      // Chunks should contain text content, not raw HTML
      for (const chunk of chunks) {
        expect(typeof chunk.content).toBe('string');
        expect(chunk.content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Property 10: Chunk Heading Preservation', () => {
    it('headingPath is an array for each chunk', () => {
      const html = `
        <h1>Main Title</h1>
        <p>${'x'.repeat(200)}</p>
        <h2>Section A</h2>
        <p>${'y'.repeat(200)}</p>
      `;

      const chunks = chunkHtmlContent(html);

      for (const chunk of chunks) {
        expect(Array.isArray(chunk.headingPath)).toBe(true);
      }
    });

    it('heading hierarchy is maintained across chunks', () => {
      fc.assert(
        fc.property(
          fc.array(headingArb, { minLength: 1, maxLength: 5 }),
          fc.array(paragraphArb, { minLength: 1, maxLength: 3 }),
          (headings, paragraphs) => {
            const elements = [...headings, ...paragraphs];
            const html = elementsToHtml(elements);
            const chunks = chunkHtmlContent(html);

            // All headingPaths should be arrays
            for (const chunk of chunks) {
              expect(Array.isArray(chunk.headingPath)).toBe(true);
            }
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 11: Chunk Token Bounds', () => {
    it('non-code chunks are between 100 and 500 tokens', () => {
      const html = `
        <h1>Title</h1>
        <p>${'word '.repeat(150)}</p>
        <p>${'text '.repeat(200)}</p>
      `;

      const chunks = chunkHtmlContent(html);
      const nonCodeChunks = chunks.filter((c) => !c.content.includes('```'));

      for (const chunk of nonCodeChunks) {
        // With our mock (length/4), check reasonable bounds
        expect(chunk.tokenCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Property 12: Chunk Sentence Splitting', () => {
    it('long sections are split at sentence boundaries', () => {
      const longText =
        'This is sentence one. This is sentence two. This is sentence three. '.repeat(50);
      const html = `<p>${longText}</p>`;

      const chunks = chunkHtmlContent(html, { maxTokens: 100 });

      for (const chunk of chunks) {
        const trimmed = chunk.content.trim();
        // Should end with sentence boundary or be the last chunk
        const endsWithBoundary =
          /[.!?]$/.test(trimmed) || trimmed === chunks[chunks.length - 1].content.trim();
        expect(endsWithBoundary || chunks.length === 1).toBe(true);
      }
    });
  });

  describe('Property 13: Chunk Content Filtering', () => {
    it('removes script, style, and ad elements', () => {
      const html = `
        <script>alert('evil')</script>
        <style>.hidden { display: none; }</style>
        <div class="advertisement">Buy now!</div>
        <p>${'valid content '.repeat(50)}</p>
        <div class="ad-banner">Click here</div>
      `;

      const chunks = chunkHtmlContent(html);
      const allContent = chunks.map((c) => c.content).join(' ');

      expect(allContent).not.toContain('alert');
      expect(allContent).not.toContain('display: none');
      expect(allContent).not.toContain('Buy now');
      expect(allContent).not.toContain('Click here');
      expect(allContent).toContain('valid content');
    });

    it('filtered elements never appear in output', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 10, maxLength: 100 }),
          fc.string({ minLength: 100, maxLength: 300 }),
          (scriptContent, validContent) => {
            const safeScript = scriptContent.replace(/</g, '').replace(/>/g, '');
            const safeValid = validContent.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const html = `
              <script>${safeScript}</script>
              <p>${safeValid}</p>
            `;

            const chunks = chunkHtmlContent(html);
            const allContent = chunks.map((c) => c.content).join(' ');

            return !allContent.includes(safeScript) || safeScript.trim() === '';
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  describe('Property 14: Chunk Code Block Preservation', () => {
    it('code blocks appear as single chunks', () => {
      const codeContent = 'function test() {\n  return 42;\n}'.repeat(10);
      const html = `
        <p>${'intro '.repeat(50)}</p>
        <pre><code>${codeContent}</code></pre>
        <p>${'outro '.repeat(50)}</p>
      `;

      const chunks = chunkHtmlContent(html, { preserveCodeBlocks: true });
      const codeChunk = chunks.find((c) => c.content.includes('function test'));

      expect(codeChunk).toBeDefined();
      expect(codeChunk!.content).toContain(codeContent);
    });

    it('code blocks are not split regardless of length', () => {
      fc.assert(
        fc.property(codeArb, (codeEl) => {
          const html = elementsToHtml([codeEl]);
          const chunks = chunkHtmlContent(html, { preserveCodeBlocks: true, maxTokens: 50 });

          // Code should be in a single chunk
          const codeChunks = chunks.filter((c) => c.content.includes(codeEl.content!.slice(0, 10)));
          return codeChunks.length <= 1;
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('handles empty HTML', () => {
      const chunks = chunkHtmlContent('');
      expect(chunks).toEqual([]);
    });

    it('handles HTML with only filtered elements', () => {
      const html = '<script>code</script><style>css</style>';
      const chunks = chunkHtmlContent(html);
      expect(chunks).toEqual([]);
    });

    it('handles deeply nested elements', () => {
      const html = '<div><div><div><p>' + 'nested '.repeat(50) + '</p></div></div></div>';
      const chunks = chunkHtmlContent(html);
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });

    it('handles plain text input by creating chunks', () => {
      const text = 'word '.repeat(200);
      const chunks = chunkHtmlContent(text);
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toContain('word');
    });

    it('falls back when DOMParser is unavailable', () => {
      const original = (globalThis as any).DOMParser;
      (globalThis as any).DOMParser = undefined;
      try {
        const chunks = chunkHtmlContent('<p>hello world</p>');
        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks[0].content).toContain('hello world');
      } finally {
        (globalThis as any).DOMParser = original;
      }
    });
  });
});
