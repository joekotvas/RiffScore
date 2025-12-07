import { Command } from './types';
import { Score, getActiveStaff } from '../types';
import { getPitchByOffset } from '../services/PitchService';

export class TransposeSelectionCommand implements Command {
  public readonly type = 'TRANSPOSE_SELECTION';

  constructor(
    private selection: { staffIndex?: number; measureIndex: number | null; eventId: string | number | null; noteId: string | number | null },
    private semitones: number,
    private keySignature: string = 'C'
  ) {}

  execute(score: Score): Score {
    if (this.selection.measureIndex === null) return score;

    const staffIndex = this.selection.staffIndex ?? 0;
    const activeStaff = getActiveStaff(score, staffIndex);
    const clef = activeStaff.clef || 'treble'; // Get clef from the actual staff
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.selection.measureIndex]) return score;

    const measure = { ...newMeasures[this.selection.measureIndex] };
    
    // Case 1: Transpose specific note
    if (this.selection.eventId && this.selection.noteId) {
        const eventIndex = measure.events.findIndex(e => e.id === this.selection.eventId);
        if (eventIndex === -1) return score;

        const event = { ...measure.events[eventIndex] };
        const noteIndex = event.notes.findIndex(n => n.id === this.selection.noteId);
        
        if (noteIndex === -1) return score;

        const note = { ...event.notes[noteIndex] };
        // Use clef from the staff, not keySignature
        note.pitch = getPitchByOffset(note.pitch, this.semitones, clef);
        
        const newNotes = [...event.notes];
        newNotes[noteIndex] = note;
        event.notes = newNotes;
        
        const newEvents = [...measure.events];
        newEvents[eventIndex] = event;
        measure.events = newEvents;
    }
    // Case 2: Transpose entire event (all notes)
    else if (this.selection.eventId) {
        const eventIndex = measure.events.findIndex(e => e.id === this.selection.eventId);
        if (eventIndex === -1) return score;

        const event = { ...measure.events[eventIndex] };
        const newNotes = event.notes.map(n => ({
            ...n,
            pitch: getPitchByOffset(n.pitch, this.semitones, clef)
        }));
        
        event.notes = newNotes;
        
        const newEvents = [...measure.events];
        newEvents[eventIndex] = event;
        measure.events = newEvents;
    }
    // Case 3: Transpose entire measure
    else {
        const newEvents = measure.events.map(e => ({
            ...e,
            notes: e.notes.map(n => ({
                ...n,
                pitch: getPitchByOffset(n.pitch, this.semitones, clef)
            }))
        }));
        measure.events = newEvents;
    }

    newMeasures[this.selection.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    // Undo is just transposing in the opposite direction
    const undoCommand = new TransposeSelectionCommand(this.selection, -this.semitones, this.keySignature);
    return undoCommand.execute(score);
  }
}
