import { Command } from './types';
import { Score, Note } from '@/types';
import { updateEvent } from '@/utils/commandHelpers';

/**
 * Fills a reserved tuplet placeholder slot (#242 Lane C) with a note OR a notated rest: clears
 * `reserved` and installs the supplied note, keeping the slot's fixed duration/dotted/tuplet/
 * position (a tuplet's rhythm is fixed, so input supplies only pitch — or a pitch-less rest). The
 * slot becomes a notated rest when the note is pitch-less. No-op if the target isn't reserved.
 */
export class FillReservedSlotCommand implements Command {
  public readonly type = 'FILL_RESERVED_SLOT';
  private previousNotes: Note[] | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string,
    private note: Note,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    return updateEvent(score, this.staffIndex, this.measureIndex, this.eventId, (event) => {
      if (!event.reserved) return false; // only reserved slots are fillable
      this.previousNotes = event.notes.map((n) => ({ ...n }));
      event.reserved = false;
      event.isRest = this.note.pitch === null; // a pitch-less fill = a notated rest
      event.notes = [this.note];
      return true;
    });
  }

  undo(score: Score): Score {
    if (!this.previousNotes) return score;
    const previousNotes = this.previousNotes;
    return updateEvent(score, this.staffIndex, this.measureIndex, this.eventId, (event) => {
      event.reserved = true;
      event.isRest = true;
      event.notes = previousNotes.map((n) => ({ ...n }));
      return true;
    });
  }
}
