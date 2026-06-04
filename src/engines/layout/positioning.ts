import { MIDDLE_LINE_Y, NOTE_SPACING_BASE_UNIT, KEY_SIGNATURES, LAYOUT, STEM } from '@/constants';
import { CONFIG } from '@/config';
import { getNoteDuration } from '@/utils/core';
import { Note, ChordLayout, SystemPreamble } from './types';
import { getStaffPitch, STAFF_LETTERS } from '@/services/MusicService';
import { getClefReference } from '@/utils/clef';

// ========== SYSTEM PREAMBLE (SSOT) ==========

interface SystemPreambleOptions {
  /** Whether this is the first system (shows time signature). Default: true */
  isFirstSystem?: boolean;
}

/**
 * Calculates system preamble layout (clef, key signature, time signature).
 * This is the SINGLE SOURCE OF TRUTH for preamble layout calculations.
 *
 * @param keySignature - The key signature string (e.g., 'C', 'G', 'F')
 * @param options - Configuration options
 * @param options.isFirstSystem - Whether to include time signature (default: true)
 * @returns SystemPreamble object with all calculated positions
 */
export const calculateSystemPreamble = (
  keySignature: string,
  options: SystemPreambleOptions = {}
): SystemPreamble => {
  const { isFirstSystem = true } = options;
  const { keySigStartX, keySigAccidentalWidth, keySigPadding, timeSigWidth, timeSigPadding } =
    CONFIG.preamble;

  const keySigCount = KEY_SIGNATURES[keySignature]?.count || 0;
  const keySigVisualWidth = keySigCount > 0 ? keySigCount * keySigAccidentalWidth + 10 : 0;

  // Time signature only on first system
  if (isFirstSystem) {
    const timeSigStartXPos = keySigStartX + keySigVisualWidth + keySigPadding;
    const measuresX = timeSigStartXPos + timeSigWidth + timeSigPadding;
    return {
      keySigStartX,
      keySigVisualWidth,
      timeSigStartX: timeSigStartXPos,
      measuresX,
      hasTimeSignature: true,
    };
  }

  // Subsequent systems: no time signature, narrower preamble
  const measuresX = keySigStartX + keySigVisualWidth + keySigPadding;
  return {
    keySigStartX,
    keySigVisualWidth,
    timeSigStartX: 0, // Not used for subsequent systems
    measuresX,
    hasTimeSignature: false,
  };
};

// ========== SINGLE-SOURCE CLEF GEOMETRY (Finding 1D / Contract C2) ==========
//
// One algorithm maps any pitch to a staff offset (forward) and any offset to a
// pitch (inverse), derived ENTIRELY from the authoritative clef reference model
// in src/utils/clef.ts (`referencePitch` + `referenceLine`). There is NO
// per-clef lookup-table fast-path: treble, bass, alto, and tenor all flow
// through the same math, so alto/tenor render at their correct positions and
// the inverse (click-to-place / hit detection) is guaranteed consistent with
// the forward render for every clef.
//
// COORDINATE SYSTEM (offset is relative to CONFIG.baseY):
//   - Higher pitch => SMALLER offset (the staff grows upward).
//   - One line-to-line gap = 12px (LINE_STEP).
//   - One diatonic step (line<->adjacent space) = 6px (HALF_STEP).
//   - Staff line N (1=bottom .. 5=top) sits at offset (5 - N) * LINE_STEP, so
//     the top line (5) = 0 and the middle line (3) = 24 in every clef.
//
// Forward:  offset = lineOffset(referenceLine) - diatonicSteps(pitch, ref) * HALF_STEP
// Inverse:  diatonicSteps = (lineOffset(referenceLine) - offset) / HALF_STEP
//
// Landmarks produced by this one formula: treble C4=60, alto C4=24,
// tenor C4=12, bass E2=60; middle-line pitch = offset 24 for every clef.

/** Pixels between adjacent staff lines (a full step on the staff grid). */
const LINE_STEP = 12;
/** Pixels per diatonic step (line to adjacent space). */
const HALF_STEP = LINE_STEP / 2;
/** Highest staff line index (top line). */
const TOP_LINE = 5;

/** Vertical offset (relative to baseY) of a 1-indexed staff line. */
const lineOffset = (line: number): number => (TOP_LINE - line) * LINE_STEP;

/** Parse SPN like "C4" / "F#-1" into { letterIdx, octave }; null if malformed. */
const parseStaffPitch = (pitch: string): { letterIdx: number; octave: number } | null => {
  const match = pitch.match(/^([A-G])(-?\d+)$/);
  if (!match) return null;
  const letterIdx = STAFF_LETTERS.indexOf(match[1]);
  if (letterIdx === -1) return null;
  return { letterIdx, octave: parseInt(match[2], 10) };
};

/**
 * Signed number of diatonic (letter-name) steps from `ref` to `pitch`.
 * Positive = `pitch` is higher than `ref`. Accidentals are ignored (they do not
 * change the staff line/space a note occupies).
 */
