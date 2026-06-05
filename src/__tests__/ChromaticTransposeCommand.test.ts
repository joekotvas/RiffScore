import { ChromaticTransposeCommand } from '../commands/ChromaticTransposeCommand';
import { createDefaultScore } from '../types';
import { Score, ScoreEvent } from '@/types';

// Mock Tonal.js if necessary, or rely on implementation if it imports Tonal
// Since the command uses Tonal internally, we'll verify end results

describe('ChromaticTransposeCommand', () => {
  const createScoreWithNote = (pitch: string, measureIdx = 0, eventIdx = 0): Score => {
    const score = createDefaultScore();
    const event: ScoreEvent = {
      id: 'e1',
      dotted: false,
      duration: 'quarter',
      notes: [{ id: 'n1', pitch }],
    };
    score.staves[0].measures[measureIdx].events[eventIdx] = event;
    return score;
  };

  test('transposes a single selected note', () => {
    let score = createScoreWithNote('C4');
    const selection = {
      measureIndex: 0,
      staffIndex: 0,
      eventId: 'e1',
      noteId: 'n1',
      selectedNotes: [],
    };

    const command = new ChromaticTransposeCommand(selection, 2); // Up 2 semitones (C4 -> D4)
    score = command.execute(score);

    const note = score.staves[0].measures[0].events[0].notes[0];
    expect(note.pitch).toBe('D4');
  });

  test('transposes down', () => {
    let score = createScoreWithNote('C4');
    const selection = {
      measureIndex: 0,
      staffIndex: 0,
      eventId: 'e1',
      noteId: 'n1',
      selectedNotes: [],
    };

    const command = new ChromaticTransposeCommand(selection, -1); // Down 1 semitone (C4 -> B3)
    score = command.execute(score);

    const note = score.staves[0].measures[0].events[0].notes[0];
    expect(note.pitch).toBe('B3');
  });

  test('clamps to piano range (lowest)', () => {
    let score = createScoreWithNote('A0');
    const selection = {
      measureIndex: 0,
      staffIndex: 0,
      eventId: 'e1',
      noteId: 'n1',
      selectedNotes: [],
    };

    const command = new ChromaticTransposeCommand(selection, -5); // Try to go below A0
    score = command.execute(score);

    const note = score.staves[0].measures[0].events[0].notes[0];
    expect(note.pitch).toBe('A0'); // Should stay at min
  });

  test('handles multi-selection', () => {
    let score = createDefaultScore();
    // Setup 2 notes
    const evt1: ScoreEvent = {
      id: 'e1',
      dotted: false,
      duration: 'quarter',
      notes: [{ id: 'n1', pitch: 'C4' }],
    };
    const evt2: ScoreEvent = {
      id: 'e2',
      dotted: false,
      duration: 'quarter',
      notes: [{ id: 'n2', pitch: 'E4' }],
    };
    score.staves[0].measures[0].events = [evt1, evt2];

    const selection = {
      measureIndex: 0,
      staffIndex: 0,
      eventId: 'e1', // Primary
      noteId: 'n1',
      selectedNotes: [
        { measureIndex: 0, staffIndex: 0, eventId: 'e1', noteId: 'n1', pitch: 'C4' },
        { measureIndex: 0, staffIndex: 0, eventId: 'e2', noteId: 'n2', pitch: 'E4' },
      ],
    };

    const command = new ChromaticTransposeCommand(selection, 1); // C4->Db4 / Cis4, E4->F4
    score = command.execute(score);

    const n1 = score.staves[0].measures[0].events[0].notes[0];
    const n2 = score.staves[0].measures[0].events[1].notes[0];

    // #239: deterministic key-aware spelling. C4 +1 in C major is out-of-key, so
    // direction decides (up -> sharp) -> C#4 (no longer a Db4/C#4 toss-up).
    expect(n1.pitch).toBe('C#4');
    expect(n2.pitch).toBe('F4'); // E4 +1 -> F natural (in key)
  });

  test('ignores null pitch events (rests)', () => {
    const score = createDefaultScore();
    const restEvent: ScoreEvent = {
      id: 'r1',
      isRest: true,
      duration: 'quarter',
      dotted: false,
      notes: [],
    };
    score.staves[0].measures[0].events = [restEvent];

    // Select the rest
    const selection = {
      measureIndex: 0,
      staffIndex: 0,
      eventId: 'r1',
      noteId: null,
      selectedNotes: [],
    };

    const command = new ChromaticTransposeCommand(selection, 2);
    const before = JSON.stringify(score);
    const newScore = command.execute(score);
    const after = JSON.stringify(newScore);

    expect(before).toBe(after); // Should not differ
  });

  // #239: key-aware enharmonic spelling. Each case asserts BOTH the spelled pitch
  // AND the sounding MIDI, so a "clean but wrong-pitch" respelling cannot pass.
  describe('key-aware spelling (#239)', () => {
    const { Note } = require('tonal');

    const transposeSingle = (pitch: string, semitones: number, key: string): string => {
      const score = createScoreWithNote(pitch);
      score.staves[0].keySignature = key;
      const selection = {
        measureIndex: 0,
        staffIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };
      const result = new ChromaticTransposeCommand(selection, semitones).execute(score);
      return result.staves[0].measures[0].events[0].notes[0].pitch as string;
    };

    it('uses the key diatonic spelling for an in-key result (sharp key)', () => {
      // C# is diatonic in D major -> C#4, not Db4.
      const out = transposeSingle('C4', 1, 'D');
      expect(out).toBe('C#4');
      expect(Note.midi(out)).toBe(61);
    });

    it('spells an out-of-key black key by direction (flat key)', () => {
      // In F major, D#/Eb (chroma 3) is out of key; ascending -> sharp -> D#4.
      const up = transposeSingle('D4', 1, 'F');
      expect(up).toBe('D#4');
      expect(Note.midi(up)).toBe(63);
      // Descending onto the same pitch class -> flat -> Eb4.
      const down = transposeSingle('E4', -1, 'F');
      expect(down).toBe('Eb4');
      expect(Note.midi(down)).toBe(63);
    });

    it('prefers a natural over a double flat (no Fb where E will do)', () => {
      // Eb4 +1 is E natural; raw Note.transpose would yield Fb4.
      const out = transposeSingle('Eb4', 1, 'Eb');
      expect(out).toBe('E4');
      expect(Note.midi(out)).toBe(64);
    });

    it('never explodes into multi-accidentals under repeated transposition', () => {
      // Regression for the Eb -> Fb -> Gbb -> Abbb ... cascade.
      let pitch = 'Eb4';
      let expectedMidi = Note.midi('Eb4');
      for (let i = 0; i < 7; i++) {
        pitch = transposeSingle(pitch, 1, 'C');
        expectedMidi += 1;
        expect(Math.abs(Note.get(pitch).alt)).toBeLessThanOrEqual(1);
        expect(Note.midi(pitch)).toBe(expectedMidi);
      }
    });
  });
});
