/**
 * #256: reflow (time-signature change) must treat a tuplet group as an atomic, indivisible unit —
 * never split it into plain-duration fragments that still carry the tuplet object (which produced
 * incoherent, validation-failing groups). The whole group moves to the next bar if it doesn't fit.
 */
import { reflowScore } from '@/utils/core';
import { sumQuants } from '@/utils/tuplet';
import { validateMeasure } from '@/utils/validation';
import { getMeasureCapacity } from '@/constants';
import { Measure, ScoreEvent } from '@/types';

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});
const trip = (id: string, pitch: string, position: number): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T1' },
});

// 4/4: quarter, quarter, [eighth-triplet ×3], quarter  (the issue's repro)
const source = (): Measure[] => [
  {
    id: 'm0',
    events: [q('a', 'C4'), q('b', 'D4'), trip('t0', 'E4', 0), trip('t1', 'F4', 1), trip('t2', 'G4', 2), q('c', 'A4')],
  },
];

const tupletMembers = (measures: Measure[]) =>
  measures.flatMap((m) => m.events).filter((e) => e.tuplet);

describe('reflowScore keeps tuplets atomic (#256)', () => {
  it('reflow 4/4 → 2/4 keeps the triplet intact and every bar valid', () => {
    const result = reflowScore(source(), '2/4');
    const cap = getMeasureCapacity('2/4');

    // The three triplet members survive as a coherent group: same id, contiguous positions 0/1/2,
    // unchanged eighth duration — NOT split into sixteenth/sixtyfourth fragments.
    const members = tupletMembers(result);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.duration)).toEqual(['eighth', 'eighth', 'eighth']);
    expect(members.map((m) => m.tuplet?.position)).toEqual([0, 1, 2]);
    expect(members.every((m) => m.tuplet?.id === 'T1')).toBe(true);

    // All three members land in the SAME measure (the group never straddles a bar line).
    const measureOf = (id: string) => result.findIndex((m) => m.events.some((e) => e.id === id));
    expect(new Set(members.map((m) => measureOf(m.id))).size).toBe(1);

    // No measure is flagged partial-tuplet or overfull.
    result.forEach((m) => {
      expect(sumQuants(m.events).partialTuplet).toBe(false);
      expect(validateMeasure(m, cap).valid).toBe(true);
    });
  });

  it('reflow 4/4 → 3/8 still keeps the triplet atomic (no overfull bar from a split group)', () => {
    const result = reflowScore(source(), '3/8');
    const cap = getMeasureCapacity('3/8');
    const members = tupletMembers(result);
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.tuplet?.position)).toEqual([0, 1, 2]);
    const measureOf = (id: string) => result.findIndex((m) => m.events.some((e) => e.id === id));
    expect(new Set(members.map((m) => measureOf(m.id))).size).toBe(1);
    result.forEach((m) => {
      expect(sumQuants(m.events).partialTuplet).toBe(false);
      // never overfull (a split group used to overflow a single bar)
      expect(sumQuants(m.events).quants).toBeLessThanOrEqual(cap);
    });
  });

  it('plain (non-tuplet) notes still split-and-tie across the bar line', () => {
    // 4/4 [quarter, half] → 2/4: the half straddles the bar line and splits into two tied quarters.
    const m: Measure[] = [
      {
        id: 'm0',
        events: [
          { id: 'qa', duration: 'quarter', dotted: false, notes: [{ id: 'qan', pitch: 'C4' }] },
          { id: 'h', duration: 'half', dotted: false, notes: [{ id: 'hn', pitch: 'D4' }] },
        ],
      },
    ];
    const result = reflowScore(m, '2/4');
    const notes = result.flatMap((mm) => mm.events);
    expect(notes.length).toBeGreaterThan(2); // the half split into tied fragments
    expect(notes.every((e) => !e.tuplet)).toBe(true);
    expect(notes.some((e) => e.notes.some((n) => n.tied))).toBe(true); // tie created across the bar
  });
});
