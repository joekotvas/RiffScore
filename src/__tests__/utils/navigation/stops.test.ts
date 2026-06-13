/**
 * getStops (#242): the unified navigable-position model. Notes (incl. tuplet members) are stops;
 * an incomplete tuplet contributes ONE `tupletFill` ghost stop (reserved slots are never their own
 * stop); a bar with room contributes a trailing `append` stop.
 */
import { getStops, findTupletFillAtQuant } from '@/utils/navigation/stops';
import { Measure, ScoreEvent } from '@/types';
import { getMeasureCapacity } from '@/constants';
import { getNoteDuration } from '@/utils/core';

const cap = getMeasureCapacity('4/4');
const note = (id: string, duration: string, pitch = 'C4'): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});
const trip = (id: string, pitch: string | null, position: number, reserved = false): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  reserved,
  isRest: reserved || pitch === null,
  notes: reserved
    ? [{ id: `${id}-rest`, pitch: null, isRest: true, reserved: true }]
    : [{ id: `${id}n`, pitch: pitch as string }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
});
const measure = (events: ScoreEvent[]): Measure => ({ id: 'm', events });
const kinds = (s: ReturnType<typeof getStops>) => s.map((x) => x.kind);

describe('getStops', () => {
  it('plain notes with room: note stops + a trailing append stop', () => {
    const stops = getStops(measure([note('a', 'quarter'), note('b', 'quarter')]), cap);
    expect(kinds(stops)).toEqual(['note', 'note', 'append']);
  });

  it('a FULL bar has no append stop', () => {
    const stops = getStops(measure([note('a', 'whole')]), cap);
    expect(kinds(stops)).toEqual(['note']);
  });

  it('a complete tuplet: three note stops, no fill ghost', () => {
    const full = measure([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('c', 'G4', 2)]);
    const stops = getStops(full, cap);
    // 3 members fill the bar's three-eighth-triplet footprint; remaining bar room → append
    expect(stops.filter((s) => s.kind === 'note')).toHaveLength(3);
    expect(stops.some((s) => s.kind === 'tupletFill')).toBe(false);
  });

  it('an INCOMPLETE tuplet: real members are notes, free space is ONE tupletFill ghost', () => {
    const incomplete = measure([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)]);
    const stops = getStops(incomplete, cap);
    const tupletStops = stops.filter((s) => s.kind === 'note' || s.kind === 'tupletFill');
    expect(tupletStops.map((s) => s.kind)).toEqual(['note', 'note', 'tupletFill']);
    const fill = stops.find((s) => s.kind === 'tupletFill');
    expect(fill).toMatchObject({ reservedId: 'r', reservedIndex: 2, baseDuration: 'eighth' });
  });

  it('reserved slots never appear as their own note stop', () => {
    const incomplete = measure([trip('a', 'C4', 0), trip('r', null, 1, true), trip('r2', null, 2, true)]);
    const stops = getStops(incomplete, cap);
    expect(stops.filter((s) => s.kind === 'note')).toHaveLength(1); // only the real member
    expect(stops.filter((s) => s.kind === 'tupletFill')).toHaveLength(1); // one ghost for the group
  });

  it('an empty bar is just an append stop', () => {
    expect(kinds(getStops(measure([]), cap))).toEqual(['append']);
  });

  it('emits stops in quant order even when a reserved slot is non-trailing (#264 QA)', () => {
    // Loaded/malformed ordering [real, reserved, real] — normal editing packs reserved to the end,
    // but loadScore accepts any order. The fill ghost must sort between the two real members so its
    // free-space range can't span (and shadow) the second real member.
    const m = measure([trip('a', 'C4', 0), trip('r', null, 1, true), trip('b', 'E4', 2)]);
    const stops = getStops(m, cap);
    expect(kinds(stops)).toEqual(['note', 'tupletFill', 'note', 'append']);
    const quants = stops.map((s) => s.quant);
    expect(quants).toEqual([...quants].sort((x, y) => x - y)); // strictly ascending

    const memberQ = getNoteDuration('eighth', false, { ratio: [3, 2] });
    expect(findTupletFillAtQuant(m, cap, memberQ)).not.toBeNull(); // inside the reserved region
    expect(findTupletFillAtQuant(m, cap, memberQ * 2)).toBeNull(); // the 2nd real member — NOT shadowed
  });
});
