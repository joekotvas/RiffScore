/**
 * ChordQuants tiling-invariant tests.
 *
 * Verifies (from first principles, against the rhythm model — not the impl) that:
 *  - chord-anchor positions within a measure are the exact prefix sums of event
 *    durations, so they tile [0, span) with no gaps, no overlap, no drift;
 *  - a fully-filled measure's events tile the time-signature capacity EXACTLY
 *    for representative meters (4/4, 3/4, 6/8);
 *  - the nominal capacity matches the independent beats × quarter-quant oracle.
 *
 * @tested src/services/chord/ChordQuants.ts
 */

import {
  getMeasureSpan,
  getMeasureQuantCapacity,
  getValidChordQuants,
} from '@/services/chord/ChordQuants';
import { getNoteDuration } from '@/utils/core';
import { NOTE_TYPES } from '@/constants';
import type { Measure, ScoreEvent, Score } from '@/types';

// ---------------------------------------------------------------------------
// Independent oracle: a quarter note is 16 quants by the project's grid, so the
// capacity of "N/D" is N * (quants-per-whole / D) = N * 64 / D. We compute this
// from NOTE_TYPES.whole rather than restating the TIME_SIGNATURES numbers so the
// test cannot merely mirror the constant under test.
// ---------------------------------------------------------------------------
const QUANTS_PER_WHOLE = NOTE_TYPES.whole.duration; // 64
const capacityFromMeter = (num: number, den: number): number => (num * QUANTS_PER_WHOLE) / den;

const event = (id: string, duration: string, dotted = false): ScoreEvent => ({
  id,
  duration,
  dotted,
  notes: [{ id: `${id}-n`, pitch: 'C4' }],
});

const measureOf = (events: ScoreEvent[]): Measure => ({ id: 'm', events });

const singleStaffScore = (measures: Measure[], timeSignature: string): Score => ({
  title: 'T',
  timeSignature,
  keySignature: 'C',
  bpm: 120,
  staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures }],
});

describe('ChordQuants — capacity oracle', () => {
  it.each([
    ['4/4', 4, 4],
    ['3/4', 3, 4],
    ['2/4', 2, 4],
    ['6/8', 6, 8],
  ])('capacity of %s equals num*64/den', (ts, num, den) => {
    expect(getMeasureQuantCapacity(ts)).toBe(capacityFromMeter(num, den));
  });
});

describe('ChordQuants — measure span tiling', () => {
  it('a 4/4 bar of four quarters tiles capacity exactly', () => {
    const m = measureOf([
      event('e0', 'quarter'),
      event('e1', 'quarter'),
      event('e2', 'quarter'),
      event('e3', 'quarter'),
    ]);
    expect(getMeasureSpan(m)).toBe(getMeasureQuantCapacity('4/4'));
  });

  it('a 3/4 bar of mixed durations tiles capacity exactly', () => {
    // half + quarter = 32 + 16 = 48
    const m = measureOf([event('e0', 'half'), event('e1', 'quarter')]);
    expect(getMeasureSpan(m)).toBe(getMeasureQuantCapacity('3/4'));
  });

  it('a 6/8 bar of two dotted quarters tiles capacity exactly', () => {
    // dotted quarter = 24; two of them = 48 = capacity of 6/8
    const m = measureOf([event('e0', 'quarter', true), event('e1', 'quarter', true)]);
    expect(getMeasureSpan(m)).toBe(getMeasureQuantCapacity('6/8'));
  });

  it('a 6/8 bar of six eighths tiles capacity exactly', () => {
    const eighths = Array.from({ length: 6 }, (_, i) => event(`e${i}`, 'eighth'));
    expect(getMeasureSpan(measureOf(eighths))).toBe(getMeasureQuantCapacity('6/8'));
  });

  it('empty measure has zero span', () => {
    expect(getMeasureSpan(measureOf([]))).toBe(0);
  });
});

describe('ChordQuants — anchor positions are exact prefix sums (no drift)', () => {
  /**
   * The set of valid chord anchors for a measure must equal the running prefix
   * sums of the event durations: {0, d0, d0+d1, ...}. We compute that oracle
   * independently here and assert set-equality, plus that the final boundary
   * lands exactly on the measure span (closure).
   */
  const assertAnchorsArePrefixSums = (events: ScoreEvent[], timeSignature: string) => {
    const score = singleStaffScore([measureOf(events)], timeSignature);
    const anchors = getValidChordQuants(score).get(0) ?? new Set<number>();

    let acc = 0;
    const expected = new Set<number>();
    for (const e of events) {
      expected.add(acc);
      acc += getNoteDuration(e.duration, e.dotted, e.tuplet);
    }

    expect([...anchors].sort((a, b) => a - b)).toEqual([...expected].sort((a, b) => a - b));
    // Closure: total accumulated equals the measure span (no lost remainder).
    expect(acc).toBe(getMeasureSpan(measureOf(events)));
  };

  it('quarters in 4/4 anchor at 0,16,32,48', () => {
    const events = [
      event('e0', 'quarter'),
      event('e1', 'quarter'),
      event('e2', 'quarter'),
      event('e3', 'quarter'),
    ];
    assertAnchorsArePrefixSums(events, '4/4');
    const anchors = getValidChordQuants(singleStaffScore([measureOf(events)], '4/4')).get(0)!;
    expect([...anchors].sort((a, b) => a - b)).toEqual([0, 16, 32, 48]);
  });

  it('dotted-quarter + eighth in 4/4 anchors at 0 and 24 (no rounding drift)', () => {
    assertAnchorsArePrefixSums([event('e0', 'quarter', true), event('e1', 'eighth')], '4/4');
  });

  it('two dotted quarters in 6/8 anchor at 0 and 24', () => {
    const events = [event('e0', 'quarter', true), event('e1', 'quarter', true)];
    assertAnchorsArePrefixSums(events, '6/8');
    const anchors = getValidChordQuants(singleStaffScore([measureOf(events)], '6/8')).get(0)!;
    expect([...anchors].sort((a, b) => a - b)).toEqual([0, 24]);
  });

  it('the last anchor + its event duration equals the full capacity for a filled 6/8 bar', () => {
    const events = [event('e0', 'quarter', true), event('e1', 'quarter', true)];
    const anchors = [
      ...(getValidChordQuants(singleStaffScore([measureOf(events)], '6/8')).get(0) ?? []),
    ].sort((a, b) => a - b);
    const lastAnchor = anchors[anchors.length - 1];
    const lastDur = getNoteDuration('quarter', true);
    expect(lastAnchor + lastDur).toBe(getMeasureQuantCapacity('6/8'));
  });
});
