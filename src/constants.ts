/**
 * Constants for Sheet Music Editor
 *
 * This file contains:
 * - Music theory constants (note types, time/key signatures)
 * - Derived layout constants (from CONFIG)
 * - Rendering settings (beaming, stems, tuplets, ties)
 */

import { CONFIG } from './config';
import { Key } from 'tonal';
import { getClefReference } from './utils/clef';

// =============================================================================
// DERIVED LAYOUT VALUES (from CONFIG.lineHeight)
// =============================================================================

const SPACE = CONFIG.lineHeight; // 12px - distance between staff lines
const HALF_SPACE = 0.5 * SPACE; // 6px

export const MIDDLE_LINE_Y = CONFIG.baseY + 24;

// =============================================================================
// TIME SIGNATURES
// =============================================================================

export const TIME_SIGNATURES: Record<string, number> = {
  '4/4': 64,
  '3/4': 48,
  '2/4': 32,
  '6/8': 48,
};

/**
 * Bar capacity in quants for a time signature — the single source of truth for "how many
 * quants fill a measure" (#242). Every capacity check and the measure-integrity invariant go
 * through this, so they can never disagree.
 *
 * The `TIME_SIGNATURES` table is a fast-path; any other `n/d` signature is derived directly
 * (a whole note is 64 quants, so a `1/d` note is `64/d` quants and the bar holds `n` of them).
 * This is why compound meters like 9/8 (72) and 12/8 (96) — which the table omits but the
 * beaming engine supports — get the right capacity. Malformed input falls back to 4/4.
 *
 * Note: a quant count does NOT uniquely identify the meter (6/8 and 3/4 both yield 48) — fine
 * for capacity math, but callers needing the meter (e.g. beaming) must read `timeSignature`.
 */
export const getMeasureCapacity = (timeSignature: string): number => {
  const known = TIME_SIGNATURES[timeSignature];
  if (known != null) return known;
  // Defensive: scores loaded through the API may carry a missing/garbage timeSignature.
  if (typeof timeSignature === 'string') {
    const [num, den] = timeSignature.split('/').map(Number);
    if (Number.isInteger(num) && num > 0 && Number.isInteger(den) && den > 0) {
      const capacity = (num * TIME_SIGNATURES['4/4']) / den;
      // Real meters have power-of-two denominators, so this is integral; reject anything that
      // isn't (e.g. 4/3) rather than return a fractional capacity.
      if (Number.isInteger(capacity)) return capacity;
    }
  }
  return TIME_SIGNATURES['4/4'];
};

// =============================================================================
// KEY SIGNATURES (Generated from Tonal)
// =============================================================================

export interface KeySignature {
  label: string;
  type: 'sharp' | 'flat';
  count: number;
  accidentals: string[];
  mode: 'major' | 'minor';
  tonic: string;
}

const SHARPS_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLATS_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

// All 15 key signature groups: C (no accidentals), 7 sharps, 7 flats
// Each major key has a relative minor with the same accidentals
// Keys are named distinctly: 'C' = C Major, 'Am' = A minor
const MAJOR_ROOTS = [
  'C', // No accidentals
  'G',
  'D',
  'A',
  'E',
  'B',
  'F#',
  'C#', // Sharp Keys
  'F',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'Gb',
  'Cb', // Flat Keys
];

export const KEY_SIGNATURES: Record<string, KeySignature> = {};

