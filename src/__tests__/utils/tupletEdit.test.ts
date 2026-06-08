/**
 * insertTupletMember (#242): the inverse of repackTupletRun. Inserting a member into a tuplet
 * consumes a reserved slot (free space) so the group's span + member count stay fixed; a full
 * tuplet rejects. Reserved slots pack to the end, so end-fill is just localIndex === realCount.
 */
import { insertTupletMember, repackTupletRun, reservedSlotId } from '@/utils/tupletEdit';
import { ScoreEvent } from '@/types';

const T = 'grp';
const member = (id: string, pitch: string | null, position: number, reserved = false): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  reserved,
  isRest: reserved || pitch === null,
  notes: reserved
    ? [{ id: `${id}-rest`, pitch: null, isRest: true, reserved: true }]
    : pitch === null
      ? [{ id: `${id}-rest`, pitch: null, isRest: true }]
      : [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: T },
});

const newReal = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter', // deliberately wrong — insertTupletMember must stamp the group's baseDuration
  dotted: true, // deliberately wrong — must be cleared
  notes: [{ id: `${id}n`, pitch }],
});

const pitches = (members: ScoreEvent[]) => members.map((m) => (m.reserved ? 'RES' : (m.notes[0].pitch ?? 'rest')));
const positions = (members: ScoreEvent[]) => members.map((m) => m.tuplet?.position);

describe('insertTupletMember', () => {
  it('rejects (full:true) when the tuplet has no reserved slot', () => {
    const full = [member('a', 'C4', 0), member('b', 'E4', 1), member('c', 'G4', 2)];
    expect(insertTupletMember(full, 1, newReal('x', 'D4'))).toEqual({ full: true });
  });

  it('inserts BETWEEN members, consuming a reserved slot and renumbering', () => {
    // [C, E, reserved] (a triplet with one freed slot). Insert D between C and E.
    const members = [member('a', 'C4', 0), member('b', 'E4', 1), member('r', null, 2, true)];
    const res = insertTupletMember(members, 1, newReal('x', 'D4'));
    expect(res.full).toBe(false);
    if (res.full) return;
    expect(pitches(res.members)).toEqual(['C4', 'D4', 'E4']); // reserved consumed, span preserved
    expect(positions(res.members)).toEqual([0, 1, 2]); // renumbered contiguous
    expect(res.members.every((m) => m.tuplet?.id === T && m.tuplet?.groupSize === 3)).toBe(true);
  });

  it('stamps the group rhythm (baseDuration, dotted:false, tuplet) onto the new member', () => {
    const members = [member('a', 'C4', 0), member('b', 'E4', 1), member('r', null, 2, true)];
    const res = insertTupletMember(members, 1, newReal('x', 'D4'));
    if (res.full) throw new Error('expected insert');
    const inserted = res.members.find((m) => m.id === 'x')!;
    expect(inserted.duration).toBe('eighth');
    expect(inserted.dotted).toBe(false);
    expect(inserted.tuplet).toMatchObject({ id: T, groupSize: 3, baseDuration: 'eighth', position: 1 });
  });

  it('end-fill (localIndex === realCount) fills the next free slot', () => {
    const members = [member('a', 'C4', 0), member('b', 'E4', 1), member('r', null, 2, true)];
    const res = insertTupletMember(members, 2, newReal('x', 'G4'));
    if (res.full) throw new Error('expected insert');
    expect(pitches(res.members)).toEqual(['C4', 'E4', 'G4']);
  });

  it('a localIndex past the free space clamps to end-fill', () => {
    const members = [member('a', 'C4', 0), member('b', 'E4', 1), member('r', null, 2, true)];
    const res = insertTupletMember(members, 99, newReal('x', 'G4'));
    if (res.full) throw new Error('expected insert');
    expect(pitches(res.members)).toEqual(['C4', 'E4', 'G4']);
  });

  it('with two free slots, insert consumes exactly one (member count constant)', () => {
    // groupSize 3 but only 1 real member + 2 reserved (deleted twice). Insert one → 2 real, 1 reserved.
    const members = [member('a', 'C4', 0), member('r1', null, 1, true), member('r2', null, 2, true)];
    const res = insertTupletMember(members, 0, newReal('x', 'B3'));
    if (res.full) throw new Error('expected insert');
    expect(res.members).toHaveLength(3);
    expect(pitches(res.members)).toEqual(['B3', 'C4', 'RES']);
  });

  it('round-trips with repackTupletRun: insert then delete restores the run shape', () => {
    const start = [member('a', 'C4', 0), member('b', 'E4', 1), member('r', null, 2, true)];
    const inserted = insertTupletMember(start, 1, newReal('x', 'D4'));
    if (inserted.full) throw new Error('expected insert');
    // delete the inserted member → back to 2 real + 1 reserved
    const repacked = repackTupletRun(inserted.members, 1, reservedSlotId());
    expect(repacked.removeGroup).toBe(false);
    if (repacked.removeGroup) return;
    expect(pitches(repacked.members)).toEqual(['C4', 'E4', 'RES']);
    expect(positions(repacked.members)).toEqual([0, 1, 2]);
  });
});
