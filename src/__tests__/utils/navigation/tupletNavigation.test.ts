/**
 * Tuplet keyboard navigation (#242): a tuplet is a fixed-span container nested in the measure.
 * Stepping moves member-by-member; stepping off the last real member of an INCOMPLETE group lands
 * on a tuplet-fill ghost (cursor over the free slot); stepping again leaves the group (next event,
 * else the bar's append ghost, else next bar). Reserved slots are never landed on directly.
 *
 * @see src/utils/navigation/horizontal.ts, src/utils/navigation/stops.ts
 */
import { calculateNextSelection } from '@/utils/navigation';
import { Measure, ScoreEvent, Selection, PreviewNote } from '@/types';
import { getMeasureCapacity } from '@/constants';

const CAP = getMeasureCapacity('4/4');
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
const note = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const sel = (measureIndex: number | null, eventId: string | null): Selection =>
  ({ staffIndex: 0, measureIndex, eventId, noteId: eventId ? `${eventId}n` : null } as Selection);

const step = (
  measures: Measure[],
  selection: Selection,
  direction: 'left' | 'right',
  previewNote: PreviewNote | null = null
) => calculateNextSelection(measures, selection, direction, previewNote, 'eighth', false, CAP, 'treble', 0, 'NOTE');

describe('tuplet keyboard navigation', () => {
  // [C, E, reserved] (incomplete triplet) then 12 quants of free bar space.
  const incomplete: Measure[] = [{ id: 'm0', events: [trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)] }];

  it('steps member-by-member within the tuplet', () => {
    const r = step(incomplete, sel(0, 'a'), 'right');
    expect(r?.selection?.eventId).toBe('b');
    expect(r?.previewNote).toBeNull();
  });

  it('stepping off the last real member lands on the tuplet-fill ghost', () => {
    const r = step(incomplete, sel(0, 'b'), 'right');
    expect(r?.selection?.eventId).toBeNull();
    expect(r?.previewNote?.eventId).toBe('r'); // anchored to the reserved slot
    expect(r?.previewNote?.mode).toBe('CHORD');
    expect(r?.previewNote?.measureIndex).toBe(0);
  });

  it('never lands ON the reserved slot when stepping forward', () => {
    const r = step(incomplete, sel(0, 'b'), 'right');
    expect(r?.selection?.eventId).not.toBe('r');
  });

  it('from the fill ghost, stepping forward leaves the group to the bar append ghost', () => {
    const ghost: PreviewNote = {
      measureIndex: 0, staffIndex: 0, quant: 4, visualQuant: 4, pitch: 'E4',
      duration: 'eighth', dotted: false, mode: 'CHORD', index: 2, eventId: 'r', isRest: false,
    };
    const r = step(incomplete, sel(null, null), 'right', ghost);
    expect(r?.previewNote?.mode).toBe('APPEND'); // bar's own free space
    expect(r?.previewNote?.eventId).toBeUndefined();
  });

  it('from the fill ghost, stepping back selects the last real member', () => {
    const ghost: PreviewNote = {
      measureIndex: 0, staffIndex: 0, quant: 4, visualQuant: 4, pitch: 'E4',
      duration: 'eighth', dotted: false, mode: 'CHORD', index: 2, eventId: 'r', isRest: false,
    };
    const r = step(incomplete, sel(null, null), 'left', ghost);
    expect(r?.selection?.eventId).toBe('b');
    expect(r?.previewNote).toBeNull();
  });

  it('with an event AFTER the tuplet, the fill ghost steps forward to that event', () => {
    const measures: Measure[] = [
      { id: 'm0', events: [trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true), note('n', 'G4')] },
    ];
    const ghost: PreviewNote = {
      measureIndex: 0, staffIndex: 0, quant: 4, visualQuant: 4, pitch: 'E4',
      duration: 'eighth', dotted: false, mode: 'CHORD', index: 2, eventId: 'r', isRest: false,
    };
    const r = step(measures, sel(null, null), 'right', ghost);
    expect(r?.selection?.eventId).toBe('n');
  });

  it('a COMPLETE tuplet has no fill ghost — stepping off the last member behaves normally', () => {
    const complete: Measure[] = [
      { id: 'm0', events: [trip('a', 'C4', 0), trip('b', 'E4', 1), trip('c', 'G4', 2)] },
    ];
    const r = step(complete, sel(0, 'c'), 'right');
    // No fill ghost; falls to the measure append ghost (bar has free space).
    expect(r?.previewNote?.eventId).toBeUndefined();
    expect(r?.previewNote?.mode).toBe('APPEND');
  });
});