// Generate all key signatures using Tonal.js
MAJOR_ROOTS.forEach((majorRoot) => {
  const majorInfo = Key.majorKey(majorRoot);
  const count = Math.abs(majorInfo.alteration);
  const type: 'sharp' | 'flat' = majorInfo.alteration < 0 ? 'flat' : 'sharp';
  const accidentals = type === 'flat' ? FLATS_ORDER.slice(0, count) : SHARPS_ORDER.slice(0, count);

  // Major key: stored as root name (e.g., 'G', 'Bb')
  KEY_SIGNATURES[majorRoot] = {
    label: `${majorRoot} Major`,
    type,
    count,
    accidentals,
    mode: 'major',
    tonic: majorRoot,
  };

  // Minor key: stored with 'm' suffix (e.g., 'Em', 'Gm')
  // Use the relative minor from Tonal.js
  const minorRoot = majorInfo.minorRelative;
  const minorKey = `${minorRoot}m`;
  KEY_SIGNATURES[minorKey] = {
    label: `${minorRoot} minor`,
    type,
    count,
    accidentals,
    mode: 'minor',
    tonic: minorRoot,
  };
});

// Key signature accidental positions on staff
export interface KeySignatureOffsets {
  treble: { sharp: Record<string, number>; flat: Record<string, number> };
  bass: { sharp: Record<string, number>; flat: Record<string, number> };
  alto: { sharp: Record<string, number>; flat: Record<string, number> };
  tenor: { sharp: Record<string, number>; flat: Record<string, number> };
}

/**
 * Conventional ENGRAVING OCTAVE of each key-signature accidental, per clef
 * (sharps in order F C G D A E B; flats in order B E A D G C F). The octave is
 * the only hand-authored datum — the staff offset is DERIVED below from the same
 * clef-reference geometry that positions notes, so a key-signature glyph always
 * sits on the exact line/space of a note of that pitch (no drift; see #233).
 *
 * Treble, bass and alto follow the standard down-a-4th / up-a-5th pattern; tenor
 * SHARPS use the traditional lower-octave (ascending) exception so they fit on
 * the staff. (Verified against the rule and against getOffsetForPitch in
 * clefKeySignature.test.)
 */
const KEY_SIG_PITCHES: Record<
  keyof KeySignatureOffsets,
  { sharp: Record<string, string>; flat: Record<string, string> }
> = {
  treble: {
    sharp: { F: 'F5', C: 'C5', G: 'G5', D: 'D5', A: 'A4', E: 'E5', B: 'B4' },
    flat: { B: 'B4', E: 'E5', A: 'A4', D: 'D5', G: 'G4', C: 'C5', F: 'F4' },
  },
  bass: {
    sharp: { F: 'F3', C: 'C3', G: 'G3', D: 'D3', A: 'A3', E: 'E3', B: 'B3' },
    flat: { B: 'B2', E: 'E3', A: 'A2', D: 'D3', G: 'G2', C: 'C3', F: 'F2' },
  },
  alto: {
    sharp: { F: 'F4', C: 'C4', G: 'G4', D: 'D4', A: 'A3', E: 'E4', B: 'B3' },
    flat: { B: 'B3', E: 'E4', A: 'A3', D: 'D4', G: 'G3', C: 'C4', F: 'F3' },
  },
  tenor: {
    sharp: { F: 'F3', C: 'C4', G: 'G3', D: 'D4', A: 'A3', E: 'E4', B: 'B3' },
    flat: { B: 'B3', E: 'E4', A: 'A3', D: 'D4', G: 'G3', C: 'C4', F: 'F3' },
  },
};

// Diatonic index of a natural pitch (e.g. 'C4' -> 28), for staff-step arithmetic.
const DIATONIC_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const diatonicIndex = (pitch: string): number => {
  const m = pitch.match(/^([A-G])(-?\d+)$/);
  return m ? parseInt(m[2], 10) * 7 + DIATONIC_LETTERS.indexOf(m[1]) : 0;
};

/**
 * Staff Y offset (relative to baseY) of a natural pitch in a clef. MUST match
 * engines/layout getOffsetForPitch: `(5 - referenceLine)*SPACE - steps*HALF_SPACE`.
 * Implemented here against the leaf module clef.ts to avoid a constants <->
 * positioning import cycle; the equivalence is asserted in clefKeySignature.test.
 */
