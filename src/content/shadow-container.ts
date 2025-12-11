// Shadow DOM container utility for isolated UI components
// Requirements: 2.1, 2.2 - Floating Bubble and Sidebar rendered in Shadow DOM
// to prevent host page CSS from affecting extension UI

import { createRoot, Root } from 'react-dom/client';
import type { ReactNode } from 'react';

export interface ShadowContainer {
  host: HTMLElement;
  shadow: ShadowRoot;
  render: (component: ReactNode) => void;
  destroy: () => void;
}

// Tailwind CSS styles to inject into Shadow DOM
// This is a minimal subset needed for the floating bubble and sidebar
const SHADOW_STYLES = `
/* Reset and base styles */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Tailwind-like utility classes */
.fixed { position: fixed; }
.absolute { position: absolute; }
.relative { position: relative; }

.flex { display: flex; }
.inline-flex { display: inline-flex; }
.hidden { display: none; }
.block { display: block; }

.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.gap-3 { gap: 0.75rem; }
.gap-4 { gap: 1rem; }

.w-full { width: 100%; }
.w-8 { width: 2rem; }
.w-10 { width: 2.5rem; }
.w-80 { width: 20rem; }
.w-96 { width: 24rem; }
.h-8 { height: 2rem; }
.h-10 { height: 2.5rem; }
.h-full { height: 100%; }
.min-h-0 { min-height: 0; }
.max-h-96 { max-height: 24rem; }
.max-h-\\[80vh\\] { max-height: 80vh; }

.p-1 { padding: 0.25rem; }
.p-2 { padding: 0.5rem; }
.p-3 { padding: 0.75rem; }
.p-4 { padding: 1rem; }
.px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
.px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
.px-4 { padding-left: 1rem; padding-right: 1rem; }
.py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
.py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }

.m-0 { margin: 0; }
.mt-2 { margin-top: 0.5rem; }
.mb-2 { margin-bottom: 0.5rem; }
.ml-2 { margin-left: 0.5rem; }

.text-xs { font-size: 0.75rem; line-height: 1rem; }
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }
.text-base { font-size: 1rem; line-height: 1.5rem; }
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
.text-white { color: #ffffff; }
.text-gray-500 { color: #6b7280; }
.text-gray-600 { color: #4b5563; }
.text-gray-700 { color: #374151; }
.text-gray-800 { color: #1f2937; }
.text-gray-900 { color: #111827; }
.text-blue-500 { color: #3b82f6; }
.text-blue-600 { color: #2563eb; }

.bg-white { background-color: #ffffff; }
.bg-gray-50 { background-color: #f9fafb; }
.bg-gray-100 { background-color: #f3f4f6; }
.bg-gray-200 { background-color: #e5e7eb; }
.bg-blue-500 { background-color: #3b82f6; }
.bg-blue-600 { background-color: #2563eb; }
.bg-blue-700 { background-color: #1d4ed8; }

.border { border-width: 1px; border-style: solid; }
.border-0 { border-width: 0; }
.border-b { border-bottom-width: 1px; border-bottom-style: solid; }
.border-gray-200 { border-color: #e5e7eb; }
.border-gray-300 { border-color: #d1d5db; }

.rounded { border-radius: 0.25rem; }
.rounded-md { border-radius: 0.375rem; }
.rounded-lg { border-radius: 0.5rem; }
.rounded-xl { border-radius: 0.75rem; }
.rounded-full { border-radius: 9999px; }

.shadow { box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1); }
.shadow-md { box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); }
.shadow-lg { box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1); }
.shadow-xl { box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1); }

.overflow-auto { overflow: auto; }
.overflow-hidden { overflow: hidden; }
.overflow-y-auto { overflow-y: auto; }

.cursor-pointer { cursor: pointer; }
.select-none { user-select: none; }

.opacity-0 { opacity: 0; }
.opacity-100 { opacity: 1; }

.transition { transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.transition-all { transition-property: all; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.transition-opacity { transition-property: opacity; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms; }
.duration-200 { transition-duration: 200ms; }
.duration-300 { transition-duration: 300ms; }

.hover\\:bg-gray-100:hover { background-color: #f3f4f6; }
.hover\\:bg-gray-200:hover { background-color: #e5e7eb; }
.hover\\:bg-blue-600:hover { background-color: #2563eb; }
.hover\\:bg-blue-700:hover { background-color: #1d4ed8; }
.hover\\:text-gray-700:hover { color: #374151; }

.bg-transparent { background-color: transparent; }
.bg-red-50 { background-color: #fef2f2; }
.border-red-200 { border-color: #fecaca; }
.text-red-700 { color: #b91c1c; }

.flex-1 { flex: 1 1 0%; }
.justify-start { justify-content: flex-start; }
.text-center { text-align: center; }

.mb-1 { margin-bottom: 0.25rem; }
.mb-3 { margin-bottom: 0.75rem; }
.mt-1 { margin-top: 0.25rem; }

.disabled\\:opacity-50:disabled { opacity: 0.5; }
.disabled\\:cursor-not-allowed:disabled { cursor: not-allowed; }

.z-\\[999999\\] { z-index: 999999; }
.z-\\[999998\\] { z-index: 999998; }

.top-0 { top: 0; }
.top-4 { top: 1rem; }
.right-0 { right: 0; }
.bottom-0 { bottom: 0; }
.left-0 { left: 0; }
.left-1\\/2 { left: 50%; }
.inset-0 { inset: 0; }

.-translate-x-1\\/2 { transform: translateX(-50%); }

.cursor-crosshair { cursor: crosshair; }

.whitespace-pre-wrap { white-space: pre-wrap; }
.break-words { overflow-wrap: break-word; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.leading-relaxed { line-height: 1.625; }

/* Animation for loading */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin { animation: spin 1s linear infinite; }

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}

/* Base font family */
.font-sans {
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
`;

/**
 * Create an isolated Shadow DOM container for rendering React components.
 * Prevents host page CSS from affecting extension UI.
 */
export function createShadowContainer(id: string): ShadowContainer {
  // Check if container already exists
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
  }

  // Create host element
  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all: initial; position: fixed; z-index: 999999;';
  document.body.appendChild(host);

  // Create shadow root
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles
  const styleElement = document.createElement('style');
  styleElement.textContent = SHADOW_STYLES;
  shadow.appendChild(styleElement);

  // Create mount point for React
  const mountPoint = document.createElement('div');
  mountPoint.className = 'font-sans';
  shadow.appendChild(mountPoint);

  // Create React root
  let root: Root | null = createRoot(mountPoint);

  return {
    host,
    shadow,
    render(component: ReactNode) {
      if (root) {
        root.render(component);
      }
    },
    destroy() {
      if (root) {
        root.unmount();
        root = null;
      }
      host.remove();
    },
  };
}

/**
 * Get or create a shadow container by ID.
 * Returns existing container if already created.
 */
const containers = new Map<string, ShadowContainer>();

export function getShadowContainer(id: string): ShadowContainer {
  let container = containers.get(id);
  if (!container) {
    container = createShadowContainer(id);
    containers.set(id, container);
  }
  return container;
}

/**
 * Destroy a shadow container by ID.
 */
export function destroyShadowContainer(id: string): void {
  const container = containers.get(id);
  if (container) {
    container.destroy();
    containers.delete(id);
  }
}

/**
 * Destroy all shadow containers.
 */
export function destroyAllShadowContainers(): void {
  containers.forEach((container) => container.destroy());
  containers.clear();
}
