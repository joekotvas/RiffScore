/**
 * Ink-aware minimum advance: how far the next event must sit from this one so this event's
 * rightmost ink clears the next event's leftmost ink by `NOTE_SPACING.INK.GAP`. The rhythmic
 * width (`getNoteWidth`) covers this for most values; it binds around a flag on an unbeamed
 * 16th–64th note and around 32nd/64th rests, whose glyphs are wider than their rhythmic
 * floors. Beamed runs are deliberately not bound (their heads may sit close), except before a
 * short rest. Both width engines (measure.ts and the grand-staff synchronizer in system.ts)
 * apply it so synchronized positions never crowd a flag or a rest.
 */
import { LAYOUT, NOTE_SPACING } from '@/constants';
import { ACCIDENTALS } from '@/constants/SMuFL';
import type { AccidentalGlyphDecision } from '@/utils/accidentalContext';
import type { ScoreEvent } from './types';
import { calculateChordLayout } from './positioning';

const FLAGGED = new Set(['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth']);

/** Whether a note of this duration carries a flag when it is not beamed. */
export const hasFlag = (duration: string): boolean => FLAGGED.has(duration);

interface InkEvent {
  duration: string;
  isRest?: boolean;
}

const isShortRest = (event: InkEvent | undefined): boolean =>
  !!event?.isRest && NOTE_SPACING.INK.REST_HALF[event.duration] !== undefined;

/**
 * @param event - This event (duration, rest flag)
 * @param next - The following event in the measure, or undefined at the barline
 * @param flagged - True when this note is drawn with a flag (unbeamed eighth or shorter)
 * @param stemDirection - Stem direction of a flagged note (which side its flag is on)
 * @returns Minimum distance from this event's x to the next event's x, or 0 when nothing binds
 */
export const inkAdvance = (
  event: InkEvent,
  next: InkEvent | undefined,
  flagged: boolean,
  stemDirection: 'up' | 'down' = 'up'
): number => {
  const { FLAG_RIGHT, HEAD_HALF, REST_HALF, GAP } = NOTE_SPACING.INK;
  const thisFlagged = flagged && !event.isRest && hasFlag(event.duration);
  const thisShortRest = isShortRest(event);
  const nextShortRest = isShortRest(next);
  if (!thisFlagged && !thisShortRest && !nextShortRest) return 0;

  const rightInk = thisFlagged
    ? FLAG_RIGHT[stemDirection]
    : event.isRest
      ? (REST_HALF[event.duration] ?? HEAD_HALF)
      : HEAD_HALF;
  const leftInk = !next ? 0 : next.isRest ? (REST_HALF[next.duration] ?? HEAD_HALF) : HEAD_HALF;
  return rightInk + GAP + leftInk;
};

type AccidentalGlyphs = Record<string, AccidentalGlyphDecision | null>;

/** Horizontal ink relative to the event anchor, including displaced chord heads.
 * Use the resolved glyph decisions: hidden/key-implied accidentals take no space,
 * while cancelling naturals and parenthesized courtesy signs do.
 */
export const eventInkBounds = (
  event: ScoreEvent,
  clef: string,
  accidentalGlyphs: AccidentalGlyphs,
  beamed: boolean,
  direction?: 'up' | 'down'
): { left: number; right: number; decorated: boolean } => {
  const { HEAD_HALF, REST_HALF, FLAG_RIGHT } = NOTE_SPACING.INK;
  if (event.isRest) {
    const half = REST_HALF[event.duration] ?? HEAD_HALF;
    return { left: -half, right: half, decorated: isShortRest(event) };
  }
  const chord = event.chordLayout ?? calculateChordLayout(event.notes, clef, direction);
  const offsets = Object.values(chord.noteOffsets);
  let left = Math.min(0, ...offsets) - HEAD_HALF;
  let right = Math.max(0, ...offsets) + HEAD_HALF;
  let decorated = offsets.some((offset) => offset !== 0) || event.dotted;
  for (const note of event.notes) {
    const accidental = accidentalGlyphs[note.id];
    if (!accidental) continue;
    decorated = true;
    // Conservative Bravura ink bounds at one staff-space = 12px. Double flats
    // are wider; parentheses add ink on both sides and the renderer nudges left.
    const half = accidental.glyph === ACCIDENTALS.doubleFlat ? 10 : 7;
    const parens = accidental.parenthesized ? 2 * LAYOUT.ACCIDENTAL.PARENTHESIS_PAD : 0;
    left = Math.min(
      left,
      (chord.noteOffsets[note.id] ?? 0) + LAYOUT.ACCIDENTAL.OFFSET_X - half - parens
    );
  }
  if (event.dotted) right += LAYOUT.DOT_OFFSET_X + LAYOUT.DOT_RADIUS;
  if (!beamed && hasFlag(event.duration)) {
    decorated = true;
    right = Math.max(right, FLAG_RIGHT[chord.direction]);
  }
  return { left, right, decorated };
};

/** Minimum anchor separation for adjacent decorated events; ordinary beamed
 * heads retain their duration floor. Shared by local and synchronized layout.
 */
export const collisionAdvance = (
  event: ScoreEvent,
  next: ScoreEvent,
  clef: string,
  accidentalGlyphs: AccidentalGlyphs,
  beamedIds: ReadonlySet<string>,
  direction?: 'up' | 'down',
  nextDirection?: 'up' | 'down'
): number => {
  const first = eventInkBounds(event, clef, accidentalGlyphs, beamedIds.has(event.id), direction);
  const second = eventInkBounds(
    next,
    clef,
    accidentalGlyphs,
    beamedIds.has(next.id),
    nextDirection
  );
  return first.decorated || second.decorated ? first.right + NOTE_SPACING.INK.GAP - second.left : 0;
};
