/**
 * Delete model (#242 Lane C): plain shift-left + tuplet-as-fixed-span-container.
 *
 * - Plain note/event delete removes it and shifts the measure left (no rest created).
 * - A tuplet-member delete packs the remaining notes to the front and leaves a RESERVED
 *   placeholder slot at the end, conserving the group's span (so sumQuants/validateMeasure
 *   still see a complete group).
 * - Deleting the last real note removes the whole tuplet group.
 * - Undo is lossless (event snapshot for plain; whole-group-run snapshot for tuplets).
 *
 * @see src/utils/tupletEdit.ts, src/commands/DeleteEventCommand.ts, DeleteNoteCommand.ts
 */
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';
import { DeleteNoteCommand } from '@/commands/DeleteNoteCommand';
import { FillReservedSlotCommand } from '@/commands/FillReservedSlotCommand';
import { sumQuants } from '@/utils/tuplet';
import { validateMeasure } from '@/utils/validation';
import { getValidChordQuants, isValidChordPosition } from '@/services/chord/ChordQuants';
import { getMeasureCapacity } from '@/constants';
import { createDefaultScore, Score, ScoreEvent } from '@/types';

const note = (id: string, duration: string, pitch = 'C4'): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});
const chord = (id: string, pitches: string[]): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: pitches.map((p, i) => ({ id: `${id}n${i}`, pitch: p })),
});
const trip = (id: string, pitch: string, position: number): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
});
const triplet = (): ScoreEvent[] => [trip('t0', 'C4', 0), trip('t1', 'E4', 1), trip('t2', 'G4', 2)];

const scoreOf = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};
const eventsOf = (s: Score): ScoreEvent[] => s.staves[0].measures[0].events;
const measureOf = (s: Score) => s.staves[0].measures[0];

