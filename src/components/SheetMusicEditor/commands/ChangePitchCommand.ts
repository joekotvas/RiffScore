import { Command } from './types';
import { Score, getActiveStaff } from '../types';

export class ChangePitchCommand implements Command {
  public readonly type = 'CHANGE_PITCH';
  private oldPitch: string | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string | number,
    private noteId: string | number,
    private newPitch: string,
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
    const noteIndex = event.notes.findIndex(n => n.id === this.noteId);

    if (noteIndex === -1) return score;

    const note = { ...event.notes[noteIndex] };
    this.oldPitch = note.pitch;
    note.pitch = this.newPitch;

    const newNotes = [...event.notes];
    newNotes[noteIndex] = note;
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
    if (this.oldPitch === null) return score;

    // Reuse the logic but swap newPitch with oldPitch
    // We can just construct a temporary command or duplicate logic. 
    // Duplicating logic is safer to avoid recursion or side effects.
    
    const activeStaff = getActiveStaff(score, this.staffIndex);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) return score;

    const measure = { ...newMeasures[this.measureIndex] };
    const eventIndex = measure.events.findIndex(e => e.id === this.eventId);

    if (eventIndex === -1) return score;

    const event = { ...measure.events[eventIndex] };
    const noteIndex = event.notes.findIndex(n => n.id === this.noteId);

    if (noteIndex === -1) return score;

    const note = { ...event.notes[noteIndex] };
    note.pitch = this.oldPitch; // Restore old pitch

    const newNotes = [...event.notes];
    newNotes[noteIndex] = note;
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
