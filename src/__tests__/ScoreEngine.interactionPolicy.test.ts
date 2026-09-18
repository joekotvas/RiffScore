import { ScoreEngine } from '@/engines/ScoreEngine';
import { AddMeasureCommand } from '@/commands/MeasureCommands';
import { DeleteNoteCommand } from '@/commands/DeleteNoteCommand';
import { UpdateEventCommand } from '@/commands/UpdateEventCommand';
import { BatchCommand } from '@/commands/BatchCommand';
import { createDefaultScore, type InteractionPolicy, type Score } from '@/types';
import { allowsInteraction } from '@/utils/interactionPolicy';

const policy: InteractionPolicy = {
  allowEventInsertion: false,
  allowEventDeletion: false,
  allowDurationChanges: false,
};
const seed = (): Score => ({
  ...createDefaultScore(),
  staves: [
    {
      id: 's',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'm',
          events: [
            {
              id: 'chord',
              duration: 'quarter',
              dotted: false,
              notes: [
                { id: 'c', pitch: 'C4' },
                { id: 'e', pitch: 'E4' },
              ],
            },
            { id: 'single', duration: 'quarter', dotted: false, notes: [{ id: 'g', pitch: 'G4' }] },
          ],
        },
      ],
    },
  ],
});
const allowed = (before: Score, after: Score) => allowsInteraction(before, after, policy);

test('a blocked batch neither partly deletes a chord nor alters history or notifies subscribers', () => {
  const engine = new ScoreEngine(seed());
  const listener = jest.fn();
  engine.subscribe(listener);
  const before = engine.getState();
  const result = engine.withMutationGuard(allowed, () =>
    engine.dispatch(
      new BatchCommand([
        new DeleteNoteCommand(0, 'chord', 'c'),
        new DeleteNoteCommand(0, 'single', 'g'),
      ])
    )
  );
  expect(result).toEqual({ value: false, accepted: false });
  expect(engine.getState()).toBe(before);
  expect(engine.getHistory()).toHaveLength(0);
  expect(listener).not.toHaveBeenCalled();
});

test('rejected undo and redo leave their stacks intact and remain available to an unrestricted caller', () => {
  const engine = new ScoreEngine(seed());
  engine.dispatch(new UpdateEventCommand(0, 'single', { duration: 'half' }));
  const before = engine.getState();
  engine.withMutationGuard(allowed, () => engine.undo());
  expect(engine.getState()).toBe(before);
  expect(engine.getHistory()).toHaveLength(1);
  expect(engine.getRedoStack()).toHaveLength(0);
  engine.undo();
  const undone = engine.getState();
  engine.withMutationGuard(allowed, () => engine.redo());
  expect(engine.getState()).toBe(undone);
  expect(engine.getHistory()).toHaveLength(0);
  expect(engine.getRedoStack()).toHaveLength(1);
  engine.redo();
  expect(engine.getState().staves[0].measures[0].events[1].duration).toBe('half');
});

test('nested guards compose and unwind on exceptions without restricting later API mutations', () => {
  const engine = new ScoreEngine(seed());
  engine.withMutationGuard(allowed, () =>
    engine.withMutationGuard(
      () => true,
      () => engine.dispatch(new AddMeasureCommand())
    )
  );
  expect(engine.getState().staves[0].measures).toHaveLength(1);
  expect(() =>
    engine.withMutationGuard(allowed, () => {
      throw new Error('interrupted');
    })
  ).toThrow('interrupted');
  engine.dispatch(new AddMeasureCommand());
  expect(engine.getState().staves[0].measures).toHaveLength(2);
});

test.each([
  { dotted: true },
  { duration: 'eighth' },
  { tuplet: { ratio: [3, 2] as [number, number], groupSize: 3, position: 0 } },
])('rhythmic edits are blocked regardless of the command implementation: %j', (updates) => {
  const engine = new ScoreEngine(seed());
  const before = engine.getState();
  engine.withMutationGuard(allowed, () =>
    engine.dispatch(new UpdateEventCommand(0, 'single', updates))
  );
  expect(engine.getState()).toBe(before);
});

test('each permission is independent and omitted permissions keep ordinary editing enabled', () => {
  const before = seed();
  const changed = new UpdateEventCommand(0, 'single', { duration: 'eighth' }).execute(before);
  expect(allowsInteraction(before, changed, {})).toBe(true);
  expect(allowsInteraction(before, changed, { allowEventInsertion: false })).toBe(true);
  expect(allowsInteraction(before, changed, { allowEventDeletion: false })).toBe(true);
  expect(allowsInteraction(before, changed, { allowDurationChanges: false })).toBe(false);
});

test('policies evaluate the final recognized score exactly once per state transition', () => {
  const engine = new ScoreEngine(seed(), { enabled: true });
  const guard = jest.fn((_before: Score, after: Score) => after.chordTrack?.length === 1);
  engine.withMutationGuard(guard, () =>
    engine.dispatch(
      new UpdateEventCommand(0, 'chord', {
        notes: [...seed().staves[0].measures[0].events[0].notes, { id: 'g2', pitch: 'G4' }],
      })
    )
  );
  expect(guard).toHaveBeenCalledTimes(1);
  expect(engine.getState().chordTrack?.[0].symbol).toBe('C');
  expect(engine.getHistory()).toHaveLength(1);
});

test('a failed subscriber cannot misreport a committed edit or starve later subscribers', () => {
  const engine = new ScoreEngine(seed());
  engine.subscribe(() => {
    throw new Error('observer failed');
  });
  const listener = jest.fn();
  engine.subscribe(listener);
  expect(engine.dispatch(new UpdateEventCommand(0, 'single', { duration: 'half' }))).toBe(true);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(engine.getHistory()).toHaveLength(1);
  engine.undo();
  expect(engine.getState().staves[0].measures[0].events[1].duration).toBe('quarter');
  expect(listener).toHaveBeenCalledTimes(2);
});

test('a later refusal restores earlier commands in the same guarded action without partial notifications', () => {
  const engine = new ScoreEngine(seed());
  const before = engine.getState();
  const listener = jest.fn();
  engine.subscribe(listener);
  const result = engine.withMutationGuard(allowed, () => {
    engine.dispatch(new UpdateEventCommand(0, 'single', { notes: [{ id: 'g', pitch: 'A4' }] }));
    expect(engine.getState().staves[0].measures[0].events[1].notes[0].pitch).toBe('A4');
    engine.dispatch(new AddMeasureCommand());
  });
  expect(result.accepted).toBe(false);
  expect(engine.getState()).toBe(before);
  expect(engine.getHistory()).toHaveLength(0);
  expect(listener).not.toHaveBeenCalled();
});

test('an exception after a guarded mutation restores state and history', () => {
  const engine = new ScoreEngine(seed());
  const before = engine.getState();
  expect(() =>
    engine.withMutationGuard(allowed, () => {
      engine.dispatch(new UpdateEventCommand(0, 'single', { notes: [{ id: 'g', pitch: 'A4' }] }));
      throw new Error('aborted');
    })
  ).toThrow('aborted');
  expect(engine.getState()).toBe(before);
  expect(engine.getHistory()).toHaveLength(0);
});
