import { Command } from '../types';
import { Score, ChordSymbol } from '@/types';
import { chordId } from '@/utils/id';
import { updateChordTrack } from '@/utils/commandHelpers';

/** Position for chord placement */
export interface ChordPosition {
  measure: number;
  quant: number;
}

/**
 * Compare two chord positions for sorting.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export const compareChordPositions = (
  a: { measure: number; quant: number },
  b: { measure: number; quant: number }
): number => {
  if (a.measure !== b.measure) return a.measure - b.measure;
  return a.quant - b.quant;
};

/**
 * Check if two chord positions are equal.
 */
export const positionsEqual = (
  a: { measure: number; quant: number },
  b: { measure: number; quant: number }
): boolean => {
  return a.measure === b.measure && a.quant === b.quant;
};

/**
 * Add a chord symbol at a specific measure-local position.
 *
 * If a chord already exists at that position, it is replaced.
 * The chord track is kept sorted by measure, then by quant.
 *
 * @example
 * ```typescript
 * // Add a C major chord at measure 0, beat 1
 * dispatch(new AddChordCommand({ measure: 0, quant: 0 }, 'C'));
 *
 * // Add at measure 1, beat 2 with custom ID
 * dispatch(new AddChordCommand({ measure: 1, quant: 16 }, 'G7', 'chord_custom_123'));
 * ```
 *
 * @throws {Error} If measure or quant is negative
 * @throws {Error} If symbol is empty after trimming
 *
 * @tested src/__tests__/commands/chord/ChordCommands.test.ts
 */
export class AddChordCommand implements Command {
  readonly type = 'ADD_CHORD';
  private chord: ChordSymbol;
  private insertIndex: number = -1;
  private replacedChord: ChordSymbol | null = null;

  /**
   * @param position - Measure-local position { measure, quant }
   * @param symbol - Chord symbol string (e.g., 'C', 'Dm7', 'G/B')
   * @param id - Optional chord ID (auto-generated if omitted)
   */
  constructor(position: ChordPosition, symbol: string, id?: string) {
    if (position.measure < 0) {
      throw new Error(`AddChordCommand: measure must be >= 0, got ${position.measure}`);
    }
    if (position.quant < 0) {
      throw new Error(`AddChordCommand: quant must be >= 0, got ${position.quant}`);
    }
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol) {
      throw new Error('AddChordCommand: symbol cannot be empty');
    }
    this.chord = {
      id: id ?? chordId(),
      measure: position.measure,
      quant: position.quant,
      symbol: trimmedSymbol,
    };
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      // Find insert position (sorted by measure, then quant)
      this.insertIndex = chordTrack.findIndex((c) => compareChordPositions(c, this.chord) >= 0);

      if (this.insertIndex === -1) {
        // Append at end
        this.insertIndex = chordTrack.length;
        chordTrack.push(this.chord);
      } else if (positionsEqual(chordTrack[this.insertIndex], this.chord)) {
        // Replace existing chord at same position
        this.replacedChord = chordTrack[this.insertIndex];
        chordTrack[this.insertIndex] = this.chord;
      } else {
        // Insert before the found position
        chordTrack.splice(this.insertIndex, 0, this.chord);
      }
      return chordTrack;
    });
  }

  undo(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      const idx = chordTrack.findIndex((c) => c.id === this.chord.id);
      if (idx === -1) return false;

      if (this.replacedChord) {
        // Restore the replaced chord
        chordTrack[idx] = this.replacedChord;
      } else {
        // Remove the inserted chord
        chordTrack.splice(idx, 1);
      }
      return chordTrack;
    });
  }
}
