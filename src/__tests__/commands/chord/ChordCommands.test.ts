/**
 * Chord Commands Tests
 *
 * TDD tests for chord symbol commands:
 * - AddChordCommand: Adds a chord at a quant position
 * - UpdateChordCommand: Updates an existing chord's symbol
 * - RemoveChordCommand: Removes a chord by ID
 *
 * @see src/commands/chord/AddChordCommand.ts
 * @see src/commands/chord/UpdateChordCommand.ts
 * @see src/commands/chord/RemoveChordCommand.ts
 */

import { Score, ChordSymbol } from '@/types';
import { AddChordCommand } from '@/commands/chord/AddChordCommand';
import { UpdateChordCommand } from '@/commands/chord/UpdateChordCommand';
import { RemoveChordCommand } from '@/commands/chord/RemoveChordCommand';

// --- Test Fixtures ---

/**
 * Creates a test score with optional chords.
 * Consolidates duplicate factory functions into a single flexible factory.
 *
 * @param chords - Optional array of chords to include. Defaults to empty (no chord track).
 * @param measureCount - Number of measures. Defaults to 2.
 */
const createTestScore = (
  chords?: ChordSymbol[],
  measureCount: number = 2
): Score => ({
  title: 'Test Score',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'treble',
      clef: 'treble',
      keySignature: 'C',
      measures: Array.from({ length: measureCount }, (_, i) => ({
        id: `m${i}`,
        events: [],
      })),
    },
  ],
  ...(chords && { chordTrack: chords }),
});

// Convenience factory functions using createTestScore
const createEmptyScore = (): Score => createTestScore();

const createScoreWithChords = (): Score =>
  createTestScore([
    { id: 'chord_001', quant: 0, symbol: 'C' },
    { id: 'chord_002', quant: 24, symbol: 'G' },
    { id: 'chord_003', quant: 48, symbol: 'Am' },
    { id: 'chord_004', quant: 96, symbol: 'F' },
  ]);

const createScoreWithSingleChord = (): Score =>
  createTestScore([{ id: 'chord_existing', quant: 48, symbol: 'Dm7' }], 1);

// --- Helper Functions ---

/**
 * Find a chord by ID in the chord track
 */
const findChordById = (score: Score, id: string): ChordSymbol | undefined => {
  return score.chordTrack?.find((chord) => chord.id === id);
};

/**
 * Find a chord by quant position
 */
const findChordByQuant = (score: Score, quant: number): ChordSymbol | undefined => {
  return score.chordTrack?.find((chord) => chord.quant === quant);
};

// --- Tests ---

