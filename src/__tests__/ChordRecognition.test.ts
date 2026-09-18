import { recognizeChord, recognizeScoreChords } from '@/services/chord/ChordRecognition';
import { parseABC } from '@/importers/abcImporter';
import { ScoreEngine } from '@/engines/ScoreEngine';
import { ChangePitchCommand } from '@/commands/ChangePitchCommand';
import type { Score } from '@/types';

const fromABC = (music: string): Score => {
  const result = parseABC(`X:1\nM:4/4\nL:1/4\nK:C\n${music}`);
  if (!result.ok) throw new Error(result.error);
  return result.score;
};

describe('chord recognition', () => {
  it.each([
    [['C4', 'E4', 'G4'], 'C'],
    [['C4', 'E4', 'G4', 'B4'], 'Cmaj7'],
    [['C4', 'E4', 'G4', 'Bb4'], 'C7'],
    [['C4', 'Eb4', 'G4', 'Bb4'], 'Cm7'],
    [['E4', 'G4', 'A4', 'C5'], 'Am7'],
    [['F4', 'A4', 'C5', 'D5'], 'Dm7'],
    [['F4', 'A4', 'C5', 'G5'], 'Fadd9'],
    [['C4', 'E4', 'G4', 'Bb4', 'D5'], 'C9'],
    [['C4', 'Eb4', 'Gb4'], 'Cdim'],
    [['Db4', 'F4', 'Ab4'], 'Db'],
  ])('recognizes %j as %s', (pitches, expected) => {
    expect(recognizeChord(pitches)).toBe(expected);
    expect(recognizeChord([...pitches].reverse())).toBe(expected);
  });

  it('handles inversions and octave doublings without inventing missing notes', () => {
    expect(recognizeChord(['E3', 'G3', 'C4', 'G4', 'C5'])).toBe('C');
    expect(recognizeChord(['E3', 'G3', 'C4'], true)).toBe('C/E');
    expect(recognizeChord(['E4', 'G4', 'B4'])).toBe('Em');
    expect(recognizeChord(['C4', 'G4', 'C5'])).toBeNull();
    expect(recognizeChord(['C4', 'C#4', 'D4'])).toBeNull();
    expect(recognizeChord(['invalid'])).toBeNull();
  });

  it('follows event anchors across staves and excludes rests and reserved slots', () => {
    const score = fromABC('[CEG] z [DFA] [EGB] |]');
    const original = JSON.stringify(score);
    const recognized = recognizeScoreChords(score, { enabled: true });
    expect(recognized.chordTrack?.map((c) => [c.quant, c.symbol])).toEqual([
      [0, 'C'],
      [32, 'Dm'],
      [48, 'Em'],
    ]);
    expect(JSON.stringify(score)).toBe(original);
    expect(recognizeScoreChords(recognized, { enabled: true })).toBe(recognized);
    expect(recognizeScoreChords(score)).toBe(score);
    score.staves.push(fromABC('[FAC]4 |]').staves[0]);
    expect(
      recognizeScoreChords(score, { enabled: true, staffIndex: 1 }).chordTrack?.map((c) => c.symbol)
    ).toEqual(['F']);
    expect(recognizeScoreChords(score, { enabled: true, staffIndex: 99 }).chordTrack).toEqual([]);
    score.staves[0].measures[0].events[0].reserved = true;
    expect(recognizeScoreChords(score, { enabled: true }).chordTrack?.map((c) => c.quant)).toEqual([
      32, 48,
    ]);
  });

  it('updates synchronously inside the note edit, preserving IDs and a single undo step', () => {
    const engine = new ScoreEngine(fromABC('[CEGB]4 |]'), { enabled: true });
    const original = engine.getState();
    const event = original.staves[0].measures[0].events[0];
    const note = event.notes.find((n) => n.pitch === 'B4')!;
    const notify = jest.fn();
    engine.subscribe(notify);
    engine.dispatch(new ChangePitchCommand(0, event.id, note.id, 'Bb4'));
    expect(engine.getState().chordTrack?.[0]).toEqual({ ...original.chordTrack![0], symbol: 'C7' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(engine.getHistory()).toHaveLength(1);
    engine.undo();
    expect(engine.getState().chordTrack).toEqual(original.chordTrack);
    engine.redo();
    expect(engine.getState().chordTrack?.[0].symbol).toBe('C7');
    engine.setChordRecognition({ enabled: false });
    engine.dispatch(new ChangePitchCommand(0, event.id, note.id, 'B4'));
    expect(engine.getState().chordTrack?.[0].symbol).toBe('C7');
  });
});
