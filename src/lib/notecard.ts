// Note Card Generator for KnowledgeLens
// Requirements: 7.1, 7.2, 7.3, 7.4 - Create shareable note cards with metadata and QR codes

import QRCode from 'qrcode';

export interface NoteCardData {
  screenshot: string; // Base64 image
  title: string;
  favicon: string;
  aiSummary: string;
  sourceUrl: string;
}

/**
 * Validate that note card data contains all required metadata fields
 * Requirements: 7.1, 7.2
 * 
 * Returns an object indicating which metadata fields are present
 */
export function validateNoteCardMetadata(data: NoteCardData): {
  hasTitle: boolean;
  hasFavicon: boolean;
  hasSourceUrl: boolean;
  hasScreenshot: boolean;
  allRequiredPresent: boolean;
} {
  const hasTitle = typeof data.title === 'string' && data.title.length > 0;
  const hasFavicon = typeof data.favicon === 'string' && data.favicon.length > 0;
  const hasSourceUrl = typeof data.sourceUrl === 'string' && data.sourceUrl.length > 0;
  const hasScreenshot = typeof data.screenshot === 'string' && data.screenshot.length > 0;
  
  return {
    hasTitle,
    hasFavicon,
    hasSourceUrl,
    hasScreenshot,
    allRequiredPresent: hasTitle && hasSourceUrl && hasScreenshot,
  };
}

export interface NoteCard {
  imageDataUrl: string;
  width: number;
  height: number;
}

// Card dimensions and styling
const CARD_CONFIG = {
  width: 600,
  padding: 24,
  headerHeight: 60,
  footerHeight: 80,
  qrSize: 60,
  borderRadius: 12,
  backgroundColor: '#ffffff',
  headerBgColor: '#f8fafc',
  textColor: '#1e293b',
  mutedColor: '#64748b',
  borderColor: '#e2e8f0',
};

/**
 * Generate a QR code for a URL
 * Returns a data URL of the QR code image
 */
export async function generateQRCode(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: CARD_CONFIG.qrSize * 2, // Higher resolution for quality
    margin: 1,
    color: {
      dark: '#1e293b',
      light: '#ffffff',
    },
  });
}

/**
 * Load an image from a data URL or URL
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Wrap text to fit within a given width
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Draw rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Generate a note card image from screenshot and AI content
 * Requirements: 7.1, 7.2, 7.3
 */
