import { Command } from '../types';
import { Score, ChordSymbol } from '@/types';
import { chordId } from '@/utils/id';
import { updateChordTrack } from '@/utils/commandHelpers';

/**
 * Add a chord symbol at a specific quant position.
 *
 * If a chord already exists at that quant, it is replaced.
 * The chord track is kept sorted by quant position.
 *
 * @example
 * ```typescript
 * // Add a C major chord at beat 1
 * dispatch(new AddChordCommand(0, 'C'));
 *
 * // Add with custom ID
 * dispatch(new AddChordCommand(24, 'G7', 'chord_custom_123'));
 * ```
 *
 * @throws {Error} If quant is negative
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
   * @param quant - Global quant position (must be >= 0)
   * @param symbol - Chord symbol string (e.g., 'C', 'Dm7', 'G/B')
   * @param id - Optional chord ID (auto-generated if omitted)
   */
  constructor(quant: number, symbol: string, id?: string) {
    if (quant < 0) {
      throw new Error(`AddChordCommand: quant must be >= 0, got ${quant}`);
    }
    const trimmedSymbol = symbol.trim();
    if (!trimmedSymbol) {
      throw new Error('AddChordCommand: symbol cannot be empty');
    }
    this.chord = { id: id ?? chordId(), quant, symbol: trimmedSymbol };
  }

  execute(score: Score): Score {
    return updateChordTrack(score, (chordTrack) => {
      this.insertIndex = chordTrack.findIndex((c) => c.quant >= this.chord.quant);
      if (this.insertIndex === -1) {
        // Append at end
        this.insertIndex = chordTrack.length;
        chordTrack.push(this.chord);
      } else if (chordTrack[this.insertIndex].quant === this.chord.quant) {
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
