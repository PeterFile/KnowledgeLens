// Screenshot capture utilities for the background service worker
// Handles full-page capture and offscreen document coordination
// Requirements: 5.2, 5.3

import type { ScreenshotRegion } from '../types';

// Path relative to extension root (matches build output structure)
const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';

/**
 * Check if offscreen document already exists
 */
async function hasOffscreenDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
  });
  return contexts.length > 0;
}

/**
 * Create offscreen document if it doesn't exist
 */
export async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    // Use BLOBS reason which is available in Chrome types
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Crop screenshot images using Canvas API',
  });
}

/**
 * Capture the visible tab and crop to the specified region
 * Requirements: 5.2, 5.3
 *
 * @param _tabId - Tab ID (reserved for future use, currently captures active window)
 * @param region - The region to crop from the screenshot
 */
export async function captureAndCropScreenshot(
  _tabId: number,
  region: ScreenshotRegion
): Promise<string> {
  // Capture the full visible tab of the current window
  const fullScreenshot = await chrome.tabs.captureVisibleTab({ format: 'png' });

  // Ensure offscreen document exists for cropping
  await ensureOffscreenDocument();

  try {
    // Send to offscreen document for cropping
    const response = await chrome.runtime.sendMessage({
      action: 'crop_image',
      imageDataUrl: fullScreenshot,
      region,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to crop screenshot');
    }

    return response.croppedImageBase64;
  } finally {
    // Close offscreen document after use to free resources
    // Chrome recommends destroying offscreen documents when done
    await closeOffscreenDocument();
  }
}

/**
 * Close the offscreen document to free resources
 */
export async function closeOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) {
    await chrome.offscreen.closeDocument();
  }
}
