/**
 * Simple Markdown to HTML converter for rendering LLM responses.
 * Supports basic markdown syntax: headers, bold, italic, code blocks, inline code, lists.
 */

/**
 * Convert markdown text to HTML string.
 * Handles common markdown patterns used in LLM responses.
 */
export function markdownToHtml(content: string): string {
  return (
    content
      // Headers (must be processed before other patterns)
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
      // Bold and italic
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Code blocks (must be before inline code)
      .replace(
        /```(\w*)\n([\s\S]*?)```/g,
        '<pre class="bg-gray-100 p-2 rounded text-xs overflow-x-auto my-2"><code>$2</code></pre>'
      )
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>')
      // Lists
      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
      .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4">$2</li>')
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mb-2">')
      .replace(/\n/g, '<br/>')
  );
}

/**
 * Extract plain text content from HTML string.
 * Removes all HTML tags and normalizes whitespace.
 */
export function extractTextFromHtml(html: string): string {
  return (
    html
      // Remove HTML tags
      .replace(/<[^>]+>/g, ' ')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Extract plain text from markdown by converting to HTML first,
 * then stripping HTML tags. This preserves the text content
 * while removing all formatting.
 */
export function extractTextFromMarkdown(markdown: string): string {
  const html = markdownToHtml(markdown);
  return extractTextFromHtml(html);
}
