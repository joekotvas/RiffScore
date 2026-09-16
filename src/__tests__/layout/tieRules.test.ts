/**
 * Tie engraving rules (#288 siblings): curve side from the stem the note is drawn with, tie
 * continuations resolved once for the whole staff, and no accidental re-shown on a continuation.
 */
import { tieCurveDirection } from '@/engines/layout/ties';
import { collectTieStops } from '@/utils/ties';
import { resolveMeasureAccidentals } from '@/utils/accidentalContext';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateSystemLayout } from '@/engines/layout/system';
import type { Measure, ScoreEvent } from '@/types';

const ev = (id: string, duration: string, pitches: string[], tied = false): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: pitches.map((p, i) => ({ id: `${id}n${i}`, pitch: p, tied })),
});

describe('tieCurveDirection', () => {
  test('a single note curves away from its stem', () => {
    expect(tieCurveDirection({ noteY: 100, chordNoteYs: [100], stemDirection: 'up' })).toBe('down');
    expect(tieCurveDirection({ noteY: 100, chordNoteYs: [100], stemDirection: 'down' })).toBe('up');
  });
  test('chord: outer notes curve outward, inner notes away from the centre', () => {
    const ys = [60, 80, 100, 120]; // top … bottom
    expect(tieCurveDirection({ noteY: 60, chordNoteYs: ys, stemDirection: 'up' })).toBe('up');
    expect(tieCurveDirection({ noteY: 120, chordNoteYs: ys, stemDirection: 'down' })).toBe('down');
    expect(tieCurveDirection({ noteY: 80, chordNoteYs: ys, stemDirection: 'up' })).toBe('up');
    expect(tieCurveDirection({ noteY: 100, chordNoteYs: ys, stemDirection: 'up' })).toBe('down');
  });
});

describe('collectTieStops', () => {
  test('marks only resolved tie targets, across barlines, never rests or other pitches', () => {
    const measures: Measure[] = [
      { id: 'm0', events: [ev('a', 'half', ['C4']), ev('b', 'half', ['E4'], true)] },
      {
        id: 'm1',
        events: [
          ev('c', 'quarter', ['E4', 'G4']),
          ev('d', 'quarter', ['E4'], true),
          { id: 'r', duration: 'half', dotted: false, isRest: true, notes: [] },
        ],
      },
      { id: 'm2', events: [ev('e', 'whole', ['E4'])] },
    ];
    const stops = collectTieStops(measures);
    expect([...stops].sort()).toEqual(['cn0']); // b→c across the barline; d→rest resolves to nothing
  });
});

describe('resolveMeasureAccidentals with tie continuations', () => {
  const key = 'C';
  test('a continuation draws no glyph but keeps the alteration in the measure memory', () => {
    // Measure 2 starts with F#4 tied from measure 1, then an F natural on the same line.
    const m2 = [ev('x', 'quarter', ['F#4']), ev('y', 'quarter', ['F4'])];
    const without = resolveMeasureAccidentals(m2, key);
    expect(without.xn0?.glyph).toBeDefined(); // re-shows the sharp today
    const withTie = resolveMeasureAccidentals(m2, key, { tieStops: new Set(['xn0']) });
    expect(withTie.xn0).toBeNull(); // the tie carries the sharp
    expect(withTie.yn0?.glyph).toBeDefined(); // …so the F natural still needs its natural
    expect(withTie.yn0).toEqual(without.yn0);
  });
  test("an explicit 'show' or 'courtesy' policy still draws on a continuation", () => {
    const shown = [
      {
        ...ev('x', 'quarter', ['F#4']),
        notes: [{ id: 'xn0', pitch: 'F#4', accidentalDisplay: 'show' as const }],
      },
    ];
    expect(
      resolveMeasureAccidentals(shown, key, { tieStops: new Set(['xn0']) }).xn0?.glyph
    ).toBeDefined();
    const courtesy = [
      {
        ...ev('x', 'quarter', ['F#4']),
        notes: [{ id: 'xn0', pitch: 'F#4', accidentalDisplay: 'courtesy' as const }],
      },
    ];
    expect(
      resolveMeasureAccidentals(courtesy, key, { tieStops: new Set(['xn0']) }).xn0?.parenthesized
    ).toBe(true);
  });
  test('layout width and the synchroniser agree: no accidental space is reserved for a continuation', () => {
    const m2 = [ev('x', 'quarter', ['F#4']), ev('y', 'quarter', ['G4']), ev('z', 'half', ['A4'])];
    const plain = [ev('x', 'quarter', ['F4']), ev('y', 'quarter', ['G4']), ev('z', 'half', ['A4'])];
    const tieStops = new Set(['xn0']);
    const tied = calculateMeasureLayout(
      m2,
      undefined,
      'treble',
      false,
      undefined,
      1,
      key,
      tieStops
    );
    const reference = calculateMeasureLayout(plain, undefined, 'treble', false, undefined, 1, key);
    expect(tied.totalWidth).toBeCloseTo(reference.totalWidth, 6);
    expect(tied.eventPositions.x).toBeCloseTo(reference.eventPositions.x, 6);
    const syncTied = calculateSystemLayout([{ events: m2 }], key, [tieStops]);
    const syncRef = calculateSystemLayout([{ events: plain }], key);
    expect(syncTied).toEqual(syncRef);
    // …and without the tie information the sharp costs width, as before.
    const untied = calculateMeasureLayout(m2, undefined, 'treble', false, undefined, 1, key);
    expect(untied.totalWidth).toBeGreaterThan(reference.totalWidth);
  });
});
