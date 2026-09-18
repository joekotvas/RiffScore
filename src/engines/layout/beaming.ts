import { ScoreEvent } from '@/types';
import { BeamGroup, BeamSegment } from './types';
import { getNoteDuration } from '@/utils/core';
import { getOffsetForPitch, calculateChordLayout, getStemOffset } from './positioning';
import { CONFIG } from '@/config';
import { MIDDLE_LINE_Y, BEAMING, STEM } from '@/constants';

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

  // Compound meters (6/8, 9/8, 12/8, 6/4, ...) beam by the DOTTED beat = three
  // denominator-units. (Compound = the beat divides into 3; top number is a
  // multiple of 3 greater than 3.)
  const isCompound = numerator % 3 === 0 && numerator > 3;

  // 3/8 (and 3/16, ...) are SIMPLE triple — three eighth beats, exactly like 3/4,
  // NOT compound. But the engraving convention beams the whole bar as one group
  // rather than leaving three single flagged notes, so the beam span is the bar,
  // which happens to also be three denominator-units (same number as a compound
  // beat, different reason). The denominator >= 8 guard keeps 3/4 simple (it beams
  // by the quarter beat, not the whole bar).
  const beamsWholeBarAsTriple = numerator === 3 && denominator >= 8;

  if (isCompound || beamsWholeBarAsTriple) {
    return denominatorUnitQuants * 3;
  }

  // Other simple meters: the beam beat is one denominator unit.
  return denominatorUnitQuants;
};

const BEAM_LEVELS: Record<string, number> = {
  eighth: 1,
  sixteenth: 2,
  thirtysecond: 3,
  sixtyfourth: 4,
};

const beamLevelForDuration = (duration: string): number => BEAM_LEVELS[duration] ?? 0;

/** The fields grouping reads; both the score model's and the layout engine's event types fit. */
export interface BeamableEvent {
  id: string;
  duration: string;
  dotted?: boolean;
  isRest?: boolean;
  tuplet?: ScoreEvent['tuplet'];
}

/** A run of beamable events with its quant span, before any geometry is computed. */
interface RawBeamGroup<T extends BeamableEvent> {
  events: T[];
  startQuant: number;
  endQuant: number;
}

const isPlainEighth = (event: BeamableEvent): boolean =>
  beamLevelForDuration(event.duration) === 1 && !event.dotted && !event.tuplet;

/**
 * Whether plain eighths in this meter beam by the HALF BAR rather than by the beat.
 *
 * Simple quadruple time (4/4) is the one common meter with a secondary grouping: four
 * eighths on beats 1–2 or 3–4 are one group, never across the middle of the bar (Gould,
 * *Behind Bars*, "Beaming in simple time"). 2/4 and 3/4 keep beat-level pairs; 2/2 already
 * beams four eighths per (half-note) beat. Unparseable signatures fall back to 4/4 behavior
 * like `getBeamBeatQuants`.
 */
const beamsEighthsByHalfBar = (timeSignature: string): boolean => {
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(timeSignature.trim());
  if (!match) return true;
  return parseInt(match[1], 10) === 4 && parseInt(match[2], 10) === 4;
};

/**
 * Joins two adjacent complete quarter-beat groups of plain eighths into one half-bar group
 * of four when the pair starts on beat 1 or beat 3. Any sixteenth, dotted or tuplet value
 * keeps its beat-level grouping so the beat stays legible; a group that is not exactly one
 * beat of eighths (a single eighth, or one that already crosses a beat) never joins.
 */
const mergeHalfBarEighths = <T extends BeamableEvent>(
  groups: RawBeamGroup<T>[],
  beatQuants: number
): RawBeamGroup<T>[] => {
  const halfBarQuants = beatQuants * 2;
  const isOneBeatOfEighths = (group: RawBeamGroup<T>): boolean =>
    group.events.every(isPlainEighth) &&
    group.endQuant - group.startQuant === beatQuants &&
    group.startQuant % beatQuants === 0;

  const merged: RawBeamGroup<T>[] = [];
  groups.forEach((group) => {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      isOneBeatOfEighths(previous) &&
      isOneBeatOfEighths(group) &&
      previous.startQuant % halfBarQuants === 0 &&
      group.startQuant === previous.endQuant
    ) {
      merged[merged.length - 1] = {
        events: [...previous.events, ...group.events],
        startQuant: previous.startQuant,
        endQuant: group.endQuant,
      };
    } else {
      merged.push(group);
    }
  });
  return merged;
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
  timeSignature = '4/4',
  stemDirection?: 'up' | 'down'
): BeamGroup[] =>
  groupBeamableEvents(events, timeSignature).map((group) =>
    processBeamGroup(group, eventPositions, clef, stemDirection)
  );