const staffOffsetForPitch = (pitch: string, clef: keyof KeySignatureOffsets): number => {
  const { referencePitch, referenceLine } = getClefReference(clef);
  const steps = diatonicIndex(pitch) - diatonicIndex(referencePitch);
  return (5 - referenceLine) * SPACE - steps * HALF_SPACE;
};

const deriveOffsets = (
  pitches: Record<string, string>,
  clef: keyof KeySignatureOffsets
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(pitches).map(([letter, pitch]) => [letter, staffOffsetForPitch(pitch, clef)])
  );

/**
 * Key-signature accidental Y offsets, DERIVED from the conventional pitches above
 * and the shared clef geometry — so they always agree with note positioning.
 */
export const KEY_SIGNATURE_OFFSETS: KeySignatureOffsets = {
  treble: {
    sharp: deriveOffsets(KEY_SIG_PITCHES.treble.sharp, 'treble'),
    flat: deriveOffsets(KEY_SIG_PITCHES.treble.flat, 'treble'),
  },
  bass: {
    sharp: deriveOffsets(KEY_SIG_PITCHES.bass.sharp, 'bass'),
    flat: deriveOffsets(KEY_SIG_PITCHES.bass.flat, 'bass'),
  },
  alto: {
    sharp: deriveOffsets(KEY_SIG_PITCHES.alto.sharp, 'alto'),
    flat: deriveOffsets(KEY_SIG_PITCHES.alto.flat, 'alto'),
  },
  tenor: {
    sharp: deriveOffsets(KEY_SIG_PITCHES.tenor.sharp, 'tenor'),
    flat: deriveOffsets(KEY_SIG_PITCHES.tenor.flat, 'tenor'),
  },
};

// =============================================================================
// CLEF TYPES
// =============================================================================

export interface ClefType {
  label: string;
  isGrand?: boolean;
}

export const CLEF_TYPES: Record<string, ClefType> = {
  treble: { label: 'Treble' },
  bass: { label: 'Bass' },
  alto: { label: 'Alto' },
  tenor: { label: 'Tenor' },
  grand: { label: 'Grand', isGrand: true },
};
// =============================================================================
// CLEF CONFIGURATION
// =============================================================================

// Clef configuration logic moved to utils/clef.ts for cleaner separation.
// Re-exported here for backward compatibility.
export { CLEF_CONFIG, getClefConfig } from './utils/clef';
export type { ClefConfig } from './utils/clef';

// =============================================================================
// NOTE TYPES
// =============================================================================

export interface NoteType {
  duration: number;
  label: string;
  fill: string;
  stroke: string;
  stem: boolean;
  flag?: number;
  abcDuration: string;
  xmlType: string;
}

export const NOTE_TYPES: Record<string, NoteType> = {
  whole: {
    duration: 64,
    label: 'Whole',
    fill: 'transparent',
    stroke: 'black',
    stem: false,
    abcDuration: '4',
    xmlType: 'whole',
  },
  half: {
    duration: 32,
    label: 'Half',
    fill: 'transparent',
    stroke: 'black',
    stem: true,
    abcDuration: '2',
    xmlType: 'half',
  },
  quarter: {
    duration: 16,
    label: 'Quarter',
    fill: 'black',
    stroke: 'black',
    stem: true,
    abcDuration: '',
    xmlType: 'quarter',
  },
  eighth: {
    duration: 8,
    label: 'Eighth',
    fill: 'black',
    stroke: 'black',
    stem: true,
    flag: 1,
    abcDuration: '/2',
    xmlType: 'eighth',
  },
  sixteenth: {
    duration: 4,
    label: '16th',
    fill: 'black',
    stroke: 'black',
    stem: true,
    flag: 2,
    abcDuration: '/4',
    xmlType: '16th',
  },
  thirtysecond: {
    duration: 2,
    label: '32nd',
    fill: 'black',
    stroke: 'black',
    stem: true,
    flag: 3,
    abcDuration: '/8',
    xmlType: '32nd',
  },
  sixtyfourth: {
    duration: 1,
    label: '64th',
    fill: 'black',
    stroke: 'black',
    stem: true,
    flag: 4,
    abcDuration: '/16',
    xmlType: '64th',
  },
};

