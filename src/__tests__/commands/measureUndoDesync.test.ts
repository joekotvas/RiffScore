/**
 * Deep-QA regressions #8/#18: Add/DeleteMeasure undo must stay correct when a grand staff is desynced
 * (staves with unequal measure counts), and #16: range linearization skips reserved tuplet slots.
 */
import { AddMeasureCommand, DeleteMeasureCommand } from '@/commands';
import { getLinearizedNotes } from '@/utils/selection';
import { createDefaultScore, Measure, Score, ScoreEvent } from '@/types';

const m = (id: string, n: number): Measure => ({
  id,
  events: Array.from({ length: n }, (_, i) => ({
    id: `${id}e${i}`,
    duration: 'quarter',
    dotted: false,
    notes: [{ id: `${id}n${i}`, pitch: 'C4' }],
  })),
});

// A grand staff where staff 1 has FEWER measures than staff 0 (desynced).
const desynced = (): Score => {
  const s = createDefaultScore();
  s.staves = [
    { ...s.staves[0], clef: 'treble', measures: [m('t0', 1), m('t1', 1), m('t2', 1)] },
    { id: 'sb', clef: 'bass', keySignature: 'C', measures: [m('b0', 1)] },
  ] as Score['staves'];
  return s;
};
const counts = (s: Score) => s.staves.map((st) => st.measures.length);

describe('#8 AddMeasureCommand.undo on a desynced grand staff', () => {
  it('removes the added bar from every staff by its recorded id (no orphan)', () => {
    const s = desynced();
    const before = counts(s); // [3, 1]
    const cmd = new AddMeasureCommand(); // append
    const added = cmd.execute(s);
    expect(counts(added)).toEqual([4, 2]);
    const undone = cmd.undo(added);
    expect(counts(undone)).toEqual(before); // [3, 1] — no orphaned bar left on either staff
  });
});

describe('#18 DeleteMeasureCommand.undo on a desynced grand staff', () => {
  it('restores the deleted bar to the correct staff (index-aligned)', () => {
    const s = desynced();
    const cmd = new DeleteMeasureCommand(0); // delete bar 0 from both staves (both have it)
    const deleted = cmd.execute(s);
    expect(counts(deleted)).toEqual([2, 0]);
    const undone = cmd.undo(deleted);
    expect(counts(undone)).toEqual([3, 1]);
    // the restored bars went back to their own staves (ids match), not swapped
    expect(undone.staves[0].measures[0].id).toBe('t0');
    expect(undone.staves[1].measures[0].id).toBe('b0');
  });
});

describe('#16 getLinearizedNotes skips reserved tuplet slots', () => {
  it('omits reserved placeholders from the linearized note list', () => {
    const s = createDefaultScore();
    const reserved: ScoreEvent = {
      id: 'r',
      duration: 'eighth',
      dotted: false,
      reserved: true,
      isRest: true,
      tuplet: { ratio: [3, 2], groupSize: 3, position: 2, baseDuration: 'eighth', id: 'T' },
      notes: [{ id: 'r-rest', pitch: null, isRest: true, reserved: true }],
    };
    const real: ScoreEvent = {
      id: 'a',
      duration: 'eighth',
      dotted: false,
      tuplet: { ratio: [3, 2], groupSize: 3, position: 0, baseDuration: 'eighth', id: 'T' },
      notes: [{ id: 'an', pitch: 'C4' }],
    };
    s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events: [real, reserved] }] }];
    const linear = getLinearizedNotes(s);
    expect(linear.some((n) => n.eventId === 'a')).toBe(true);
    expect(linear.some((n) => n.eventId === 'r')).toBe(false); // reserved slot excluded
  });
});
