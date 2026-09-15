/**
 * Unbeamed stem lengths (#288): standard length from the outer notehead, longer under three or
 * four flags, and extended to the middle line for notes on the second ledger line or beyond —
 * one rule shared by the renderer, the tuplet bracket and the vertical extents.
 */
import { calculateStemGeometry, unbeamedStemEnd } from '@/engines/layout/stems';
import { getOffsetForPitch } from '@/engines/layout/positioning';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import { calculateMeasureExtent } from '@/engines/layout/vertical';
import { CONFIG } from '@/config';
import { MIDDLE_LINE_Y, STEM } from '@/constants';
import type { ScoreEvent } from '@/types';

const y = (p: string, clef = 'treble') => CONFIG.baseY + getOffsetForPitch(p, clef);
const single = (p: string, duration = 'quarter') => ({ minY: y(p), maxY: y(p), duration });

describe('unbeamedStemEnd', () => {
  test('inside the staff: the standard length', () => {
    expect(y('E4') - unbeamedStemEnd({ direction: 'up', ...single('E4') })).toBe(
      STEM.LENGTHS.default
    );
    expect(unbeamedStemEnd({ direction: 'down', ...single('F5') }) - y('F5')).toBe(
      STEM.LENGTHS.default
    );
  });
  test('first ledger line: the standard stem already passes the middle line, so unchanged', () => {
    expect(y('C4') - unbeamedStemEnd({ direction: 'up', ...single('C4') })).toBe(
      STEM.LENGTHS.default
    );
    expect(unbeamedStemEnd({ direction: 'down', ...single('A5') }) - y('A5')).toBe(
      STEM.LENGTHS.default
    );
  });
  test('second ledger line and beyond: the stem reaches the middle line', () => {
    expect(unbeamedStemEnd({ direction: 'up', ...single('A3') })).toBe(MIDDLE_LINE_Y); // 48 px stem
    expect(unbeamedStemEnd({ direction: 'up', ...single('D3') })).toBe(MIDDLE_LINE_Y); // 84 px
    expect(unbeamedStemEnd({ direction: 'down', ...single('C6') })).toBe(MIDDLE_LINE_Y);
    expect(unbeamedStemEnd({ direction: 'down', ...single('G6') })).toBe(MIDDLE_LINE_Y);
    expect(y('D3') - MIDDLE_LINE_Y).toBeGreaterThan(STEM.LENGTHS.default);
  });
  test('third and fourth flags lengthen the stem', () => {
    expect(y('B4') - unbeamedStemEnd({ direction: 'up', ...single('B4', 'thirtysecond') })).toBe(
      48
    );
    expect(y('B4') - unbeamedStemEnd({ direction: 'up', ...single('B4', 'sixtyfourth') })).toBe(56);
    expect(y('B4') - unbeamedStemEnd({ direction: 'up', ...single('B4', 'sixteenth') })).toBe(44);
  });
  test('chords measure from the outer notehead in the stem direction', () => {
    // Up-stem chord A3–C4: anchor is the top note C4 → 60 − 44 = 16, past the middle line.
    expect(
      unbeamedStemEnd({ direction: 'up', minY: y('C4'), maxY: y('A3'), duration: 'quarter' })
    ).toBe(y('C4') - 44);
    // Up-stem chord entirely below the staff (F3–A3): anchor A3 → extended to the middle line.
    expect(
      unbeamedStemEnd({ direction: 'up', minY: y('A3'), maxY: y('F3'), duration: 'quarter' })
    ).toBe(MIDDLE_LINE_Y);
  });
});

describe('the rule is shared', () => {
  test('calculateStemGeometry (unbeamed) ends where unbeamedStemEnd says; beamed stems are untouched', () => {
    const g = calculateStemGeometry({
      stemX: 0,
      direction: 'up',
      minY: y('A3'),
      maxY: y('A3'),
      duration: 'quarter',
    });
    expect(g).toEqual({ startY: y('A3'), endY: MIDDLE_LINE_Y });
    const beamed = calculateStemGeometry({
      beamSpec: { startX: 0, endX: 100, startY: 50, endY: 50 },
      stemX: 50,
      direction: 'up',
      minY: y('A3'),
      maxY: y('A3'),
      duration: 'eighth',
    });
    expect(beamed.endY).toBe(50);
  });
  test('vertical extent reads the extended stem, so far-out notes stay inside the staff block', () => {
    const events: ScoreEvent[] = [
      { id: 'e', duration: 'quarter', dotted: false, notes: [{ id: 'n', pitch: 'A3' }] },
    ];
    const relative = calculateMeasureLayout(events, undefined, 'treble');
    const extent = calculateMeasureExtent(relative, [], []);
    // Up-stem from A3 ends at the middle line (inside the staff): top stays at the staff line…
    expect(extent.top).toBe(0);
    // …and the bottom is the A3 head, not a stem.
    expect(extent.bottom).toBeCloseTo(getOffsetForPitch('A3', 'treble') + CONFIG.lineHeight / 2, 6);
  });
  test('a 64th flag makes the extent reach further than an eighth flag', () => {
    // A4 stems up: an eighth ends at 30 − 44 = −14 (above the top line), a 64th at 30 − 56 = −26.
    const mk = (duration: string): ScoreEvent[] => [
      { id: 'e', duration, dotted: false, notes: [{ id: 'n', pitch: 'A4' }] },
    ];
    const ext = (duration: string) =>
      calculateMeasureExtent(calculateMeasureLayout(mk(duration), undefined, 'treble'), [], []);
    expect(ext('eighth').top).toBe(-14);
    expect(ext('sixtyfourth').top).toBe(-26);
  });

  test('an unbeamed quarter-note triplet bracket clears the extended stems of ledger notes', () => {
    const trip: ScoreEvent[] = ['D3', 'F3', 'A3'].map((p, i) => ({
      id: `t${i}`,
      duration: 'quarter',
      dotted: false,
      notes: [{ id: `n${i}`, pitch: p }],
      tuplet: { ratio: [3, 2], groupSize: 3, position: i },
      chordLayout: { direction: 'up' } as any,
    }));
    const positions = { t0: 50, t1: 100, t2: 150 };
    const [bracket] = calculateTupletBrackets(trip, positions, 'treble', []);
    // Stems up reach the middle line; the bracket sits above that, not above a 44 px stem end
    // that would be far below the staff.
    expect(bracket.direction).toBe('up');
    expect(Math.max(bracket.startY, bracket.endY)).toBeLessThan(MIDDLE_LINE_Y);
  });
});
