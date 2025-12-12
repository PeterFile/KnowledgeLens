// Content script for KnowledgeLens
// Handles text selection, floating bubble, sidebar, and screenshot overlay
// Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.4, 5.1, 5.2, 5.4

import type { SelectionData, ScreenshotRegion, ScreenshotResult } from '../types';
import { getShadowContainer, destroyShadowContainer } from './shadow-container';
import { startSelectionListener, stopSelectionListener } from './selection';
import { FloatingBubble } from './FloatingBubble';
import { Sidebar } from './Sidebar';
import { ScreenshotOverlay } from './ScreenshotOverlay';
import { ProcessingPanel } from './ProcessingPanel';

console.log('KnowledgeLens content script loaded');

// Container IDs
const BUBBLE_CONTAINER_ID = 'knowledgelens-bubble';
const SIDEBAR_CONTAINER_ID = 'knowledgelens-sidebar';
const SCREENSHOT_OVERLAY_ID = 'knowledgelens-screenshot-overlay';
const PROCESSING_PANEL_ID = 'knowledgelens-processing-panel';

// Current state
let currentSelection: SelectionData | null = null;
let sidebarMode: 'explain' | 'search' | null = null;

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
 * Show the sidebar with AI response.
 */
function showSidebar(mode: 'explain' | 'search'): void {
  if (!currentSelection) return;

  sidebarMode = mode;
  hideBubble();

  const container = getShadowContainer(SIDEBAR_CONTAINER_ID);
  container.render(
    <Sidebar
      selectedText={currentSelection.text}
      context={currentSelection.context}
      mode={mode}
      onClose={hideSidebar}
    />
  );
}

/**
 * Hide the sidebar.
 */
function hideSidebar(): void {
  destroyShadowContainer(SIDEBAR_CONTAINER_ID);
  sidebarMode = null;
}

/**
 * Handle explain button click.
 */
function handleExplain(): void {
  showSidebar('explain');
}

/**
 * Handle search button click.
 */
function handleSearch(): void {
  showSidebar('search');
}

/**
 * Handle selection change.
 */
function handleSelectionChange(selection: SelectionData | null): void {
  // Don't hide sidebar if it's open
  if (sidebarMode) return;

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
  hideSidebar();

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
  hideScreenshotOverlay();

  // Send capture request to background service worker
  chrome.runtime.sendMessage(
    {
      action: 'capture_screenshot',
      payload: { region, tabId: 0 }, // tabId will be determined by background
    },
    (response) => {
      if (response?.success && response.data) {
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
 * Handle click outside to close sidebar.
 */
function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  // Don't close if clicking inside our UI
  if (target.closest('[data-knowledgelens]')) return;

  // Check if click is inside shadow DOM containers
  const bubbleHost = document.getElementById(BUBBLE_CONTAINER_ID);
  const sidebarHost = document.getElementById(SIDEBAR_CONTAINER_ID);
  const processingHost = document.getElementById(PROCESSING_PANEL_ID);

  if (
    bubbleHost?.contains(target) ||
    sidebarHost?.contains(target) ||
    processingHost?.contains(target)
  ) {
    return;
  }

  // Close sidebar if open and clicking outside
  if (sidebarMode) {
    hideSidebar();
  }
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
  hideSidebar();
  hideScreenshotOverlay();
  hideProcessingPanel();
}

// Start
init();

// Cleanup on page unload (use pagehide instead of unload to avoid Permissions Policy violations)
window.addEventListener('pagehide', cleanup);

// Export functions for external use (e.g., from popup)
export { showScreenshotOverlay, hideScreenshotOverlay };
