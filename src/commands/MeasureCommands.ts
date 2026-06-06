import { Command } from './types';
import { Score, Measure, ChordSymbol } from '@/types';
import { measureId } from '@/utils/id';
import {
  shiftChordsForInsertedMeasure,
  shiftChordsForDeletedMeasure,
} from '@/services/chord/ChordQuants';

export class AddMeasureCommand implements Command {
  public readonly type = 'ADD_MEASURE';
  private addedMeasureIds: string[] = [];
  private insertedIndex: number = -1;
  private previousChordTrack: ChordSymbol[] | undefined = undefined;

  constructor(private atIndex?: number) {}

  execute(score: Score): Score {
    this.previousChordTrack = score.chordTrack;
    const firstStaff = score.staves[0];
    if (!firstStaff) return score; // nothing to add to (and no valid index for a chord shift)

    // Compute the insertion index ONCE from the first staff, so it's consistent across all
    // staves and drives the chord shift. Computing it per-staff (the old approach) left it at
    // -1 for an empty score — shifting every chord — and at the last staff's value for a
    // desynced grand staff.
    const measureCount = firstStaff.measures.length;
    const insertAt =
      this.atIndex !== undefined && this.atIndex >= 0 && this.atIndex <= measureCount
        ? this.atIndex
        : measureCount;
    this.insertedIndex = insertAt;

    const newStaves = score.staves.map((staff, index) => {
      const newMeasures = [...staff.measures];
      const newId = measureId();
      this.addedMeasureIds[index] = newId;
      const newMeasure: Measure = { id: newId, events: [] };
      newMeasures.splice(insertAt, 0, newMeasure); // splice clamps to end when appending
      return { ...staff, measures: newMeasures };
    });

    // Chords at or after the inserted bar move one bar later (#242).
    return {
      ...score,
      staves: newStaves,
      chordTrack: shiftChordsForInsertedMeasure(score.chordTrack, insertAt),
    };
  }

  undo(score: Score): Score {
    const newStaves = score.staves.map((staff, index) => {
      const newMeasures = [...staff.measures];
      if (newMeasures.length === 0) {
        return { ...staff, measures: newMeasures };
      }

      // Check if execute() was called (addedMeasureIds would be populated)
      const wasExecuted = this.addedMeasureIds.length > 0;

      if (wasExecuted) {
        // Normal case: remove at recorded index if IDs match
        if (
          this.insertedIndex >= 0 &&
          this.insertedIndex < newMeasures.length &&
          this.addedMeasureIds[index] &&
          newMeasures[this.insertedIndex].id === this.addedMeasureIds[index]
        ) {
          newMeasures.splice(this.insertedIndex, 1);
        }
      }
      return { ...staff, measures: newMeasures };
    });

    return { ...score, staves: newStaves, chordTrack: this.previousChordTrack };
  }
}

export class DeleteMeasureCommand implements Command {
  public readonly type = 'DELETE_MEASURE';
  private deletedMeasures: Measure[] = [];
  private deletedIndex: number = -1;
  private previousChordTrack: ChordSymbol[] | undefined = undefined;

  constructor(private index?: number) {}

  execute(score: Score): Score {
    // Determine target index from first staff (assuming sync)
    const firstStaff = score.staves[0];
    if (!firstStaff || firstStaff.measures.length === 0) return score;

    const targetIndex = this.index !== undefined ? this.index : firstStaff.measures.length - 1;
    if (targetIndex < 0 || targetIndex >= firstStaff.measures.length) return score;

    this.deletedIndex = targetIndex;
    this.deletedMeasures = [];
    this.previousChordTrack = score.chordTrack;

    const newStaves = score.staves.map((staff) => {
      const newMeasures = [...staff.measures];
      if (targetIndex < newMeasures.length) {
        this.deletedMeasures.push(newMeasures[targetIndex]);
        newMeasures.splice(targetIndex, 1);
      }
      return { ...staff, measures: newMeasures };
    });

    // Chords in the deleted bar are dropped; chords after it move one bar earlier (#242).
    return {
      ...score,
      staves: newStaves,
      chordTrack: shiftChordsForDeletedMeasure(score.chordTrack, targetIndex),
    };
  }

  undo(score: Score): Score {
    if (this.deletedIndex === -1 || this.deletedMeasures.length === 0) return score;

    const newStaves = score.staves.map((staff, index) => {
      const newMeasures = [...staff.measures];
      const deletedMeasure = this.deletedMeasures[index]; // Assuming staves order preserved
      if (deletedMeasure) {
        newMeasures.splice(this.deletedIndex, 0, deletedMeasure);
      }
      return { ...staff, measures: newMeasures };
    });

    return { ...score, staves: newStaves, chordTrack: this.previousChordTrack };
  }
}