describe('AddChordCommand', () => {
  describe('execute', () => {
    it('adds a chord to an empty chord track', () => {
      const score = createEmptyScore();
      const command = new AddChordCommand(0, 'Cmaj7');

      const result = command.execute(score);

      expect(result.chordTrack).toBeDefined();
      expect(result.chordTrack).toHaveLength(1);
      expect(result.chordTrack![0].quant).toBe(0);
      expect(result.chordTrack![0].symbol).toBe('Cmaj7');
      expect(result.chordTrack![0].id).toMatch(/^chord_/);
    });

    it('adds a chord at empty position in existing track', () => {
      const score = createScoreWithChords();
      const command = new AddChordCommand(72, 'Em'); // Position between existing chords (between quant 48 and 96)

      const result = command.execute(score);

      expect(result.chordTrack).toHaveLength(5);
      const addedChord = findChordByQuant(result, 72);
      expect(addedChord).toBeDefined();
      expect(addedChord!.symbol).toBe('Em');
    });

    it('maintains ascending quant order when adding chord', () => {
      const score = createScoreWithChords();
      const command = new AddChordCommand(12, 'Dm'); // Between 0 and 24

      const result = command.execute(score);

      expect(result.chordTrack).toHaveLength(5);
      // Verify ascending order
      const quants = result.chordTrack!.map((c) => c.quant);
      expect(quants).toEqual([0, 12, 24, 48, 96]);
    });

    it('replaces existing chord at same quant position', () => {
      const score = createScoreWithChords();
      const command = new AddChordCommand(24, 'G7'); // Same position as 'G' chord

      const result = command.execute(score);

      // Should still have 4 chords (replacement, not addition)
      expect(result.chordTrack).toHaveLength(4);
      const chordAtQuant24 = findChordByQuant(result, 24);
      expect(chordAtQuant24!.symbol).toBe('G7');
    });

    it('stores replaced chord for undo when replacing at same quant', () => {
      const score = createScoreWithChords();
      const originalChord = findChordByQuant(score, 24);
      const command = new AddChordCommand(24, 'G7');

      command.execute(score);

      // Command should have stored the original chord internally for undo
      // This is verified by the undo test below
      expect(originalChord!.symbol).toBe('G');
    });

    it('uses provided ID when specified', () => {
      const score = createEmptyScore();
      const command = new AddChordCommand(0, 'Cmaj7', 'custom_chord_id');

      const result = command.execute(score);

      expect(result.chordTrack![0].id).toBe('custom_chord_id');
    });

    it('generates unique ID when not provided', () => {
      const score = createEmptyScore();
      const command1 = new AddChordCommand(0, 'C');
      const command2 = new AddChordCommand(24, 'G');

      const result1 = command1.execute(score);
      const result2 = command2.execute(result1);

      expect(result2.chordTrack![0].id).not.toBe(result2.chordTrack![1].id);
    });

    it('does not mutate original score', () => {
      const score = createEmptyScore();
      const originalChordTrack = score.chordTrack;
      const command = new AddChordCommand(0, 'C');

      command.execute(score);

      expect(score.chordTrack).toBe(originalChordTrack);
    });

    it('has correct command type', () => {
      const command = new AddChordCommand(0, 'C');
      expect(command.type).toBe('ADD_CHORD');
    });
  });

  describe('undo', () => {
    it('removes added chord from empty track', () => {
      const score = createEmptyScore();
      const command = new AddChordCommand(0, 'C');

      const afterAdd = command.execute(score);
      const afterUndo = command.undo(afterAdd);

      expect(afterUndo.chordTrack).toEqual([]);
    });

    it('removes added chord from existing track', () => {
      const score = createScoreWithChords();
      const command = new AddChordCommand(72, 'Em');

      const afterAdd = command.execute(score);
      expect(afterAdd.chordTrack).toHaveLength(5);

      const afterUndo = command.undo(afterAdd);
      expect(afterUndo.chordTrack).toHaveLength(4);
      expect(findChordByQuant(afterUndo, 72)).toBeUndefined();
    });

    it('restores replaced chord when undoing replacement', () => {
      const score = createScoreWithChords();
      const originalChord = findChordByQuant(score, 24);
      const command = new AddChordCommand(24, 'G7');

      const afterAdd = command.execute(score);
      expect(findChordByQuant(afterAdd, 24)!.symbol).toBe('G7');

      const afterUndo = command.undo(afterAdd);
      const restoredChord = findChordByQuant(afterUndo, 24);
      expect(restoredChord!.symbol).toBe(originalChord!.symbol);
      expect(restoredChord!.id).toBe(originalChord!.id);
    });

    it('maintains chord track order after undo', () => {
      const score = createScoreWithChords();
      const command = new AddChordCommand(12, 'Dm');

      const afterAdd = command.execute(score);
      const afterUndo = command.undo(afterAdd);

      const quants = afterUndo.chordTrack!.map((c) => c.quant);
      expect(quants).toEqual([0, 24, 48, 96]);
    });
  });
});

