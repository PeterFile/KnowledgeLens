// HTML content chunker for semantic segmentation
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6

import { countTokens } from '../tokenizer';

export interface Chunk {
  content: string;
  headingPath: string[];
  tokenCount: number;
  startOffset: number;
  endOffset: number;
}

interface ChunkOptions {
  minTokens?: number;
  maxTokens?: number;
  preserveCodeBlocks?: boolean;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  minTokens: 100,
  maxTokens: 500,
  preserveCodeBlocks: true,
};

// Elements to remove entirely
const REMOVE_SELECTORS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'nav',
  'footer',
  'header',
  'aside',
  '[role="banner"]',
  '[role="navigation"]',
  '[role="complementary"]',
  '[class*="ad-"]',
  '[class*="advertisement"]',
  '[class*="sidebar"]',
  '[id*="ad-"]',
  '[id*="advertisement"]',
];

interface TextBlock {
  text: string;
  headingPath: string[];
  isCode: boolean;
  offset: number;
}

function extractTextBlocks(html: string): TextBlock[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove unwanted elements
  REMOVE_SELECTORS.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((el) => el.remove());
  });

  const blocks: TextBlock[] = [];
  const headingStack: string[] = [];
  let currentOffset = 0;

  function getHeadingLevel(tagName: string): number {
    const match = tagName.match(/^H(\d)$/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  function processNode(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toUpperCase();

      // Handle headings
      const level = getHeadingLevel(tagName);
      if (level > 0) {
        const text = el.textContent?.trim() || '';
        if (text) {
          // Pop headings of same or lower level
          while (headingStack.length >= level) {
            headingStack.pop();
          }
          headingStack.push(text);
        }
        return;
      }

      // Handle code blocks
      if (tagName === 'PRE' || (tagName === 'CODE' && el.parentElement?.tagName !== 'PRE')) {
        const text = el.textContent?.trim() || '';
        if (text) {
          blocks.push({
            text,
            headingPath: [...headingStack],
            isCode: true,
            offset: currentOffset,
          });
          currentOffset += text.length;
        }
        return;
      }

      // Handle block elements
      if (['P', 'DIV', 'ARTICLE', 'SECTION', 'LI', 'TD', 'TH', 'BLOCKQUOTE'].includes(tagName)) {
        const text = el.textContent?.trim() || '';
        if (text && text.length > 20) {
          blocks.push({
            text,
            headingPath: [...headingStack],
            isCode: false,
            offset: currentOffset,
          });
          currentOffset += text.length;
          return;
        }
      }

      // Recurse into children
      el.childNodes.forEach(processNode);
    }
  }

  processNode(doc.body);
  return blocks;
}

function splitAtSentenceBoundary(text: string, maxTokens: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const result: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const combined = current + sentence;
    if (countTokens(combined) > maxTokens && current) {
      result.push(current.trim());
      current = sentence;
    } else {
      current = combined;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

export function chunkHtmlContent(html: string, options?: ChunkOptions): Chunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const blocks = extractTextBlocks(html);
  const chunks: Chunk[] = [];

  let pendingText = '';
  let pendingHeadingPath: string[] = [];
  let pendingOffset = 0;

  function flushPending(): void {
    if (!pendingText.trim()) return;

    const tokenCount = countTokens(pendingText);
    if (tokenCount >= opts.minTokens) {
      chunks.push({
        content: pendingText.trim(),
        headingPath: pendingHeadingPath,
        tokenCount,
        startOffset: pendingOffset,
        endOffset: pendingOffset + pendingText.length,
      });
    }
    pendingText = '';
  }

  for (const block of blocks) {
    // Code blocks are always separate chunks
    if (block.isCode && opts.preserveCodeBlocks) {
      flushPending();
      chunks.push({
        content: block.text,
        headingPath: block.headingPath,
        tokenCount: countTokens(block.text),
        startOffset: block.offset,
        endOffset: block.offset + block.text.length,
      });
      continue;
    }

    const blockTokens = countTokens(block.text);

    // If block exceeds max, split at sentence boundaries
    if (blockTokens > opts.maxTokens) {
      flushPending();
      const parts = splitAtSentenceBoundary(block.text, opts.maxTokens);
      let offset = block.offset;
      for (const part of parts) {
        const tc = countTokens(part);
        chunks.push({
          content: part,
          headingPath: block.headingPath,
          tokenCount: tc,
          startOffset: offset,
          endOffset: offset + part.length,
        });
        offset += part.length;
      }
      continue;
    }

    // Check if adding this block would exceed max
    const combinedTokens = countTokens(pendingText + ' ' + block.text);
    if (combinedTokens > opts.maxTokens) {
      flushPending();
      pendingText = block.text;
      pendingHeadingPath = block.headingPath;
      pendingOffset = block.offset;
    } else {
      if (!pendingText) {
        pendingOffset = block.offset;
        pendingHeadingPath = block.headingPath;
      }
      pendingText += (pendingText ? ' ' : '') + block.text;
    }
  }

  flushPending();
  return chunks;
}