const diatonicStepsBetween = (
  pitch: { letterIdx: number; octave: number },
  ref: { letterIdx: number; octave: number }
): number => (pitch.octave - ref.octave) * STAFF_LETTERS.length + (pitch.letterIdx - ref.letterIdx);

/** Diatonic (natural) pitch that lies `steps` diatonic steps above `ref`. */
const pitchAtDiatonicSteps = (ref: { letterIdx: number; octave: number }, steps: number): string => {
  const total = ref.letterIdx + steps;
  const len = STAFF_LETTERS.length;
  // Floored division handles negative steps so the octave rolls correctly.
  const octave = ref.octave + Math.floor(total / len);
  const letterIdx = ((total % len) + len) % len;
  return `${STAFF_LETTERS[letterIdx]}${octave}`;
};

/** Resolve a clef name to its authoritative { referencePitch, referenceLine }. */
const resolveReference = (clef: string): { letterIdx: number; octave: number; line: number } => {
  const ref = getClefReference(clef);
  const parsed = parseStaffPitch(ref.referencePitch) ?? { letterIdx: 0, octave: 4 };
  return { ...parsed, line: ref.referenceLine };
};

/**
 * Calculates the Y offset (relative to CONFIG.baseY) for ANY pitch in a clef.
 *
 * Derived from the single clef-reference model — no lookup tables. Accidentals
 * are ignored for positioning (a note sits on the line/space of its letter).
 *
 * @param pitch - Pitch to position (e.g., "F#4", "C2", "G7"); null/undefined => 0 (rests)
 * @param clef - Clef context ('treble' | 'bass' | 'alto' | 'tenor'; 'grand' => treble)
 * @returns Y offset in pixels relative to CONFIG.baseY (higher pitch = smaller offset)
 */
export const getOffsetForPitch = (
  pitch: string | null | undefined,
  clef: string = 'treble'
): number => {
  // Handle null/undefined pitch (e.g., rest notes)
  if (!pitch) return 0;

  const parsed = parseStaffPitch(getStaffPitch(pitch));
  if (!parsed) return 0;

  const ref = resolveReference(clef);
  const steps = diatonicStepsBetween(parsed, ref);
  return lineOffset(ref.line) - steps * HALF_STEP;
};

/**
 * Gets the diatonic (natural) pitch occupying a given Y offset in a clef.
 *
 * This is the exact inverse of getOffsetForPitch, derived from the SAME
 * clef-reference model, so click-to-place / hit detection always agrees with
 * the rendered note position (critical for alto/tenor/grand). Offsets that do
 * not land on a line or space (i.e. not a multiple of HALF_STEP) return
 * undefined.
 *
 * @param offset - Y offset relative to CONFIG.baseY
 * @param clef - Clef context ('treble' | 'bass' | 'alto' | 'tenor'; 'grand' => treble)
 * @returns Natural-spelling pitch (e.g. 'C4'), or undefined if off-grid
 */
export const getPitchForOffset = (offset: number, clef: string = 'treble'): string | undefined => {
  const ref = resolveReference(clef);
  const stepsTimesHalf = lineOffset(ref.line) - offset;
  if (stepsTimesHalf % HALF_STEP !== 0) return undefined;
  const steps = stepsTimesHalf / HALF_STEP;
  return pitchAtDiatonicSteps(ref, steps);
};

/**
 * Calculates the visual width of a note based on its duration.
 * Spacing is proportional to the square root of quants to balance density.
 * Includes minimum widths for short notes and dot padding.
 * @param duration - The duration type (e.g., 'quarter', 'eighth')
 * @param dotted - Whether the note is dotted
 * @returns The calculated width in pixels
 */
export const getNoteWidth = (duration: string, dotted: boolean): number => {
  const quants = getNoteDuration(duration, dotted, undefined);
  const baseWidth = NOTE_SPACING_BASE_UNIT * Math.sqrt(quants);

  // Use multipliers relative to the base unit for responsiveness
  const MIN_WIDTH_FACTORS: Record<string, number> = {
    sixtyfourth: 1.2,
    thirtysecond: 1.5,
    sixteenth: 1.8,
    eighth: 2.2,
  };

  const minWidth = (MIN_WIDTH_FACTORS[duration] || 0) * NOTE_SPACING_BASE_UNIT;

  // Calculate base width (greater of rhythm-based or visual minimum)
  let width = Math.max(baseWidth, minWidth);

  // Add space for the dot if dotted (dots appear to the right of notehead)
  if (dotted) {
    width += NOTE_SPACING_BASE_UNIT * 0.5; // Dot width factor
  }

  return width;
};

