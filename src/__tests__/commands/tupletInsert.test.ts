/**
 * InsertTupletMemberCommand (#242): the container-aware tuplet insert. Inserting a member consumes
 * a reserved slot (free space) so the group's span + member count stay fixed; a full tuplet is a
 * no-op (caller rejects with feedback). End-fill (localIndex === realCount) fills the next free
 * slot; a smaller index inserts between members. Undo is lossless; the group stays coherent.
 *
 * @see src/commands/InsertTupletMemberCommand.ts, src/utils/tupletEdit.ts
 */
import { InsertTupletMemberCommand } from '@/commands/InsertTupletMemberCommand';
import { sumQuants } from '@/utils/tuplet';
import { validateMeasure } from '@/utils/validation';
import { getMeasureCapacity } from '@/constants';
import { createDefaultScore, Score, ScoreEvent } from '@/types';

const T = 'T';
const trip = (id: string, pitch: string | null, position: number, reserved = false): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  reserved,
  isRest: reserved || pitch === null,
  notes: reserved
    ? [{ id: `${id}-rest`, pitch: null, isRest: true, reserved: true }]
    : [{ id: `${id}n`, pitch: pitch as string }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: T },
});

const newMember = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const scoreWith = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};
const events = (s: Score) => s.staves[0].measures[0].events;
const pitches = (s: Score) => events(s).map((e) => (e.reserved ? 'RES' : (e.notes[0].pitch ?? 'rest')));

describe('InsertTupletMemberCommand', () => {
  it('inserts BETWEEN members of an incomplete triplet, keeping the group coherent', () => {
    // [C, E, reserved] then surrounding context note
    const score = scoreWith([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)]);
    const cmd = new InsertTupletMemberCommand(0, 'a', 1, newMember('x', 'D4'), 0);
    const after = cmd.execute(score);
    expect(pitches(after)).toEqual(['C4', 'D4', 'E4']);
    // group invariants hold: complete, coherent, not flagged partial
    const { partialTuplet } = sumQuants(events(after));
    expect(partialTuplet).toBe(false);
    expect(events(after).every((e) => e.tuplet?.id === T && e.tuplet?.groupSize === 3)).toBe(true);
    expect(events(after).map((e) => e.tuplet?.position)).toEqual([0, 1, 2]);
  });

  it('end-fill (localIndex === realCount) fills the next free slot', () => {
    const score = scoreWith([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)]);
    const after = new InsertTupletMemberCommand(0, 'a', 2, newMember('x', 'G4'), 0).execute(score);
    expect(pitches(after)).toEqual(['C4', 'E4', 'G4']);
  });

  it('is a no-op on a FULL tuplet (caller rejects with feedback)', () => {
    const score = scoreWith([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('c', 'G4', 2)]);
    const after = new InsertTupletMemberCommand(0, 'a', 1, newMember('x', 'D4'), 0).execute(score);
    expect(pitches(after)).toEqual(['C4', 'E4', 'G4']); // unchanged
  });

  it('undo restores the exact prior run', () => {
    const score = scoreWith([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)]);
    const cmd = new InsertTupletMemberCommand(0, 'a', 1, newMember('x', 'D4'), 0);
    const after = cmd.execute(score);
    const back = cmd.undo(after);
    expect(pitches(back)).toEqual(['C4', 'E4', 'RES']);
    expect(events(back).map((e) => e.tuplet?.position)).toEqual([0, 1, 2]);
  });

  it('execute→undo→redo is stable', () => {
    const score = scoreWith([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)]);
    const cmd = new InsertTupletMemberCommand(0, 'a', 1, newMember('x', 'D4'), 0);
    const once = pitches(cmd.execute(score));
    cmd.undo(cmd.execute(score));
    const twice = pitches(cmd.execute(score));
    expect(twice).toEqual(once);
  });

  it('keeps the measure valid after insertion', () => {
    const score = scoreWith([trip('a', 'C4', 0), trip('b', 'E4', 1), trip('r', null, 2, true)]);
    const after = new InsertTupletMemberCommand(0, 'a', 1, newMember('x', 'D4'), 0).execute(score);
    const capacity = getMeasureCapacity('4/4');
    expect(validateMeasure(after.staves[0].measures[0], capacity).valid).toBe(true);
  });
});
