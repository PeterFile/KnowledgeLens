// Offscreen document for CPU-intensive operations
// Handles image cropping, note card generation, and embedding computation
// Requirements: 3.1, 5.3, 7.1, 7.2, 7.3

import type { ScreenshotRegion } from '../types';
import { generateNoteCard, type NoteCardData } from '../lib/notecard';
import { handleEmbeddingRequest, ensureInitialized, type EmbeddingRequest } from './embedding';

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

chrome.runtime.onMessage.addListener(
  (message: OffscreenMessage & { target?: string }, sender, sendResponse) => {
    console.log('[Offscreen] Received message:', message, 'from:', sender.id);

    // Only handle messages targeted to offscreen document
    // This prevents background script from intercepting its own messages
    if (message.target !== 'offscreen') {
      console.log('[Offscreen] Ignoring message - target is not offscreen:', message.target);
      return false;
    }
    if (sender.id !== chrome.runtime.id) {
      console.log('[Offscreen] Ignoring message - sender is not extension:', sender.id);
      return false;
    }

    console.log('[Offscreen] Processing message with action:', message.action);

    if (message.action === 'crop_image') {
      console.log('[Offscreen] Handling crop_image');
      cropImage(message.imageDataUrl, message.region)
        .then((croppedImageBase64) => {
          console.log('[Offscreen] crop_image success');
          sendResponse({ success: true, croppedImageBase64 });
        })
        .catch((error) => {
          console.error('[Offscreen] crop_image error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    }

    if (message.action === 'generate_note_card') {
      console.log('[Offscreen] Handling generate_note_card');
      generateNoteCard(message.data)
        .then((noteCard) => {
          console.log('[Offscreen] generate_note_card success');
          sendResponse({
            success: true,
            imageDataUrl: noteCard.imageDataUrl,
            width: noteCard.width,
            height: noteCard.height,
          });
        })
        .catch((error) => {
          console.error('[Offscreen] generate_note_card error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    }

    if (message.action === 'compute_embedding') {
      console.log('[Offscreen] Handling compute_embedding');
      handleEmbeddingRequest(message).then((response) => {
        console.log('[Offscreen] compute_embedding response:', response);
        sendResponse(response);
      });
      return true;
    }

    if (message.action === 'preload_embedding') {
      console.log('[Offscreen] Handling preload_embedding');
      ensureInitialized()
        .then(() => {
          console.log('[Offscreen] preload_embedding success');
          sendResponse({ success: true });
        })
        .catch((error) => {
          console.error('[Offscreen] preload_embedding error:', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      return true;
    }

    console.log('[Offscreen] Unknown action:', (message as { action?: string }).action);
    return false;
  }
);

console.log('KnowledgeLens offscreen document loaded');
