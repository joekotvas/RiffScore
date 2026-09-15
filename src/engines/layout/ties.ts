/**
 * Tie curve direction (Gould, *Behind Bars*, "Ties"): a tie sits on the notehead side, away
 * from the stem — below a stem-up note, above a stem-down note — using the stem the note is
 * actually drawn with (a beamed note's stem follows its beam, whatever the note's own position
 * says). In a chord the outer ties curve outward (top note above, bottom note below) and inner
 * ties curve away from the chord's centre.
 */

export type TieDirection = 'up' | 'down';

export const tieCurveDirection = (args: {
  /** Y of the tied note (larger = lower on the staff). */
  noteY: number;
  /** Ys of every pitched note in the same event (chord context); length 1 for a single note. */
  chordNoteYs: number[];
  /** Direction of the stem the event is drawn with (beam direction when beamed). */
  stemDirection: TieDirection;
}): TieDirection => {
  const { noteY, chordNoteYs, stemDirection } = args;
  if (chordNoteYs.length <= 1) return stemDirection === 'up' ? 'down' : 'up';
  const top = Math.min(...chordNoteYs);
  const bottom = Math.max(...chordNoteYs);
  if (noteY <= top) return 'up';
  if (noteY >= bottom) return 'down';
  return noteY < (top + bottom) / 2 ? 'up' : 'down';
};
