import { useEffect, useCallback } from 'react';
import type { ScoreLayout } from '@/engines/layout/types';
import type { Selection, PreviewNote } from '@/types';

interface UseAutoScrollProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  layout: ScoreLayout;
  selection: Selection;
  playbackPosition: { measureIndex: number | null; quant: number | null; duration: number };
  previewNote: PreviewNote | null;
  scale: number;
  originX?: number;
  enabled?: boolean;
}

/** Follow canonical engraving coordinates; never reconstruct a second measure layout. */
export const useAutoScroll = ({
  containerRef,
  layout,
  selection,
  playbackPosition,
  previewNote,
  scale,
  originX = 0,
  enabled = true,
}: UseAutoScrollProps): void => {
  const scrollToX = useCallback(
    (x: number | null) => {
      const container = containerRef.current;
      if (!enabled || !container || !container.clientWidth || x === null || !Number.isFinite(x))
        return;
      const target = (x - originX) * scale;
      const padding = Math.min(100, container.clientWidth / 4);
      const { scrollLeft, clientWidth, scrollWidth } = container;
      const left =
        target < scrollLeft + padding
          ? target - padding
          : target > scrollLeft + clientWidth - padding
            ? target - clientWidth + padding
            : scrollLeft;
      const next = Math.max(0, Math.min(left, scrollWidth - clientWidth));
      if (Math.abs(next - scrollLeft) > 1) {
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        container.scrollTo({ left: next, behavior: reducedMotion ? 'auto' : 'smooth' });
      }
    },
    [containerRef, enabled, originX, scale]
  );

  const quantX = useCallback(
    (measure: number, quant: number): number | null => {
      const origin = layout.getX.measureOrigin({ measure });
      const local = layout.getX({ measure, quant });
      return origin === null || local === null ? null : origin + local;
    },
    [layout]
  );

  useEffect(() => {
    if (selection.measureIndex === null || !selection.eventId) return;
    const measure = layout.staves[selection.staffIndex ?? 0]?.measures[selection.measureIndex];
    const event = measure?.events[selection.eventId];
    if (measure && event) scrollToX(measure.x + event.localX);
  }, [layout, selection.staffIndex, selection.measureIndex, selection.eventId, scrollToX]);

  useEffect(() => {
    if (previewNote?.source !== 'keyboard') return;
    scrollToX(quantX(previewNote.measureIndex, previewNote.visualQuant));
  }, [previewNote, quantX, scrollToX]);

  useEffect(() => {
    if (playbackPosition.measureIndex === null || playbackPosition.quant === null) return;
    scrollToX(quantX(playbackPosition.measureIndex, playbackPosition.quant));
  }, [playbackPosition.measureIndex, playbackPosition.quant, quantX, scrollToX]);
};
