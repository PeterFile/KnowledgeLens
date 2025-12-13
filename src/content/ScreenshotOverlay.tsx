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

// Custom crosshair cursor (white with black outline for visibility)
const CROSSHAIR_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cline x1='16' y1='0' x2='16' y2='32' stroke='white' stroke-width='2'/%3E%3Cline x1='0' y1='16' x2='32' y2='16' stroke='white' stroke-width='2'/%3E%3Cline x1='16' y1='0' x2='16' y2='32' stroke='%234F46E5' stroke-width='1'/%3E%3Cline x1='0' y1='16' x2='32' y2='16' stroke='%234F46E5' stroke-width='1'/%3E%3Ccircle cx='16' cy='16' r='3' fill='none' stroke='%234F46E5' stroke-width='1'/%3E%3C/svg%3E") 16 16, crosshair`;

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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999998,
        cursor: CROSSHAIR_CURSOR,
        userSelect: 'none',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Instructions */}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          zIndex: 999999,
        }}
      >
        <span style={{ fontSize: '14px', color: '#374151' }}>
          Drag to select a region • Press ESC to cancel
        </span>
        <button
          data-cancel-button
          onClick={onCancel}
          style={{
            padding: '4px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            color: '#6b7280',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
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
