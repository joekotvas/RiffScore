/**
 * System Layout Engine
 *
 * Handles multi-staff synchronization for vertically aligned measures.
 * Ensures that events at the same rhythmic position align across staves.
 */

import { CONFIG } from '@/config';
import { getNoteDuration } from '@/utils/core';
import { NOTE_SPACING, NOTE_SPACING_BASE_UNIT, LAYOUT } from '@/constants';
import { beamedEventIds } from './beaming';
import { inkAdvance, collisionAdvance } from './ink';
import { getEventMetrics } from './measure';
import { ScoreEvent, Note } from './types';
import { calculateChordLayout } from './positioning';
import { getTupletGroup, getTupletUnifiedDirection } from './tuplets';
import { pitchHasAlteration } from '@/services/MusicService';
import { resolveMeasureAccidentals, type AccidentalGlyphDecision } from '@/utils/accidentalContext';

// --- CONSTANTS ---

/** Padding added before noteheads when accidentals are present */
const ACCIDENTAL_PADDING = LAYOUT.ACCIDENTAL_PADDING;

/** Minimum width factors for short-duration notes */

// --- HELPERS ---

/**
 * Collects all unique time boundaries (quants) across all measures.
 * Used to create a grid of synchronized positions for multi-staff alignment.
 *
 * @param measures - Array of measure objects, each containing events
 * @returns Sorted array of quant positions where events start or end
 */
const getSystemTimePoints = (measures: { events: ScoreEvent[] }[]): number[] => {
  const points = new Set<number>([0]);

  measures.forEach((measure) => {
    let q = 0;
    measure.events.forEach((event) => {
      points.add(q); // Start of event
      q += getNoteDuration(event.duration, event.dotted, event.tuplet);
      points.add(q); // End of event
    });
  });

  return Array.from(points).sort((a, b) => a - b);
};

/**
 * Finds the event that starts at a specific quant position.
 * Uses linear search with early termination for efficiency.
 *
 * @param events - List of events in the measure
 * @param targetQuant - The quant position to search for
 * @returns The event starting at that quant, or null if none found
 */
const findEventAtQuant = (events: ScoreEvent[], targetQuant: number): ScoreEvent | null => {
  let q = 0;
  for (const event of events) {
    if (q === targetQuant) return event;
    q += getNoteDuration(event.duration, event.dotted, event.tuplet);
    if (q > targetQuant) return null; // Passed target, no match
  }
  return null;
};

/**
 * The stem direction an unbeamed note is drawn with (so which side its flag is on): its
 * chord's own direction, or its tuplet's unified direction — the same rules measure.ts applies.
 */
const drawnStemDirection = (
  events: ScoreEvent[],
  event: ScoreEvent,
  clef: string
): 'up' | 'down' => {
  if (event.tuplet) {
    const index = events.indexOf(event);
    const startIndex = Math.max(0, index - (event.tuplet.position ?? 0));
    const group = getTupletGroup(events, startIndex);
    if (group.includes(event)) return getTupletUnifiedDirection(group, clef);
  }
  return calculateChordLayout(event.notes, clef).direction;
};

/**
 * Calculates extra padding required for an event based on its visual properties.
 * Considers accidentals, second intervals (close note pairs), and dots.
 *
 * @param event - The score event to analyze
 * @returns Additional padding in pixels needed before the next event
 */
const calculateEventPadding = (
  event: ScoreEvent,
  accidentalGlyphs?: Record<string, AccidentalGlyphDecision | null>
): number => {
  let padding = 0;

  // Reserve for the glyph the renderer will DRAW (matching measure.ts exactly so
  // the two layout engines never drift). When the resolved glyph map is present,
  // a cancelling natural reserves space too; otherwise fall back to the pitch rule.
  const hasAccidental = accidentalGlyphs
    ? event.notes.some((n: Note) => accidentalGlyphs[n.id] != null)
    : event.notes.some((n: Note) => pitchHasAlteration(n.pitch));
  if (hasAccidental) {
    padding = Math.max(padding, ACCIDENTAL_PADDING);
  }

  const chordLayout = calculateChordLayout(event.notes, 'treble');
  const hasSecond = Object.values(chordLayout.noteOffsets).some((v) => v !== 0);
  if (hasSecond) {
    padding = Math.max(padding, LAYOUT.SECOND_INTERVAL_SPACE);
    if (hasAccidental) {
      padding = Math.max(padding, LAYOUT.SECOND_INTERVAL_SPACE + ACCIDENTAL_PADDING * 0.5);
    }
  }

  if (event.dotted) {
    padding = Math.max(padding, NOTE_SPACING_BASE_UNIT * 0.5);
  }

  return padding;
};

