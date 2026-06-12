/**
 * Deep-QA regressions: make/unmake tuplet must honor the "no silent overflow / no incoherent group"
 * invariants the #242 branch introduced.
 *   #1 — RemoveTupletCommand must not silently overfill the bar.
 *   #2 — ApplyTupletCommand must reject a non-uniform (mixed-duration) selection.
 */
import { ApplyTupletCommand, RemoveTupletCommand, DeleteEventCommand } from '@/commands';
import { sumQuants } from '@/utils/tuplet';
import { validateMeasure } from '@/utils/validation';
import { getMeasureCapacity } from '@/constants';
import { createDefaultScore, ScoreEvent, Score } from '@/types';

const ev = (id: string, duration: string): ScoreEvent => ({
  id, duration, dotted: false, notes: [{ id: `${id}n`, pitch: 'C4' }],
});
const scoreWith = (events: ScoreEvent[], ts: string): Score => {
  const s = createDefaultScore();
  s.timeSignature = ts;
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};
const m0 = (s: Score) => s.staves[0].measures[0];

describe('#1 RemoveTupletCommand never silently overfills', () => {
  it('refuses (no-op) when restoring full durations would overflow the bar', () => {
    const cap = getMeasureCapacity('2/4'); // 32
    // 2/4 bar: an eighth-triplet (16q) + a quarter (16q) = 32q, exactly full.
    let s = scoreWith([ev('a', 'eighth'), ev('b', 'eighth'), ev('c', 'eighth'), ev('q', 'quarter')], '2/4');
    s = new ApplyTupletCommand(0, 0, 3, [3, 2]).execute(s);
    expect(validateMeasure(m0(s), cap).valid).toBe(true);

    const before = m0(s).events;
    const after = new RemoveTupletCommand(0, 0).execute(s);
    // Stripping the triplet would restore 3×eighth (24q) + quarter (16q) = 40q > 32 → fail closed.
    expect(m0(after).events).toBe(before); // untouched
    expect(validateMeasure(m0(after), cap).valid).toBe(true);
  });

  it('still removes a tuplet when there IS room', () => {
    const cap = getMeasureCapacity('4/4'); // 64
    let s = scoreWith([ev('a', 'eighth'), ev('b', 'eighth'), ev('c', 'eighth')], '4/4');
    s = new ApplyTupletCommand(0, 0, 3, [3, 2]).execute(s);
    s = new RemoveTupletCommand(0, 0).execute(s);
    expect(m0(s).events.every((e) => !e.tuplet)).toBe(true);
    expect(validateMeasure(m0(s), cap).valid).toBe(true); // 3×eighth = 24q ≤ 64
  });
});

describe('#2 ApplyTupletCommand rejects a non-uniform selection', () => {
  it('leaves the score untouched for mixed durations (would mint an incoherent group)', () => {
    const s = scoreWith([ev('q', 'quarter'), ev('e1', 'eighth'), ev('e2', 'eighth')], '4/4');
    const after = new ApplyTupletCommand(0, 0, 3, [3, 2]).execute(s);
    expect(after).toBe(s); // no-op
    expect(m0(after).events.some((e) => e.tuplet)).toBe(false);
  });

  it('still applies for a uniform selection', () => {
    const s = scoreWith([ev('a', 'eighth'), ev('b', 'eighth'), ev('c', 'eighth')], '4/4');
    const after = new ApplyTupletCommand(0, 0, 3, [3, 2]).execute(s);
    expect(m0(after).events.every((e) => e.tuplet?.id)).toBe(true);
    expect(sumQuants(m0(after).events).partialTuplet).toBe(false);
  });
});

describe('#7 RemoveTupletCommand drops reserved slots (no orphan rest)', () => {
  it('collapses a freed slot instead of leaving a reserved rest in plain space', () => {
    // Build an eighth-triplet, then delete the middle member → a reserved slot remains.
    let s = scoreWith([ev('a', 'eighth'), ev('b', 'eighth'), ev('c', 'eighth')], '4/4');
    s = new ApplyTupletCommand(0, 0, 3, [3, 2]).execute(s);
    s = new DeleteEventCommand(0, 'b', 0).execute(s);
    expect(m0(s).events.some((e) => e.reserved)).toBe(true); // reserved slot present

    const before = m0(s).events;
    const removeCmd = new RemoveTupletCommand(0, 0);
    s = removeCmd.execute(s);
    // No tuplet metadata AND no orphaned reserved rest left behind.
    expect(m0(s).events.some((e) => e.tuplet)).toBe(false);
    expect(m0(s).events.some((e) => e.reserved)).toBe(false);
    expect(m0(s).events.every((e) => !e.reserved && e.notes.every((n) => n.pitch !== null))).toBe(true);

    // undo restores the prior state exactly (reserved slot back).
    const undone = removeCmd.undo(s);
    expect(m0(undone).events).toEqual(before);
  });
});