// =============================================================================
// LAYOUT CONSTANTS
// =============================================================================

export const NOTE_SPACING_BASE_UNIT = 16;

/**
 * Rhythmic (duration-proportional) horizontal spacing, in staff pixels at 100%
 * (12 px = one staff space).
 *
 * The distance a note claims before the next one is `UNIT * sqrt(quants)` — the classic
 * engraving progression where each halving of the value takes about 1/√2 of the space —
 * floored by `MIN_WIDTH` so short values never crowd their flags and heads. Calibrated to
 * engraved density at a 7–7.6 mm staff: a quarter ≈ 3.7 spaces, an eighth ≈ 2.6, a
 * sixteenth ≈ 1.8, a whole ≈ 7.3, so a 4/4 bar of eight eighths runs ≈ 43 mm at the 60%
 * page-view default (was 63 mm with the previous 16 px unit). Glyph paddings (accidentals,
 * dots, lookahead) stay on `NOTE_SPACING_BASE_UNIT`.
 */
export const NOTE_SPACING = {
  /** Pixels per √quant (quarter = 16 quants → 4 × UNIT). */
  UNIT: 11,
  /** Floor per duration, in pixels; values not listed have no floor. */
  MIN_WIDTH: {
    sixtyfourth: 16,
    thirtysecond: 18,
    sixteenth: 20,
    eighth: 24,
  } as Record<string, number>,
  /**
   * Glyph ink around an event's x (Bravura at 100%), for the ink-aware advance in ink.ts: a
   * flag hangs to the right of an up-stem (left of a down-stem), noteheads and rests are
   * centred on x. `GAP` is the clearance kept between one event's ink and the next's.
   */
  INK: {
    FLAG_RIGHT: { up: 19, down: 8 } as Record<'up' | 'down', number>,
    HEAD_HALF: 7,
    REST_HALF: { eighth: 6, sixteenth: 8, thirtysecond: 9, sixtyfourth: 10.5 } as Record<
      string,
      number
    >,
    GAP: 6,
  },
};
export const WHOLE_REST_WIDTH = 12;
export const DEFAULT_SCALE = 0.75;

export const LAYOUT = {
  // Core Primitives
  LINE_STROKE_WIDTH: 1.5,
  NOTE_RX: 6,
  NOTE_RY: 4,
  DOT_RADIUS: 3,

  // Derived from lineHeight
  SECOND_INTERVAL_SHIFT: SPACE - 1,
  SECOND_INTERVAL_SPACE: HALF_SPACE,
  DOT_OFFSET_X: SPACE,
  LEDGER_LINE_EXTENSION: SPACE - 2,
  /** Extra ledger half-width for the wider whole-note head, so it peeks past both sides. */
  LEDGER_LINE_WHOLE_EXTRA: 4,

  // Accidentals
  ACCIDENTAL: {
    OFFSET_X: -16,
    OFFSET_Y: 0,
    FONT_SIZE: 22, // Legacy, now using getFontSize() from SMuFL
    SPACING: HALF_SPACE + 2,
    /** Leftward nudge for a parenthesized (courtesy) accidental so the parens don't crowd. */
    PARENTHESIS_PAD: 5,
  },

  /** Padding added before noteheads when accidentals are present */
  ACCIDENTAL_PADDING: NOTE_SPACING_BASE_UNIT * 0.8,

  // Hit Detection
  HIT_AREA: {
    WIDTH: 20,
    HEIGHT: 12,
    OFFSET_X: -10,
    OFFSET_Y: -6,
  },
  HIT_ZONE_RADIUS: 14,
  APPEND_ZONE_WIDTH: 2000,

  LOOKAHEAD_PADDING_FACTOR: 0.3,
};

// =============================================================================
// STEM RENDERING
// =============================================================================

