/**
 * Tuplet quant integrality (#237 guard scope; foundation for #242).
 *
 * Pins the model's actual rhythm guarantee: tuplet MEMBERS are fractional and drift under
 * IEEE-754, but a complete tuplet GROUP spans an exact integer number of quants. `sumQuants`
 * must return that integer exactly (so #242 capacity/validation/re-anchoring math is sound),
 * and the creation guard must reject ratios that can't tile an integer span.
 *
 * @see src/utils/tuplet.ts
 */
import {
  tupletGroupSpan,
  isValidTupletRatio,
  sumQuants,
  quantsEqual,
} from '@/utils/tuplet';
import { getNoteDuration, calculateTotalQuants } from '@/utils/core';
import { ApplyTupletCommand } from '@/commands/TupletCommands';
import { createDefaultScore, ScoreEvent } from '@/types';

const eighths = (n: number): ScoreEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    duration: 'eighth',
    dotted: false,
    notes: [{ id: `n${i}`, pitch: 'C4' }],
  }));

const half: ScoreEvent = {
  id: 'h',
  duration: 'half',
  dotted: false,
  notes: [{ id: 'nh', pitch: 'C4' }],
};

/** Stamp a tuplet over the first `groupSize` events via the real command (so members get a
 *  shared group id), then return the resulting event list. */
const withTuplet = (events: ScoreEvent[], groupSize: number, ratio: [number, number]): ScoreEvent[] => {
  const score = createDefaultScore();
  score.staves[0].measures[0].events = events;
  return new ApplyTupletCommand(0, 0, groupSize, ratio).execute(score).staves[0].measures[0]
    .events;
};

