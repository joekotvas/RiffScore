import { useMemo } from 'react';
import { ScoreEvent } from '@/types';
import {
  getEffectiveAccidental,
  getKeyAccidental,
  getDiatonicPitch,
  type EffectiveAccidental,
} from '@/utils/accidentalContext';
import { ACCIDENTALS } from '@/constants/SMuFL';

/**
 * Maps the resolved chromatic accidental to its SMuFL (Bravura) glyph.
 * IMPORTANT: these are SMuFL PUA codepoints (E26x), NOT the legacy Unicode
 * U+266x codepoints — the latter render as tofu/wrong shapes in the Bravura
 * font used on the canvas.
 */
const ACCIDENTAL_GLYPH: Record<EffectiveAccidental, string> = {
  doubleSharp: ACCIDENTALS.doubleSharp,
  sharp: ACCIDENTALS.sharp,
  natural: ACCIDENTALS.natural,
  flat: ACCIDENTALS.flat,
  doubleFlat: ACCIDENTALS.doubleFlat,
};

/**
 * Hook to calculate which accidentals should be displayed for notes in a
 * measure, with full MEASURE MEMORY (standard engraving rules).
 *
 * Source of truth: each note's `pitch` string (contract C1). The displayed
 * accidental is DERIVED from pitch + key signature + intra-measure history;
 * `note.accidental` is never consulted here.
 *
 * Rules (resolved per measure; state resets at every barline):
 * 1. The accidental "in effect" on a staff line starts as the key signature's
 *    implied accidental for that letter (so diatonic notes show nothing).
 * 2. A note shows an accidental glyph iff its effective accidental DIFFERS from
 *    what is currently in effect on its staff line. A repeated identical
 *    alteration on the same line within the measure does NOT repeat the glyph.
 * 3. A natural is shown to cancel a prior accidental on the line, OR to cancel a
 *    key-signature accidental on that letter.
 * 4. Double sharps/flats are preserved and render their own glyph.
 *
 * @param events - The events in the measure (already in temporal order)
 * @param keySignature - The current key signature (e.g. 'G', 'Bb', 'Em')
 * @returns A map of noteId -> SMuFL accidental glyph, or null to hide.
 *
 * @tested src/__tests__/theory/accidentalContext.test.ts
 */
export function useAccidentalContext(
  events: ScoreEvent[],
  keySignature: string
): Record<string, string | null> {
  return useMemo(() => {
    const overrides: Record<string, string | null> = {};

    /**
     * The accidental currently in effect on each staff line (letter+octave),
     * within this measure. Seeded lazily from the key signature the first time a
     * line is encountered.
     */
    const lineState: Record<string, EffectiveAccidental> = {};

    events.forEach((event) => {
      if (!event.notes) return;

      event.notes.forEach((note) => {
        // Skip rest notes (null pitch)
        if (note.pitch === null) return;

        const effective = getEffectiveAccidental(note.pitch);
        const letter = note.pitch.charAt(0);
        const keyAccidental = getKeyAccidental(letter, keySignature);
        const line = getDiatonicPitch(note.pitch);

        // What is currently in effect on this line? If untouched this measure,
        // it is whatever the key signature implies for the letter.
        const inEffect: EffectiveAccidental = line in lineState ? lineState[line] : keyAccidental;

        // Show the accidental glyph only when the note deviates from what is
        // already sounding on that line.
        const showSymbol = effective !== inEffect;

        overrides[note.id] = showSymbol ? ACCIDENTAL_GLYPH[effective] : null;

        // Update measure memory for this line.
        lineState[line] = effective;
      });
    });

    return overrides;
  }, [events, keySignature]);
}
