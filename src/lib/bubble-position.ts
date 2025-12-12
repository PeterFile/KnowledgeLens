// Bubble positioning utility
// Requirements: 2.1 - Show bubble near selection within viewport bounds

export interface BubblePosition {
  left: number;
  top: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface SelectionPosition {
  x: number;
  y: number;
}

// Bubble dimensions (approximate)
const BUBBLE_WIDTH = 160;
const BUBBLE_HEIGHT = 60;
const BUBBLE_OFFSET = 8;

/**
 * Calculate the position for the floating bubble.
 * Ensures the bubble stays within viewport bounds while remaining near the selection.
 *
 * @param selectionPos - The position of the text selection (typically bottom-right)
 * @param viewport - The viewport dimensions
 * @param scrollY - Current vertical scroll position (default 0)
 * @returns The calculated bubble position (left, top)
 */
export function calculateBubblePosition(
  selectionPos: SelectionPosition,
  viewport: ViewportDimensions,
  scrollY = 0
): BubblePosition {
  // Calculate initial position with offset from selection
  const initialLeft = selectionPos.x + BUBBLE_OFFSET;
  const initialTop = selectionPos.y - scrollY + BUBBLE_OFFSET;

  // Clamp to viewport bounds
  const left = Math.min(initialLeft, viewport.width - BUBBLE_WIDTH);
  const top = Math.min(initialTop, viewport.height - BUBBLE_HEIGHT);

  return { left, top };
}

/**
 * Check if a bubble position is within viewport bounds.
 */
export function isWithinViewport(position: BubblePosition, viewport: ViewportDimensions): boolean {
  return (
    position.left >= 0 &&
    position.top >= 0 &&
    position.left <= viewport.width - BUBBLE_WIDTH &&
    position.top <= viewport.height - BUBBLE_HEIGHT
  );
}

/**
 * Check if the bubble is near the selection (within reasonable distance).
 * "Near" means within BUBBLE_OFFSET + some tolerance from the selection point.
 */
export function isNearSelection(
  bubblePos: BubblePosition,
  selectionPos: SelectionPosition,
  scrollY = 0,
  tolerance = 200
): boolean {
  const adjustedSelectionY = selectionPos.y - scrollY;
  const distanceX = Math.abs(bubblePos.left - selectionPos.x);
  const distanceY = Math.abs(bubblePos.top - adjustedSelectionY);

  return distanceX <= tolerance && distanceY <= tolerance;
}

export { BUBBLE_WIDTH, BUBBLE_HEIGHT, BUBBLE_OFFSET };