describe('plain delete = shift-left (no rest)', () => {
  it('deleting the first of four quarters shifts the rest left', () => {
    const score = scoreOf([note('a', 'quarter'), note('b', 'quarter'), note('c', 'quarter'), note('d', 'quarter')]);
    const after = new DeleteEventCommand(0, 'a').execute(score);
    expect(eventsOf(after).map((e) => e.id)).toEqual(['b', 'c', 'd']); // packed left, NO rest
    expect(eventsOf(after).every((e) => !e.isRest)).toBe(true);
  });

  it('undo restores the deleted event at its index', () => {
    const score = scoreOf([note('a', 'quarter'), note('b', 'quarter')]);
    const cmd = new DeleteEventCommand(0, 'a');
    expect(eventsOf(cmd.undo(cmd.execute(score))).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('tuplet-member delete = pack front + reserved trailing slot (span conserved)', () => {
  it('deleting a middle member leaves a reserved slot and a complete group', () => {
    const after = new DeleteEventCommand(0, 't1').execute(scoreOf(triplet()));
    const events = eventsOf(after);

    expect(events).toHaveLength(3); // span/member-count conserved
    expect(events.map((e) => e.notes[0].pitch)).toEqual(['C4', 'G4', null]); // C,G pack front
    const slot = events[2];
    expect(slot.reserved).toBe(true);
    expect(slot.isRest).toBe(true);
    expect(slot.tuplet).toMatchObject({ id: 'T', groupSize: 3, position: 2 });
    // positions renumbered contiguously
    expect(events.map((e) => e.tuplet?.position)).toEqual([0, 1, 2]);
    // group still complete + measure valid (reserved slot carries the footprint)
    expect(sumQuants(events).partialTuplet).toBe(false);
    expect(sumQuants(events).quants).toBe(16); // eighth-triplet span = 2 eighths
    expect(validateMeasure(measureOf(after), getMeasureCapacity('4/4')).valid).toBe(true);
  });

  it('deleting the position-0 member packs the survivors and reserves the tail', () => {
    const events = eventsOf(new DeleteEventCommand(0, 't0').execute(scoreOf(triplet())));
    expect(events.map((e) => e.notes[0].pitch)).toEqual(['E4', 'G4', null]);
    expect(events[2].reserved).toBe(true);
  });

  it('undo restores the original group exactly', () => {
    const cmd = new DeleteEventCommand(0, 't1');
    const restored = cmd.undo(cmd.execute(scoreOf(triplet())));
    expect(eventsOf(restored).map((e) => e.notes[0].pitch)).toEqual(['C4', 'E4', 'G4']);
    expect(eventsOf(restored).every((e) => !e.reserved)).toBe(true);
  });

  it('redo keeps the reserved slot id AND its inner note id stable', () => {
    const cmd = new DeleteEventCommand(0, 't1');
    const a1 = cmd.execute(scoreOf(triplet()));
    const a2 = cmd.execute(cmd.undo(a1)); // undo then re-execute = redo
    expect(eventsOf(a2)[2].id).toBe(eventsOf(a1)[2].id);
    expect(eventsOf(a2)[2].notes[0].id).toBe(eventsOf(a1)[2].notes[0].id);
  });
});

describe('vanish option (internal overwrite/insert removal)', () => {
  it('vanish:true removes a tuplet member outright — no reserved slot, no repack', () => {
    const events = eventsOf(new DeleteEventCommand(0, 't1', 0, { vanish: true }).execute(scoreOf(triplet())));
    expect(events.map((e) => e.id)).toEqual(['t0', 't2']); // pure splice, frees the quant space
    expect(events.some((e) => e.reserved)).toBe(false);
  });
});

describe('FillReservedSlotCommand', () => {
  const reservedTriplet = (): Score => scoreOf(eventsOf(new DeleteEventCommand(0, 't1').execute(scoreOf(triplet()))));

  it('fills a reserved slot with a pitch (clears reserved/isRest)', () => {
    const score = reservedTriplet();
    const slot = eventsOf(score).find((e) => e.reserved)!;
    const after = new FillReservedSlotCommand(0, slot.id, { id: 'fn', pitch: 'A4' }).execute(score);
    const filled = eventsOf(after).find((e) => e.id === slot.id)!;
    expect(filled.reserved).toBe(false);
    expect(filled.isRest).toBe(false);
    expect(filled.notes[0].pitch).toBe('A4');
    expect(filled.tuplet).toBeDefined(); // still in the group, slot rhythm kept
  });

  it('fills a reserved slot with a notated rest when the note is pitch-less', () => {
    const score = reservedTriplet();
    const slot = eventsOf(score).find((e) => e.reserved)!;
    const after = new FillReservedSlotCommand(0, slot.id, { id: 'fr', pitch: null, isRest: true }).execute(score);
    const filled = eventsOf(after).find((e) => e.id === slot.id)!;
    expect(filled.reserved).toBe(false); // no longer reserved space...
    expect(filled.isRest).toBe(true); // ...but a notated rest
  });

  it('undo restores the reserved slot', () => {
    const score = reservedTriplet();
    const slot = eventsOf(score).find((e) => e.reserved)!;
    const cmd = new FillReservedSlotCommand(0, slot.id, { id: 'fn', pitch: 'A4' });
    const restored = cmd.undo(cmd.execute(score));
    expect(eventsOf(restored).find((e) => e.id === slot.id)!.reserved).toBe(true);
  });
});

describe('reserved slots are not valid chord anchors', () => {
  it('a reserved slot quant is excluded from getValidChordQuants', () => {
    const after = new DeleteEventCommand(0, 't1').execute(scoreOf(triplet()));
    const valid = getValidChordQuants(after);
    // real members at quant 0 and ~5.33 remain valid; the reserved tail (~10.67) is excluded.
    const m0 = valid.get(0)!;
    expect(isValidChordPosition(valid, 0, 0)).toBe(true);
    expect([...m0].some((q) => Math.abs(q - (16 * 2) / 3) < 1e-6)).toBe(false); // ~10.67 not offered
  });
});

describe('deleting the last real note removes the whole tuplet group', () => {
  it('a measure of just a triplet empties when all notes are deleted', () => {
    let score = scoreOf(triplet());
    score = new DeleteEventCommand(0, 't0').execute(score); // [E,G,res]
    score = new DeleteEventCommand(0, 't1').execute(score); // [G,res,res]
    expect(eventsOf(score).filter((e) => !e.reserved)).toHaveLength(1);
    score = new DeleteEventCommand(0, 't2').execute(score); // last real → remove group
    expect(eventsOf(score)).toHaveLength(0);
  });

  it('a triplet followed by a quarter: deleting all triplet notes shifts the quarter to the front', () => {
    let score = scoreOf([...triplet(), note('q', 'half')]);
    score = new DeleteEventCommand(0, 't0').execute(score);
    score = new DeleteEventCommand(0, 't1').execute(score);
    const collapse = new DeleteEventCommand(0, 't2');
    const after = collapse.execute(score);
    expect(eventsOf(after).map((e) => e.id)).toEqual(['q']); // group gone, measure shifted left
    // undo restores the group ahead of the quarter
    expect(eventsOf(collapse.undo(after)).filter((e) => e.tuplet)).toHaveLength(3);
  });
});

describe('DeleteNoteCommand', () => {
  it('deleting the last note of a tuplet member reserves the slot', () => {
    const after = new DeleteNoteCommand(0, 't1', 't1n').execute(scoreOf(triplet()));
    const events = eventsOf(after);
    expect(events[2].reserved).toBe(true);
    expect(events.map((e) => e.notes[0].pitch)).toEqual(['C4', 'G4', null]);
  });

  it('deleting one note of a chord keeps the event (no tuplet/reserved effect)', () => {
    const after = new DeleteNoteCommand(0, 'ch', 'chn1').execute(
      scoreOf([note('a', 'quarter'), chord('ch', ['C4', 'E4', 'G4'])])
    );
    const events = eventsOf(after);
    expect(events).toHaveLength(2);
    expect(events[1].notes.map((n) => n.pitch)).toEqual(['C4', 'G4']);
    expect(events[1].reserved).toBeUndefined();
  });

  it('undo restores a chord note at its ORIGINAL index', () => {
    const cmd = new DeleteNoteCommand(0, 'ch', 'chn1');
    const restored = cmd.undo(cmd.execute(scoreOf([chord('ch', ['C4', 'E4', 'G4'])])));
    expect(eventsOf(restored)[0].notes.map((n) => n.pitch)).toEqual(['C4', 'E4', 'G4']);
  });
});

describe('snapshot isolation', () => {
  it('mutating the live reserved slot does not corrupt the undo snapshot', () => {
    const cmd = new DeleteEventCommand(0, 't1');
    const after = cmd.execute(scoreOf(triplet()));
    eventsOf(after)[2].tuplet!.position = 99; // mutate live reserved slot in place
    const restored = cmd.undo(after);
    expect(eventsOf(restored).map((e) => e.tuplet?.position)).toEqual([0, 1, 2]);
  });
});
