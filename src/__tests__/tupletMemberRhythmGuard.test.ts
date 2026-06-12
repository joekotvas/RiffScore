/**
 * #265 Codex P2: changing a single tuplet member's rhythm (duration or dot) must be refused — it
 * breaks the group's uniformity/integrality and would yield an `incomplete-tuplet` invalid bar even
 * though the scalar measure total still fits.
 */
import { canModifyEventDuration, canToggleEventDot, validateMeasure } from '@/utils/validation';
import { getMeasureCapacity } from '@/constants';
import { Measure, ScoreEvent } from '@/types';

const cap = getMeasureCapacity('4/4'); // 64
const trip = (id: string, pitch: string, pos: number): ScoreEvent => ({
  id, duration: 'eighth', dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position: pos, baseDuration: 'eighth', id: 'T' },
});
const plain = (id: string, duration: string): ScoreEvent => ({ id, duration, dotted: false, notes: [{ id: `${id}n`, pitch: 'C4' }] });

describe('#265 tuplet-member rhythm guard', () => {
  const tupletEvents = [trip('a', 'C4', 0), trip('b', 'D4', 1), trip('c', 'E4', 2)]; // valid triplet (16q)

  it('canModifyEventDuration REJECTS changing a tuplet member to a different duration', () => {
    expect(canModifyEventDuration(tupletEvents, 'a', 'quarter', cap)).toBe(false);
    // and the change really would have produced an invalid bar:
    const broken: Measure = { id: 'm', events: tupletEvents.map((e) => (e.id === 'a' ? { ...e, duration: 'quarter' } : e)) };
    expect(validateMeasure(broken, cap).valid).toBe(false);
  });

  it('canModifyEventDuration ALLOWS a no-op (same duration) and is unaffected for non-tuplet events', () => {
    expect(canModifyEventDuration(tupletEvents, 'a', 'eighth', cap)).toBe(true); // no-op
    expect(canModifyEventDuration([plain('x', 'quarter'), plain('y', 'quarter')], 'x', 'half', cap)).toBe(true);
  });

  it('canToggleEventDot REJECTS toggling a tuplet member but not a plain note', () => {
    expect(canToggleEventDot(tupletEvents, 'a', cap)).toBe(false);
    expect(canToggleEventDot([plain('x', 'quarter')], 'x', cap)).toBe(true);
  });
});
