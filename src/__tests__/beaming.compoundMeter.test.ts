/**
 * Meter-aware beaming tests (issue #241).
 *
 * Beam grouping must respect the actual beat structure of the meter, not assume
 * 4/4. Expected groupings below are derived from music theory:
 *
 *   - Simple meters group beams by the denominator beat. In 4/4, 3/4 and 2/4 the
 *     beat is the quarter note, so consecutive eighths beam in pairs (two eighths
 *     per quarter beat).
 *   - Compound meters (numerator divisible by 3 and > 3: 6/8, 9/8, 12/8) feel a
 *     dotted-quarter beat that groups THREE eighth notes. So eighths beam in
 *     groups of three.
 *
 * The quant grid (utils/core): whole = 64, quarter = 16, eighth = 8, sixteenth = 4.
 *
 * @see calculateBeamingGroups
 * @see getBeamBeatQuants
 */

import { calculateBeamingGroups, getBeamBeatQuants } from '@/engines/layout/beaming';
import { ScoreEvent } from '@/types';

/** Build N consecutive notes of a given duration, ascending positions. */
const makeEvents = (
  count: number,
  duration: ScoreEvent['duration'],
  dotted = false
): ScoreEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `e${i + 1}`,
    duration,
    dotted,
    notes: [{ id: `n${i + 1}`, pitch: 'B4' }],
  }));

/** Evenly-spaced x-positions keyed by event id. */
const makePositions = (events: ScoreEvent[]): Record<string, number> =>
  events.reduce<Record<string, number>>((acc, e, i) => {
    acc[e.id] = 10 + i * 30;
    return acc;
  }, {});

/** Reduce beam groups to arrays of member ids (the assertable structure). */
const groupIds = (events: ScoreEvent[], timeSignature: string): string[][] => {
  const groups = calculateBeamingGroups(events, makePositions(events), 'treble', timeSignature);
  return groups.map((g) => g.ids);
};

describe('getBeamBeatQuants (first-principles beat sizing)', () => {
  test('simple meters use the denominator beat', () => {
    // quarter = 16 quants
    expect(getBeamBeatQuants('4/4')).toBe(16);
    expect(getBeamBeatQuants('3/4')).toBe(16);
    expect(getBeamBeatQuants('2/4')).toBe(16);
    // half = 32 quants
    expect(getBeamBeatQuants('2/2')).toBe(32);
    // eighth = 8 quants (3/8 is simple, not compound: numerator is not > 3)
    expect(getBeamBeatQuants('3/8')).toBe(8);
  });

  test('compound meters use a dotted beat of three denominator units', () => {
    // dotted quarter = three eighths = 24 quants
    expect(getBeamBeatQuants('6/8')).toBe(24);
    expect(getBeamBeatQuants('9/8')).toBe(24);
    expect(getBeamBeatQuants('12/8')).toBe(24);
    // dotted eighth = three sixteenths = 12 quants
    expect(getBeamBeatQuants('6/16')).toBe(12);
  });

  test('unknown/garbage signatures fall back to the quarter beat (4/4)', () => {
    expect(getBeamBeatQuants('garbage')).toBe(16);
    expect(getBeamBeatQuants('')).toBe(16);
    // default param
    expect(getBeamBeatQuants()).toBe(16);
  });
});

