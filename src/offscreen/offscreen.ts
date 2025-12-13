// Offscreen document for CPU-intensive image operations
// Handles image cropping and note card generation
// Requirements: 5.3, 7.1, 7.2, 7.3

import type { ScreenshotRegion } from '../types';
import { generateNoteCard, type NoteCardData } from '../lib/notecard';

/**
 * Message types for offscreen document communication
 */
interface CropImageMessage {
  action: 'crop_image';
  imageDataUrl: string;
  region: ScreenshotRegion;
}

interface GenerateNoteCardMessage {
  action: 'generate_note_card';
  data: NoteCardData;
}

interface CropImageResponse {
  success: true;
  croppedImageBase64: string;
}

interface NoteCardResponse {
  success: true;
  imageDataUrl: string;
  width: number;
  height: number;
}

interface ErrorResponse {
  success: false;
  error: string;
}

type OffscreenMessage = CropImageMessage | GenerateNoteCardMessage;
type OffscreenResponse = CropImageResponse | NoteCardResponse | ErrorResponse;

/**
 * Crop an image using Canvas API
 * Takes a full screenshot and extracts the specified region
 */
function cropImage(imageDataUrl: string, region: ScreenshotRegion): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        // Account for device pixel ratio in the captured image
        // Default to 1 if not provided (fallback for edge cases)
        const dpr = region.devicePixelRatio || 1;
        const sourceX = Math.round(region.x * dpr);
        const sourceY = Math.round(region.y * dpr);
        const sourceWidth = Math.round(region.width * dpr);
        const sourceHeight = Math.round(region.height * dpr);

        // Create canvas with the cropped dimensions
        const canvas = document.createElement('canvas');
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Draw the cropped region
        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight, // Source rectangle
          0,
          0,
          sourceWidth,
          sourceHeight // Destination rectangle
        );

        // Convert to base64 PNG
        const croppedDataUrl = canvas.toDataURL('image/png');
        // Remove the data URL prefix to get just the base64 string
        const base64 = croppedDataUrl.replace(/^data:image\/png;base64,/, '');
        resolve(base64);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to crop image'));
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for cropping'));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Handle messages from the service worker
 * Only accepts messages from the extension itself for security
 */
chrome.runtime.onMessage.addListener(
  (message: OffscreenMessage, sender, sendResponse: (response: OffscreenResponse) => void) => {
    // Security check: only accept messages from our extension
    if (sender.id !== chrome.runtime.id) {
      return false;
    }

    if (message.action === 'crop_image') {
      cropImage(message.imageDataUrl, message.region)
        .then((croppedImageBase64) => {
          sendResponse({ success: true, croppedImageBase64 });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

      return true;
    }

    if (message.action === 'generate_note_card') {
      generateNoteCard(message.data)
        .then((noteCard) => {
          sendResponse({
            success: true,
            imageDataUrl: noteCard.imageDataUrl,
            width: noteCard.width,
            height: noteCard.height,
          });
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });

      return true;
    }

    return false;
  }
);

console.log('KnowledgeLens offscreen document loaded');
