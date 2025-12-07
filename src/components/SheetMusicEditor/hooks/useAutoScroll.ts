import { useEffect } from 'react';
import { CONFIG } from '../config';
import { calculateMeasureWidth, calculateMeasureLayout, calculateHeaderLayout } from '../engines/layout';
import { getActiveStaff, Score, Selection } from '../types';

interface UseAutoScrollProps {
  containerRef: React.RefObject<HTMLDivElement>;
  score: Score;
  selection: Selection;
  playbackPosition: { measureIndex: number | null; eventIndex: number | null; duration: number };
  previewNote: any;
  scale: number;
}

export const useAutoScroll = ({
  containerRef,
  score,
  selection,
  playbackPosition,
  previewNote,
  scale
}: UseAutoScrollProps) => {

  const activeStaff = getActiveStaff(score);
  const keySignature = score.keySignature || activeStaff.keySignature || 'C';
  const clef = score.staves.length >= 2 ? 'grand' : (activeStaff.clef || 'treble');

  // Auto-Scroll for Selection / Preview
  useEffect(() => {
    if (!containerRef.current) return;

    let targetX: number | null = null;
    let targetMeasureIndex: number | null = null;

    if (selection.measureIndex !== null && selection.eventId) {
      targetMeasureIndex = selection.measureIndex;
    } else if (previewNote) {
      targetMeasureIndex = previewNote.measureIndex;
    }

    if (targetMeasureIndex !== null) {
      const { startOfMeasures } = calculateHeaderLayout(keySignature);

      let currentMeasureX = startOfMeasures;
      
      for (let i = 0; i < targetMeasureIndex; i++) {
        if (getActiveStaff(score).measures[i]) {
          currentMeasureX += calculateMeasureWidth(getActiveStaff(score).measures[i].events, getActiveStaff(score).measures[i].isPickup);
        }
      }

      const measure = getActiveStaff(score).measures[targetMeasureIndex];
      if (measure) {
        const layout = calculateMeasureLayout(measure.events, undefined, clef);
        
        if (selection.measureIndex !== null) {
          targetX = currentMeasureX + (layout.eventPositions[selection.eventId!] || 0);
        } else if (previewNote) {
          if (previewNote.mode === 'APPEND') {
            targetX = currentMeasureX + layout.totalWidth - CONFIG.measurePaddingRight;
          } else if (previewNote.mode === 'INSERT') {
            if (previewNote.index !== undefined && previewNote.index > 0 && previewNote.index <= measure.events.length) {
              const prevEvent = measure.events[previewNote.index - 1];
              const prevX = layout.eventPositions[prevEvent.id];
              targetX = currentMeasureX + prevX + 30;
            } else {
              targetX = currentMeasureX + CONFIG.measurePaddingLeft;
            }
          } else {
            // Null check for index just in case
            if (previewNote.index !== null && previewNote.index !== undefined) {
                const event = measure.events[previewNote.index];
                if (event) {
                  targetX = currentMeasureX + (layout.eventPositions[event.id] || 0);
                }
            }
          }
        }
      }
    }

    if (targetX !== null) {
      const container = containerRef.current;
      const { scrollLeft, clientWidth } = container;
      const scaledX = targetX * scale;
      const padding = 100;

      if (scaledX > scrollLeft + clientWidth - padding) {
        container.scrollTo({
          left: scaledX - clientWidth + padding + 200,
          behavior: 'smooth'
        });
      } else if (scaledX < scrollLeft + padding) {
        container.scrollTo({
          left: Math.max(0, scaledX - padding - 100),
          behavior: 'smooth'
        });
      }
    }
  }, [selection, score, scale, keySignature, clef, previewNote, containerRef]);

  // Auto-Scroll for Playback Cursor
  useEffect(() => {
    if (!containerRef.current || playbackPosition.measureIndex === null) return;
    
    const container = containerRef.current;
    const { scrollLeft, clientWidth } = container;
    
    const { startOfMeasures } = calculateHeaderLayout(keySignature);

    let absX = startOfMeasures;
    const currentActiveStaff = getActiveStaff(score);
    const measures = currentActiveStaff.measures || [];

    for (let i = 0; i < playbackPosition.measureIndex; i++) {
      if (measures[i]) {
        absX += calculateMeasureWidth(measures[i].events, measures[i].isPickup);
      }
    }
    const measure = measures[playbackPosition.measureIndex];
    if (measure && measure.events[playbackPosition.eventIndex!]) {
      const layout = calculateMeasureLayout(measure.events, undefined, clef);
      const event = measure.events[playbackPosition.eventIndex!];
      absX += layout.eventPositions[event.id] || CONFIG.measurePaddingLeft;
    }
    
    const scaledX = absX * scale;
    const padding = 150;
    
    if (scaledX > scrollLeft + clientWidth - padding) {
      container.scrollTo({
        left: scaledX - clientWidth / 2,
        behavior: 'smooth'
      });
    } else if (scaledX < scrollLeft + padding) {
      container.scrollTo({
        left: Math.max(0, scaledX - clientWidth / 2),
        behavior: 'smooth'
      });
    }
  }, [playbackPosition, score, scale, keySignature, clef, containerRef]);
};