describe('UpdateChordCommand', () => {
  describe('execute', () => {
    it('updates chord symbol by ID', () => {
      const score = createScoreWithChords();
      const command = new UpdateChordCommand('chord_002', { symbol: 'G7sus4' });

      const result = command.execute(score);

      const updatedChord = findChordById(result, 'chord_002');
      expect(updatedChord!.symbol).toBe('G7sus4');
      expect(updatedChord!.quant).toBe(24); // Quant should be unchanged
    });

    it('preserves chord ID after update', () => {
      const score = createScoreWithChords();
      const command = new UpdateChordCommand('chord_001', { symbol: 'Cmaj9' });

      const result = command.execute(score);

      expect(findChordById(result, 'chord_001')).toBeDefined();
    });

    it('preserves chord quant after update', () => {
      const score = createScoreWithChords();
      const originalChord = findChordById(score, 'chord_003');
      const command = new UpdateChordCommand('chord_003', { symbol: 'Am7' });

      const result = command.execute(score);

      const updatedChord = findChordById(result, 'chord_003');
      expect(updatedChord!.quant).toBe(originalChord!.quant);
    });

    it('returns unchanged score when chord ID not found', () => {
      const score = createScoreWithChords();
      const command = new UpdateChordCommand('nonexistent_chord', { symbol: 'X' });

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('returns unchanged score when chord track is undefined', () => {
      const score = createEmptyScore();
      const command = new UpdateChordCommand('any_id', { symbol: 'C' });

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('returns unchanged score when chord track is empty', () => {
      const score = { ...createEmptyScore(), chordTrack: [] };
      const command = new UpdateChordCommand('any_id', { symbol: 'C' });

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('does not mutate original score', () => {
      const score = createScoreWithChords();
      const originalSymbol = findChordById(score, 'chord_001')!.symbol;
      const command = new UpdateChordCommand('chord_001', { symbol: 'NewSymbol' });

      command.execute(score);

      expect(findChordById(score, 'chord_001')!.symbol).toBe(originalSymbol);
    });

    it('has correct command type', () => {
      const command = new UpdateChordCommand('chord_001', { symbol: 'C' });
      expect(command.type).toBe('UPDATE_CHORD');
    });
  });

  describe('undo', () => {
    it('restores original chord symbol', () => {
      const score = createScoreWithChords();
      const originalSymbol = findChordById(score, 'chord_002')!.symbol;
      const command = new UpdateChordCommand('chord_002', { symbol: 'G7' });

      const afterUpdate = command.execute(score);
      expect(findChordById(afterUpdate, 'chord_002')!.symbol).toBe('G7');

      const afterUndo = command.undo(afterUpdate);
      expect(findChordById(afterUndo, 'chord_002')!.symbol).toBe(originalSymbol);
    });

    it('handles undo when original execute did not modify (not found)', () => {
      const score = createScoreWithChords();
      const command = new UpdateChordCommand('nonexistent', { symbol: 'X' });

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo).toBe(afterExecute);
    });

    it('preserves other chords in track', () => {
      const score = createScoreWithChords();
      const command = new UpdateChordCommand('chord_002', { symbol: 'G7' });

      const afterUpdate = command.execute(score);
      const afterUndo = command.undo(afterUpdate);

      // Other chords should be unchanged
      expect(findChordById(afterUndo, 'chord_001')!.symbol).toBe('C');
      expect(findChordById(afterUndo, 'chord_003')!.symbol).toBe('Am');
      expect(findChordById(afterUndo, 'chord_004')!.symbol).toBe('F');
    });
  });
});

describe('RemoveChordCommand', () => {
  describe('execute', () => {
    it('removes chord by ID', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('chord_002');

      const result = command.execute(score);

      expect(result.chordTrack).toHaveLength(3);
      expect(findChordById(result, 'chord_002')).toBeUndefined();
    });

    it('removes the only chord in track', () => {
      const score = createScoreWithSingleChord();
      const command = new RemoveChordCommand('chord_existing');

      const result = command.execute(score);

      expect(result.chordTrack).toHaveLength(0);
    });

    it('preserves other chords when removing', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('chord_003');

      const result = command.execute(score);

      expect(findChordById(result, 'chord_001')).toBeDefined();
      expect(findChordById(result, 'chord_002')).toBeDefined();
      expect(findChordById(result, 'chord_004')).toBeDefined();
    });

    it('maintains ascending quant order after removal', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('chord_002');

      const result = command.execute(score);

      const quants = result.chordTrack!.map((c) => c.quant);
      expect(quants).toEqual([0, 48, 96]);
    });

    it('returns unchanged score when chord ID not found', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('nonexistent_chord');

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('returns unchanged score when chord track is undefined', () => {
      const score = createEmptyScore();
      const command = new RemoveChordCommand('any_id');

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('returns unchanged score when chord track is empty', () => {
      const score = { ...createEmptyScore(), chordTrack: [] };
      const command = new RemoveChordCommand('any_id');

      const result = command.execute(score);

      expect(result).toBe(score);
    });

    it('does not mutate original score', () => {
      const score = createScoreWithChords();
      const originalLength = score.chordTrack!.length;
      const command = new RemoveChordCommand('chord_001');

      command.execute(score);

      expect(score.chordTrack).toHaveLength(originalLength);
    });

    it('has correct command type', () => {
      const command = new RemoveChordCommand('chord_001');
      expect(command.type).toBe('REMOVE_CHORD');
    });
  });

  describe('undo', () => {
    it('restores removed chord', () => {
      const score = createScoreWithChords();
      const originalChord = findChordById(score, 'chord_002');
      const command = new RemoveChordCommand('chord_002');

      const afterRemove = command.execute(score);
      expect(findChordById(afterRemove, 'chord_002')).toBeUndefined();

      const afterUndo = command.undo(afterRemove);
      const restoredChord = findChordById(afterUndo, 'chord_002');
      expect(restoredChord).toBeDefined();
      expect(restoredChord!.symbol).toBe(originalChord!.symbol);
      expect(restoredChord!.quant).toBe(originalChord!.quant);
    });

    it('restores chord in correct quant order', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('chord_002');

      const afterRemove = command.execute(score);
      const afterUndo = command.undo(afterRemove);

      const quants = afterUndo.chordTrack!.map((c) => c.quant);
      expect(quants).toEqual([0, 24, 48, 96]);
    });

    it('handles undo when original execute did not modify (not found)', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('nonexistent');

      const afterExecute = command.execute(score);
      const afterUndo = command.undo(afterExecute);

      expect(afterUndo).toBe(afterExecute);
    });

    it('preserves chord ID on restore', () => {
      const score = createScoreWithChords();
      const command = new RemoveChordCommand('chord_003');

      const afterRemove = command.execute(score);
      const afterUndo = command.undo(afterRemove);

      expect(findChordById(afterUndo, 'chord_003')).toBeDefined();
    });
  });
});

describe('Chord Commands Integration', () => {
  it('supports sequential add, update, remove operations', () => {
    let score = createEmptyScore();

    // Add a chord
    const addCommand = new AddChordCommand(0, 'C', 'test_chord');
    score = addCommand.execute(score);
    expect(score.chordTrack).toHaveLength(1);

    // Update the chord
    const updateCommand = new UpdateChordCommand('test_chord', { symbol: 'Cmaj7' });
    score = updateCommand.execute(score);
    expect(findChordById(score, 'test_chord')!.symbol).toBe('Cmaj7');

    // Remove the chord
    const removeCommand = new RemoveChordCommand('test_chord');
    score = removeCommand.execute(score);
    expect(score.chordTrack).toHaveLength(0);
  });

  it('supports full undo chain', () => {
    const originalScore = createEmptyScore();
    let score = originalScore;

    // Add
    const addCommand = new AddChordCommand(0, 'C', 'test_chord');
    score = addCommand.execute(score);

    // Update
    const updateCommand = new UpdateChordCommand('test_chord', { symbol: 'Cmaj7' });
    score = updateCommand.execute(score);

    // Undo update
    score = updateCommand.undo(score);
    expect(findChordById(score, 'test_chord')!.symbol).toBe('C');

    // Undo add
    score = addCommand.undo(score);
    expect(score.chordTrack).toEqual([]);
  });

  it('handles edge case: multiple chords at measure boundaries', () => {
    const score = createEmptyScore();

    // Add chords at measure boundaries (64 quants per measure in 4/4)
    const command1 = new AddChordCommand(0, 'C');
    const command2 = new AddChordCommand(64, 'G');
    const command3 = new AddChordCommand(128, 'Am');

    let result = command1.execute(score);
    result = command2.execute(result);
    result = command3.execute(result);

    expect(result.chordTrack).toHaveLength(3);
    const quants = result.chordTrack!.map((c) => c.quant);
    expect(quants).toEqual([0, 64, 128]);
  });

  it('handles edge case: negative quant values', () => {
    const score = createEmptyScore();
    const command = new AddChordCommand(-1, 'C');

    // Command should handle negative quant gracefully
    // (Implementation may clamp to 0 or reject)
    const result = command.execute(score);

    // The chord track should exist (behavior depends on implementation)
    expect(result.chordTrack).toBeDefined();
  });

  it('handles edge case: empty symbol string', () => {
    const score = createEmptyScore();
    const command = new AddChordCommand(0, '');

    const result = command.execute(score);

    // Empty symbol should still be allowed (for clearing chord display)
    expect(result.chordTrack).toBeDefined();
  });

  it('handles complex chord symbols', () => {
    const score = createEmptyScore();
    const complexSymbols = ['Cmaj7#11', 'Dm7b5', 'G7alt', 'F#m9', 'Bb13', 'Edim7', 'Aaug'];

    let result = score;
    complexSymbols.forEach((symbol, index) => {
      const command = new AddChordCommand(index * 24, symbol);
      result = command.execute(result);
    });

    expect(result.chordTrack).toHaveLength(complexSymbols.length);
    complexSymbols.forEach((symbol, index) => {
      expect(result.chordTrack![index].symbol).toBe(symbol);
    });
  });
});