/**
 * Calculates the width required for a specific time segment.
 * Checks all measures at this quant to find the maximum width needed
 * for proper vertical alignment across staves.
 *
 * @param startQuant - Start of the time segment
 * @param endQuant - End of the time segment
 * @param measures - All measures being synchronized
 * @returns Required width in pixels for this segment
 */
const getSegmentWidthRequirement = (
  startQuant: number,
  endQuant: number,
  measures: { events: ScoreEvent[]; clef?: string }[],
  accidentalGlyphsByMeasure?: Record<string, AccidentalGlyphDecision | null>[],
  beamedIdsByMeasure?: ReadonlySet<string>[]
): number => {
  const segmentDuration = endQuant - startQuant;
  let maxSegmentWidth = NOTE_SPACING.UNIT * Math.sqrt(segmentDuration);
  let maxExtraPadding = 0;

  measures.forEach((measure, idx) => {
    const event = findEventAtQuant(measure.events, startQuant);
    if (!event) return;

    // Check minimum width for short notes (same floor as getNoteWidth)
    const minWidth = NOTE_SPACING.MIN_WIDTH[event.duration] ?? 0;
    maxSegmentWidth = Math.max(maxSegmentWidth, minWidth);

    // Ink: an unbeamed note's flag or a short rest's glyph must clear the next event's glyph.
    // The flag's side follows the stem, which the clef decides (same rule as the renderer and
    // measure.ts), so a down-stem flag reserves only its narrower extent.
    const flagged = !event.isRest && !(beamedIdsByMeasure?.[idx]?.has(event.id) ?? false);
    const next = findEventAtQuant(measure.events, endQuant) ?? undefined;
    const clef = measure.clef ?? (idx === 0 ? 'treble' : 'bass');
    const stemDirection = flagged ? drawnStemDirection(measure.events, event, clef) : 'up';
    maxSegmentWidth = Math.max(maxSegmentWidth, inkAdvance(event, next, flagged, stemDirection));

    // Calculate padding requirements
    const padding = calculateEventPadding(event, accidentalGlyphsByMeasure?.[idx]);
    maxExtraPadding = Math.max(maxExtraPadding, padding);
  });

  return maxSegmentWidth + maxExtraPadding;
};

// --- MAIN EXPORT ---

/**
 * Calculates a unified layout for a system (group of measures vertically aligned).
 *
 * Process:
 * 1. Collect all unique time points across all measures
 * 2. For each time segment, calculate the maximum required width
 * 3. Build a mapping from quant position to X coordinate
 *
 * @param measures - Array of measures at the same index across all staves, each with its
 *   staff's clef (decides flagged notes' stem side; defaults to treble for the first staff and
 *   bass below it, as the score layout does)
 * @returns Map of Quant -> X Position for synchronized positioning
 */