/**
 * The beam groups of a measure as arrays of events — the grouping half of
 * `calculateBeamingGroups`, which depends only on the events and the meter (never on x), so
 * the width engines can know which notes will be beamed and which will carry a flag.
 */
export const groupBeamableEvents = <T extends BeamableEvent>(
  events: T[],
  timeSignature = '4/4'
): T[][] => {
  const rawGroups: RawBeamGroup<T>[] = [];
  let currentGroup: T[] = [];
  let currentGroupStart = 0;

  let currentQuant = 0;

  // Helper to finalize a group
  const finalizeGroup = () => {
    if (currentGroup.length > 1) {
      rawGroups.push({
        events: currentGroup,
        startQuant: currentGroupStart,
        endQuant: currentQuant,
      });
    }
    currentGroup = [];
  };

  // Meter-aware beaming beat: notes beam within a single beat and break at beat
  // boundaries. Compound meters (6/8, 9/8, 12/8) use a dotted beat (three eighths);
  // simple meters use one denominator unit (e.g. quarter in 4/4, 3/4, 2/4).
  const beatQuants = getBeamBeatQuants(timeSignature);

  events.forEach((event: T) => {
    const beamLevel = beamLevelForDuration(event.duration);
    const durationQuants = getNoteDuration(event.duration, event.dotted, event.tuplet);

    // Break beams on rests and unbeamable durations. Mixed flagged values stay in
    // one beat-level group; secondary/partial beam segments encode the shorter
    // values instead of splitting the primary beam (#245).
    if (beamLevel === 0 || event.isRest) {
      finalizeGroup();
      currentQuant += durationQuants;
      return;
    }

    // Break the beam at every beat boundary so beams never span across beats.
    // `beatQuants` is derived from the meter (see getBeamBeatQuants): in 4/4 this
    // is a quarter (16 quants); in 6/8 it is a dotted quarter (24 quants) so six
    // eighths form two groups of three. (Plain eighths in 4/4 are re-joined by the
    // half bar afterwards — see mergeHalfBarEighths.)
    if (currentQuant % beatQuants === 0 && currentGroup.length > 0) {
      finalizeGroup();
    }

    const eventEndQuant = currentQuant + durationQuants;
    // Do not start the deferred tuplet-beaming work here: tuplets can carry
    // fractional beat positions on the current quant grid, so the #245
    // no-dependency fix only splits plain flagged events that overrun a beat.
    const crossesPlainBeatBoundary =
      !event.tuplet &&
      Math.floor((eventEndQuant - 1e-9) / beatQuants) !== Math.floor(currentQuant / beatQuants);
    if (crossesPlainBeatBoundary) {
      finalizeGroup();
      currentQuant = eventEndQuant;
      return;
    }

    if (currentGroup.length === 0) currentGroupStart = currentQuant;
    currentGroup.push(event);
    currentQuant = eventEndQuant;
  });

  finalizeGroup();

  const groups = beamsEighthsByHalfBar(timeSignature)
    ? mergeHalfBarEighths(rawGroups, beatQuants)
    : rawGroups;

  return groups.map((group) => group.events);
};

/** Ids of every event that is drawn beamed (member of a group of two or more). */
export const beamedEventIds = (events: BeamableEvent[], timeSignature = '4/4'): Set<string> =>
  new Set(
    groupBeamableEvents(events, timeSignature)
      .flat()
      .map((event) => event.id)
  );

import { STEM_BEAMED_LENGTHS } from './stems';

const SPACE = CONFIG.lineHeight;
const HALF_SPACE = SPACE / 2;

/**
 * Stem direction for a beamed group (Gould, *Behind Bars*, "Stem direction of beamed
 * groups"): the note farthest from the middle line decides — up when it lies below, down
 * when it lies above. If the highest and lowest notes are equidistant, the mean of every
 * note in the group decides, and a mean on the middle line takes the stems down. Chords
 * contribute all of their notes.
 */
export const beamGroupDirection = (noteYs: number[]): 'up' | 'down' => {
  let farthestAbove = 0;
  let farthestBelow = 0;
  let sum = 0;
  noteYs.forEach((y) => {
    const above = MIDDLE_LINE_Y - y; // positive = above the middle line (smaller y)
    if (above > farthestAbove) farthestAbove = above;
    if (-above > farthestBelow) farthestBelow = -above;
    sum += y;
  });
  if (farthestAbove !== farthestBelow) return farthestAbove > farthestBelow ? 'down' : 'up';
  return sum / noteYs.length <= MIDDLE_LINE_Y ? 'down' : 'up';
};

