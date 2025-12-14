import { useEffect, useCallback, useMemo } from 'react';
import { CONFIG } from '@/config';
import { calculateMeasureWidth, calculateMeasureLayout, calculateHeaderLayout } from '@/engines/layout';
import { getActiveStaff, Score, Selection } from '@/types';
import { getNoteDuration } from '@/utils/core';

// ------------------------------------------------------------------
// Types & Interfaces
// ------------------------------------------------------------------

interface PreviewNote {
  source?: 'hover' | 'keyboard' | string;
  measureIndex: number | null;
  mode: 'APPEND' | 'INSERT';
  index: number;
}

interface UseAutoScrollProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  score: Score;
  selection: Selection;
  playbackPosition: { measureIndex: number | null; quant: number | null; duration: number };
  previewNote: PreviewNote | null;
  scale: number;
}

type ScrollStrategy = 'scroll-to-start' | 'keep-in-view';

// ------------------------------------------------------------------
// Hook Implementation
// ------------------------------------------------------------------

export const useAutoScroll = ({
  containerRef,
  score,
  selection,
  playbackPosition,
  previewNote,
  scale
}: UseAutoScrollProps) => {

  // 1. Memoize Derived State
  const activeStaff = useMemo(() => getActiveStaff(score), [score]);
  
  const keySignature = useMemo(() => 
    score.keySignature || activeStaff.keySignature || 'C', 
  [score.keySignature, activeStaff.keySignature]);

  const clef = useMemo(() => 
    score.staves.length >= 2 ? 'grand' : (activeStaff.clef || 'treble'), 
  [score.staves.length, activeStaff.clef]);

  // 2. Memoized Cumulative Measure Widths (O(1) lookup during playback)
  // Cache invalidates when measures or keySignature changes
  const measureStartXCache = useMemo(() => {
    const { startOfMeasures } = calculateHeaderLayout(keySignature);
    const cache = [startOfMeasures];
    let x = startOfMeasures;
    
    for (const measure of activeStaff.measures || []) {
      x += calculateMeasureWidth(measure.events, measure.isPickup);
      cache.push(x);
    }
    return cache;
  }, [activeStaff.measures, keySignature]);

  // O(1) lookup instead of O(n) loop
  const getMeasureStartX = useCallback((targetIndex: number) => {
    return measureStartXCache[targetIndex] ?? measureStartXCache[0] ?? 0;
  }, [measureStartXCache]);

  // 3. Helper: Unified Scroll Executor
  const performScroll = useCallback((targetX: number, strategy: ScrollStrategy = 'keep-in-view') => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollLeft, clientWidth } = container;
    const scaledTargetX = targetX * scale;
    const padding = 100;

    let newScrollLeft = null;

    if (strategy === 'scroll-to-start') {
      // Place target at left edge of viewport (for playback)
      // Scroll if target is off-screen (left or right)
      const rightEdge = scrollLeft + clientWidth - padding;
      const leftEdge = scrollLeft + padding;
      
      if (scaledTargetX > rightEdge || scaledTargetX < leftEdge) {
        newScrollLeft = Math.max(0, scaledTargetX - padding);
      }
    } else {
      // 'keep-in-view': Only scroll if target is outside visible area
      const rightEdge = scrollLeft + clientWidth - padding;
      const leftEdge = scrollLeft + padding;

      if (scaledTargetX > rightEdge) {
        newScrollLeft = scaledTargetX - clientWidth + padding + 200; 
      } else if (scaledTargetX < leftEdge) {
        newScrollLeft = Math.max(0, scaledTargetX - padding - 100);
      }
    }

    if (newScrollLeft !== null) {
      container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    }
  }, [containerRef, scale]);

  // 4. Effect: Auto-Scroll for Selection
  useEffect(() => {
    if (selection.measureIndex === null || !selection.eventId) return;

    const measure = activeStaff.measures[selection.measureIndex];
    if (!measure) return;

    const measureStartX = getMeasureStartX(selection.measureIndex);
    const layout = calculateMeasureLayout(measure.events, undefined, clef);
    const eventOffset = layout.eventPositions[selection.eventId] || 0;
    
    performScroll(measureStartX + eventOffset, 'keep-in-view');

  }, [selection.measureIndex, selection.eventId, activeStaff, clef, getMeasureStartX, performScroll]);

  // 5. Effect: Auto-Scroll for Preview Note (Keyboard Only)
  useEffect(() => {
    if (!previewNote || previewNote.source === 'hover' || previewNote.measureIndex === null) return;

    const measure = activeStaff.measures[previewNote.measureIndex];
    if (!measure) return;

    const measureStartX = getMeasureStartX(previewNote.measureIndex);
    const layout = calculateMeasureLayout(measure.events, undefined, clef);
    
    let localOffsetX = CONFIG.measurePaddingLeft;

    if (previewNote.mode === 'APPEND') {
      localOffsetX = layout.totalWidth - CONFIG.measurePaddingRight;
    } else if (previewNote.mode === 'INSERT' && previewNote.index > 0) {
      const prevEvent = measure.events[previewNote.index - 1];
      const GAP_SPACING = 30; 
      localOffsetX = (layout.eventPositions[prevEvent?.id] || 0) + GAP_SPACING;
    }

    performScroll(measureStartX + localOffsetX, 'keep-in-view');

  }, [previewNote, activeStaff, clef, getMeasureStartX, performScroll]);

  // 6. Effect: Auto-Scroll for Playback
  useEffect(() => {
    if (playbackPosition.measureIndex === null || playbackPosition.quant === null) return;

    const measure = activeStaff.measures[playbackPosition.measureIndex];
    if (!measure) return; 

    const measureStartX = getMeasureStartX(playbackPosition.measureIndex);
    const layout = calculateMeasureLayout(measure.events, undefined, clef);

    let localOffsetX = CONFIG.measurePaddingLeft;
    let currentQuant = 0;
    let found = false;
    
    for (const event of measure.events) {
      if (currentQuant >= playbackPosition.quant) {
        localOffsetX = layout.eventPositions[event.id] || CONFIG.measurePaddingLeft;
        found = true;
        break;
      }
      currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
    }

    if (!found && currentQuant < playbackPosition.quant) {
      localOffsetX = layout.totalWidth - CONFIG.measurePaddingRight;
    }

    // Use 'scroll-to-start' strategy: scroll target to left edge when it goes off-screen
    performScroll(measureStartX + localOffsetX, 'scroll-to-start');

  }, [playbackPosition, activeStaff, clef, getMeasureStartX, performScroll]);
};
