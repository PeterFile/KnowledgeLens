// Content script for KnowledgeLens
// Handles text selection, floating bubble, and sidebar
// Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 4.4

import type { SelectionData } from '../types';
import { getShadowContainer, destroyShadowContainer } from './shadow-container';
import { startSelectionListener, stopSelectionListener } from './selection';
import { FloatingBubble } from './FloatingBubble';
import { Sidebar } from './Sidebar';

console.log('KnowledgeLens content script loaded');

// Container IDs
const BUBBLE_CONTAINER_ID = 'knowledgelens-bubble';
const SIDEBAR_CONTAINER_ID = 'knowledgelens-sidebar';

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
 * Handle click outside to close sidebar.
 */
function handleDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  // Don't close if clicking inside our UI
  if (target.closest('[data-knowledgelens]')) return;

  // Check if click is inside shadow DOM containers
  const bubbleHost = document.getElementById(BUBBLE_CONTAINER_ID);
  const sidebarHost = document.getElementById(SIDEBAR_CONTAINER_ID);

  if (bubbleHost?.contains(target) || sidebarHost?.contains(target)) return;

  // Close sidebar if open and clicking outside
  if (sidebarMode) {
    hideSidebar();
  }
}

// Initialize content script
function init(): void {
  startSelectionListener(handleSelectionChange);
  document.addEventListener('click', handleDocumentClick);
}

// Cleanup on unload
function cleanup(): void {
  stopSelectionListener();
  document.removeEventListener('click', handleDocumentClick);
  hideBubble();
  hideSidebar();
}

// Start
init();

// Cleanup on page unload
window.addEventListener('unload', cleanup);

export {};
