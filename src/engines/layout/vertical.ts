/**
 * Vertical layout: how far apart the staves of a system sit, and what is reserved above and
 * below them.
 *
 * The staff distance is content-aware. Every staff has a drawn EXTENT — how far its noteheads,
 * ledger notes, stems, beams and tuplet brackets reach above its top line and below its bottom
 * line — and an optional LYRIC BAND below that extent (`Staff.lyricLines`; lyrics themselves
 * are not rendered yet, roadmap #30). Adjacent staves sit `CONFIG.staffSpacing` apart unless
 * the upper staff's extent plus band and the lower staff's extent would come closer than
 * `STAFF_DISTANCE.MIN_CLEARANCE`, in which case the lower staff moves down just enough. Staves
 * that do not need room never move.
 *
 * Scroll view applies one vertical layout to the whole score (staves are continuous); page
 * view applies it per system, so a system with a wide beamed run opens up while the others
 * keep the default distance.
 *
 * All values are staff px at 100%, relative to the FIRST staff's top line (or, for an extent,
 * to its own staff's top line); negative is above.
 */

import { CONFIG } from '@/config';
import { BEAMING, LYRICS, STAFF_DISTANCE, STAFF_HEIGHT, TUPLET } from '@/constants';
import { unbeamedStemEnd } from './stems';
import type { BeamGroup, MeasureLayout, TupletBracketGroup } from './types';

const HALF_SPACE = CONFIG.lineHeight / 2;

/** Drawn extent of a staff's content relative to its top line: 0..STAFF_HEIGHT is the bare staff. */
export interface StaffExtent {
  top: number;
  bottom: number;
}

export const EMPTY_STAFF_EXTENT: StaffExtent = { top: 0, bottom: STAFF_HEIGHT };

export const unionExtents = (extents: StaffExtent[]): StaffExtent =>
  extents.reduce<StaffExtent>(
    (acc, e) => ({ top: Math.min(acc.top, e.top), bottom: Math.max(acc.bottom, e.bottom) }),
    EMPTY_STAFF_EXTENT
  );

/**
 * Drawn extent of one measure: noteheads (with their ledger lines), stems — to the beam for
 * beamed notes, a standard stem otherwise — and tuplet brackets with their numbers. Rests,
 * accidentals and flags stay within those bounds.
 */
export const calculateMeasureExtent = (
  relativeLayout: MeasureLayout,
  beamGroups: BeamGroup[],
  tupletGroups: TupletBracketGroup[]
): StaffExtent => {
  let top = CONFIG.baseY;
  let bottom = CONFIG.baseY + STAFF_HEIGHT;

  const beamOf = new Map<string, BeamGroup>();
  beamGroups.forEach((group) => group.ids.forEach((id) => beamOf.set(id, group)));

  relativeLayout.processedEvents.forEach((event) => {
    const chord = event.chordLayout;
    if (event.isRest || !chord || chord.sortedNotes.length === 0) return;
    top = Math.min(top, chord.minY - HALF_SPACE);
    bottom = Math.max(bottom, chord.maxY + HALF_SPACE);

    const beam = beamOf.get(event.id);
    if (beam) {
      // The primary beam is the outermost; secondary beams sit inside it.
      if (beam.direction === 'up') {
        top = Math.min(top, Math.min(beam.startY, beam.endY) - BEAMING.THICKNESS / 2);
      } else {
        bottom = Math.max(bottom, Math.max(beam.startY, beam.endY) + BEAMING.THICKNESS / 2);
      }
    } else if (event.duration !== 'whole') {
      const end = unbeamedStemEnd({
        direction: chord.direction,
        minY: chord.minY,
        maxY: chord.maxY,
        duration: event.duration,
      });
      if (chord.direction === 'up') top = Math.min(top, end);
      else bottom = Math.max(bottom, end);
    }
  });

  tupletGroups.forEach((bracket) => {
    if (bracket.direction === 'up') {
      top = Math.min(
        top,
        Math.min(bracket.startY, bracket.endY) + TUPLET.NUMBER_OFFSET_UP - TUPLET.NUMBER_FONT_SIZE
      );
    } else {
      bottom = Math.max(bottom, Math.max(bracket.startY, bracket.endY) + TUPLET.NUMBER_OFFSET_DOWN);
    }
  });

  return { top: top - CONFIG.baseY, bottom: bottom - CONFIG.baseY };
};

/** Height reserved below a staff's extent for `lines` lyric lines; 0 when there are none. */
export const lyricBandHeight = (lines: number): number =>
  lines > 0
    ? LYRICS.GAP_ABOVE + LYRICS.ASCENT + (lines - 1) * LYRICS.LINE_HEIGHT + LYRICS.DESCENT
    : 0;

/**
 * Baseline of lyric line `lineIndex` (0-based) below a staff whose drawn extent ends at
 * `extentBottom` (relative to the staff's top line). For a bare staff this is about 1.8 spaces
 * below the bottom line, the engraved norm; lower when ledger notes or beams reach further.
 */
export const lyricLineBaseline = (extentBottom: number, lineIndex: number): number =>
  Math.max(extentBottom, STAFF_HEIGHT) +
  LYRICS.GAP_ABOVE +
  LYRICS.ASCENT +
  lineIndex * LYRICS.LINE_HEIGHT;

export interface VerticalLayout {
  /** Y of each staff's top line relative to the first staff's top line. */
  offsets: number[];
  /** Highest ink relative to the first staff's top line (≤ 0). */
  top: number;
  /** Lowest ink or lyric band relative to the first staff's top line (≥ offsets[last] + STAFF_HEIGHT). */
  bottom: number;
  /** Lyric band height reserved below each staff. */
  lyricBands: number[];
}

/**
 * Content-aware staff offsets. Each staff sits `staffSpacing` below the previous one, or further
 * when the previous staff's extent plus its lyric band would come within `minClearance` of this
 * staff's extent. Never less than `staffSpacing`, so staves that need no room do not move.
 */
export const calculateStaffOffsets = (
  extents: StaffExtent[],
  lyricLines: number[] = [],
  options: { staffSpacing?: number; minClearance?: number } = {}
): VerticalLayout => {
  const staffSpacing = options.staffSpacing ?? CONFIG.staffSpacing;
  const minClearance = options.minClearance ?? STAFF_DISTANCE.MIN_CLEARANCE;
  const lyricBands = extents.map((_, i) => lyricBandHeight(lyricLines[i] ?? 0));
  if (extents.length === 0) return { offsets: [], top: 0, bottom: 0, lyricBands };

  const offsets = [0];
  for (let i = 1; i < extents.length; i++) {
    const above = extents[i - 1];
    const needed = above.bottom + lyricBands[i - 1] + minClearance - extents[i].top;
    offsets.push(offsets[i - 1] + Math.max(staffSpacing, needed));
  }
  const last = extents.length - 1;
  return {
    offsets,
    top: Math.min(0, extents[0].top),
    bottom: offsets[last] + Math.max(STAFF_HEIGHT, extents[last].bottom + lyricBands[last]),
    lyricBands,
  };
};

/** Chord text is centered on its baseline; keep its lower edge clear of all engraved ink. */
export const calculateChordTrackY = (staffTop: number, inkTop: number, fontSize = 20): number =>
  Math.min(
    staffTop - CONFIG.chordTrack.minDistanceFromStaff,
    inkTop - CONFIG.chordTrack.paddingAboveNotes - fontSize / 2
  );
