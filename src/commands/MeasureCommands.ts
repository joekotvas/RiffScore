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
    // Remove each staff's added bar by its RECORDED id, not the shared insertedIndex: on a desynced
    // grand staff, splice() clamped the insert to a shorter staff's end, so the added bar isn't at
    // insertedIndex there — an index-based removal would orphan it (under-delete).
    const newStaves = score.staves.map((staff, index) => {
      const addedId = this.addedMeasureIds[index];
      if (!addedId) return staff;
      const idx = staff.measures.findIndex((m) => m.id === addedId);
      if (idx === -1) return staff;
      const newMeasures = [...staff.measures];
      newMeasures.splice(idx, 1);
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

    const newStaves = score.staves.map((staff, index) => {
      const newMeasures = [...staff.measures];
      if (targetIndex < newMeasures.length) {
        // Index-aligned by staff (was .push, which misaligned the staff→measure map when a shorter
        // staff had no bar at targetIndex — undo then restored the wrong measure to the wrong staff).
        this.deletedMeasures[index] = newMeasures[targetIndex];
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