describe('compound meter beaming', () => {
  test('6/8: six eighths beam into exactly TWO groups of three', () => {
    const events = makeEvents(6, 'eighth');
    const groups = groupIds(events, '6/8');

    expect(groups).toEqual([
      ['e1', 'e2', 'e3'],
      ['e4', 'e5', 'e6'],
    ]);
  });

  test('9/8: nine eighths beam into THREE groups of three', () => {
    const events = makeEvents(9, 'eighth');
    const groups = groupIds(events, '9/8');

    expect(groups).toEqual([
      ['e1', 'e2', 'e3'],
      ['e4', 'e5', 'e6'],
      ['e7', 'e8', 'e9'],
    ]);
  });

  test('12/8: twelve eighths beam into FOUR groups of three', () => {
    const events = makeEvents(12, 'eighth');
    const groups = groupIds(events, '12/8');

    expect(groups).toEqual([
      ['e1', 'e2', 'e3'],
      ['e4', 'e5', 'e6'],
      ['e7', 'e8', 'e9'],
      ['e10', 'e11', 'e12'],
    ]);
  });

  test('6/8 mixed: quarter + eighth groups within each dotted-quarter beat', () => {
    // Beat 1 (0-24q): quarter(16) + eighth(8) -> the quarter is unbeamable, so the
    // lone eighth cannot form a group of >1 within beat 1.
    // Beat 2 (24-48q): three eighths -> one group of three.
    const events: ScoreEvent[] = [
      { id: 'q1', duration: 'quarter', dotted: false, notes: [{ id: 'a', pitch: 'B4' }] },
      { id: 'e1', duration: 'eighth', dotted: false, notes: [{ id: 'b', pitch: 'B4' }] },
      { id: 'e2', duration: 'eighth', dotted: false, notes: [{ id: 'c', pitch: 'B4' }] },
      { id: 'e3', duration: 'eighth', dotted: false, notes: [{ id: 'd', pitch: 'B4' }] },
      { id: 'e4', duration: 'eighth', dotted: false, notes: [{ id: 'f', pitch: 'B4' }] },
    ];
    const groups = groupIds(events, '6/8');

    // Only the full second beat (e2,e3,e4) beams together. The first eighth (e1)
    // sits alone after the quarter within beat 1 and is not beamed.
    expect(groups).toEqual([['e2', 'e3', 'e4']]);
  });

  test('6/8: a dotted-quarter beat boundary is never crossed', () => {
    // Four eighths in 6/8: first three fill beat 1, the fourth starts beat 2 alone.
    const events = makeEvents(4, 'eighth');
    const groups = groupIds(events, '6/8');

    expect(groups).toEqual([['e1', 'e2', 'e3']]);
  });
});

describe('simple meter beaming (quarter beat)', () => {
  test('3/4: six eighths beam in pairs (three quarter beats)', () => {
    const events = makeEvents(6, 'eighth');
    const groups = groupIds(events, '3/4');

    expect(groups).toEqual([
      ['e1', 'e2'],
      ['e3', 'e4'],
      ['e5', 'e6'],
    ]);
  });

  test('2/4: four eighths beam in pairs (two quarter beats)', () => {
    const events = makeEvents(4, 'eighth');
    const groups = groupIds(events, '2/4');

    expect(groups).toEqual([
      ['e1', 'e2'],
      ['e3', 'e4'],
    ]);
  });
});

describe('4/4 regression (behavior must be identical to before #241)', () => {
  test('eight eighths beam in four pairs by the quarter beat', () => {
    const events = makeEvents(8, 'eighth');

    // Explicit default (no timeSignature) and explicit '4/4' must match.
    const defaultPositions = makePositions(events);
    const defaultGroups = calculateBeamingGroups(events, defaultPositions, 'treble');
    const explicitGroups = groupIds(events, '4/4');

    const expected = [
      ['e1', 'e2'],
      ['e3', 'e4'],
      ['e5', 'e6'],
      ['e7', 'e8'],
    ];

    expect(defaultGroups.map((g) => g.ids)).toEqual(expected);
    expect(explicitGroups).toEqual(expected);
  });

  test('four sixteenths within one beat beam together', () => {
    const events = makeEvents(4, 'sixteenth');
    const groups = groupIds(events, '4/4');

    // 4 sixteenths = 16 quants = exactly one quarter beat -> single group.
    expect(groups).toEqual([['e1', 'e2', 'e3', 'e4']]);
  });

  test('quarter note breaks the beam (no group spanning the rest of the beat)', () => {
    const events: ScoreEvent[] = [
      { id: 'e1', duration: 'eighth', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
      { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
      { id: 'e3', duration: 'eighth', dotted: false, notes: [{ id: 'n3', pitch: 'E4' }] },
    ];
    const groups = groupIds(events, '4/4');

    // No beam group of >1 note can form.
    expect(groups).toEqual([]);
  });
});
