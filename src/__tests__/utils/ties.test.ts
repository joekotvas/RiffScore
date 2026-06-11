/**
 * Tie validity (#242 Lane E).
 *
 * findTieTarget is the single definition of "what a tie connects to" (same-pitch note in the
 * IMMEDIATE next event; cross-barline; rests/reserved slots are never targets). repairTies clears
 * ties with no target but never invents one, and reflow now PRESERVES authored ties (the blanket
 * tied:false reset is gone) and repairs only genuinely-separated pairs.
 *
 * @see src/utils/ties.ts, src/utils/core.ts (flattenMeasures / reflowScore / repairTies)
 */
import { findTieTarget, hasTieTarget } from '@/utils/ties';
import { reflowScore, repairTies } from '@/utils/core';
import { Measure, ScoreEvent } from '@/types';

const note = (id: string, pitch: string | null, tied = false): ScoreEvent =>
  pitch === null
    ? { id, duration: 'quarter', dotted: false, isRest: true, notes: [{ id: `${id}n`, pitch: null, isRest: true }] }
    : { id, duration: 'quarter', dotted: false, notes: [{ id: `${id}n`, pitch, tied }] };

const chord = (id: string, pitches: string[], tiedPitches: string[] = []): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: pitches.map((p, i) => ({ id: `${id}n${i}`, pitch: p, tied: tiedPitches.includes(p) })),
});

const reserved = (id: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  reserved: true,
  isRest: true,
  notes: [{ id: `${id}n`, pitch: null, isRest: true, reserved: true }],
});

const m = (id: string, events: ScoreEvent[]): Measure => ({ id, events });

describe('findTieTarget', () => {
  it('resolves a same-pitch successor in the immediate next event', () => {
    const measures = [m('m0', [note('a', 'C4'), note('b', 'C4')])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toMatchObject({
      measureIndex: 0,
      eventIndex: 1,
      noteIndex: 0,
    });
  });

  it('returns null when the next event is a different pitch', () => {
    const measures = [m('m0', [note('a', 'C4'), note('b', 'D4')])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toBeNull();
  });

  it('crosses the barline to the first event of the next measure', () => {
    const measures = [m('m0', [note('a', 'C4')]), m('m1', [note('b', 'C4')])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toMatchObject({
      measureIndex: 1,
      eventIndex: 0,
    });
  });

  it('returns null cross-barline when the next measure starts on a different pitch', () => {
    const measures = [m('m0', [note('a', 'C4')]), m('m1', [note('b', 'G4')])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toBeNull();
  });

  it('returns null when the next event is a normal rest', () => {
    const measures = [m('m0', [note('a', 'C4'), note('r', null)])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toBeNull();
  });

  it('returns null when the next event is a reserved tuplet slot', () => {
    const measures = [m('m0', [note('a', 'C4'), reserved('res')])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toBeNull();
  });

  it('returns null for the last note of the score (no successor)', () => {
    const measures = [m('m0', [note('a', 'C4')])];
    expect(hasTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toBe(false);
  });

  it('does NOT skip-and-chain past an intervening rest to a later same pitch', () => {
    const measures = [m('m0', [note('a', 'C4'), note('r', null), note('c', 'C4')])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toBeNull();
  });

  it('resolves chord ties per-note', () => {
    const measures = [m('m0', [chord('a', ['C4', 'E4', 'G4']), chord('b', ['C4', 'G4'])])];
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'C4' })).toMatchObject({ noteIndex: 0 });
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'G4' })).toMatchObject({ noteIndex: 1 });
    expect(findTieTarget(measures, { measureIndex: 0, eventIndex: 0, pitch: 'E4' })).toBeNull(); // E4 not in next chord
  });
});

describe('repairTies', () => {
  it('clears a tie whose target is a rest', () => {
    const repaired = repairTies([m('m0', [note('a', 'C4', true), note('r', null)])]);
    expect(repaired[0].events[0].notes[0].tied).toBe(false);
  });

  it('keeps a tie whose same-pitch successor is present', () => {
    const repaired = repairTies([m('m0', [note('a', 'C4', true), note('b', 'C4')])]);
    expect(repaired[0].events[0].notes[0].tied).toBe(true);
  });

  it('never invents a tie between two coincidentally-adjacent same-pitch notes', () => {
    const repaired = repairTies([m('m0', [note('a', 'C4'), note('b', 'C4')])]); // neither authored a tie
    expect(repaired[0].events[0].notes[0].tied).toBeFalsy();
  });
});

describe('reflowScore tie preservation (Lane E)', () => {
  it('preserves a user tie whose same-pitch neighbor stays adjacent (no blanket wipe)', () => {
    const measures = [m('m0', [note('a', 'C4', true), note('b', 'C4'), note('c', 'C4'), note('d', 'C4')])];
    const out = reflowScore(measures, '4/4');
    expect(out[0].events[0].notes[0].tied).toBe(true);
  });

  it('breaks a tie that points at a rest after re-barring', () => {
    const measures = [m('m0', [note('a', 'C4', true), note('r', null), note('c', 'E4'), note('d', 'F4')])];
    const out = reflowScore(measures, '4/4');
    expect(out[0].events[0].notes[0].tied).toBe(false);
  });

  it('preserves per-note chord ties through reflow (not broadcast from notes[0])', () => {
    const measures = [m('m0', [chord('a', ['C4', 'E4'], ['C4']), chord('b', ['C4', 'E4']), note('x', 'G4'), note('y', 'G4')])];
    const out = reflowScore(measures, '4/4');
    const c = out[0].events[0].notes;
    expect(c.find((n) => n.pitch === 'C4')!.tied).toBe(true);
    expect(c.find((n) => n.pitch === 'E4')!.tied).toBeFalsy();
  });

  it('creates a split tie across the barline: head fragment ties, final fragment does not', () => {
    const whole: ScoreEvent = { id: 'w', duration: 'whole', dotted: false, notes: [{ id: 'wn', pitch: 'C4' }] };
    const out = reflowScore([m('m0', [whole])], '3/4');
    expect(out.length).toBeGreaterThan(1);
    const head = out[0].events[out[0].events.length - 1];
    expect(head.notes[0].tied).toBe(true); // continues into the next measure
    const lastMeasure = out[out.length - 1];
    const tail = lastMeasure.events[lastMeasure.events.length - 1];
    expect(tail.notes[0].tied).toBeFalsy(); // nothing after it
  });
});
