/**
 * Shared measure-local accidental resolution for exporters.
 *
 * Standard engraving rules for when a written accidental glyph is required:
 *   - the key signature implies an alteration for certain letters (not re-marked);
 *   - an accidental persists to the end of the measure for that letter+octave;
 *   - a natural cancels a prior sharp/flat (from the key sig or an earlier note);
 *   - state resets at every barline.
 *
 * This is the SINGLE source of the "show an accidental?" decision shared by the
 * MusicXML and ABC exporters, so the two can never drift apart (and both match
 * what the on-screen renderer derives from pitch + key + measure context).
 *
 * The pure decision returns the alteration to SHOW (-2..+2) or null when no glyph
 * is needed; each exporter maps that to its own token (ABC `^/_/=`, MusicXML
 * `<accidental>` names). The sounding pitch is always carried separately (ABC
 * pitch letter / MusicXML `<alter>`), independent of this glyph decision.
 */

import { KEY_SIGNATURES } from '@/constants';

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
