/**
 * Ink-aware minimum advance: how far the next event must sit from this one so this event's
 * rightmost ink clears the next event's leftmost ink by `NOTE_SPACING.INK.GAP`. The rhythmic
 * width (`getNoteWidth`) covers this for most values; it binds around a flag on an unbeamed
 * 16th–64th note and around 32nd/64th rests, whose glyphs are wider than their rhythmic
 * floors. Beamed runs are deliberately not bound (their heads may sit close), except before a
 * short rest. Both width engines (measure.ts and the grand-staff synchronizer in system.ts)
 * apply it so synchronized positions never crowd a flag or a rest.
 */
import { NOTE_SPACING } from '@/constants';

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
