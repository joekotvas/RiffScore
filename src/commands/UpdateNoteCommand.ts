import { Command } from './types';
import { Score, Note } from '@/types';
import { updateNote } from '@/utils/commandHelpers';
import { foldAccidentalIntoPitch, deriveAccidental } from '@/services/MusicService';

export class UpdateNoteCommand implements Command {
  public readonly type = 'UPDATE_NOTE';
  private previousNote: Note | null = null;

  constructor(
    private measureIndex: number,
    private eventId: string,
    private noteId: string,
    private updates: Partial<Note>,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    const staffKey = score.staves[this.staffIndex]?.keySignature || score.keySignature || 'C';

    return updateNote(
      score,
      this.staffIndex,
      this.measureIndex,
      this.eventId,
      this.noteId,
      (note) => {
        this.previousNote = { ...note };

        // CONTRACT C1: pitch is the single source of truth for alteration.
        // If a caller asks to change the `accidental` WITHOUT supplying a pitch,
        // fold that accidental into the sounding pitch so it is never a no-op.
        // This guards every dispatch path, not just the API.
        const updates = { ...this.updates };
        const accidentalChanged = 'accidental' in updates;
        const pitchChanged = 'pitch' in updates;

        if (accidentalChanged && !pitchChanged && note.pitch != null) {
          const type = updates.accidental ?? null;
          updates.pitch = foldAccidentalIntoPitch(note.pitch, type, staffKey);
        }

        Object.assign(note, updates);

        // Keep the legacy `accidental` field as a strictly-DERIVED mirror of the
        // (possibly newly-computed) pitch so readers never disagree with pitch.
        if ('pitch' in updates && note.pitch != null) {
          note.accidental = deriveAccidental(note.pitch);
        }

        return true;
      }
    );
  }

  undo(score: Score): Score {
    if (!this.previousNote) return score;

    return updateNote(
      score,
      this.staffIndex,
      this.measureIndex,
      this.eventId,
      this.noteId,
      (note) => {
        // Restore all properties from previousNote
        // Note: Object.assign implies we overwrite keys, but if 'updates' added keys that were undefined,
        // previousNote might not have them. A strict 'replace' logic is safer if we want full undo.
        // updateNote gives us a clone of the current note.
        // The safest way is to replace the properties we changed.

        // Since 'updates' is Partial<Note>, we can just re-apply previousNote properties?
        // Actually, updateNote expects modification of the passed 'note' object.
        // We can just Object.assign(note, this.previousNote).
        Object.assign(note, this.previousNote);
        return true;
      }
    );
  }
}
