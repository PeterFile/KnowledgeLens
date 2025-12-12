// Screenshot Overlay component for region selection
// Requirements: 5.1, 5.2 - Dim background, drag selection for region

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ScreenshotRegion } from '../types';

interface ScreenshotOverlayProps {
  onCapture: (region: ScreenshotRegion) => void;
  onCancel: () => void;
}

interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// Close icon
const CloseIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export function ScreenshotOverlay({ onCapture, onCancel }: ScreenshotOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Calculate normalized selection box (handles drag in any direction)
  const getNormalizedSelection = useCallback((box: SelectionBox) => {
    const x = Math.min(box.startX, box.endX);
    const y = Math.min(box.startY, box.endY);
    const width = Math.abs(box.endX - box.startX);
    const height = Math.abs(box.endY - box.startY);
    return { x, y, width, height };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Ignore if clicking on the cancel button
    if ((e.target as HTMLElement).closest('[data-cancel-button]')) {
      return;
    }

    e.preventDefault();
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX;
    const y = e.clientY;

    setIsDragging(true);
    setSelection({
      startX: x,
      startY: y,
      endX: x,
      endY: y,
    });
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !selection) return;

      e.preventDefault();
      setSelection((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          endX: e.clientX,
          endY: e.clientY,
        };
      });
    },
    [isDragging, selection]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !selection) return;

      e.preventDefault();
      setIsDragging(false);

      const normalized = getNormalizedSelection(selection);

      // Minimum selection size (10x10 pixels)
      if (normalized.width < 10 || normalized.height < 10) {
        setSelection(null);
        return;
      }

      // Create region with device pixel ratio for high-DPI displays
      const region: ScreenshotRegion = {
        x: normalized.x,
        y: normalized.y,
        width: normalized.width,
        height: normalized.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      };

      onCapture(region);
    },
    [isDragging, selection, getNormalizedSelection, onCapture]
  );

  // Handle escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Render selection box style
  const getSelectionStyle = (): React.CSSProperties | undefined => {
    if (!selection) return undefined;

    const normalized = getNormalizedSelection(selection);
    return {
      position: 'fixed',
      left: normalized.x,
      top: normalized.y,
      width: normalized.width,
      height: normalized.height,
      border: '2px dashed #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      pointerEvents: 'none',
      zIndex: 999999,
    };
  };

  return (
    <div
      ref={overlayRef}
      data-knowledgelens="screenshot-overlay"
      className="fixed inset-0 z-[999998] cursor-crosshair select-none"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Instructions */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-3 z-[999999]"
        style={{ transform: 'translateX(-50%)' }}
      >
        <span className="text-sm text-gray-700">Drag to select a region • Press ESC to cancel</span>
        <button
          data-cancel-button
          onClick={onCancel}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 cursor-pointer transition border-0 bg-transparent"
          title="Cancel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Selection box */}
      {selection && <div style={getSelectionStyle()} />}
    </div>
  );
}
