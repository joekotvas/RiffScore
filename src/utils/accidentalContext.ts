import { Note } from 'tonal';
import { getEffectiveScale } from '@/utils/keyResolution';
import { KEY_SIGNATURES } from '@/constants';
import { ACCIDENTALS } from '@/constants/SMuFL';

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

// =============================================================================
// Shared measure-local accidental engine
//
// One algorithm decides "show an accidental glyph?" for BOTH the on-screen
// renderer (via resolveMeasureAccidentals below) and the MusicXML/ABC exporters
// (which call MeasureAccidentalState.resolve directly). Keeping a single engine
// means the canvas and the exported file can never disagree (#234).
//
// Standard engraving rules:
//   - the key signature implies an alteration for certain letters (not re-marked);
//   - an accidental persists to the end of the measure for that letter+octave;
//   - a natural cancels a prior sharp/flat (from the key sig or an earlier note);
//   - state resets at every barline.
// =============================================================================

/**
 * The alteration the key signature applies to a given diatonic letter.
 * +1 for a sharp-key letter, -1 for a flat-key letter, 0 otherwise.
 */
export const keySignatureAltForLetter = (letter: string, keySig: string): number => {
  const sig = KEY_SIGNATURES[keySig];
  if (!sig) return 0;
  if (!sig.accidentals.includes(letter)) return 0;
  return sig.type === 'sharp' ? 1 : -1;
};

/**
 * Tracks, per measure, the active chromatic alteration for each (letter, octave).
 * Construct one per measure (or call `reset()` at each barline).
 */
export class MeasureAccidentalState {
  // key: `${letter}${octave}` -> active chromatic alt (-2..+2)
  private active = new Map<string, number>();

  /** Reset at a barline: all alterations revert to the key signature. */
  reset(): void {
    this.active.clear();
  }

  /**
   * Decide whether `alt` must be written as a glyph for this pitch, given the key
   * signature and any earlier accidental in the measure. Returns the alteration to
   * SHOW (-2..+2, where 0 means a cancelling natural) or null if no glyph is
   * needed. Records the new active alteration when a glyph is shown.
   *
   * @param letter Diatonic letter A-G.
   * @param octave Octave number.
   * @param alt    Sounding chromatic alteration of the pitch (-2..+2).
   * @param keyAlt Alteration the key signature applies to this letter.
   */
  resolve(letter: string, octave: number, alt: number, keyAlt: number): number | null {
    const slot = `${letter}${octave}`;
    const currentlyActive = this.active.has(slot) ? this.active.get(slot)! : keyAlt;

    // No glyph needed if the desired alteration already holds in this measure.
    if (alt === currentlyActive) return null;

    // A glyph will be written: record the new active alteration for this slot.
    this.active.set(slot, alt);
    return alt;
  }
}

/** Maps a chromatic alteration (-2..+2) to its SMuFL (Bravura) glyph. */
const ACCIDENTAL_GLYPH_BY_ALT: Record<number, string> = {
  2: ACCIDENTALS.doubleSharp,
  1: ACCIDENTALS.sharp,
  0: ACCIDENTALS.natural,
  [-1]: ACCIDENTALS.flat,
  [-2]: ACCIDENTALS.doubleFlat,
};

/**
 * Resolves the accidental glyph (or null) to draw for every note in a measure,
 * with full MEASURE MEMORY — the on-screen counterpart of what the exporters do.
 *
 * Drives the SAME {@link MeasureAccidentalState} engine and the SAME
 * {@link keySignatureAltForLetter} key lookup the exporters use, so the canvas
 * glyph and the exported `<accidental>`/ABC token can never drift apart (#234).
 *
 * Source of truth: each note's `pitch` string (contract C1). `note.accidental`
 * is never consulted.
 *
 * Typed structurally (only `notes[].id` + `notes[].pitch` are read) so both the
 * `@/types` and layout-local `ScoreEvent` shapes can call it without conversion.
 *
 * @param events - The events in the measure, already in temporal order.
 * @param keySignature - The current key signature (e.g. 'G', 'Bb', 'Em').
 * @returns A map of noteId -> SMuFL accidental glyph, or null to draw nothing.
 */
interface ResolvableNote {
  id: string;
  pitch: string | null;
}
interface ResolvableEvent {
  notes?: ResolvableNote[];
}

export const resolveMeasureAccidentals = (
  events: ResolvableEvent[],
  keySignature: string
): Record<string, string | null> => {
  const state = new MeasureAccidentalState();
  const overrides: Record<string, string | null> = {};

  for (const event of events) {
    if (!event.notes) continue;

    for (const note of event.notes) {
      if (note.pitch == null) continue;

      const parsed = Note.get(note.pitch);
      if (parsed.empty || !parsed.letter) {
        overrides[note.id] = null;
        continue;
      }

      // Use the PARSED diatonic letter (not pitch.charAt(0)) so a leading
      // accidental in an unusual spelling can never be mistaken for the letter.
      const letter = parsed.letter;
      const octave = parsed.oct ?? 0;
      const alt = Number.isFinite(parsed.alt) ? parsed.alt : 0;
      const keyAlt = keySignatureAltForLetter(letter, keySignature);

      const showAlt = state.resolve(letter, octave, alt, keyAlt);
      overrides[note.id] = showAlt === null ? null : ACCIDENTAL_GLYPH_BY_ALT[showAlt];
    }
  }

  return overrides;
};
