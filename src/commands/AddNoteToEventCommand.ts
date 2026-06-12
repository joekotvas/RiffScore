import { Command } from './types';
import { Score, Note } from '@/types';
import { updateEvent } from '@/utils/commandHelpers';

export class AddNoteToEventCommand implements Command {
  public readonly type = 'ADD_NOTE_TO_EVENT';

  // Set when execute() PROMOTED a rest event to a note (rather than appending a chord tone), so undo
  // can restore the rest exactly.
  private promotedFrom: { isRest?: boolean; reserved?: boolean; notes: Note[] } | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string,
    private note: Note,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    this.promotedFrom = null;
    return updateEvent(score, this.staffIndex, this.measureIndex, this.eventId, (event) => {
      // Check duplicate
      if (event.notes.some((n) => n.pitch === this.note.pitch)) return false;

      // Adding the first real note to a REST promotes it to a note event — you can't stack a tone
      // onto a rest. Appending instead would leave isRest:true with a pitched note (a malformed event
      // the renderer/exporter treat as a rest, silently swallowing the note).
      if (event.isRest) {
        this.promotedFrom = { isRest: event.isRest, reserved: event.reserved, notes: event.notes };
        event.isRest = false;
        event.reserved = false;
        event.notes = [this.note];
        return true;
      }

      event.notes = [...event.notes, this.note];
      return true;
    });
  }

  undo(score: Score): Score {
    return updateEvent(score, this.staffIndex, this.measureIndex, this.eventId, (event) => {
      if (this.promotedFrom) {
        event.isRest = this.promotedFrom.isRest;
        event.reserved = this.promotedFrom.reserved;
        event.notes = this.promotedFrom.notes;
        return true;
      }
      const initialLength = event.notes.length;
      event.notes = event.notes.filter((n) => n.id !== this.note.id);
      return event.notes.length !== initialLength;
    });
  }
}
