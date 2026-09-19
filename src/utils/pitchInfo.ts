import { Note } from 'tonal';
export interface PitchInfo {
  readonly letter: string;
  readonly alteration: number;
  readonly octave: number | null;
  readonly chroma: number;
}
/** Written pitch identity, preserving enharmonic spelling; null for invalid input. */
export function getPitchInfo(pitch: string): PitchInfo | null {
  const note = Note.get(pitch);
  return note.empty
    ? null
    : Object.freeze({
        letter: note.letter,
        alteration: note.alt,
        octave: note.oct ?? null,
        chroma: note.chroma,
      });
}
