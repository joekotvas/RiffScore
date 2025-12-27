/**
 * useCursorLayout.ts
 *
 * Focused hook for calculating playback cursor position.
 * Consumes the centralized ScoreLayout to avoid duplicate calculations.
 *
 * @see Issue #109
 */
import { useMemo } from 'react';
import { ScoreLayout, MeasureLayoutV2 } from '@/engines/layout/types';

interface PlaybackPosition {
  measureIndex: number | null;
  quant: number | null;
  duration: number;
}

interface CursorLayout {
  x: number | null;
  width: number;
  isGrandStaff: boolean;
  numStaves: number;
}

/**
 * Calculates playback cursor position from centralized layout.
 *
 * @param layout - ScoreLayout from useScoreLayout (SSOT)
 * @param playbackPosition - Current playback position
 * @returns Cursor x position and width
 */
export const useCursorLayout = (
  layout: ScoreLayout,
  playbackPosition: PlaybackPosition
): CursorLayout => {
  const numStaves = layout.staves.length;
  const isGrandStaff = numStaves > 1;

  const cursor = useMemo(() => {
    // No layout or single staff - no unified cursor needed
    if (!isGrandStaff || layout.staves.length === 0) {
      return { x: null, width: 0 };
    }

    const { measureIndex, quant } = playbackPosition;
    if (measureIndex === null || quant === null) {
      return { x: null, width: 0 };
    }

    // Use first staff as reference (all staves share same measure positions)
    const referenceStaff = layout.staves[0];
    if (!referenceStaff?.measures) {
      return { x: null, width: 0 };
    }

    // Get measure layout
    const measureLayout = referenceStaff.measures[measureIndex];
    if (!measureLayout) {
      return { x: null, width: 0 };
    }

    // Calculate X position using legacyLayout's forcedPositions
    const forcedPositions = measureLayout.legacyLayout?.eventPositions;
    if (!forcedPositions) {
      return { x: measureLayout.x, width: 20 };
    }

    // Find position for this quant
    const quantPosition = getQuantPosition(measureLayout, quant);

    return {
      x: measureLayout.x + quantPosition.x,
      width: quantPosition.width,
    };
  }, [isGrandStaff, layout.staves, playbackPosition]);

  return {
    x: cursor.x,
    width: cursor.width,
    isGrandStaff,
    numStaves,
  };
};

// --- Helper ---

interface QuantPosition {
  x: number;
  width: number;
}

/** Calculate cursor position within a measure for a given quant value */
const getQuantPosition = (measureLayout: MeasureLayoutV2, quant: number): QuantPosition => {
  const legacyLayout = measureLayout.legacyLayout;
  if (!legacyLayout) {
    return { x: 0, width: 20 };
  }

  const eventPositions = legacyLayout.eventPositions;
  const events = legacyLayout.processedEvents;

  if (events.length === 0) {
    return { x: 0, width: 20 };
  }

  // event.quant is the START position of the event, not its duration
  // Find the event whose start position is <= quant and whose next event starts after quant
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const eventStartQuant = event.quant ?? 0;
    const nextEventStartQuant = i < events.length - 1 ? (events[i + 1].quant ?? 0) : Infinity;

    if (eventStartQuant <= quant && quant < nextEventStartQuant) {
      // Found the event covering this quant
      const cursorX = eventPositions[event.id] ?? 0;

      // Calculate width to next event
      let cursorWidth: number;
      if (i < events.length - 1) {
        const nextEventX = eventPositions[events[i + 1].id] ?? measureLayout.width;
        cursorWidth = nextEventX - cursorX;
      } else {
        // Last event - width to end of measure
        cursorWidth = measureLayout.width - cursorX;
      }

      return { x: cursorX, width: Math.max(cursorWidth, 20) };
    }
  }

  // Fallback: quant is beyond all events, position at last event
  const lastEvent = events[events.length - 1];
  const lastX = eventPositions[lastEvent.id] ?? 0;
  return { x: lastX, width: Math.max(measureLayout.width - lastX, 20) };
};
