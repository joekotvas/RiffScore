import { Command } from './types';
import { Score, getActiveStaff, ScoreEvent, Note } from '../types';

export class DeleteNoteCommand implements Command {
  public readonly type = 'DELETE_NOTE';
  private deletedEventIndex: number = -1;
  private deletedEvent: ScoreEvent | null = null;
  private deletedNote: Note | null = null;
  private wasLastNoteInEvent: boolean = false;

  constructor(
    private measureIndex: number,
    private eventId: string | number,
    private noteId: string | number,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    const activeStaff = getActiveStaff(score, this.staffIndex);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) return score;

    const measure = { ...newMeasures[this.measureIndex] };
    const eventIndex = measure.events.findIndex(e => e.id === this.eventId);

    if (eventIndex === -1) return score;

    const event = { ...measure.events[eventIndex] };
    this.deletedEventIndex = eventIndex;

    // Check if note exists
    const noteIndex = event.notes.findIndex(n => n.id === this.noteId);
    if (noteIndex === -1) return score;

    this.deletedNote = event.notes[noteIndex];

    if (event.notes.length === 1) {
        // Remove the entire event if it's the last note
        this.wasLastNoteInEvent = true;
        this.deletedEvent = event;
        const newEvents = [...measure.events];
        newEvents.splice(eventIndex, 1);
        measure.events = newEvents;
    } else {
        // Remove just the note
        this.wasLastNoteInEvent = false;
        const newNotes = [...event.notes];
        newNotes.splice(noteIndex, 1);
        event.notes = newNotes;
        
        const newEvents = [...measure.events];
        newEvents[eventIndex] = event;
        measure.events = newEvents;
    }

    newMeasures[this.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    if (this.deletedEventIndex === -1 || !this.deletedNote) return score;

    const activeStaff = getActiveStaff(score, this.staffIndex);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) return score;

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];

    if (this.wasLastNoteInEvent && this.deletedEvent) {
        // Restore the entire event
        newEvents.splice(this.deletedEventIndex, 0, this.deletedEvent);
    } else {
        // Restore the note to the event
        // Note: This logic assumes the event still exists at the same index if we didn't delete it.
        // In a real collaborative environment, we'd need more robust ID-based lookup.
        // For single-user undo stack, index is usually safe if operations are strictly sequential.
        const event = { ...newEvents[this.deletedEventIndex] };
        if (event.id !== this.eventId) {
            // Fallback: try to find by ID if index shifted (though strictly sequential undo shouldn't shift)
             const foundIndex = newEvents.findIndex(e => e.id === this.eventId);
             if (foundIndex !== -1) {
                 this.deletedEventIndex = foundIndex;
             } else {
                 return score; // Cannot find event to restore note to
             }
        }
        
        const newNotes = [...event.notes, this.deletedNote];
        // Optional: sort notes by pitch if needed, but simple append is fine for restore
        event.notes = newNotes;
        newEvents[this.deletedEventIndex] = event;
    }

    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }
}
