import { Command } from './types';
import { Score, Note, ScoreEvent } from '../types';
import { updateMeasure } from '../utils/commandHelpers';

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
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
        const newEvents = [...measure.events];
        
        const newEvent: ScoreEvent = {
            id: this.eventId || Date.now().toString(),
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
        return true;
    });
  }

  undo(score: Score): Score {
    return updateMeasure(score, this.staffIndex, this.measureIndex, (measure) => {
        const newEvents = [...measure.events];
        
        if (this.index !== undefined && this.index >= 0 && this.index < newEvents.length) {
             newEvents.splice(this.index, 1);
        } else {
             newEvents.pop(); // Remove last event
        }
        
        measure.events = newEvents;
        return true;
    });
  }
}