export async function generateNoteCard(data: NoteCardData): Promise<NoteCard> {
  const { width, padding, headerHeight, footerHeight, qrSize, borderRadius } = CARD_CONFIG;

  // Load images
  const [screenshotImg, qrCodeDataUrl] = await Promise.all([
    loadImage(data.screenshot.startsWith('data:') ? data.screenshot : `data:image/png;base64,${data.screenshot}`),
    generateQRCode(data.sourceUrl),
  ]);

  const qrImg = await loadImage(qrCodeDataUrl);

  // Calculate screenshot dimensions to fit card width
  const contentWidth = width - padding * 2;
  const screenshotAspect = screenshotImg.width / screenshotImg.height;
  const screenshotHeight = Math.min(contentWidth / screenshotAspect, 400);
  const screenshotWidth = screenshotHeight * screenshotAspect;

  // Create temporary canvas to measure text
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  tempCtx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Wrap AI summary text
  const summaryLines = data.aiSummary
    ? wrapText(tempCtx, data.aiSummary, contentWidth - qrSize - padding)
    : [];
  const summaryHeight = summaryLines.length * 20 + (summaryLines.length > 0 ? padding : 0);

  // Calculate total card height
  const cardHeight = headerHeight + screenshotHeight + summaryHeight + footerHeight + padding * 2;

  // Create main canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = cardHeight;
  const ctx = canvas.getContext('2d')!;

  // Draw card background with rounded corners
  ctx.fillStyle = CARD_CONFIG.backgroundColor;
  roundRect(ctx, 0, 0, width, cardHeight, borderRadius);
  ctx.fill();

  // Draw border
  ctx.strokeStyle = CARD_CONFIG.borderColor;
  ctx.lineWidth = 1;
  roundRect(ctx, 0.5, 0.5, width - 1, cardHeight - 1, borderRadius);
  ctx.stroke();

  // Draw header background
  ctx.fillStyle = CARD_CONFIG.headerBgColor;
  ctx.beginPath();
  ctx.moveTo(borderRadius, 0);
  ctx.lineTo(width - borderRadius, 0);
  ctx.quadraticCurveTo(width, 0, width, borderRadius);
  ctx.lineTo(width, headerHeight);
  ctx.lineTo(0, headerHeight);
  ctx.lineTo(0, borderRadius);
  ctx.quadraticCurveTo(0, 0, borderRadius, 0);
  ctx.closePath();
  ctx.fill();

  // Draw header separator
  ctx.strokeStyle = CARD_CONFIG.borderColor;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(width, headerHeight);
  ctx.stroke();

  // Draw favicon if available
  let titleX = padding;
  if (data.favicon) {
    try {
      const faviconImg = await loadImage(data.favicon);
      ctx.drawImage(faviconImg, padding, (headerHeight - 24) / 2, 24, 24);
      titleX = padding + 32;
    } catch {
      // Favicon failed to load, skip it
    }
  }

  // Draw title
  ctx.fillStyle = CARD_CONFIG.textColor;
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const titleMaxWidth = width - titleX - padding;
  const truncatedTitle = truncateText(ctx, data.title || 'Untitled', titleMaxWidth);
  ctx.fillText(truncatedTitle, titleX, headerHeight / 2 + 6);

  // Draw screenshot
  const screenshotX = (width - screenshotWidth) / 2;
  const screenshotY = headerHeight + padding;
  ctx.drawImage(screenshotImg, screenshotX, screenshotY, screenshotWidth, screenshotHeight);

  // Draw AI summary if present
  if (summaryLines.length > 0) {
    const summaryY = screenshotY + screenshotHeight + padding;
    ctx.fillStyle = CARD_CONFIG.textColor;
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    summaryLines.forEach((line, index) => {
      ctx.fillText(line, padding, summaryY + index * 20 + 14);
    });
  }

  // Draw footer separator
  const footerY = cardHeight - footerHeight;
  ctx.strokeStyle = CARD_CONFIG.borderColor;
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(width, footerY);
  ctx.stroke();

  // Draw QR code
  const qrX = width - padding - qrSize;
  const qrY = footerY + (footerHeight - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Draw source URL
  ctx.fillStyle = CARD_CONFIG.mutedColor;
  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const urlMaxWidth = width - padding * 3 - qrSize;
  const truncatedUrl = truncateText(ctx, data.sourceUrl, urlMaxWidth);
  ctx.fillText(truncatedUrl, padding, footerY + footerHeight / 2 + 4);

  // Draw "Scan to visit" label
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Scan to visit', qrX, qrY - 4);

  return {
    imageDataUrl: canvas.toDataURL('image/png'),
    width,
    height: cardHeight,
  };
}

/**
 * Truncate text to fit within a given width
 */
function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  const metrics = ctx.measureText(text);
  if (metrics.width <= maxWidth) {
    return text;
  }

  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }

  return truncated + '...';
}

/**
 * Download note card as image file
 * Requirement: 7.4
 */
export function downloadNoteCard(noteCard: NoteCard, filename?: string): void {
  const link = document.createElement('a');
  link.href = noteCard.imageDataUrl;
  link.download = filename || `note-card-${Date.now()}.png`;
  link.click();
}

/**
 * Copy note card to clipboard
 * Requirement: 7.4
 */
export async function copyNoteCardToClipboard(noteCard: NoteCard): Promise<void> {
  // Convert data URL to blob
  const response = await fetch(noteCard.imageDataUrl);
  const blob = await response.blob();

  await navigator.clipboard.write([
    new ClipboardItem({
      [blob.type]: blob,
    }),
  ]);
}
