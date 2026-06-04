import { ScoreEvent } from '@/types';
import { BeamGroup } from './types';
import { getNoteDuration } from '@/utils/core';
import { getOffsetForPitch, calculateChordLayout, getStemOffset } from './positioning';
import { CONFIG } from '@/config';
import { MIDDLE_LINE_Y, BEAMING } from '@/constants';

// Removed temporary interfaces

/**
 * Quants per whole note. The quant grid is defined so that a whole note spans
 * `CONFIG.quantsPerMeasure` quants in 4/4 (a whole-note-long measure). This makes
 * one quant = 1/64 of a whole note (with the default config of 64), so:
 *   quarter = 16 quants, eighth = 8 quants, sixteenth = 4 quants.
 * This matches DURATION_QUANTS in utils/core.
 */
const QUANTS_PER_WHOLE = CONFIG.quantsPerMeasure;

/**
 * Derives the beaming "beat" size (in quants) for a given time signature, from
 * first principles based on meter theory.
 *
 * - Simple meters (denominator beat): beat = one denominator note value.
 *   e.g. 4/4 -> quarter, 3/4 -> quarter, 2/4 -> quarter, 2/2 -> half, 3/8 -> eighth.
 * - Compound meters (numerator divisible by 3 and > 3, i.e. 6/8, 9/8, 12/8): the
 *   felt beat is a dotted note grouping three of the denominator value.
 *   e.g. 6/8 -> dotted quarter (3 eighths), 9/8 -> dotted quarter, 12/8 -> dotted quarter.
 *
 * Beams group within a single beat: notes never beam across a beat boundary.
 *
 * @param timeSignature - e.g. '4/4', '6/8', '3/4'. Defaults to 4/4 behavior on
 *   any unparseable or unknown value (regression-safe).
 * @returns The number of quants in one beaming beat.
 */
export const getBeamBeatQuants = (timeSignature = '4/4'): number => {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(timeSignature.trim());

  // Fallback: preserve historical 4/4 behavior (quarter-note beats) for any
  // value we cannot parse.
  if (!match) {
    return QUANTS_PER_WHOLE / 4;
  }

  const numerator = parseInt(match[1], 10);
  const denominator = parseInt(match[2], 10);

  if (numerator <= 0 || denominator <= 0) {
    return QUANTS_PER_WHOLE / 4;
  }

  // Quants in one denominator-unit note (e.g. /8 -> eighth-note quants).
  const denominatorUnitQuants = QUANTS_PER_WHOLE / denominator;

  // Compound meters: numerator is a multiple of 3 and greater than 3
  // (6/8, 9/8, 12/8, ...). The beat groups three denominator units (a dotted beat).
  const isCompound = numerator > 3 && numerator % 3 === 0;
  if (isCompound) {
    return denominatorUnitQuants * 3;
  }

  // Simple meters: the beat is one denominator unit.
  return denominatorUnitQuants;
};

/**
 * Groups events into beaming groups based on musical rules (beats, syncopation).
 * All calculations use CONFIG.baseY - staff positioning is handled by SVG transforms.
 * @param events - List of events in the measure
 * @param eventPositions - Map of event IDs to their x-positions
 * @param clef - The clef for pitch offset lookup
 * @param timeSignature - The score's time signature (e.g. '6/8'). Determines beat
 *   grouping. Defaults to '4/4' for backward compatibility.
 * @returns Array of beam group specifications
 */
