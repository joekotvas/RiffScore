/**
 * Example property test (Verify-infra scaffolding, Phase 1).
 *
 * Demonstrates the fast-check + Tonal-as-oracle pattern that the theory/transpose
 * lanes are meant to follow. The invariants here are PURE pitch facts proven against
 * Tonal (an authority independent of RiffScore's own code), not against any RiffScore
 * implementation — so this file is both a self-test of the harness AND a worked
 * template.
 *
 * Why these particular invariants:
 *   1. Chromatic transposition by N semitones must change MIDI by exactly N
 *      (the defining property of chromatic transposition).
 *   2. Transposing up then down by the same semitone count returns the same SOUNDING
 *      pitch (a round-trip invariant) — catches asymmetric/lossy transposition.
 *   3. A pitch's derived alteration (Note.get(pitch).alt) must agree with its written
 *      accidental token — this anchors Contract C1 (pitch is the source of truth for
 *      both sounding pitch AND enharmonic spelling; accidental is derived).
 */

import fc from 'fast-check';
import { Note, Interval } from 'tonal';
import { pitchArb, naturalPitchArb, RUN } from '../helpers/property/harness';

describe('property harness self-test: pure pitch invariants (Tonal oracle)', () => {
  it('chromatic transposition by N semitones changes MIDI by exactly N', () => {
    fc.assert(
      fc.property(pitchArb(), fc.integer({ min: -24, max: 24 }), (pitch, semitones) => {
        const before = Note.midi(pitch) as number; // pitchArb guarantees non-null
        // The invariant only applies when the RESULT is itself representable in the
        // MIDI range [0, 127]; transposing past the top/bottom of the keyboard yields a
        // pitch with no MIDI value (e.g. B7 + 21 -> B9). Precondition on representability
        // so the property tests the rule where it is defined, not the edge of the range.
        const target = before + semitones;
        fc.pre(target >= 0 && target <= 127);

        const out = Note.transpose(pitch, Interval.fromSemitones(semitones));
        const after = Note.midi(out);
        expect(after).not.toBeNull();
        expect(after).toBe(target);
      }),
      RUN
    );
  });

  it('transpose up then down by the same chromatic interval restores the sounding pitch', () => {
    fc.assert(
      fc.property(pitchArb(), fc.integer({ min: 1, max: 12 }), (pitch, semitones) => {
        const before = Note.midi(pitch) as number;
        // Keep the intermediate (transposed-up) pitch representable so the round-trip is
        // defined; otherwise the up step produces a null-MIDI pitch off the keyboard.
        fc.pre(before + semitones <= 127);
        const up = Note.transpose(pitch, Interval.fromSemitones(semitones));
        const back = Note.transpose(up, Interval.fromSemitones(-semitones));
        // Spelling may differ, but the SOUNDING pitch (MIDI) must be identical.
        expect(Note.midi(back)).toBe(before);
      }),
      RUN
    );
  });

  it('a written accidental token agrees with the derived alteration (Contract C1)', () => {
    // Map accidental tokens to their alteration value.
    const tokenToAlt: Record<string, number> = { '': 0, '#': 1, '##': 2, b: -1, bb: -2 };
    fc.assert(
      fc.property(
        naturalPitchArb(),
        fc.constantFrom('', '#', '##', 'b', 'bb'),
        (naturalPitch, token) => {
          const letter = naturalPitch[0];
          const octave = naturalPitch.slice(1);
          const pitch = `${letter}${token}${octave}`;
          // alt is DERIVED from the pitch string; it must mirror the written token.
          expect(Note.get(pitch).alt).toBe(tokenToAlt[token]);
        }
      ),
      RUN
    );
  });

  it('a single hand-verified golden case grounds the harness with no library dependence', () => {
    // C4 up a major third is E4 (4 semitones); verified by hand, not by any library.
    const e4 = Note.transpose('C4', '3M');
    expect(e4).toBe('E4');
    expect(Note.midi('C4')).toBe(60); // MIDI 60 == middle C, an external fixed fact.
    expect(Note.midi('E4')).toBe(64);
  });
});
