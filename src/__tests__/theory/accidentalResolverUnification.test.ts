/**
 * Accidental resolver unification (#234).
 *
 * The on-screen renderer used to run its OWN hand-written measure-memory loop
 * while the exporters ran MeasureAccidentalState — two copies of the same rules,
 * benign only as long as nobody edited one. They are now ONE engine
 * (resolveMeasureAccidentals / MeasureAccidentalState in utils/accidentalContext),
 * so the canvas glyph and the exported accidental can't drift.
 *
 * These tests pin the unified engine's decisions, prove the layout now reserves
 * width for the RENDERED glyph (a cancelling natural, which the old pitch-only
 * rule missed), and prove the legacy `note.accidental` mirror is reconciled from
 * pitch at the load boundary.
 */

import { resolveMeasureAccidentals } from '@/utils/accidentalContext';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { ACCIDENTALS } from '@/constants/SMuFL';
import { migrateScore } from '@/types';

/** A one-note quarter event. */
const ev = (id: string, pitch: string) => ({
  id,
  duration: 'quarter' as const,
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

/** Collapse the resolver's { glyph, parenthesized } decisions to glyph-or-null. */
const glyphs = (events: ReturnType<typeof ev>[], key: string): Record<string, string | null> => {
  const out: Record<string, string | null> = {};
  for (const [id, d] of Object.entries(resolveMeasureAccidentals(events, key))) {
    out[id] = d ? d.glyph : null;
  }
  return out;
};

describe('#234 resolveMeasureAccidentals — the single shared engine', () => {
  it('draws nothing for a diatonic note, a glyph for one that deviates', () => {
    expect(glyphs([ev('e1', 'C4')], 'C').e1n).toBeNull();
    expect(glyphs([ev('e1', 'F#4')], 'C').e1n).toBe(ACCIDENTALS.sharp);
  });

  it('does not re-mark a repeated identical accidental on the same line', () => {
    const r = glyphs([ev('e1', 'F#4'), ev('e2', 'F#4')], 'C');
    expect(r.e1n).toBe(ACCIDENTALS.sharp);
    expect(r.e2n).toBeNull();
  });

  it('draws a cancelling natural after a prior accidental on the line', () => {
    const r = glyphs([ev('e1', 'F#4'), ev('e2', 'F4')], 'C');
    expect(r.e1n).toBe(ACCIDENTALS.sharp);
    expect(r.e2n).toBe(ACCIDENTALS.natural);
  });

  it('tracks accidentals per (letter, octave) — a different octave is independent', () => {
    const r = glyphs([ev('e1', 'F#4'), ev('e2', 'F#5')], 'C');
    expect(r.e1n).toBe(ACCIDENTALS.sharp);
    expect(r.e2n).toBe(ACCIDENTALS.sharp); // F5 line untouched -> still deviates from the key
  });

  it('is mode-aware via the key signature: F is diatonic in G, a natural cancels it', () => {
    expect(glyphs([ev('e1', 'F#4')], 'G').e1n).toBeNull();
    expect(glyphs([ev('e1', 'F4')], 'G').e1n).toBe(ACCIDENTALS.natural);
  });

  it('preserves double accidentals (does not downgrade to single)', () => {
    expect(glyphs([ev('e1', 'F##4')], 'C').e1n).toBe(ACCIDENTALS.doubleSharp);
  });
});

describe('#234 layout reserves width for the RENDERED glyph, not just an altered pitch', () => {
  const width = (events: ReturnType<typeof ev>[]) =>
    calculateMeasureLayout(events, undefined, 'treble', false, undefined, 1.0, 'C').totalWidth;

  it('a cancelling natural reserves accidental width; a repeated sharp (no glyph) does not', () => {
    // [F#, F♮]: BOTH draw a glyph (the ♮ cancels the F#) -> two reservations.
    // [F#, F#]: the 2nd is a repeat -> NO glyph -> one reservation.
    // Under the OLD pitch-only rule this was BACKWARDS (the natural reserved
    // nothing, the repeated sharp reserved space), so this ordering is the proof.
    const cancelling = width([ev('e1', 'F#4'), ev('e2', 'F4')]);
    const repeated = width([ev('e1', 'F#4'), ev('e2', 'F#4')]);
    expect(cancelling).toBeGreaterThan(repeated);
  });
});

describe('#234 load-time reconciliation of the derived note.accidental mirror', () => {
  it('rewrites a stale mirror to match the pitch on load', () => {
    const stale = {
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                {
                  id: 'e1',
                  duration: 'quarter',
                  dotted: false,
                  // pitch says sharp; mirror is a stale 'flat'
                  notes: [{ id: 'n1', pitch: 'C#4', accidental: 'flat' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const migrated = migrateScore(stale);
    expect(migrated.staves[0].measures[0].events[0].notes[0].accidental).toBe('sharp');
  });

  it('leaves an already-consistent mirror (and a rest) untouched', () => {
    const clean = migrateScore({
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'Bb3' }] },
                { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: null }] },
              ],
            },
          ],
        },
      ],
    });
    const notes = clean.staves[0].measures[0].events;
    expect(notes[0].notes[0].accidental).toBe('flat');
    expect(notes[1].notes[0].accidental).toBeUndefined();
  });
});
