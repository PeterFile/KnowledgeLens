// Content script for KnowledgeLens
// Handles text selection, floating bubble, sidebar, and screenshot overlay
// Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.4, 5.1, 5.2, 5.4

import type { SelectionData, ScreenshotRegion, ScreenshotResult } from '../types';
import { getShadowContainer, destroyShadowContainer } from './shadow-container';
import { startSelectionListener, stopSelectionListener } from './selection';
import { FloatingBubble } from './FloatingBubble';
import { FloatingPanel } from './FloatingPanel';
import { ScreenshotOverlay } from './ScreenshotOverlay';
import { ProcessingPanel } from './ProcessingPanel';

console.log('KnowledgeLens content script loaded');

// Container IDs
const BUBBLE_CONTAINER_ID = 'knowledgelens-bubble';
const PANEL_CONTAINER_PREFIX = 'knowledgelens-panel-';
const SCREENSHOT_OVERLAY_ID = 'knowledgelens-screenshot-overlay';
const PROCESSING_PANEL_ID = 'knowledgelens-processing-panel';

// Current state
let currentSelection: SelectionData | null = null;

// Track active panels by their unique IDs
const activePanels = new Map<string, { text: string; mode: 'explain' | 'search' }>();

/**
 * Generate a unique panel ID.
 */
