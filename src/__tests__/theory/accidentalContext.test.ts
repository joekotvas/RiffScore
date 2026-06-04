/**
 * Measure accidental memory (Finding 1A — render side).
 *
 * Standard engraving rules under test (first principles, not the implementation):
 *  - An accidental persists on its staff line for the rest of the measure: a
 *    repeated altered pitch does NOT repeat the glyph.
 *  - A natural is shown to cancel a prior accidental mid-measure.
 *  - Key-signature-implied accidentals are suppressed (no redundant glyphs).
 *  - State resets at the barline (each measure is resolved independently).
 *  - Glyphs are SMuFL PUA codepoints (Bravura), NOT legacy Unicode U+266x.
 *
 * The displayed accidental is derived from `note.pitch` (contract C1); the
 * `note.accidental` field is intentionally set to WRONG values in these inputs
 * to prove the resolver ignores it.
 */

import { renderHook } from '@testing-library/react';
import { useAccidentalContext } from '@/hooks/editor/useAccidentalContext';
import { ACCIDENTALS } from '@/constants/SMuFL';
import { ScoreEvent } from '@/types';

let idCounter = 0;
const ev = (...pitches: (string | null)[]): ScoreEvent => {
  const id = `e${idCounter++}`;
  return {
    id,
    duration: 'quarter',
    dotted: false,
    notes: pitches.map((pitch, i) => ({
      id: `${id}-n${i}`,
      pitch,
      // Deliberately WRONG mirror to prove pitch is the source of truth.
      accidental: 'natural' as const,
    })),
  };
};

const run = (events: ScoreEvent[], key: string): Record<string, string | null> => {
  const raw = renderHook(() => useAccidentalContext(events, key)).result.current;
  // This suite predates the display-policy field (#236); collapse each decision to
  // its glyph (there are no courtesy notes here) so the glyph/null assertions hold.
  const out: Record<string, string | null> = {};
  for (const [id, decision] of Object.entries(raw)) out[id] = decision ? decision.glyph : null;
  return out;
};

describe('measure accidental memory', () => {
  it('does NOT repeat an accidental on a repeated altered pitch in the same measure', () => {
    // C major: F#4, then F#4 again on the same line.
    const e1 = ev('F#4');
    const e2 = ev('F#4');
    const out = run([e1, e2], 'C');

    // First F#4 shows a sharp; the repeat is suppressed.
    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.sharp);
    expect(out[e2.notes[0].id]).toBeNull();
  });

  it('shows a natural to cancel a prior accidental mid-measure', () => {
    const e1 = ev('F#4');
    const e2 = ev('F4'); // same line, now natural -> must cancel
    const out = run([e1, e2], 'C');

    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.sharp);
    expect(out[e2.notes[0].id]).toBe(ACCIDENTALS.natural);
  });

  it('suppresses key-signature-implied accidentals (no redundant sharps in G major)', () => {
    // F# is in the G-major signature; it must NOT print a glyph.
    const e1 = ev('F#4');
    const out = run([e1], 'G');
    expect(out[e1.notes[0].id]).toBeNull();
  });

  it('shows a natural that contradicts the key signature (F natural in G major)', () => {
    const e1 = ev('F4'); // foreign to G major (which expects F#)
    const out = run([e1], 'G');
    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.natural);
  });

  it('resets memory at the barline (each measure resolved independently)', () => {
    // Measure A: F# sets memory. Measure B (separate hook call) starts fresh.
    const a1 = ev('F#4');
    const outA = run([a1], 'C');
    expect(outA[a1.notes[0].id]).toBe(ACCIDENTALS.sharp);

    // New measure: the very first F#4 must re-show its sharp (no carryover).
    const b1 = ev('F#4');
    const outB = run([b1], 'C');
    expect(outB[b1.notes[0].id]).toBe(ACCIDENTALS.sharp);
  });

  it('treats different octaves of the same letter as independent lines', () => {
    // F#4 sharps line F4; F5 (different line/octave) is unaffected and natural.
    const e1 = ev('F#4');
    const e2 = ev('F5'); // C major: F natural, different staff line
    const out = run([e1, e2], 'C');

    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.sharp);
    // F5 in C major is diatonic-natural and untouched -> no glyph.
    expect(out[e2.notes[0].id]).toBeNull();
  });

  it('emits SMuFL PUA glyphs, never legacy Unicode U+266x', () => {
    const e1 = ev('Bb4');
    const out = run([e1], 'C');
    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.flat);
    // Guard against the font-mismatch regression.
    expect(out[e1.notes[0].id]).not.toBe('\u266D'); // legacy Unicode flat
    expect(out[e1.notes[0].id]).toBe('\uE260'); // SMuFL PUA flat (Bravura)
  });

  it('renders double accidentals with their own glyph (no ±2 collapse)', () => {
    const e1 = ev('Fx4'); // double sharp
    const out = run([e1], 'C');
    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.doubleSharp);
  });

  it('a foreign accidental followed by its natural on a later beat both print', () => {
    // C major: C#4 (foreign sharp), then C4 (natural cancels it).
    const e1 = ev('C#4');
    const e2 = ev('C4');
    const out = run([e1, e2], 'C');
    expect(out[e1.notes[0].id]).toBe(ACCIDENTALS.sharp);
    expect(out[e2.notes[0].id]).toBe(ACCIDENTALS.natural);
  });

  it('does not re-show a key-cancelling natural already implied (C natural in C major)', () => {
    // C4 in C major is the key default -> no glyph; a repeat also shows nothing.
    const e1 = ev('C4');
    const e2 = ev('C4');
    const out = run([e1, e2], 'C');
    expect(out[e1.notes[0].id]).toBeNull();
    expect(out[e2.notes[0].id]).toBeNull();
  });
});
