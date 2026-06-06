/**
 * Capacity SSOT + measure-integrity invariants (#242 Lane A).
 *
 * Pins that bar capacity has one source (`getMeasureCapacity`), that a measure can't silently
 * exceed it, that an incomplete tuplet group is caught, and — using the corpus — that every
 * shipped fixture satisfies the invariant. The audit's headline gap was "zero measure-integrity
 * assertions exist"; this closes it.
 *
 * @see src/utils/validation.ts
 */
import { getMeasureCapacity } from '@/constants';
import { validateMeasure, validateScore } from '@/utils/validation';
import { ApplyTupletCommand } from '@/commands/TupletCommands';
import { createDefaultScore, Measure, ScoreEvent } from '@/types';
import { visualFixtures } from '@/__tests__/fixtures/visual';

const ev = (id: string, duration: string, dotted = false): ScoreEvent => ({
  id,
  duration,
  dotted,
  notes: [{ id: `${id}n`, pitch: 'C4' }],
});
const measure = (events: ScoreEvent[], isPickup = false): Measure => ({ id: 'm', events, isPickup });

/** Build a single measure's events, stamping a tuplet over the first `groupSize` of them. */
const tupletEvents = (count: number, groupSize: number, ratio: [number, number]): ScoreEvent[] => {
  const score = createDefaultScore();
  score.staves[0].measures[0].events = Array.from({ length: count }, (_, i) => ev(`t${i}`, 'eighth'));
  return new ApplyTupletCommand(0, 0, groupSize, ratio).execute(score).staves[0].measures[0].events;
};

describe('getMeasureCapacity — single source of truth', () => {
  it.each([
    ['4/4', 64], // table fast-path
    ['3/4', 48],
    ['2/4', 32],
    ['6/8', 48],
  ])('maps tabled %s to %i quants', (ts, expected) => {
    expect(getMeasureCapacity(ts)).toBe(expected);
  });

  it.each([
    ['9/8', 72], // derived: not in the table, but a real compound meter
    ['12/8', 96],
    ['7/8', 56],
    ['2/2', 64],
  ])('derives untabled %s to %i quants', (ts, expected) => {
    expect(getMeasureCapacity(ts)).toBe(expected);
  });

  it('falls back to 4/4 for a malformed signature', () => {
    expect(getMeasureCapacity('garbage')).toBe(64);
  });

  it('rejects a non-power-of-two denominator rather than returning a fractional capacity', () => {
    expect(getMeasureCapacity('4/3')).toBe(64); // 4*64/3 = 85.33… is not integral → fallback
  });

  it('is null-safe for scores loaded without a time signature', () => {
    // Scores loaded via the API can carry a missing timeSignature; must not throw.
    expect(getMeasureCapacity(undefined as unknown as string)).toBe(64);
  });
});

describe('validateMeasure (#242 measure integrity)', () => {
  it('accepts an exactly-full 4/4 bar', () => {
    expect(validateMeasure(measure([ev('a', 'whole')]), 64)).toMatchObject({
      valid: true,
      quants: 64,
    });
  });

  it('accepts an under-full bar (model renders the remainder as an implicit rest)', () => {
    expect(validateMeasure(measure([ev('a', 'quarter')]), 64).valid).toBe(true);
  });

  it('rejects an over-full bar', () => {
    const result = validateMeasure(measure([ev('a', 'whole'), ev('b', 'quarter')]), 64); // 80 > 64
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('overfull');
  });

  it('accepts a full tuplet bar exactly: eighth septuplet (32) + half (32) = 64', () => {
    const score = createDefaultScore();
    score.staves[0].measures[0].events = [
      ...Array.from({ length: 7 }, (_, i) => ev(`t${i}`, 'eighth')),
      ev('h', 'half'),
    ];
    const m = new ApplyTupletCommand(0, 0, 7, [7, 4]).execute(score).staves[0].measures[0];
    const result = validateMeasure(m, 64);
    expect(result.valid).toBe(true);
    expect(result.quants).toBe(64); // exact, not float-drifted
  });

  it('rejects an incomplete tuplet group', () => {
    const partial = measure(tupletEvents(3, 3, [3, 2]).slice(0, 2)); // 2 of 3
    const result = validateMeasure(partial, 64);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('incomplete-tuplet');
  });

  it('rejects an over-full bar built from a dotted (heterogeneous) tuplet group', () => {
    // 3 dotted-eighths in a 3:2 triplet occupy 24 quants (not the 16-quant nominal span);
    // with a dotted half (48) that is 72 > 64. Accounting by span would have read this valid.
    const dottedTriplet: ScoreEvent[] = ['eighth', 'eighth', 'eighth'].map((d, i) => ({
      id: `dt${i}`,
      duration: d,
      dotted: true,
      notes: [{ id: `dt${i}n`, pitch: 'C4' }],
      tuplet: { ratio: [3, 2], groupSize: 3, position: i, baseDuration: 'eighth', id: 'DT' },
    }));
    const result = validateMeasure(measure([...dottedTriplet, ev('dh', 'half', true)]), 64);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('overfull');
    expect(result.quants).toBe(72);
  });
});

describe('validateScore (#242)', () => {
  it('passes a fresh default score (empty measures are valid)', () => {
    expect(validateScore(createDefaultScore()).valid).toBe(true);
  });

  it('flags an over-full measure with its location', () => {
    const score = createDefaultScore();
    score.staves[0].measures[0].events = [ev('a', 'whole'), ev('b', 'quarter')];
    const result = validateScore(score);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatchObject({ staffIndex: 0, measureIndex: 0 });
    expect(result.errors[0].reason).toContain('overfull');
  });

  it('flags grand-staff measure-count mismatch (parity)', () => {
    const score = createDefaultScore();
    const extraCount = score.staves[0].measures.length + 1;
    score.staves.push({
      id: 's2',
      clef: 'bass',
      keySignature: 'C',
      measures: Array.from({ length: extraCount }, (_, i) => ({ id: `s2m${i}`, events: [] })),
    });
    const result = validateScore(score);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.measureIndex === -1)).toBe(true);
  });
});

describe('measure-integrity invariant over the visual fixture corpus (#242/#252)', () => {
  it.each(visualFixtures.map((f) => [f.name, f] as const))(
    '%s: no over-full or incomplete-tuplet measures',
    (_name, fixture) => {
      expect(validateScore(fixture.score).errors).toEqual([]);
    }
  );
});