function generatePanelId(): string {
  return `${PANEL_CONTAINER_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Show the floating bubble near the selection.
 */
function showBubble(selection: SelectionData): void {
  const container = getShadowContainer(BUBBLE_CONTAINER_ID);
  container.render(
    <FloatingBubble
      position={selection.position}
      onExplain={handleExplain}
      onSearch={handleSearch}
    />
  );
}

/**
 * Hide the floating bubble.
 */
function hideBubble(): void {
  destroyShadowContainer(BUBBLE_CONTAINER_ID);
}

/**
 * Show the floating panel with AI response.
 * Creates a new panel with a unique ID, allowing multiple panels to coexist.
 */
function showPanel(mode: 'explain' | 'search'): string | undefined {
  if (!currentSelection) return;

  hideBubble();

  const panelId = generatePanelId();
  activePanels.set(panelId, { text: currentSelection.text, mode });

  const container = getShadowContainer(panelId);
  container.render(
    <FloatingPanel
      selectedText={currentSelection.text}
      context={currentSelection.context}
      mode={mode}
      onClose={() => hidePanelById(panelId)}
    />
  );

  return panelId;
}

/**
 * Hide a specific floating panel by its ID.
 */
function hidePanelById(panelId: string): void {
  destroyShadowContainer(panelId);
  activePanels.delete(panelId);
}

/**
 * Hide all floating panels.
 */
function hideAllPanels(): void {
  activePanels.forEach((_, panelId) => {
    destroyShadowContainer(panelId);
  });
  activePanels.clear();
}

/**
 * Handle explain button click.
 */
function handleExplain(): void {
  showPanel('explain');
}

/**
 * Handle search button click.
 */
function handleSearch(): void {
  showPanel('search');
}

/**
 * Handle selection change.
 * Allows new selections even when panels are open.
 */
function handleSelectionChange(selection: SelectionData | null): void {
  if (selection) {
    currentSelection = selection;
    showBubble(selection);
  } else {
    currentSelection = null;
    hideBubble();
  }
}

/**
 * Show the screenshot overlay for region selection.
 * Requirements: 5.1, 5.2
 */
function showScreenshotOverlay(): void {
  hideBubble();
  hideAllPanels();

  const container = getShadowContainer(SCREENSHOT_OVERLAY_ID);
  container.render(
    <ScreenshotOverlay onCapture={handleScreenshotCapture} onCancel={hideScreenshotOverlay} />
  );
}

/**
 * Hide the screenshot overlay.
 */
function hideScreenshotOverlay(): void {
  destroyShadowContainer(SCREENSHOT_OVERLAY_ID);
}

/**
 * Handle screenshot capture - send region to background for processing.
 * Requirements: 5.2, 5.3
 */
function handleScreenshotCapture(region: ScreenshotRegion): void {
  console.log('Screenshot capture requested:', region);
  hideScreenshotOverlay();

  // Send capture request to background service worker
  chrome.runtime.sendMessage(
    {
      action: 'capture_screenshot',
      payload: { region, tabId: 0 }, // tabId will be determined by background
    },
    (response) => {
      console.log('Screenshot capture response:', response);
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        return;
      }
      if (response?.success && response.data) {
        console.log('Screenshot captured successfully, showing processing panel');
        const result: ScreenshotResult = {
          imageBase64: response.data.imageBase64,
          region,
          pageUrl: window.location.href,
          pageTitle: document.title,
          favicon: getFavicon(),
        };
        showProcessingPanel(result);
      } else if (response?.error) {
        console.error('Screenshot capture failed:', response.error);
      } else {
        console.error('Unexpected response:', response);
      }
    }
  );
}

/**
 * Get the page favicon URL.
 */
function getFavicon(): string {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel="icon"], link[rel="shortcut icon"]'
  );
  return link?.href || `${window.location.origin}/favicon.ico`;
}

/**
 * Show the processing panel with captured screenshot.
 * Requirements: 5.4
 */
function showProcessingPanel(screenshot: ScreenshotResult): void {
  const container = getShadowContainer(PROCESSING_PANEL_ID);
  container.render(<ProcessingPanel screenshot={screenshot} onClose={hideProcessingPanel} />);
}

/**
 * Hide the processing panel.
 */
function hideProcessingPanel(): void {
  destroyShadowContainer(PROCESSING_PANEL_ID);
}

/**
 * Handle click outside to close bubble (but not panels).
 * Panels should only be closed via the close button to prevent accidental loss of results.
 */
function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  // Don't do anything if clicking inside our UI
  if (target.closest('[data-knowledgelens]')) return;

  // Check if click is inside shadow DOM containers
  const bubbleHost = document.getElementById(BUBBLE_CONTAINER_ID);
  const processingHost = document.getElementById(PROCESSING_PANEL_ID);

  // Check if click is inside any active panel
  let clickedInsidePanel = false;
  activePanels.forEach((_, panelId) => {
    const panelHost = document.getElementById(panelId);
    if (panelHost?.contains(target)) {
      clickedInsidePanel = true;
    }
  });

  if (bubbleHost?.contains(target) || clickedInsidePanel || processingHost?.contains(target)) {
    return;
  }

  // Only hide bubble when clicking outside, keep panels open
  // Panels should be closed explicitly via close button to prevent losing results
  hideBubble();
}

/**
 * Handle messages from popup or background.
 */
function handleExtensionMessage(
  message: { action: string },
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
): boolean {
  if (message.action === 'activate_screenshot') {
    showScreenshotOverlay();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'get_page_content') {
    // Simple text extraction for now
    // Requirements: 1.1 - Text extraction for summary
    const content = document.body.innerText || '';
    sendResponse({ content });
    return true;
  }
  return false;
}

// Initialize content script
function init(): void {
  startSelectionListener(handleSelectionChange);
  document.addEventListener('click', handleDocumentClick);
  chrome.runtime.onMessage.addListener(handleExtensionMessage);
}

// Cleanup on unload
function cleanup(): void {
  stopSelectionListener();
  document.removeEventListener('click', handleDocumentClick);
  chrome.runtime.onMessage.removeListener(handleExtensionMessage);
  hideBubble();
  hideAllPanels();
  hideScreenshotOverlay();
  hideProcessingPanel();
}

// Start
init();

// Cleanup on page unload (use pagehide instead of unload to avoid Permissions Policy violations)
window.addEventListener('pagehide', cleanup);

// Export functions for external use (e.g., from popup)
export { showScreenshotOverlay, hideScreenshotOverlay };
