/**
 * Horizontal spacing contract (engraved density).
 *
 * `getNoteWidth` spaces notes by `NOTE_SPACING.UNIT * sqrt(quants)` (each halving of the
 * value takes ~1/√2 of the space), floored by `NOTE_SPACING.MIN_WIDTH`. The numbers are
 * calibrated so that at the 60% page-view default (7.6 mm staff) a 4/4 bar lands in the
 * range engraved music uses: eight eighths ≈ 43 mm, four quarters ≈ 32 mm, sixteen
 * sixteenths ≈ 60 mm. The grand-staff synchroniser must space by the same table.
 */

import { getNoteWidth } from '@/engines/layout/positioning';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateSystemLayout } from '@/engines/layout/system';
import { CONFIG } from '@/config';
import { NOTE_SPACING } from '@/constants';
import type { ScoreEvent } from '@/types';

const SPACE = CONFIG.lineHeight; // 12 px
const DEFAULT_STAFF_SCALE = 0.6;
const mmAtDefault = (staffPx: number) => ((staffPx * DEFAULT_STAFF_SCALE) / 96) * 25.4;

const bar = (duration: string, count: number, dotted = false): ScoreEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    duration,
    dotted,
    notes: [{ id: `n${i}`, pitch: 'B4' }],
  }));

describe('note widths follow the √-progression in staff spaces', () => {
  test.each([
    ['whole', 7.0, 7.6],
    ['half', 4.9, 5.4],
    ['quarter', 3.5, 3.9],
    ['eighth', 2.4, 2.8],
    ['sixteenth', 1.7, 2.0],
  ])('%s is between %s and %s spaces', (duration, min, max) => {
    const spaces = getNoteWidth(duration, false) / SPACE;
    expect(spaces).toBeGreaterThanOrEqual(min);
    expect(spaces).toBeLessThanOrEqual(max);
  });

  test('each halving takes 1/√2 of the space above the floors', () => {
    expect(getNoteWidth('quarter', false) / getNoteWidth('eighth', false)).toBeCloseTo(
      Math.SQRT2,
      6
    );
    expect(getNoteWidth('half', false) / getNoteWidth('quarter', false)).toBeCloseTo(Math.SQRT2, 6);
  });

  test('short values are floored so heads and flags never crowd', () => {
    expect(getNoteWidth('thirtysecond', false)).toBe(NOTE_SPACING.MIN_WIDTH.thirtysecond);
    expect(getNoteWidth('sixtyfourth', false)).toBe(NOTE_SPACING.MIN_WIDTH.sixtyfourth);
    expect(getNoteWidth('sixteenth', false)).toBeGreaterThanOrEqual(
      NOTE_SPACING.MIN_WIDTH.sixteenth
    );
    expect(getNoteWidth('eighth', false)).toBeGreaterThanOrEqual(NOTE_SPACING.MIN_WIDTH.eighth);
  });

  test('a dot adds its own padding', () => {
    expect(getNoteWidth('quarter', true)).toBeGreaterThan(
      getNoteWidth('quarter', false) * Math.sqrt(1.5)
    );
  });
});

describe('bar widths at the 60% page-view default land in the engraved range', () => {
  test.each([
    ['eighth', 8, 40, 46],
    ['quarter', 4, 29, 36],
    ['sixteenth', 16, 52, 62],
    ['half', 2, 21, 27],
    ['whole', 1, 16, 20],
  ])('a 4/4 bar of %s × %s is %s–%s mm', (duration, count, min, max) => {
    const width = calculateMeasureLayout(
      bar(duration, count),
      undefined,
      'treble',
      false
    ).totalWidth;
    const mm = mmAtDefault(width);
    expect(mm).toBeGreaterThanOrEqual(min);
    expect(mm).toBeLessThanOrEqual(max);
  });

  test('the left measure padding is two staff spaces', () => {
    expect(CONFIG.measurePaddingLeft).toBe(2 * SPACE);
  });
});

describe('the grand-staff synchroniser spaces by the same table', () => {
  test('segment widths for plain notes equal getNoteWidth', () => {
    const quantToX = calculateSystemLayout([{ events: bar('eighth', 8) }]);
    for (let q = 0; q < 64; q += 8) {
      expect(quantToX[q + 8] - quantToX[q]).toBeCloseTo(getNoteWidth('eighth', false), 6);
    }
    const sixteenths = calculateSystemLayout([{ events: bar('sixteenth', 16) }]);
    expect(sixteenths[4] - sixteenths[0]).toBeCloseTo(getNoteWidth('sixteenth', false), 6);
  });
});
