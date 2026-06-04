import { Note } from 'tonal';
import { getEffectiveScale } from '@/utils/keyResolution';

/**
 * The full chromatic accidental of a pitch, including double sharps/flats.
 */
export type EffectiveAccidental =
  | 'doubleSharp'
  | 'sharp'
  | 'natural'
  | 'flat'
  | 'doubleFlat';

/**
 * Returns the effective accidental of a pitch, derived SOLELY from the pitch
 * string (the single source of truth per contract C1).
 *
 * Double sharps/flats are preserved (Fx -> 'doubleSharp', Bbb -> 'doubleFlat')
 * so the measure-memory engine and exporters never silently downgrade ±2 to ±1.
 *
 * e.g. F# -> 'sharp', Bb -> 'flat', C -> 'natural', Fx -> 'doubleSharp'
 */
export const getEffectiveAccidental = (pitch: string): EffectiveAccidental => {
  const note = Note.get(pitch);
  if (note.empty) return 'natural';

  switch (note.alt) {
    case 2:
      return 'doubleSharp';
    case 1:
      return 'sharp';
    case -1:
      return 'flat';
    case -2:
      return 'doubleFlat';
    case 0:
      return 'natural';
    default:
      return note.alt > 0 ? 'doubleSharp' : 'doubleFlat';
  }
};

/**
 * Returns the accidental implied by the Key Signature for a given letter.
 * Mode-aware: minor keys resolve through the shared resolver, so e.g. the F
 * letter in E minor correctly reports 'sharp'.
 */
export const getKeyAccidental = (
  letter: string,
  keySignature: string
): 'sharp' | 'flat' | 'natural' => {
  const scale = getEffectiveScale(keySignature);
  // Find the note in the scale with this letter
  const match = scale.find((n) => n.startsWith(letter));
  if (match) {
    if (match.includes('##') || /x/i.test(match)) return 'sharp';
    if (match.includes('bb')) return 'flat';
    if (match.includes('#')) return 'sharp';
    if (match.includes('b')) return 'flat';
  }
  return 'natural';
};

/**
 * Returns the diatonic pitch (Letter + Octave) for staff position tracking.
 * e.g. "C#4" -> "C4", "Bb3" -> "B3"
 */
export const getDiatonicPitch = (pitch: string): string => {
  const note = Note.get(pitch);
  if (note.empty) return pitch;
  return `${note.letter}${note.oct}`;
};