export const STEM = {
  /**
   * Unbeamed stem length by duration (px at 100%; 44 ≈ 3.7 spaces). Third and fourth flags
   * need a longer stem so the flag clears the notehead. A stem that would not reach the middle
   * line (notes from the second ledger line outward) is extended to it — see `unbeamedStemEnd`.
   */
  LENGTHS: {
    default: 44,
    thirtysecond: 48,
    sixtyfourth: 56,
  } as Record<string, number>,
  BEAMED_LENGTHS: {
    default: 44,
    thirtysecond: 48,
    sixtyfourth: 56,
  } as Record<string, number>,
  /**
   * Shortest stem allowed next to the beam in a WIDE group (Gould: about 2.5 spaces; more with
   * three or four beams so the inner beams still clear the notehead). See
   * `BEAMED_RANGE_ALLOWANCE`.
   */
  BEAMED_SHORT_LENGTHS: {
    default: 30,
    thirtysecond: 36,
    sixtyfourth: 44,
  } as Record<string, number>,
  /**
   * How far (px) a group's longest stem may exceed the minimum before the stems nearest the
   * beam are shortened to compensate — about an octave's span (3.5 spaces). Beyond it the
   * beam moves toward the notes by the excess, never past `BEAMED_SHORT_LENGTHS`.
   */
  BEAMED_RANGE_ALLOWANCE: 42,
  OFFSET_X: HALF_SPACE + 0.25,
};

// =============================================================================
// VERTICAL LAYOUT — staff distance and lyric bands
// =============================================================================

/**
 * Content-aware staff distance. `CONFIG.staffSpacing` (120 px) is the DEFAULT distance between
 * the top lines of adjacent staves; a staff moves further from the one above only when their
 * drawn content (ledger notes, stems, beams, tuplet brackets) plus the upper staff's lyric band
 * would otherwise come closer than `MIN_CLEARANCE`. See `engines/layout/vertical.ts`.
 */
export const STAFF_DISTANCE = {
  /**
   * Smallest gap kept between the lowest ink of one staff (or its lyric band) and the highest
   * ink of the next, px at 100% — one staff space.
   */
  MIN_CLEARANCE: SPACE,
};

/**
 * Lyric band geometry, px at 100%. Lyrics are not rendered yet (roadmap #30); the layout
 * already reserves this band below any staff whose `lyricLines` is set, so staves, systems and
 * pages make room, and `lyricLineBaseline` says where each verse's baseline will sit.
 */
export const LYRICS = {
  /** Gap from the lowest ink of the staff (never less than its bottom line) to the first line's ascent. */
  GAP_ABOVE: SPACE,
  /** Ascent of the lyric face above its baseline (a 13 px font at 100%). */
  ASCENT: 10,
  /** Baseline-to-baseline distance between verses. */
  LINE_HEIGHT: 15,
  /** Descent kept clear below the last baseline. */
  DESCENT: 4,
};

// =============================================================================
// BEAMING
// =============================================================================

export const BEAMING = {
  THICKNESS: 5,
  SPACING: 8,
  /**
   * Maximum beam rise in staff spaces, indexed by the interval between the outer anchor
   * notes in staff steps (0 = unison, 1 = second, 2 = third, …); wider intervals use the
   * last entry. Engraving convention (Gould): a second slants a quarter space, and no beam
   * slants more than one space however wide the leap.
   */
  MAX_RISE_SPACES: [0, 0.25, 0.5, 0.75, 1],
  /**
   * Maximum rise/run whatever the interval (≈19°), so tightly spaced beams — sixteenth
   * pairs, compressed measures — stay shallow.
   */
  MAX_SLOPE: 0.35,
  EXTENSION_PX: 0.625,
};

// =============================================================================
// TUPLET BRACKETS
// =============================================================================

