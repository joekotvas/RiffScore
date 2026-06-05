import { useMemo } from 'react';
import { ScoreEvent } from '@/types';
import {
  calculateMeasureLayout,
  calculateBeamingGroups,
  applyMeasureCentering,
} from '@/engines/layout';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import { BeamGroup } from '@/engines/layout/types';

/**
 * Hook to compute all layout-related data for a measure.
 *
 * Consolidates:
 * - Measure layout (hit zones, event positions, total width)
 * - Event centering for Grand Staff alignment
 * - Beam grouping for 8th/16th notes
 * - Tuplet bracket positioning
 *
 * @param events - The events in the measure
 * @param clef - The clef type ('treble' | 'bass')
 * @param isPickup - Whether this is a pickup measure
 * @param forcedEventPositions - Optional forced positions from Grand Staff sync
 * @param forcedWidth - Optional forced width from Grand Staff sync
 * @param stretchFactor - Optional stretch factor for justified systems (default: 1.0)
 * @param keySignature - Key signature so accidental spacing matches the rendered
 *   glyph (cancelling naturals included); default 'C'. This is the page-view
 *   (justified) layout path, so it must thread the key like scoreLayout does (#234).
 * @param timeSignature - Optional time signature for meter-aware beam grouping (default: '4/4')
 */
export function useMeasureLayout(
  events: ScoreEvent[],
  clef: string,
  isPickup: boolean,
  forcedEventPositions?: Record<string, number>,
  forcedWidth?: number,
  stretchFactor: number = 1.0,
  keySignature: string = 'C',
  timeSignature: string = '4/4'
) {
  // Core measure layout
  const measureLayout = useMemo(() => {
    return calculateMeasureLayout(
      events,
      undefined,
      clef,
      isPickup,
      forcedEventPositions,
      stretchFactor,
      keySignature
    );
  }, [events, clef, isPickup, forcedEventPositions, stretchFactor, keySignature]);

  const { hitZones, eventPositions, totalWidth, processedEvents } = measureLayout;

  // Effective width (Grand Staff may force a specific width)
  const effectiveWidth = forcedWidth || totalWidth;

  // Re-center events if width is forced and we have a rest placeholder
  const centeredEvents = useMemo(() => {
    if (
      forcedWidth &&
      processedEvents.length === 1 &&
      processedEvents[0].id === 'rest-placeholder'
    ) {
      return applyMeasureCentering(processedEvents, effectiveWidth);
    }
    return processedEvents;
  }, [processedEvents, forcedWidth, effectiveWidth]);

  // Beam grouping for 8th/16th notes (meter-aware via timeSignature)
  const beamGroups = useMemo(() => {
    return calculateBeamingGroups(events, eventPositions, clef, timeSignature);
  }, [events, eventPositions, clef, timeSignature]) as BeamGroup[];

  // Tuplet bracket positioning (beams passed so a beamed tuplet bracket parallels its beam)
  const tupletGroups = useMemo(() => {
    return calculateTupletBrackets(centeredEvents, eventPositions, clef, beamGroups);
  }, [centeredEvents, eventPositions, clef, beamGroups]);

  return {
    hitZones,
    eventPositions,
    totalWidth,
    effectiveWidth,
    centeredEvents,
    beamGroups,
    tupletGroups,
  };
}
