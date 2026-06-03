import { useState, useCallback, useEffect, useRef } from 'react';
import { CONFIG } from '@/config';

interface UseZoomDragProps {
  /** Current zoom value (percentage, e.g., 100 for 100%) */
  value: number;
  /** Callback when zoom changes */
  onChange: (value: number) => void;
  /** Minimum zoom value (default from CONFIG) */
  min?: number;
  /** Maximum zoom value (default from CONFIG) */
  max?: number;
  /** Step size per pixel dragged (default from CONFIG) */
  step?: number;
}

interface UseZoomDragReturn {
  /** Whether the user is currently dragging */
  isDragging: boolean;
  /** Mouse down handler for the drag handle */
  handleMouseDown: (e: React.MouseEvent) => void;
  /** Current cursor style to apply */
  cursor: 'ew-resize' | 'default';
}

/**
 * Hook for Figma-style horizontal drag-to-zoom functionality.
 * Drag left to decrease zoom, drag right to increase zoom.
 *
 * @tested src/__tests__/hooks/useZoomDrag.test.ts
 */
export const useZoomDrag = ({
  value,
  onChange,
  min = CONFIG.footer.zoom.min,
  max = CONFIG.footer.zoom.max,
  step = CONFIG.footer.zoom.dragStep,
}: UseZoomDragProps): UseZoomDragReturn => {
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startXRef.current = e.clientX;
      startValueRef.current = value;
    },
    [value]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current;
      const newValue = Math.round(startValueRef.current + delta * step);
      const clampedValue = Math.max(min, Math.min(max, newValue));

      if (clampedValue !== value) {
        onChange(clampedValue);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, value, onChange, min, max, step]);

  return {
    isDragging,
    handleMouseDown,
    cursor: isDragging ? 'ew-resize' : 'default',
  };
};
