import { ScoreEvent, TupletBracketGroup, BeamGroup } from './types';
import { getNoteDuration } from '@/utils/core';
import { getOffsetForPitch } from './positioning';
import { CONFIG } from '@/config';

import { TUPLET, STEM } from '@/constants';

/**
 * Helper to determine the events belonging to a tuplet group starting at a given index.
 * Uses ID-based grouping (priority) or falls back to legacy logic.
 */
export const getTupletGroup = (events: ScoreEvent[], startIndex: number): ScoreEvent[] => {
  const startEvent = events[startIndex];
  if (!startEvent.tuplet) return [];

  const groupEvents: ScoreEvent[] = [];
  const { groupSize } = startEvent.tuplet;

  // Priority 1: ID-based grouping (Robust)
  if (startEvent.tuplet.id) {
    const targetId = startEvent.tuplet.id;
    for (let j = 0; startIndex + j < events.length; j++) {
      const e = events[startIndex + j];
      if (e.tuplet && e.tuplet.id === targetId) {
        groupEvents.push(e);
      } else {
        break; // Stop if ID mismatch or no tuplet
      }
    }
  }
  // Priority 2: BaseDuration-based grouping (Dynamic)
  else if (startEvent.tuplet.baseDuration) {
    const { ratio: r, baseDuration } = startEvent.tuplet;
    const baseQuants = getNoteDuration(baseDuration, false);
    const targetQuants = r[0] * baseQuants;

    let currentQuants = 0;

    for (let j = 0; startIndex + j < events.length; j++) {
      const e = events[startIndex + j];
      const eventQuants = getNoteDuration(e.duration, e.dotted, undefined);
      currentQuants += eventQuants;
      groupEvents.push(e);

      if (currentQuants >= targetQuants) {
        break;
      }
    }
  }
  // Priority 3: GroupSize-based grouping (Legacy)
  else {
    for (let j = 0; j < groupSize && startIndex + j < events.length; j++) {
      groupEvents.push(events[startIndex + j]);
    }
  }

  return groupEvents;
};