/**
 * Calculates layout details for a chord (group of notes at the same time).
 * Determines stem direction, note offsets for clusters, and vertical bounds.
 * All calculations use CONFIG.baseY - staff positioning is handled by SVG transforms.
 * @param notes - Array of notes in the chord
 * @param clef - The current clef ('treble' or 'bass')
 * @param forcedDirection - Optional direction to force ('up' or 'down')
 * @returns Object containing sortedNotes, direction, noteOffsets, maxNoteShift, minY, maxY
 */
export const calculateChordLayout = (
  notes: Note[],
  clef: string = 'treble',
  forcedDirection?: 'up' | 'down'
): ChordLayout => {
  // Filter out rest notes (null pitch) since they don't have visual positions
  const realNotes = notes.filter((n) => n.pitch !== null);

  if (!realNotes || realNotes.length === 0) {
    return {
      sortedNotes: [],
      direction: forcedDirection || 'up',
      noteOffsets: {},
      maxNoteShift: 0,
      minNoteShift: 0,
      minY: 0,
      maxY: 0,
    };
  }

  const sortedNotes = [...realNotes].sort((a, b) => {
    const yA = getOffsetForPitch(a.pitch!, clef);
    const yB = getOffsetForPitch(b.pitch!, clef);
    return yA - yB;
  });

  let furthestNote = sortedNotes[0];
  let maxDist = -1;
  let minY = Infinity;
  let maxY = -Infinity;

  sortedNotes.forEach((n) => {
    const y = CONFIG.baseY + getOffsetForPitch(n.pitch!, clef);
    const dist = Math.abs(y - MIDDLE_LINE_Y);
    if (dist > maxDist) {
      maxDist = dist;
      furthestNote = n;
    }
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });

  const furthestY = CONFIG.baseY + getOffsetForPitch(furthestNote.pitch!, clef);

  // Use forced direction if provided, otherwise calculate based on furthest note
  const direction = forcedDirection || (furthestY <= MIDDLE_LINE_Y ? 'down' : 'up');

  const noteOffsets: Record<string, number> = {};

  // Second interval displacement depends on stem direction
  // Up-stem: noteheads on LEFT, upper note of second shifts RIGHT (+11)
  // Down-stem: noteheads on RIGHT, lower note of second shifts LEFT (-11)

  if (direction === 'up') {
    for (let i = sortedNotes.length - 1; i > 0; i--) {
      const noteLower = sortedNotes[i]; // Higher Y = lower pitch
      const noteUpper = sortedNotes[i - 1]; // Lower Y = higher pitch
      const yLower = getOffsetForPitch(noteLower.pitch!, clef);
      const yUpper = getOffsetForPitch(noteUpper.pitch!, clef);
      if (Math.abs(yLower - yUpper) === 6) {
        if (!noteOffsets[noteLower.id]) {
          noteOffsets[noteUpper.id] = LAYOUT.SECOND_INTERVAL_SHIFT; // Upper note shifts RIGHT
        }
      }
    }
  } else {
    for (let i = 0; i < sortedNotes.length - 1; i++) {
      const noteUpper = sortedNotes[i];
      const noteLower = sortedNotes[i + 1];
      const yUpper = getOffsetForPitch(noteUpper.pitch!, clef);
      const yLower = getOffsetForPitch(noteLower.pitch!, clef);
      if (Math.abs(yLower - yUpper) === 6) {
        if (!noteOffsets[noteUpper.id]) {
          noteOffsets[noteLower.id] = -LAYOUT.SECOND_INTERVAL_SHIFT; // Lower note shifts LEFT
        }
      }
    }
  }

  // Track both positive (right shift) and negative (left shift) offsets
  const offsets = Object.values(noteOffsets);
  const maxNoteShift = offsets.length > 0 ? Math.max(0, ...offsets) : 0;
  const minNoteShift = offsets.length > 0 ? Math.min(0, ...offsets) : 0;

  return { sortedNotes, direction, noteOffsets, maxNoteShift, minNoteShift, minY, maxY };
};

/**
 * Calculates the stem X offset for a chord based on its layout and direction.
 * This is the single source of truth for stem positioning logic.
 *
 * Rules:
 * - Up-stem seconds (maxNoteShift > 0): stem at +6 (between notes at 0 and +11)
 * - Down-stem seconds (any offset < 0): stem at -6 (between notes at -11 and 0)
 * - Regular up-stem: stem on right at +6
 * - Regular down-stem: stem on left at -6
 *
 * @param chordLayout - The ChordLayout object from calculateChordLayout
 * @param direction - The stem direction ('up' or 'down')
 * @returns The X offset for the stem relative to noteX
 */
export const getStemOffset = (chordLayout: ChordLayout, direction: 'up' | 'down'): number => {
  const hasUpSecond = chordLayout.maxNoteShift > 0;
  const hasDownSecond = Object.values(chordLayout.noteOffsets).some((v) => v < 0);

  if (hasUpSecond) return STEM.OFFSET_X;
  if (hasDownSecond) return -STEM.OFFSET_X;
  return direction === 'up' ? STEM.OFFSET_X : -STEM.OFFSET_X;
};
