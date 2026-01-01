// Offscreen document for CPU-intensive operations
// Handles image cropping, note card generation, and embedding computation
// Requirements: 3.1, 5.3, 7.1, 7.2, 7.3

import type { ScreenshotRegion } from '../types';
import { generateNoteCard, type NoteCardData } from '../lib/notecard';
import {
  handleEmbeddingRequest,
  ensureInitialized,
  type EmbeddingRequest,
} from './embedding';

interface CropImageMessage {
  action: 'crop_image';
  imageDataUrl: string;
  region: ScreenshotRegion;
}

interface GenerateNoteCardMessage {
  action: 'generate_note_card';
  data: NoteCardData;
}

interface PreloadEmbeddingMessage {
  action: 'preload_embedding';
}

type OffscreenMessage =
  | CropImageMessage
  | GenerateNoteCardMessage
  | EmbeddingRequest
  | PreloadEmbeddingMessage;

function cropImage(imageDataUrl: string, region: ScreenshotRegion): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const dpr = region.devicePixelRatio || 1;
        const sourceX = Math.round(region.x * dpr);
        const sourceY = Math.round(region.y * dpr);
        const sourceWidth = Math.round(region.width * dpr);
        const sourceHeight = Math.round(region.height * dpr);

        const canvas = document.createElement('canvas');
        canvas.width = sourceWidth;
        canvas.height = sourceHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(
          img,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight
        );

        const croppedDataUrl = canvas.toDataURL('image/png');
        const base64 = croppedDataUrl.replace(/^data:image\/png;base64,/, '');
        resolve(base64);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Failed to crop image'));
      }
    };

    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = imageDataUrl;
  });
}

chrome.runtime.onMessage.addListener((message: OffscreenMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message.action === 'crop_image') {
    cropImage(message.imageDataUrl, message.region)
      .then((croppedImageBase64) => sendResponse({ success: true, croppedImageBase64 }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    return true;
  }

  if (message.action === 'generate_note_card') {
    generateNoteCard(message.data)
      .then((noteCard) =>
        sendResponse({
          success: true,
          imageDataUrl: noteCard.imageDataUrl,
          width: noteCard.width,
          height: noteCard.height,
        })
      )
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    return true;
  }

  if (message.action === 'compute_embedding') {
    handleEmbeddingRequest(message).then(sendResponse);
    return true;
  }

  if (message.action === 'preload_embedding') {
    ensureInitialized()
      .then(() => sendResponse({ success: true }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    return true;
  }

  return false;
});

console.log('KnowledgeLens offscreen document loaded');