export const calculateTupletBrackets = (
  events: ScoreEvent[],
  eventPositions: Record<string, number>,
  clef: string = 'treble',
  beamGroups: BeamGroup[] = []
): TupletBracketGroup[] => {
  const brackets: TupletBracketGroup[] = [];

  // Helper to get Y bounds of an event (top and bottom of everything: notes, stems)
  const getEventYBounds = (event: ScoreEvent, _dir: 'up' | 'down') => {
    // 1. Noteheads - filter out rest notes (null pitch)
    const realNotes = event.notes.filter((n) => n.pitch !== null);
    if (realNotes.length === 0) {
      // Rest event - use staff middle line as default
      const middleY = CONFIG.baseY + CONFIG.lineHeight * 2;
      return { topY: middleY, bottomY: middleY };
    }
    const noteYs = realNotes.map((n) => CONFIG.baseY + getOffsetForPitch(n.pitch!, clef));
    const minNoteY = Math.min(...noteYs);
    const maxNoteY = Math.max(...noteYs);

    // 2. Stem tip. A tuplet can span mixed values that form SEPARATE beams (or beamed +
    // unbeamed notes), so we resolve each event's real stem tip individually:
    //  - If the event belongs to a beam, its stem tip sits ON that beam's line at the
    //    event's x (so the bracket tracks the actual beamed stems, whatever their slope).
    //  - Otherwise (unbeamed: quarters, lone eighths) use the default stem length.
    const chordDir = event.chordLayout?.direction || 'down';
    const beam = beamGroups.find((b) => b.ids.includes(event.id));

    let topY = minNoteY;
    let bottomY = maxNoteY;

    if (beam && beam.endX !== beam.startX) {
      const beamSlope = (beam.endY - beam.startY) / (beam.endX - beam.startX);
      const beamY = beam.startY + beamSlope * ((eventPositions[event.id] ?? 0) - beam.startX);
      if (beam.direction === 'up') topY = Math.min(topY, beamY);
      else bottomY = Math.max(bottomY, beamY);
    } else {
      const stemLen = STEM.LENGTHS.default;
      if (chordDir === 'up') topY = Math.min(topY, minNoteY - stemLen);
      else bottomY = Math.max(bottomY, maxNoteY + stemLen);
    }

    return { topY, bottomY };
  };

  const processedIndices = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (processedIndices.has(i)) continue;

    const event = events[i];
    if (event.tuplet && event.tuplet.position === 0) {
      const groupEvents = getTupletGroup(events, i);

      // Mark indices as processed to avoid duplicates if we iterate differently later
      // (Though here we just iterate linearly, but good practice)
      // Actually, calculateTupletBrackets iterates all events.
      // We only care about position === 0.

      if (groupEvents.length === 0) continue;

      // 1. Determine Direction
      // Rule: Place on stem side.
      // If majority stems up -> Bracket Up (above).
      // If majority stems down -> Bracket Down (below).
      let upCount = 0;
      let downCount = 0;
      groupEvents.forEach((e) => {
        if (e.chordLayout?.direction === 'up') upCount++;
        else downCount++;
      });

      const direction = upCount >= downCount ? 'up' : 'down';

      // 2. Calculate Slope and Position
      // We want to draw a line from start to end that clears all "obstacles" on that side.
      // Calculate slope based on first and last note
      // Note: startX/endX are centers of note heads.
      // We want the bracket to extend to the outer edges of the note heads.

      // Calculate bounds based on ALL events in the group to ensure we cover everything
      // (handles potential unsorted events or layout anomalies)
      const xValues = groupEvents.map((e) => eventPositions[e.id] || 0);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);

      // Increase radius slightly to ensure it visually covers the note head fully
      const startX = minX - TUPLET.VISUAL_NOTE_RADIUS;
      const endX = maxX + TUPLET.VISUAL_NOTE_RADIUS;

      // Calculate Y bounds (top and bottom of the group)
      // const yBounds = groupEvents.map((e) => getEventYBounds(e, direction));
      // const topY = Math.min(...yBounds.map((b) => b.topY)); // Unused
      // const bottomY = Math.max(...yBounds.map((b) => b.bottomY)); // Unused

      // Calculate "Limit Y" for each event on the bracket side
      // If Up: Limit is topY (lowest value). We want bracket Y < topY.
      // If Down: Limit is bottomY (highest value). We want bracket Y > bottomY.

      const limits = groupEvents.map((e) => {
        const bounds = getEventYBounds(e, direction);
        return {
          x: eventPositions[e.id],
          y: direction === 'up' ? bounds.topY : bounds.bottomY,
        };
      });

      // Slope from the FIRST and LAST stem tips at their REAL x, so the bracket line is
      // collinear with the line through those tips: for a single beam that line IS the beam
      // (bracket runs parallel to it); for mixed/separate beams it tracks the outer contour.
      // y1/y2 are then extrapolated out to the bracket ends (startX/endX) along that slope.
      const first = limits[0];
      const last = limits[limits.length - 1];
      const padOff = direction === 'up' ? -TUPLET.PADDING : TUPLET.PADDING;
      let m = last.x === first.x ? 0 : (last.y - first.y) / (last.x - first.x);
      let y1 = first.y + m * (startX - first.x) + padOff;
      let y2 = first.y + m * (endX - first.x) + padOff;

      // Limit slope (max angle from constant)
      if (Math.abs(m) > TUPLET.MAX_SLOPE) {
        m = m > 0 ? TUPLET.MAX_SLOPE : -TUPLET.MAX_SLOPE;
        // Recenter
        const midX = (startX + endX) / 2;
        const midY = (y1 + y2) / 2;
        y1 = midY - m * (midX - startX);
        y2 = midY + m * (endX - midX);
      }

      // 3. Collision Detection & Shift
      let maxShift = 0;

      limits.forEach((limit) => {
        const targetY = y1 + m * (limit.x - startX);

        if (direction === 'up') {
          // We want targetY < limit.y (visually above)
          // If targetY > limit.y - PADDING, we are too low.
          // Shift needed: (limit.y - PADDING) - targetY
          // We want to subtract from Y (move up).
          // Let's define shift as positive = move AWAY (Up for up, Down for down)

          // Distance from limit to line (positive if line is below limit)
          const dist = targetY - (limit.y - TUPLET.PADDING);
          if (dist > 0) {
            maxShift = Math.max(maxShift, dist);
          }
        } else {
          // We want targetY > limit.y (visually below)
          // If targetY < limit.y + PADDING, we are too high.
          // Shift needed: (limit.y + PADDING) - targetY

          const dist = limit.y + TUPLET.PADDING - targetY;
          if (dist > 0) {
            maxShift = Math.max(maxShift, dist);
          }
        }
      });

      // Apply shift
      if (direction === 'up') {
        y1 -= maxShift;
        y2 -= maxShift;
      } else {
        y1 += maxShift;
        y2 += maxShift;
      }

      brackets.push({
        startX,
        endX,
        startY: y1,
        endY: y2,
        direction,
        number: event.tuplet.ratio[0],
      });
    }
  }

  return brackets;
};
