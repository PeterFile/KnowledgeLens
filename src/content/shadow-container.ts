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

// Brutalist styles to inject into Shadow DOM
const SHADOW_STYLES = `
/* Reset */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Utilities */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.gap-1 { gap: 0.25rem; }
.gap-2 { gap: 0.5rem; }
.inline-flex { display: inline-flex; }

/* Font Setup for Shadow DOM content */
.font-sans {
  font-family: "JetBrains Mono", system-ui, -apple-system, sans-serif;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-left: 1px solid #000;
}
::-webkit-scrollbar-thumb {
  background: #000;
  border: 1px solid #fff;
}
::-webkit-scrollbar-thumb:hover {
  background: #444;
}

/* Animations */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
`;

export function createShadowContainer(id: string): ShadowContainer {
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
  }

  const host = document.createElement('div');
  host.id = id;
  host.style.cssText = 'all: initial; position: fixed; z-index: 999999;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  const styleElement = document.createElement('style');
  styleElement.textContent = SHADOW_STYLES;
  shadow.appendChild(styleElement);

  const mountPoint = document.createElement('div');
  mountPoint.className = 'font-sans';
  shadow.appendChild(mountPoint);

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

const containers = new Map<string, ShadowContainer>();

export function getShadowContainer(id: string): ShadowContainer {
  let container = containers.get(id);
  if (!container) {
    container = createShadowContainer(id);
    containers.set(id, container);
  }
  return container;
}

export function destroyShadowContainer(id: string): void {
  const container = containers.get(id);
  if (container) {
    container.destroy();
    containers.delete(id);
  }
}

export function destroyAllShadowContainers(): void {
  containers.forEach((container) => container.destroy());
  containers.clear();
}
