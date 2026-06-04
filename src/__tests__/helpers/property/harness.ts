/**
 * fast-check property-testing harness scaffold (Verify-infra scaffolding, Phase 1).
 *
 * Provides reusable arbitraries (generators) for the musical domain so later
 * theory/transpose/rhythm property tests follow ONE pattern instead of each lane
 * hand-rolling generators. The arbitraries here intentionally produce only valid,
 * representable values (e.g. real scientific-pitch-notation pitches) so a failing
 * property points at a genuine model defect, not at garbage input.
 *
 * Pattern for downstream tests:
 *
 *   import fc from 'fast-check';
 *   import { pitchArb, RUN } from './harness';
 *   import { Note } from 'tonal';
 *
 *   it('transpose preserves midi delta', () => {
 *     fc.assert(
 *       fc.property(pitchArb(), fc.integer({ min: -24, max: 24 }), (pitch, semis) => {
 *         const out = transposeChromatic(pitch, semis);   // subject under test
 *         expect(Note.midi(out)).toBe((Note.midi(pitch) ?? 0) + semis); // Tonal oracle
 *       }),
 *       RUN
 *     );
 *   });
 */

import fc from 'fast-check';
import { Note } from 'tonal';

/** Standard run parameters: enough cases to find defects, deterministic seed for reproducibility. */
export const RUN: fc.Parameters<unknown> = { numRuns: 200, seed: 0x21ff };

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;

/** Natural pitch letters A–G. */
export function letterArb(): fc.Arbitrary<string> {
  return fc.constantFrom(...LETTERS);
}

/** Accidental token usable in SPN: '' (natural), '#', 'b', '##', 'bb'. */
export function accidentalArb(): fc.Arbitrary<string> {
  return fc.constantFrom('', '#', 'b', '##', 'bb');
}

/**
 * Scientific-pitch-notation pitch (e.g. 'F#4', 'Bb3', 'C##5'), constrained to a
 * musically realistic octave range [1, 7] so generated values are renderable.
 * Every produced value is guaranteed to have a defined Tonal MIDI number.
 */
export function pitchArb(opts: { minOctave?: number; maxOctave?: number } = {}): fc.Arbitrary<string> {
  const minOctave = opts.minOctave ?? 1;
  const maxOctave = opts.maxOctave ?? 7;
  return fc
    .tuple(letterArb(), accidentalArb(), fc.integer({ min: minOctave, max: maxOctave }))
    .map(([letter, acc, oct]) => `${letter}${acc}${oct}`)
    .filter((p) => Note.midi(p) !== null);
}

/** A pitch restricted to naturals only (no accidental), useful for spelling-stability tests. */
export function naturalPitchArb(opts: { minOctave?: number; maxOctave?: number } = {}): fc.Arbitrary<string> {
  const minOctave = opts.minOctave ?? 1;
  const maxOctave = opts.maxOctave ?? 7;
  return fc
    .tuple(letterArb(), fc.integer({ min: minOctave, max: maxOctave }))
    .map(([letter, oct]) => `${letter}${oct}`);
}

/** Duration names used by RiffScore's model. */
export function durationArb(): fc.Arbitrary<string> {
  return fc.constantFrom('whole', 'half', 'quarter', 'eighth', 'sixteenth');
}
