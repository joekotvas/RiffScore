import { Command } from './types';
import { Score, getActiveStaff, Note } from '../types';

export class UpdateNoteCommand implements Command {
  public readonly type = 'UPDATE_NOTE';
  private previousNote: Note | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string | number,
    private noteId: string | number,
    private updates: Partial<Note>
  ) {}

  execute(score: Score): Score {
    const activeStaff = getActiveStaff(score);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) return score;

    const measure = { ...newMeasures[this.measureIndex] };
    const eventIndex = measure.events.findIndex(e => e.id === this.eventId);

    if (eventIndex === -1) return score;

    const event = { ...measure.events[eventIndex] };
    const noteIndex = event.notes.findIndex(n => n.id === this.noteId);

    if (noteIndex === -1) return score;

    const note = { ...event.notes[noteIndex] };
    this.previousNote = note;

    const newNote = { ...note, ...this.updates };
    
    const newNotes = [...event.notes];
    newNotes[noteIndex] = newNote;
    event.notes = newNotes;
    
    const newEvents = [...measure.events];
    newEvents[eventIndex] = event;
    measure.events = newEvents;

    newMeasures[this.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[0] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    if (!this.previousNote) return score;

    const activeStaff = getActiveStaff(score);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) return score;

    const measure = { ...newMeasures[this.measureIndex] };
    const eventIndex = measure.events.findIndex(e => e.id === this.eventId);

    if (eventIndex === -1) return score;

    const event = { ...measure.events[eventIndex] };
    const noteIndex = event.notes.findIndex(n => n.id === this.noteId);

    if (noteIndex === -1) return score;

    const newNotes = [...event.notes];
    newNotes[noteIndex] = this.previousNote;
    event.notes = newNotes;
    
    const newEvents = [...measure.events];
    newEvents[eventIndex] = event;
    measure.events = newEvents;

    newMeasures[this.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[0] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }
}