describe('tuplet integrality (#237 guard / #242 foundation)', () => {
  describe('tupletGroupSpan — a complete group is an exact integer span', () => {
    it.each([
      ['eighth', [3, 2] as [number, number], 16], // triplet of eighths = 2 eighths
      ['eighth', [7, 4] as [number, number], 32], // septuplet of eighths = 4 eighths
      ['eighth', [6, 4] as [number, number], 32],
      ['quarter', [5, 4] as [number, number], 64], // quintuplet of quarters = 4 quarters
      ['sixteenth', [7, 4] as [number, number], 16],
    ])('%s %p spans %i quants', (base, ratio, expected) => {
      const span = tupletGroupSpan(base, ratio);
      expect(span).toBe(expected);
      expect(Number.isInteger(span)).toBe(true);
    });

    it('returns 0 for an unknown base duration', () => {
      expect(tupletGroupSpan('triple-whole', [3, 2])).toBe(0);
    });
  });

  describe('isValidTupletRatio — only ratios that tile an integer span', () => {
    it.each([
      ['eighth', [3, 2]],
      ['eighth', [7, 4]],
      ['quarter', [5, 4]],
      ['eighth', [2, 3]], // duplet: 2 in the space of 3
    ])('accepts %s %p', (base, ratio) => {
      expect(isValidTupletRatio(base, ratio as [number, number])).toBe(true);
    });

    it.each([
      ['eighth', [1, 2]], // actual < 2 — not a tuplet
      ['eighth', [3, 0]], // inSpaceOf 0 — zero-length members
      ['eighth', [0, 2]], // actual 0
      ['eighth', [3.5, 2]], // non-integer
      ['triple-whole', [3, 2]], // unknown base → span 0
    ])('rejects %s %p', (base, ratio) => {
      expect(isValidTupletRatio(base, ratio as [number, number])).toBe(false);
    });
  });

  describe('sumQuants — atomic group accounting is exact where naive summation drifts', () => {
    it('a complete eighth septuplet (7:4) sums to exactly 32 (naive summation drifts)', () => {
      const events = withTuplet(eighths(7), 7, [7, 4]);

      // Naive member summation drifts off the integer span under IEEE-754...
      const naive = events.reduce(
        (acc, e) => acc + getNoteDuration(e.duration, e.dotted, e.tuplet),
        0
      );
      expect(naive).not.toBe(32);
      expect(naive).toBeCloseTo(32, 6);
      // ...and so does the existing accountant.
      expect(calculateTotalQuants(events)).not.toBe(32);

      // The atomic accountant is exact.
      const { quants, partialTuplet } = sumQuants(events);
      expect(quants).toBe(32);
      expect(partialTuplet).toBe(false);
    });

    it('a complete eighth triplet (3:2) sums to exactly 16', () => {
      const { quants, partialTuplet } = sumQuants(withTuplet(eighths(3), 3, [3, 2]));
      expect(quants).toBe(16);
      expect(partialTuplet).toBe(false);
    });

    it('tiles a full 4/4 bar exactly: septuplet (32) + half (32) = 64', () => {
      const events = withTuplet([...eighths(7), half], 7, [7, 4]);
      const { quants, partialTuplet } = sumQuants(events);
      expect(quants).toBe(64);
      expect(partialTuplet).toBe(false);
    });

    it('accounts two complete groups in one measure (two eighth triplets = 32)', () => {
      const group = (prefix: string, gid: string): ScoreEvent[] =>
        Array.from({ length: 3 }, (_, i) => ({
          id: `${prefix}${i}`,
          duration: 'eighth',
          dotted: false,
          notes: [{ id: `${prefix}n${i}`, pitch: 'C4' }],
          tuplet: {
            ratio: [3, 2] as [number, number],
            groupSize: 3,
            position: i,
            baseDuration: 'eighth',
            id: gid,
          },
        }));
      const events = [...group('a', 'GA'), ...group('b', 'GB')];
      const { quants, partialTuplet } = sumQuants(events);
      expect(quants).toBe(32);
      expect(partialTuplet).toBe(false);
    });

    it('accounts a non-tuplet event preceding a group (quarter + triplet = 32)', () => {
      const events: ScoreEvent[] = [
        { id: 'q', duration: 'quarter', dotted: false, notes: [{ id: 'nq', pitch: 'C4' }] },
        ...withTuplet(eighths(3), 3, [3, 2]),
      ];
      expect(sumQuants(events).quants).toBe(32);
    });

    it('a plain (non-tuplet) measure still sums exactly', () => {
      const events: ScoreEvent[] = [
        { id: 'a', duration: 'half', dotted: false, notes: [{ id: 'na', pitch: 'C4' }] },
        { id: 'b', duration: 'quarter', dotted: false, notes: [{ id: 'nb', pitch: 'C4' }] },
        { id: 'c', duration: 'quarter', dotted: false, notes: [{ id: 'nc', pitch: 'C4' }] },
      ];
      expect(sumQuants(events).quants).toBe(64);
    });
  });

  describe('sumQuants — flags incomplete tuplets (mid-edit, not safely tileable)', () => {
    it('flags a partial group (2 of 3 triplet members present)', () => {
      const triplet = withTuplet(eighths(3), 3, [3, 2]);
      const { quants, partialTuplet } = sumQuants(triplet.slice(0, 2));
      expect(partialTuplet).toBe(true);
      expect(quants).toBeCloseTo((8 * 2) / 3 * 2, 6); // two fractional members
    });

    it('flags a tuplet event with no group id', () => {
      const orphan: ScoreEvent = {
        id: 'x',
        duration: 'eighth',
        dotted: false,
        notes: [{ id: 'n', pitch: 'C4' }],
        tuplet: { ratio: [3, 2], groupSize: 3, position: 0, baseDuration: 'eighth' },
      };
      expect(sumQuants([orphan]).partialTuplet).toBe(true);
    });
  });

  describe('quantsEqual — tolerant comparison for drift-prone sums', () => {
    it('treats a drifted septuplet sum as equal to its integer span', () => {
      expect(quantsEqual(31.999999999999993, 32)).toBe(true);
    });
    it('still distinguishes genuinely different quant counts', () => {
      expect(quantsEqual(16, 16.5)).toBe(false);
    });
  });

  describe('creation guard — ApplyTupletCommand rejects non-tiling ratios', () => {
    it('leaves the score untouched for an inSpaceOf-0 ratio', () => {
      const events = withTuplet(eighths(3), 3, [3, 0]);
      expect(events.every((e) => e.tuplet === undefined)).toBe(true);
    });

    it('applies a valid ratio', () => {
      const events = withTuplet(eighths(3), 3, [3, 2]);
      expect(events[0].tuplet).toEqual(
        expect.objectContaining({ ratio: [3, 2], groupSize: 3, baseDuration: 'eighth' })
      );
    });
  });
});