/**
 * Signed vertical rise of a beam (end minus start, SVG y) from the anchors on its stem
 * side, after the engraving limits:
 *  - an inner note that lies beyond BOTH outer notes on the beam side makes the beam
 *    horizontal (the group is concave/convex; a slant would misrepresent its contour);
 *  - the rise is capped by the interval between the outer anchors
 *    (`BEAMING.MAX_RISE_SPACES`, in staff spaces by staff steps — a second slants only a
 *    quarter space, and nothing slants more than one space);
 *  - the rise/run never exceeds `BEAMING.MAX_SLOPE`, so short (tightly spaced) beams stay
 *    shallow.
 */
export const beamRise = (anchorYs: number[], direction: 'up' | 'down', run: number): number => {
  const first = anchorYs[0];
  const last = anchorYs[anchorYs.length - 1];
  const outerExtreme = direction === 'up' ? Math.min(first, last) : Math.max(first, last);
  const inner = anchorYs.slice(1, -1);
  const innerBeyondOuter =
    direction === 'up' ? inner.some((y) => y < outerExtreme) : inner.some((y) => y > outerExtreme);
  if (innerBeyondOuter) return 0;

  const natural = last - first;
  const steps = Math.round(Math.abs(natural) / HALF_SPACE);
  const table = BEAMING.MAX_RISE_SPACES;
  const maxRiseByInterval = table[Math.min(steps, table.length - 1)] * SPACE;
  const maxRiseBySlope = BEAMING.MAX_SLOPE * Math.max(0, run);
  return Math.sign(natural) * Math.min(Math.abs(natural), maxRiseByInterval, maxRiseBySlope);
};

/**
 * Calculates the geometry for a single beam group.
 * Direction and slant follow `beamGroupDirection` and `beamRise`; every stem is then
 * checked for the minimum beamed stem length, and wide groups pull the beam back toward
 * the notes so the nearest stems shorten instead of the far ones growing without bound.
 */