export const calculateBeamingGroups = (
  events: ScoreEvent[],
  eventPositions: Record<string, number>,
  clef = 'treble',
  timeSignature = '4/4'
): BeamGroup[] => {
  const groups: BeamGroup[] = [];
  let currentGroup: ScoreEvent[] = [];
  let currentType: string | null = null;

  // Helper to finalize a group
  const finalizeGroup = () => {
    if (currentGroup.length > 1) {
      groups.push(processBeamGroup(currentGroup, eventPositions, clef));
    }
    currentGroup = [];
    currentType = null;
  };

  let currentQuant = 0;

  // Meter-aware beaming beat: notes beam within a single beat and break at beat
  // boundaries. Compound meters (6/8, 9/8, 12/8) use a dotted beat (three eighths);
  // simple meters use one denominator unit (e.g. quarter in 4/4, 3/4, 2/4).
  const beatQuants = getBeamBeatQuants(timeSignature);

  events.forEach((event: ScoreEvent) => {
    const type = event.duration;
    const isFlagged = ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'].includes(type);
    const durationQuants = getNoteDuration(type, event.dotted, event.tuplet);

    // Break beam if:
    // 1. Not a flagged note
    // 2. Dotted note (simplify for now - standard beaming breaks on dots usually unless configured)
    // 3. Type changes (e.g. 8th to 16th - simple engines often break here, complex ones don't)
    // 4. Rest

    if (!isFlagged || event.isRest) {
      finalizeGroup();
      currentQuant += durationQuants;
      return;
    }

    if (currentType && currentType !== type) {
      finalizeGroup();
    }

    // Break the beam at every beat boundary so beams never span across beats.
    // `beatQuants` is derived from the meter (see getBeamBeatQuants): in 4/4 this
    // is a quarter (16 quants) reproducing the original behavior; in 6/8 it is a
    // dotted quarter (24 quants) so six eighths form two groups of three.
    if (currentQuant % beatQuants === 0 && currentGroup.length > 0) {
      finalizeGroup();
    }

    currentGroup.push(event);
    currentType = type;
    currentQuant += durationQuants;
  });

  finalizeGroup();
  return groups;
};

import { STEM_BEAMED_LENGTHS } from './stems';

/**
 * Calculates the geometry for a single beam group.
 * Implements proper beam sloping based on pitch contour.
 */
