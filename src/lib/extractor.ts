import { countTokens, truncateToTokens, TokenizerEncoding } from './tokenizer';

export interface ExtractedContent {
  title: string;
  metadata?: {
    description?: string;
    [key: string]: any;
  };
  mainText: string;
  wordCount: number;
  tokenCount: number;
}

export interface TruncationOptions {
  maxTokens: number;
  preserveStart?: boolean;
  preserveEnd?: boolean;
  encoding?: TokenizerEncoding;
}

// Elements that should be completely removed (including their content)
const REMOVE_ELEMENTS = [
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'canvas',
  'video',
  'audio',
  'map',
  'object',
  'embed',
];

// Elements that are typically navigation/non-content
// Elements that are typically navigation/non-content
const NAVIGATION_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[role="complementary"]',
  '.nav',
  '.navbar',
  '.navigation',
  '.menu',
  '.sidebar',
  '.footer',
  '.header',
  '.advertisement',
  '.ad',
  '.ads',
  '.social-share',
  '.comments',
  '.related-posts',
  '#comments',
  '#sidebar',
  '.widget-area',
];

/**
 * Clean HTML string by removing unwanted elements.
 * Preserves visible text content while stripping scripts, styles, and navigation.
 */
export function cleanHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // Create a temporary DOM parser
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove unwanted elements
  for (const tag of REMOVE_ELEMENTS) {
    const elements = doc.querySelectorAll(tag);
    elements.forEach((el) => el.remove());
  }

  // Remove navigation elements
  for (const selector of NAVIGATION_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(selector);
      elements.forEach((el) => el.remove());
    } catch {
      // Invalid selector, skip
    }
  }

  // Experimental: Clean noise using heuristics
  cleanNoise(doc.body);

  // Get text content and normalize whitespace
  const text = doc.body?.textContent || '';
  return normalizeWhitespace(text);
}

/**
 * Heuristically remove noisy elements (e.g., date-only lines, social buttons text).
 */
function cleanNoise(root: HTMLElement | null) {
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const toRemove: Element[] = [];

  while (walker.nextNode()) {
    const el = walker.currentNode as Element;
    // Skip if it contains significant children (we only want to prune "leaves" or near-leaves)
    if (el.querySelectorAll('p, div, section').length > 0) continue;

    const text = (el.textContent || '').trim();

    // Heuristic 1: Very short text that looks like UI noise (e.g. "Reply", "Share")
    if (text.length < 20 && /^(reply|share|like|follow|comment|posted on|read more)/i.test(text)) {
      // Only remove if it's a block level element or an isolated span
      if (['DIV', 'P', 'SPAN', 'LI'].includes(el.tagName)) {
        toRemove.push(el);
      }
    }

    // Heuristic 2: Date-only lines (e.g. 2023-10-12)
    if (text.length < 50 && /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\w+ \d{1,2},? \d{4})/.test(text)) {
      if (['DIV', 'P', 'SPAN', 'TIME'].includes(el.tagName)) {
        toRemove.push(el);
      }
    }
  }

  toRemove.forEach((el) => el.remove());
}

/**
 * Normalize whitespace in text: collapse multiple spaces/newlines into single spaces.
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract main content from a DOM Document.
 * Attempts to find the main content area and extract clean text.
 */
export function extractPageContent(document: Document): ExtractedContent {
  const title = document.title || '';

  // Extract meta description
  const metaDescQuery = document.querySelector('meta[name="description"]');
  const metaDescription = metaDescQuery ? metaDescQuery.getAttribute('content') || '' : '';

  // Try to find main content area using common selectors
  const mainContent = findMainContent(document);

  // Clean the HTML and extract text
  const mainText = mainContent
    ? cleanHtml(mainContent.outerHTML)
    : cleanHtml(document.body?.outerHTML || '');

  const wordCount = mainText.split(/\s+/).filter(Boolean).length;
  const tokenCount = countTokens(mainText);

  return {
    title,
    metadata: {
      description: metaDescription,
    },
    mainText,
    wordCount,
    tokenCount,
  };
}

/**
 * Find the main content element in a document.
 * Uses heuristics to identify the primary content area.
 */
function findMainContent(document: Document): Element | null {
  // Priority order for main content selectors
  const contentSelectors = [
    'main',
    '[role="main"]',
    'article',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content', // ID is often more specific than class
    '.content',
    '.post',
    '.article',
  ];

  for (const selector of contentSelectors) {
    const element = document.querySelector(selector);
    if (element && hasSubstantialText(element)) {
      return element;
    }
  }

  // Fallback: find the element with the most text content
  return findLargestTextBlock(document.body);
}

/**
 * Check if an element has substantial text content (more than 100 chars).
 */
function hasSubstantialText(element: Element): boolean {
  const text = element.textContent || '';
  return text.trim().length > 100;
}

/**
 * Find the element with the largest text block in the document.
 */
function findLargestTextBlock(root: Element | null): Element | null {
  if (!root) return null;

  let maxLength = 0;
  let bestElement: Element | null = null;

  // Check paragraphs and divs for text content - we search deeper now
  // Limiting scope to avoid traversing entire tree too expensively
  const candidates = root.querySelectorAll('article, section, div, p');

  for (const element of candidates) {
    // Skip if it's a navigation element
    if (isNavigationElement(element)) continue;

    // We want the *deepest* element that still contains a lot of text,
    // but sometimes the text is split across multiple p tags in a div.
    // So we prefer semantic tags if possible.

    const textLength = (element.textContent || '').trim().length;
    if (textLength > maxLength) {
      maxLength = textLength;
      bestElement = element;
    }
  }

  return bestElement;
}

/**
 * Check if an element is likely a navigation element.
 */
function isNavigationElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();

  // Explicit tag check
  if (['nav', 'header', 'footer', 'aside'].includes(tagName)) {
    return true;
  }

  // Role check
  const role = element.getAttribute('role');
  if (role && ['navigation', 'banner', 'contentinfo', 'complementary'].includes(role)) {
    return true;
  }

  // ID and Class check (more robust)
  const id = element.id.toLowerCase();
  const className = element.className?.toString().toLowerCase() || ''; // className can be SVGAnimatedString

  const navKeywords = [
    'nav',
    'menu',
    'sidebar',
    'footer',
    'header',
    'ad-container',
    'comment',
    'popup',
    'modal',
  ];

  if (navKeywords.some((keyword) => id.includes(keyword) || className.includes(keyword))) {
    return true;
  }

  return false;
}

/**
 * Truncate text to fit within a token limit.
 * Optionally preserves start and/or end sections.
 */
export function truncateToTokenLimit(text: string, options: TruncationOptions): string {
  const {
    maxTokens,
    preserveStart = true,
    preserveEnd = false,
    encoding = 'cl100k_base',
  } = options;

  if (!text || maxTokens <= 0) {
    return '';
  }

  const currentTokens = countTokens(text, encoding);
  if (currentTokens <= maxTokens) {
    return text;
  }

  // Simple truncation if not preserving both ends
  if (!preserveStart || !preserveEnd) {
    return truncateToTokens(text, maxTokens, encoding);
  }

  // Preserve both start and end: split tokens between them
  const halfTokens = Math.floor(maxTokens / 2);
  const startText = truncateToTokens(text, halfTokens, encoding);

  // For end, we need to work backwards - take last portion
  const words = text.split(/\s+/);
  let endText = '';

  for (let i = words.length - 1; i >= 0; i--) {
    const candidate = words.slice(i).join(' ');
    const candidateTokens = countTokens(candidate, encoding);
    if (candidateTokens <= halfTokens) {
      endText = candidate;
    } else {
      break;
    }
  }

  return `${startText}\n\n[...content truncated...]\n\n${endText}`;
}

/**
 * Context window size in characters (before and after selection).
 */
export const CONTEXT_WINDOW_SIZE = 500;

export interface SelectionContext {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  fullContext: string;
}

/**
 * Extract context window around selected text.
 * Returns up to 500 characters before and after the selection.
 * Handles document boundary cases gracefully.
 */
export function extractContextWindow(
  selectedText: string,
  fullText: string,
  selectionStart: number
): SelectionContext {
  if (!selectedText || !fullText) {
    return {
      selectedText: selectedText || '',
      contextBefore: '',
      contextAfter: '',
      fullContext: selectedText || '',
    };
  }

  // Ensure selectionStart is within bounds
  const start = Math.max(0, Math.min(selectionStart, fullText.length));
  const selectionEnd = Math.min(start + selectedText.length, fullText.length);

  // Extract context before selection (up to CONTEXT_WINDOW_SIZE chars)
  const contextBeforeStart = Math.max(0, start - CONTEXT_WINDOW_SIZE);
  const contextBefore = fullText.slice(contextBeforeStart, start);

  // Extract context after selection (up to CONTEXT_WINDOW_SIZE chars)
  const contextAfterEnd = Math.min(fullText.length, selectionEnd + CONTEXT_WINDOW_SIZE);
  const contextAfter = fullText.slice(selectionEnd, contextAfterEnd);

  // Combine into full context
  const fullContext = `${contextBefore}${selectedText}${contextAfter}`;

  return {
    selectedText,
    contextBefore,
    contextAfter,
    fullContext,
  };
}

/**
 * Find a suitable container element with enough context.
 * Walks up the DOM tree to find an element with substantial text content.
 */
function findContextContainer(
  element: Element | null,
  minTextLength: number = 200
): Element | null {
  if (!element) return null;

  let current: Element | null = element;
  const body = document.body;

  while (current && current !== body) {
    const textLength = (current.textContent || '').trim().length;
    // Stop if we find an element with enough text, or if it's a semantic container
    if (textLength >= minTextLength) {
      return current;
    }
    // Also stop at semantic containers like article, section, main
    const tagName = current.tagName.toLowerCase();
    if (['article', 'section', 'main', 'div'].includes(tagName) && textLength > 50) {
      return current;
    }
    current = current.parentElement;
  }

  // Fallback to body if nothing suitable found
  return body;
}

/**
 * Get selection context from a DOM Selection object.
 * Extracts the selected text and surrounding context from the page.
 */
export function getSelectionWithContext(selection: Selection | null): SelectionContext | null {
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return null;
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;

  // Get the text content of the container element
  const initialElement =
    container.nodeType === Node.TEXT_NODE ? container.parentElement : (container as Element);

  if (!initialElement) {
    return {
      selectedText,
      contextBefore: '',
      contextAfter: '',
      fullContext: selectedText,
    };
  }

  // Find a container with enough context (at least 200 chars or 2x context window)
  const contextContainer = findContextContainer(initialElement, CONTEXT_WINDOW_SIZE * 2);

  if (!contextContainer) {
    return {
      selectedText,
      contextBefore: '',
      contextAfter: '',
      fullContext: selectedText,
    };
  }

  // Get full text and find selection position
  const fullText = contextContainer.textContent || '';
  const selectionStart = findSelectionStart(contextContainer, range);

  return extractContextWindow(selectedText, fullText, selectionStart);
}

/**
 * Find the character offset of the selection start within a container element.
 */
function findSelectionStart(container: Element, range: Range): number {
  const treeWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  let offset = 0;
  let node: Node | null;

  while ((node = treeWalker.nextNode())) {
    if (node === range.startContainer) {
      return offset + range.startOffset;
    }
    offset += node.textContent?.length || 0;
  }

  return 0;
}