export const TUPLET = {
  HOOK_HEIGHT: 8,
  PADDING: 15,
  // Matches BEAMING.MAX_SLOPE so a bracket drawn over a beamed tuplet can run parallel to
  // the beam instead of being clamped flatter than it.
  MAX_SLOPE: BEAMING.MAX_SLOPE,
  NUMBER_FONT_SIZE: 11,
  NUMBER_OFFSET_UP: -4,
  NUMBER_OFFSET_DOWN: 12,
  VISUAL_NOTE_RADIUS: 8,
};

// =============================================================================
// TIE RENDERING
// =============================================================================

export const TIE = {
  START_GAP: 0,
  END_GAP: 5,
  VERTICAL_OFFSET: 8,
  MID_THICKNESS: 4,
  TIP_THICKNESS: 1.2,
};

// =============================================================================
// FLAG RENDERING (not SMuFL glyphs - see constants/SMuFL.ts for those)
// =============================================================================

export const FLAG_RENDERING = {
  SPACING: 7,
  SCALE_CLOSEST: 1.3,
  SCALE_OTHERS: 1.2,
  OFFSET: 3,
};

// =============================================================================
// STAFF LAYOUT & INTERACTION LIMITS
// =============================================================================

export const STAFF_LINES_COUNT = 5;
export const STAFF_HEIGHT = (STAFF_LINES_COUNT - 1) * SPACE; // 48px

/**
 * Consolidated staff geometry constants.
 * Single source of truth for all staff dimension calculations.
 *
 * Coordinate system: Staff coordinates (unscaled pixels at 100% scale).
 * Multiply by staffScale to get page coordinates.
 */
export const STAFF_GEOMETRY = {
  /** Distance between staff lines (pixels) */
  lineHeight: CONFIG.lineHeight, // 12px
  /** Number of staff lines */
  lineCount: STAFF_LINES_COUNT, // 5
  /** Total height of staff (4 spaces × 12px = 48px) */
  height: STAFF_HEIGHT, // 48px
  /** Spacing between staves in grand staff (pixels) */
  spacing: CONFIG.staffSpacing, // 120px
} as const;

// Visual limits for interactions
export const LEDGER_LINE_STEP = SPACE; // 12px step for full line
export const INNER_ZONE_LINES = 1.6; // Lines allowed in the gap between staves
export const OUTER_ZONE_LINES = 4.6; // Lines allowed outside the system

export const CLAMP_LIMITS = {
  // Inner zone (gap) limit: 2 ledger lines (24px)
  INNER_OFFSET: INNER_ZONE_LINES * LEDGER_LINE_STEP,

  // Outer zone (top of system) limit: 4 ledger lines up (-48px)
  OUTER_TOP: -(OUTER_ZONE_LINES * LEDGER_LINE_STEP),

  // Outer zone (bottom of system) limit: User preference (90px)
  // Accommodates 4 ledger lines down + breathing room
  OUTER_BOTTOM: 90,
};

export const MOUSE_OFFSET_SNAP = HALF_SPACE; // 6px

/**
 * Distance from measure hit area top to first staff line.
 * Derived from OUTER_ZONE_LINES to ensure hit area covers all valid ledger line positions.
 * Used for mouse Y → pitch offset calculation.
 * Must match the hit area `y={baseY - MEASURE_HIT_AREA_TOP_OFFSET}` in Measure.tsx
 */
export const MEASURE_HIT_AREA_TOP_OFFSET = Math.ceil(OUTER_ZONE_LINES * LEDGER_LINE_STEP);

/**
 * Total height of the measure hit area (12 staff lines): the ledger zone above the staff,
 * the staff itself, and the ledger zone below. Must match the `height` of the hit area rect in
 * Measure.tsx; PageLayoutService reserves the same zones around each system in page view so
 * adjacent systems' hit areas never overlap.
 */
export const MEASURE_HIT_AREA_HEIGHT = CONFIG.lineHeight * 12;

export const PIANO_RANGE = {
  min: 'A0', // MIDI 21
  max: 'C8', // MIDI 108
};