export const calculateSystemLayout = (
  measures: { events: ScoreEvent[]; clef?: string }[],
  keySignature: string = 'C',
  tieStopsByStaff?: ReadonlyArray<ReadonlySet<string> | undefined>,
  timeSignature: string = '4/4',
  eventWidths?: ReadonlyMap<string, number>
): Record<number, number> => {
  const timePoints = getSystemTimePoints(measures);
  const quantToX: Record<number, number> = { [timePoints[0]]: CONFIG.measurePaddingLeft };

  // Resolve each measure's rendered accidental glyphs once (full measure memory),
  // so segment-width reservation matches the drawn glyph including cancelling
  // naturals — same engine as the renderer and exporters (#234).
  const accidentalGlyphsByMeasure = measures.map((m, staffIndex) =>
    resolveMeasureAccidentals(m.events, keySignature, { tieStops: tieStopsByStaff?.[staffIndex] })
  );
  const beamedIdsByMeasure = measures.map((m) => beamedEventIds(m.events, timeSignature));

  let currentX = CONFIG.measurePaddingLeft;

  for (let i = 0; i < timePoints.length - 1; i++) {
    const startQuant = timePoints[i];
    const endQuant = timePoints[i + 1];

    const segmentWidth = getSegmentWidthRequirement(
      startQuant,
      endQuant,
      measures,
      accidentalGlyphsByMeasure,
      beamedIdsByMeasure
    );

    currentX += segmentWidth;
    quantToX[endQuant] = currentX;
  }

  // Rhythmic segments may be split by another staff. Enforce clearance between
  // each staff's adjacent *events* on the shared grid, so all staves move together.
  const constraints = new Map<number, { from: number; distance: number }[]>();
  measures.forEach((measure, staffIndex) => {
    let quant = 0;
    const glyphs = accidentalGlyphsByMeasure[staffIndex];
    const beamed = beamedIdsByMeasure[staffIndex];
    const clef = measure.clef ?? (staffIndex === 0 ? 'treble' : 'bass');
    measure.events.forEach((event, index) => {
      const nextQuant = quant + getNoteDuration(event.duration, event.dotted, event.tuplet);
      const next = measure.events[index + 1];
      if (next) {
        const direction = drawnStemDirection(measure.events, event, clef);
        const nextDirection = drawnStemDirection(measure.events, next, clef);
        const first = getEventMetrics(event, clef, glyphs, beamed.has(event.id), next, direction);
        const second = getEventMetrics(
          next,
          clef,
          glyphs,
          beamed.has(next.id),
          undefined,
          nextDirection
        );
        const distance =
          collisionAdvance(event, next, clef, glyphs, beamed, direction, nextDirection) +
          first.accidentalSpace +
          Math.abs(first.minOffset) -
          second.accidentalSpace -
          Math.abs(second.minOffset);
        const entries = constraints.get(nextQuant) ?? [];
        entries.push({ from: quant, distance });
        constraints.set(nextQuant, entries);
      }
      quant = nextQuant;
    });
  });
  // Centered text lanes share the rhythmic grid across all staves. Reserve both
  // edges even for a single event, and propagate constraints through split beats.
  let firstInset = 0;
  if (eventWidths?.size)
    measures.forEach((measure, staffIndex) => {
      let quant = 0;
      measure.events.forEach((event, index) => {
        const half = (eventWidths?.get(event.id) ?? 0) / 2;
        const next = measure.events[index + 1];
        const nextHalf = ((next && eventWidths?.get(next.id)) || 0) / 2;
        const nextQuant = quant + getNoteDuration(event.duration, event.dotted, event.tuplet);
        if (half || nextHalf) {
          const clef = measure.clef ?? (staffIndex === 0 ? 'treble' : 'bass');
          const offset = (item: ScoreEvent, following?: ScoreEvent): number => {
            const metrics = getEventMetrics(
              item,
              clef,
              accidentalGlyphsByMeasure[staffIndex],
              beamedIdsByMeasure[staffIndex].has(item.id),
              following,
              drawnStemDirection(measure.events, item, clef)
            );
            return metrics.accidentalSpace + Math.abs(metrics.minOffset);
          };
          const currentOffset = offset(event, next);
          const nextOffset = next ? offset(next) : 0;
          if (index === 0) firstInset = Math.max(firstInset, half - currentOffset);
          const entries = constraints.get(nextQuant) ?? [];
          entries.push({ from: quant, distance: half + nextHalf + 8 + currentOffset - nextOffset });
          constraints.set(nextQuant, entries);
        }
        quant = nextQuant;
      });
    });
  let shift = firstInset;
  for (const quant of timePoints) {
    const originalX = quantToX[quant];
    let x = originalX + shift;
    for (const constraint of constraints.get(quant) ?? []) {
      x = Math.max(x, quantToX[constraint.from] + constraint.distance);
    }
    shift = x - originalX;
    quantToX[quant] = x;
  }
  return quantToX;
};
