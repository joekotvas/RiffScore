import { Command } from './types';
import { Score, Note } from '@/types';
import { updateEvent } from '@/utils/commandHelpers';

/**
 * Sets a tuplet MEMBER's note at its fixed rhythm (#242 Lane C), without disturbing the group.
 * Two cases, both routed here because a tuplet's rhythm is fixed and input supplies only the pitch
 * (or a pitch-less rest), never a new duration:
 *   - a RESERVED placeholder slot (freed by deleting a member) → install the note, clear `reserved`;
 *   - a REAL member (the selection re-anchors onto a sibling after a delete) → replace its pitch.
 * The slot becomes a notated rest when the note is pitch-less. Keeps id/duration/dotted/tuplet/
 * position intact, so the group stays coherent (the old path overwrote the member with a plain
 * note, dropping the tuplet and consuming the reserved slot → an orphaned single-member group).
 * No-op if the target isn't a tuplet member. Undo restores the member's exact prior state.
 */
export class FillReservedSlotCommand implements Command {
  public readonly type = 'FILL_RESERVED_SLOT';
  private prev: { reserved: boolean; isRest: boolean; notes: Note[] } | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string,
    private note: Note,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    return updateEvent(score, this.staffIndex, this.measureIndex, this.eventId, (event) => {
      if (!event.tuplet) return false; // only a tuplet member has a fixed-rhythm slot to set
      this.prev = {
        reserved: !!event.reserved,
        isRest: !!event.isRest,
        notes: event.notes.map((n) => ({ ...n })),
      };
      event.reserved = false;
      event.isRest = this.note.pitch === null; // a pitch-less fill = a notated rest
      event.notes = [this.note];
      return true;
    });
  }

  undo(score: Score): Score {
    if (!this.prev) return score;
    const prev = this.prev;
    return updateEvent(score, this.staffIndex, this.measureIndex, this.eventId, (event) => {
      event.reserved = prev.reserved;
      event.isRest = prev.isRest;
      event.notes = prev.notes.map((n) => ({ ...n }));
      return true;
    });
  }
}
