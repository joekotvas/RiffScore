import { Command } from './types';
import { Score, Note, getActiveStaff, ScoreEvent } from '../types';

export class AddNoteCommand implements Command {
  public readonly type = 'ADD_NOTE';

  constructor(
    private measureIndex: number,
    private note: Note,
    private duration: string,
    private isDotted: boolean,
    private index?: number,
    private eventId?: string,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    const activeStaff = getActiveStaff(score, this.staffIndex);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) {
        return score; // Measure not found
    }

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];

    // Simple append logic for now (real logic needs to handle timing/chords)
    // This is a basic implementation for the API layer proof-of-concept
    const newEvent: ScoreEvent = {
        id: this.eventId || Date.now().toString(), // Use provided ID or generate one
        duration: this.duration,
        dotted: this.isDotted,
        notes: [this.note],
        isRest: false
    };

    if (this.index !== undefined && this.index >= 0 && this.index <= newEvents.length) {
        newEvents.splice(this.index, 0, newEvent);
    } else {
        newEvents.push(newEvent);
    }

    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    // Undo logic would be complex if we don't store the previous state or the ID of the added event.
    // For a robust command pattern, we usually store the inverse operation or the previous state.
    // For this simple example, we'll assume we can remove the last event if it matches.
    // A better approach for production is to have the execute() method return the *new* score 
    // AND store enough info to undo it (e.g. the ID of the created event).
    
    // For now, let's implement a naive undo that removes the last event of the measure.
    const activeStaff = getActiveStaff(score, this.staffIndex);
    const newMeasures = [...activeStaff.measures];
    
    if (!newMeasures[this.measureIndex]) {
        return score;
    }

    const measure = { ...newMeasures[this.measureIndex] };
    const newEvents = [...measure.events];
    
    if (this.index !== undefined && this.index >= 0 && this.index < newEvents.length) {
         newEvents.splice(this.index, 1);
    } else {
         newEvents.pop(); // Remove last event
    }
    
    measure.events = newEvents;
    newMeasures[this.measureIndex] = measure;

    const newStaves = [...score.staves];
    newStaves[this.staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }
}