const processBeamGroup = (
  groupEvents: ScoreEvent[],
  eventPositions: Record<string, number>,
  clef: string,
  stemDirection?: 'up' | 'down'
): BeamGroup => {
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
    const noteYs = e.notes
      .filter((n) => n.pitch !== null)
      .map((n) => CONFIG.baseY + getOffsetForPitch(n.pitch as string, clef));

    return {
      noteX,
      noteYs,
      minY: Math.min(...noteYs),
      maxY: Math.max(...noteYs),
      eventX: 0, // Placeholder, updated later
    };
  });

  const direction = stemDirection ?? beamGroupDirection(noteData.flatMap((d) => d.noteYs));

  // Get chord layouts for first and last events
  const startChordLayout = calculateChordLayout(groupEvents[0].notes, clef, stemDirection);
  const endChordLayout = calculateChordLayout(
    groupEvents[groupEvents.length - 1].notes,
    clef,
    stemDirection
  );

  // Use shared getStemOffset function for consistent stem positioning
  const startStemOffset = getStemOffset(startChordLayout, direction);
  const endStemOffset = getStemOffset(endChordLayout, direction);

  // Apply stem offset to get actual stem X positions
  // Extend beam by BEAMING.EXTENSION_PX on each side for better visual appearance
  const startX = noteData[0].noteX + startStemOffset - BEAMING.EXTENSION_PX;
  const endX = noteData[noteData.length - 1].noteX + endStemOffset + BEAMING.EXTENSION_PX;

  // Update noteData with stem X positions for clearance calculations
  noteData.forEach((d, i) => {
    const layout = calculateChordLayout(groupEvents[i].notes, clef, stemDirection);
    d.eventX = d.noteX + getStemOffset(layout, direction);
  });

  // The beam sits on the stem side of each chord: above the top note for up-stems, below
  // the bottom note for down-stems. Its slant follows the outer two anchors.
  const anchorYs = noteData.map((d) => (direction === 'up' ? d.minY : d.maxY));
  const firstAnchorY = anchorYs[0];
  const rise = beamRise(anchorYs, direction, endX - startX);

  // Place the beam a minimum stem length from the first anchor; the clearance pass below
  // pushes it away from any note whose stem would come out shorter (a capped slant leaves
  // the note nearest the beam with the minimum stem and lengthens the rest — never the
  // reverse).
  let startBeamY = direction === 'up' ? firstAnchorY - minStemLength : firstAnchorY + minStemLength;
  let endBeamY = startBeamY + rise;

  // Now verify that ALL notes in the group have adequate stem length
  // Calculate beam line: y = mx + b
  const slope = (endBeamY - startBeamY) / (endX - startX);
  const intercept = startBeamY - slope * startX;

  // Find the maximum additional clearance needed
  let maxAdditionalClearance = 0;

  noteData.forEach((d) => {
    const beamYAtPoint = slope * d.eventX + intercept;
    const anchorNoteY = direction === 'up' ? d.minY : d.maxY;
    // Signed: positive when the beam lies on the stem side of this anchor, NEGATIVE when the
    // line placed from the first anchor falls on the far side of a later note (a wide group
    // whose notes overshoot the first one by more than a stem). An absolute value here left
    // such notes with a stem of the overshoot's remainder — one staff space in the worst case.
    const currentStemLength =
      direction === 'up' ? anchorNoteY - beamYAtPoint : beamYAtPoint - anchorNoteY;

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

  const lineYAt = (x: number): number => {
    const finalSlope = (endBeamY - startBeamY) / (endX - startX);
    const finalIntercept = startBeamY - finalSlope * startX;
    return finalSlope * x + finalIntercept;
  };

  // Wide groups: the stems nearest the beam may shorten (Gould, "Stem lengths in beamed
  // groups") so the far stems stay bounded and the beam stays near the staff. Pull the beam
  // toward the notes by however much the longest stem exceeds the minimum plus an allowance
  // of about an octave, never past the short minimum for this group's beam count.
  const stemLengthAt = (d: { eventX: number; minY: number; maxY: number }): number =>
    direction === 'up' ? d.minY - lineYAt(d.eventX) : lineYAt(d.eventX) - d.maxY;
  const longestStem = Math.max(...noteData.map(stemLengthAt));
  const shortMinStemLength = uniqueDurations.has('sixtyfourth')
    ? STEM.BEAMED_SHORT_LENGTHS.sixtyfourth
    : uniqueDurations.has('thirtysecond')
      ? STEM.BEAMED_SHORT_LENGTHS.thirtysecond
      : STEM.BEAMED_SHORT_LENGTHS.default;
  const excess = longestStem - minStemLength - STEM.BEAMED_RANGE_ALLOWANCE;
  const shortening = Math.min(Math.max(0, excess), minStemLength - shortMinStemLength);
  if (shortening > 0) {
    if (direction === 'up') {
      startBeamY += shortening;
      endBeamY += shortening;
    } else {
      startBeamY -= shortening;
      endBeamY -= shortening;
    }
  }

  const highestBeamLevel = Math.max(
    ...groupEvents.map((event) => beamLevelForDuration(event.duration))
  );
  const segmentFor = (level: number, start: number, end: number): BeamSegment => {
    const offset =
      direction === 'up' ? (level - 1) * BEAMING.SPACING : -(level - 1) * BEAMING.SPACING;
    return {
      level,
      startX: start,
      endX: end,
      startY: lineYAt(start) + offset,
      endY: lineYAt(end) + offset,
    };
  };

  const stemXs = noteData.map((d) => d.eventX);
  const segments: BeamSegment[] = [segmentFor(1, startX, endX)];

  for (let level = 2; level <= highestBeamLevel; level++) {
    let runStart = -1;

    const flushRun = (runEnd: number) => {
      if (runStart === -1) return;

      if (runEnd > runStart) {
        segments.push(
          segmentFor(
            level,
            stemXs[runStart] - BEAMING.EXTENSION_PX,
            stemXs[runEnd] + BEAMING.EXTENSION_PX
          )
        );
      } else {
        const stemX = stemXs[runStart];
        const prevX = stemXs[runStart - 1];
        const nextX = stemXs[runStart + 1];
        const towardNext = nextX !== undefined;
        const neighborX = towardNext ? nextX : prevX;
        const gap = neighborX === undefined ? 24 : Math.abs(neighborX - stemX);
        const length = Math.min(14, Math.max(8, gap * 0.45));
        const beamletStart = towardNext ? stemX : stemX - length;
        const beamletEnd = towardNext ? stemX + length : stemX;
        segments.push(segmentFor(level, beamletStart, beamletEnd));
      }

      runStart = -1;
    };

    groupEvents.forEach((event, index) => {
      if (beamLevelForDuration(event.duration) >= level) {
        if (runStart === -1) runStart = index;
      } else {
        flushRun(index - 1);
      }
    });
    flushRun(groupEvents.length - 1);
  }

  const groupType =
    groupEvents.find((event) => beamLevelForDuration(event.duration) === highestBeamLevel)
      ?.duration ?? groupEvents[0].duration;

  return {
    ids: groupEvents.map((e) => e.id),
    startX,
    endX,
    startY: startBeamY,
    endY: endBeamY,
    direction,
    type: groupType,
    segments,
  };
};
