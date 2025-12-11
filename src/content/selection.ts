// Text selection detection module
// Requirements: 2.1, 3.1 - Detect text selection and extract context

import type { SelectionData } from '../types';
import { getSelectionWithContext } from '../lib/extractor';

export type SelectionCallback = (data: SelectionData | null) => void;

let selectionCallback: SelectionCallback | null = null;
let isListening = false;

/**
 * Get the bounding rectangle of the current selection.
 * Returns position near the end of the selection for bubble placement.
 */
function getSelectionPosition(selection: Selection): { x: number; y: number } | null {
  if (!selection.rangeCount) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) return null;

  // Position at the end of the selection, slightly below
  return {
    x: rect.right,
    y: rect.bottom + window.scrollY,
  };
}

/**
 * Extract selection data including text, context, and position.
 */
function extractSelectionData(): SelectionData | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return null;

  const selectedText = selection.toString().trim();
  if (!selectedText || selectedText.length < 2) return null;

  const position = getSelectionPosition(selection);
  if (!position) return null;

  // Get context using extractor
  const contextData = getSelectionWithContext(selection);
  const context = contextData?.fullContext || selectedText;

  return {
    text: selectedText,
    context,
    position,
    pageUrl: window.location.href,
    pageTitle: document.title,
  };
}

/**
 * Handle mouseup event to detect text selection.
 */
function handleMouseUp(event: MouseEvent): void {
  // Ignore if clicking inside our extension UI
  const target = event.target as HTMLElement;
  if (target.closest('[data-knowledgelens]')) return;

  // Small delay to ensure selection is complete
  setTimeout(() => {
    const data = extractSelectionData();
    selectionCallback?.(data);
  }, 10);
}

/**
 * Handle selection change to detect when selection is cleared.
 */
function handleSelectionChange(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim()) {
    selectionCallback?.(null);
  }
}

/**
 * Start listening for text selection events.
 */
export function startSelectionListener(callback: SelectionCallback): void {
  if (isListening) {
    selectionCallback = callback;
    return;
  }

  selectionCallback = callback;
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('selectionchange', handleSelectionChange);
  isListening = true;
}

/**
 * Stop listening for text selection events.
 */
export function stopSelectionListener(): void {
  if (!isListening) return;

  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('selectionchange', handleSelectionChange);
  selectionCallback = null;
  isListening = false;
}

/**
 * Get current selection data without setting up listeners.
 */
export function getCurrentSelection(): SelectionData | null {
  return extractSelectionData();
}
