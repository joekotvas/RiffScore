/**
 * chordTrack re-anchoring across structural edits (#242 Lane F).
 *
 * Chords are measure-local `{measure, quant}`. Before this lane, AddMeasure / DeleteMeasure /
 * SetTimeSignature ignored the chordTrack, so harmony silently drifted to the wrong bar or
 * pointed at deleted/invalid positions. These tests pin the re-anchoring and its lossless undo.
 *
 * @see src/services/chord/ChordQuants.ts (shift helpers)
 * @see src/commands/MeasureCommands.ts, src/commands/SetTimeSignatureCommand.ts
 */
import { AddMeasureCommand, DeleteMeasureCommand } from '@/commands/MeasureCommands';
import { SetTimeSignatureCommand } from '@/commands/SetTimeSignatureCommand';
import {
  shiftChordsForInsertedMeasure,
  shiftChordsForDeletedMeasure,
} from '@/services/chord/ChordQuants';
import { createDefaultScore, Score, ChordSymbol, ScoreEvent } from '@/types';

const chord = (id: string, measure: number, quant: number): ChordSymbol => ({
  id,
  measure,
  quant,
  symbol: 'C',
});

/** A score of `count` whole-note measures (so quant 0 is the only anchor per bar) + chords. */
const wholeNoteScore = (count: number, chordTrack: ChordSymbol[]): Score => {
  const s = createDefaultScore();
  const measures = Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    events: [
      { id: `m${i}e0`, duration: 'whole', dotted: false, notes: [{ id: `m${i}n`, pitch: 'C4' }] },
    ] as ScoreEvent[],
  }));
  s.staves = [{ ...s.staves[0], measures }];
  s.chordTrack = chordTrack;
  return s;
};

describe('chord shift helpers', () => {
  it('shiftChordsForInsertedMeasure moves chords at/after the insert one bar later', () => {
    const result = shiftChordsForInsertedMeasure(
      [chord('a', 0, 0), chord('b', 1, 0), chord('c', 2, 0)],
      1
    );
    expect(result!.map((c) => c.measure)).toEqual([0, 2, 3]);
  });

  it('shiftChordsForDeletedMeasure drops chords in the bar and pulls later ones back', () => {
    const result = shiftChordsForDeletedMeasure(
      [chord('a', 0, 0), chord('b', 1, 0), chord('c', 2, 0)],
      1
    );
    expect(result!.map((c) => c.id)).toEqual(['a', 'c']);
    expect(result!.map((c) => c.measure)).toEqual([0, 1]);
  });

  it('is a no-op for an empty/absent chordTrack', () => {
    expect(shiftChordsForInsertedMeasure(undefined, 0)).toBeUndefined();
    expect(shiftChordsForDeletedMeasure([], 0)).toEqual([]);
  });
});

describe('AddMeasureCommand re-anchors chords', () => {
  it('inserting a bar shifts chords at/after it (and undo restores)', () => {
    const score = wholeNoteScore(3, [chord('a', 0, 0), chord('b', 1, 0), chord('c', 2, 0)]);
    const cmd = new AddMeasureCommand(1);
    const after = cmd.execute(score);
    expect(after.chordTrack!.map((c) => `${c.id}@${c.measure}`)).toEqual(['a@0', 'b@2', 'c@3']);
    expect(cmd.undo(after).chordTrack!.map((c) => c.measure)).toEqual([0, 1, 2]);
  });

  it('appending a bar at the end leaves chords unchanged', () => {
    const score = wholeNoteScore(2, [chord('a', 0, 0), chord('b', 1, 0)]);
    const after = new AddMeasureCommand().execute(score); // append (no index)
    expect(after.chordTrack!.map((c) => c.measure)).toEqual([0, 1]);
  });

  it('does not shift chords when there are no staves (index would be -1)', () => {
    const score = wholeNoteScore(1, [chord('a', 0, 0)]);
    score.staves = []; // degenerate score (e.g. a malformed loaded object)
    const after = new AddMeasureCommand(0).execute(score);
    expect(after.chordTrack!.map((c) => c.measure)).toEqual([0]); // unchanged, not shifted to 1
  });
});

describe('DeleteMeasureCommand re-anchors chords', () => {
  it('deleting a bar drops its chords and pulls later ones back (and undo restores)', () => {
    const score = wholeNoteScore(3, [chord('a', 0, 0), chord('b', 1, 0), chord('c', 2, 0)]);
    const cmd = new DeleteMeasureCommand(1);
    const after = cmd.execute(score);
    expect(after.chordTrack!.map((c) => `${c.id}@${c.measure}`)).toEqual(['a@0', 'c@1']);
    // undo restores the dropped chord and original anchors.
    expect(cmd.undo(after).chordTrack!.map((c) => `${c.id}@${c.measure}`)).toEqual([
      'a@0',
      'b@1',
      'c@2',
    ]);
  });
});

describe('SetTimeSignatureCommand drops chords orphaned by the reflow', () => {
  it('keeps chords on a still-valid anchor and drops the rest (undo restores all)', () => {
    // One 4/4 bar of four quarters; chords on beat 1 (quant 0) and beat 4 (quant 48).
    const s = createDefaultScore();
    s.timeSignature = '4/4';
    s.staves = [
      {
        ...s.staves[0],
        measures: [
          {
            id: 'm0',
            events: [0, 1, 2, 3].map((i) => ({
              id: `e${i}`,
              duration: 'quarter',
              dotted: false,
              notes: [{ id: `n${i}`, pitch: 'C4' }],
            })),
          },
        ],
      },
    ];
    s.chordTrack = [chord('beat1', 0, 0), chord('beat4', 0, 48)];

    const cmd = new SetTimeSignatureCommand('2/4');
    const after = cmd.execute(s);
    // Reflow → two 2/4 bars of two quarters; bar 0's anchors are {0,16}, so beat1 (0) survives
    // and beat4 (48) is orphaned and dropped.
    expect(after.chordTrack!.map((c) => c.id)).toEqual(['beat1']);
    // Lossless undo restores both chords.
    expect(cmd.undo(after).chordTrack!.map((c) => c.id)).toEqual(['beat1', 'beat4']);
  });
});
