import { Command } from './types';
import { Score, getActiveStaff, Note } from '../types';

export class AddNoteToEventCommand implements Command {
  public readonly type = 'ADD_NOTE_TO_EVENT';

  constructor(
    private measureIndex: number,
    private eventId: string | number,
    private note: Note,
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
    
    // Check if note with same pitch already exists
    if (event.notes.some(n => n.pitch === this.note.pitch)) {
        return score; // No-op if duplicate pitch
    }

    const newNotes = [...event.notes, this.note];
    // Optional: Sort notes by pitch
    // newNotes.sort(...) 

    event.notes = newNotes;
    
    const newEvents = [...measure.events];
    newEvents[eventIndex] = event;
    measure.events = newEvents;

    newMeasures[this.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    const activeStaff = getActiveStaff(score, this.staffIndex);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) return score;

    const measure = { ...newMeasures[this.measureIndex] };
    const eventIndex = measure.events.findIndex(e => e.id === this.eventId);

    if (eventIndex === -1) return score;

    const event = { ...measure.events[eventIndex] };
    const newNotes = event.notes.filter(n => n.id !== this.note.id);
    
    event.notes = newNotes;
    
    const newEvents = [...measure.events];
    newEvents[eventIndex] = event;
    measure.events = newEvents;

    newMeasures[this.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }
}