const processBeamGroup = (
  groupEvents: ScoreEvent[],
  eventPositions: Record<string, number>,
  clef: string
): BeamGroup => {
  const startEvent = groupEvents[0];

  // Determine minimum stem length based on the note type with the most beams in the group
  // 32nd notes need longer stems to accommodate 3 beams, 64th for 4 beams
  let minStemLength = STEM_BEAMED_LENGTHS.default;

  // Check if group contains shorter durations that require more beam space
  const uniqueDurations = new Set(groupEvents.map((e) => e.duration));
  if (uniqueDurations.has('sixtyfourth')) {
    minStemLength = STEM_BEAMED_LENGTHS.sixtyfourth;
  } else if (uniqueDurations.has('thirtysecond')) {
    minStemLength = STEM_BEAMED_LENGTHS.thirtysecond;
  }

  // First pass: collect note data to determine direction
  const noteData = groupEvents.map((e) => {
    const noteX = eventPositions[e.id];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noteYs = e.notes.map((n: any) => CONFIG.baseY + getOffsetForPitch(n.pitch, clef));

    // Check if this chord has a second interval
    const chordLayout = calculateChordLayout(e.notes, clef);
    const hasSecond = Object.values(chordLayout.noteOffsets).some((v) => v !== 0);

    return {
      noteX,
      minY: Math.min(...noteYs),
      maxY: Math.max(...noteYs),
      avgY: noteYs.reduce((sum: number, y: number) => sum + y, 0) / noteYs.length,
      hasSecond,
      eventX: 0, // Placeholder, updated later
    };
  });

  // Determine stem direction based on average position relative to middle line
  const avgY = noteData.reduce((sum: number, d) => sum + d.avgY, 0) / noteData.length;
  const direction = avgY <= MIDDLE_LINE_Y ? 'down' : 'up';

  // Get chord layouts for first and last events
  const startChordLayout = calculateChordLayout(groupEvents[0].notes, clef);
  const endChordLayout = calculateChordLayout(groupEvents[groupEvents.length - 1].notes, clef);

  // Use shared getStemOffset function for consistent stem positioning
  const startStemOffset = getStemOffset(startChordLayout, direction);
  const endStemOffset = getStemOffset(endChordLayout, direction);

  // Apply stem offset to get actual stem X positions
  // Extend beam by BEAMING.EXTENSION_PX on each side for better visual appearance
  const startX = noteData[0].noteX + startStemOffset - BEAMING.EXTENSION_PX;
  const endX = noteData[noteData.length - 1].noteX + endStemOffset + BEAMING.EXTENSION_PX;

  // Update noteData with stem X positions for clearance calculations
  noteData.forEach((d, i) => {
    const layout = calculateChordLayout(groupEvents[i].notes, clef);
    d.eventX = d.noteX + getStemOffset(layout, direction);
  });

  // Find the extreme notes (the ones that determine beam position)
  let highestNoteY = Infinity; // Lowest Y value (highest on staff)
  let lowestNoteY = -Infinity; // Highest Y value (lowest on staff)

  noteData.forEach((d) => {
    highestNoteY = Math.min(highestNoteY, d.minY);
    lowestNoteY = Math.max(lowestNoteY, d.maxY);
  });

  // Calculate beam endpoints based on direction
  // For upward stems: beam connects above the highest (topmost) notes
  // For downward stems: beam connects below the lowest (bottommost) notes
  let startBeamY: number, endBeamY: number;

  if (direction === 'up') {
    // Beams above notes - use the highest note positions at start and end
    const startNoteY = noteData[0].minY;
    const endNoteY = noteData[noteData.length - 1].minY;

    startBeamY = startNoteY - minStemLength;
    endBeamY = endNoteY - minStemLength;
  } else {
    // Beams below notes - use the lowest note positions at start and end
    const startNoteY = noteData[0].maxY;
    const endNoteY = noteData[noteData.length - 1].maxY;

    startBeamY = startNoteY + minStemLength;
    endBeamY = endNoteY + minStemLength;
  }

  // Limit beam slope to maximum angle for readability
  const rawSlope = (endBeamY - startBeamY) / (endX - startX);

  if (Math.abs(rawSlope) > BEAMING.MAX_SLOPE) {
    // Clamp the slope and recalculate beam endpoints
    const clampedSlope = Math.sign(rawSlope) * BEAMING.MAX_SLOPE;
    const deltaX = endX - startX;
    const deltaY = clampedSlope * deltaX;

    // Adjust endBeamY to match the clamped slope
    endBeamY = startBeamY + deltaY;
  }

  // Now verify that ALL notes in the group have adequate stem length
  // Calculate beam line: y = mx + b
  const slope = (endBeamY - startBeamY) / (endX - startX);
  const intercept = startBeamY - slope * startX;

  // Find the maximum additional clearance needed
  let maxAdditionalClearance = 0;

  noteData.forEach((d) => {
    const beamYAtPoint = slope * d.eventX + intercept;
    const anchorNoteY = direction === 'up' ? d.minY : d.maxY;
    const currentStemLength = Math.abs(beamYAtPoint - anchorNoteY);

    if (currentStemLength < minStemLength) {
      const needed = minStemLength - currentStemLength;
      maxAdditionalClearance = Math.max(maxAdditionalClearance, needed);
    }
  });

  // Apply additional clearance if needed (shift beam away from notes)
  if (maxAdditionalClearance > 0) {
    if (direction === 'up') {
      startBeamY -= maxAdditionalClearance;
      endBeamY -= maxAdditionalClearance;
    } else {
      startBeamY += maxAdditionalClearance;
      endBeamY += maxAdditionalClearance;
    }
  }

  return {
    ids: groupEvents.map((e) => e.id),
    startX,
    endX,
    startY: startBeamY,
    endY: endBeamY,
    direction,
    type: startEvent.duration,
  };
};
