/**
 * ChromaticTransposeCommand
 *
 * Transposes selected notes by a specified number of semitones.
 * Unlike TransposeSelectionCommand (diatonic/visual), this moves by
 * exact chromatic intervals regardless of key signature.
 *
 * @see TransposeSelectionCommand for diatonic transposition
 */

import { Command } from './types';
import { Score, getActiveStaff, Selection, Staff, ScoreEvent, Note as NoteType } from '@/types';
import { Note, Interval } from 'tonal';
import { PIANO_RANGE } from '@/constants';
import { getMidi } from '@/services/MusicService';
import { spellPitchInKey } from '@/utils/keyResolution';
import { NoteSnapshot, snapshotNotes, restoreNoteSnapshots } from './transposeSnapshot';

export class ChromaticTransposeCommand implements Command {
  public readonly type = 'CHROMATIC_TRANSPOSE';

  /**
   * Pre-image of every note this command is about to mutate, captured on the
   * MOST RECENT execute(). undo() restores these verbatim — lossless, immune to
   * range-clamp no-ops and enharmonic drift (unlike inverse re-transposition).
   */
  private preImage: NoteSnapshot[] = [];

  constructor(
    private selection: Selection,
    private semitones: number,
    // Fallback key when a target staff has no key signature. execute() prefers
    // each target staff's own key (per-staff, so grand-staff/multi-staff
    // selections spanning different keys spell correctly).
    private keySignature: string = 'C'
  ) {}

  /**
   * Enumerate the stable coordinates of every note this command would mutate
   * for a given score, applying the SAME case logic as execute(). Used to
   * capture the pre-image snapshot before mutation.
   */
  private collectTargets(score: Score): Array<{
    staffIndex: number;
    measureIndex: number;
    eventId: string;
    noteId: string;
  }> {
    const targets: Array<{
      staffIndex: number;
      measureIndex: number;
      eventId: string;
      noteId: string;
    }> = [];

    if (this.selection.measureIndex === null) return targets;

    const idsMatch = (a: string | null, b: string | null) => String(a) === String(b);

    // CASE 0: Multi-Note Selection
    if (this.selection.selectedNotes && this.selection.selectedNotes.length > 0) {
      this.selection.selectedNotes.forEach((sn) => {
        const staff = score.staves[sn.staffIndex];
        const measure = staff?.measures[sn.measureIndex];
        if (!measure) return;
        const event = measure.events.find((e) => idsMatch(e.id, sn.eventId));
        if (!event) return;
        const note = event.notes.find((n) => idsMatch(n.id, sn.noteId));
        if (note && note.pitch !== null) {
          targets.push({
            staffIndex: sn.staffIndex,
            measureIndex: sn.measureIndex,
            eventId: event.id,
            noteId: note.id,
          });
        }
      });
      return targets;
    }

    const staffIndex = this.selection.staffIndex ?? 0;
    const activeStaff = getActiveStaff(score, staffIndex);
    const measure = activeStaff.measures[this.selection.measureIndex];
    if (!measure) return targets;

    // Case 1: specific note
    if (this.selection.eventId && this.selection.noteId) {
      const event = measure.events.find((e) => idsMatch(e.id, this.selection.eventId));
      if (!event) return targets;
      const note = event.notes.find((n) => idsMatch(n.id, this.selection.noteId));
      if (note && note.pitch !== null) {
        targets.push({
          staffIndex,
          measureIndex: this.selection.measureIndex,
          eventId: event.id,
          noteId: note.id,
        });
      }
    }
    // Case 2: entire event
    else if (this.selection.eventId) {
      const event = measure.events.find((e) => idsMatch(e.id, this.selection.eventId));
      if (event) {
        event.notes.forEach((n) => {
          if (n.pitch !== null) {
            targets.push({
              staffIndex,
              measureIndex: this.selection.measureIndex!,
              eventId: event.id,
              noteId: n.id,
            });
          }
        });
      }
    }

    return targets;
  }

  /**
   * Transpose a pitch by semitones, respelled key-aware, clamped to piano range.
   *
   * Raw `Note.transpose` accumulates accidentals without bound (a +1 is a minor
   * 2nd, forcing a letter-step + an extra flat each time: E♭ → F♭ → G𝄫 → …).
   * We keep that result's SOUNDING pitch but choose a conventional spelling for
   * the target key (#239) — `spellPitchInKey` is MIDI-preserving, so transpose
   * still moves by exactly `semitones`; only the spelling changes. Direction
   * (sign of `semitones`) breaks the out-of-key sharp/flat tie: up → sharp,
   * down → flat.
   */
  private transposePitch(pitch: string, keySig: string): string | null {
    if (!pitch) return null;

    // Get the interval from semitones (e.g., 3 -> "3m" or "3M" depending on context)
    // Using Interval.fromSemitones will give us the simplest interval
    const interval = Interval.fromSemitones(this.semitones);
    if (!interval) return pitch;

    const transposed = Note.transpose(pitch, interval);
    if (!transposed) return pitch;

    // Key-aware respelling (kills the double/triple-accidental explosion).
    const spelled = spellPitchInKey(transposed, keySig, this.semitones >= 0 ? 'sharp' : 'flat');

    // Clamp to piano range (on the sounding pitch).
    const midi = getMidi(spelled);
    const minMidi = getMidi(PIANO_RANGE.min);
    const maxMidi = getMidi(PIANO_RANGE.max);

    if (midi < minMidi || midi > maxMidi) {
      return pitch; // Don't transpose out of range
    }

    return spelled;
  }

  execute(score: Score): Score {
    // Capture the pre-image of every note we are about to mutate BEFORE we
    // mutate anything. Refreshed on every execute() so redo stays lossless.
    this.preImage = snapshotNotes(score, this.collectTargets(score));

    if (this.selection.measureIndex === null) return score;

    const staffIndex = this.selection.staffIndex ?? 0;

    // Helper for robust ID comparison
    const idsMatch = (a: string | null, b: string | null) => String(a) === String(b);

    // CASE 0: Multi-Note Selection (using selection.selectedNotes)
    if (this.selection.selectedNotes && this.selection.selectedNotes.length > 0) {
      // Group by staff -> measure
      const notesByMeasure = new Map<string, typeof this.selection.selectedNotes>();

      this.selection.selectedNotes.forEach((sn) => {
        const key = `${sn.staffIndex}-${sn.measureIndex}`;
        if (!notesByMeasure.has(key)) notesByMeasure.set(key, []);
        notesByMeasure.get(key)!.push(sn);
      });

      const newStaves = [...score.staves];
      const staffMap = new Map<number, Staff>();

      notesByMeasure.forEach((notesInMeasure, key) => {
        const [sIdxStr, mIdxStr] = key.split('-');
        const sIdx = parseInt(sIdxStr, 10);
        const mIdx = parseInt(mIdxStr, 10);

        // Resolve the key per target staff so a selection spanning staves with
        // different key signatures (grand staff) spells each note in its own key.
        const keySig = score.staves[sIdx]?.keySignature || this.keySignature || 'C';

        if (!staffMap.has(sIdx)) {
          staffMap.set(sIdx, {
            ...newStaves[sIdx],
            measures: [...newStaves[sIdx].measures],
          });
          newStaves[sIdx] = staffMap.get(sIdx)!;
        }
        const workingStaff = staffMap.get(sIdx)!;

        const originalMeasure = workingStaff.measures[mIdx];
        if (!originalMeasure) return;

        const newMeasure = { ...originalMeasure, events: [...originalMeasure.events] };
        workingStaff.measures[mIdx] = newMeasure;

        // Group notes by event
        const notesByEvent = new Map<string, typeof notesInMeasure>();
        notesInMeasure.forEach((n) => {
          const eKey = String(n.eventId);
          if (!notesByEvent.has(eKey)) notesByEvent.set(eKey, []);
          notesByEvent.get(eKey)!.push(n);
        });

        notesByEvent.forEach((notesInEvent, eIdStr) => {
          const eventIndex = newMeasure.events.findIndex(
            (e: ScoreEvent) => String(e.id) === eIdStr
          );
          if (eventIndex === -1) return;

          const newEvent = {
            ...newMeasure.events[eventIndex],
            notes: [...newMeasure.events[eventIndex].notes],
          };
          newMeasure.events[eventIndex] = newEvent;

          notesInEvent.forEach((nTarget) => {
            const noteIndex = newEvent.notes.findIndex((note: NoteType) =>
              idsMatch(note.id, nTarget.noteId)
            );
            if (noteIndex !== -1) {
              const currentPitch = newEvent.notes[noteIndex].pitch;
              if (currentPitch !== null) {
                const newPitch = this.transposePitch(currentPitch, keySig);
                if (newPitch) {
                  newEvent.notes[noteIndex] = {
                    ...newEvent.notes[noteIndex],
                    pitch: newPitch,
                  };
                }
              }
            }
          });
        });
      });

      return { ...score, staves: newStaves };
    }

    // Case 1: Transpose specific note
    const activeStaff = getActiveStaff(score, staffIndex);
    const keySig = activeStaff.keySignature || this.keySignature || 'C';
    const newMeasures = [...activeStaff.measures];

    if (!newMeasures[this.selection.measureIndex]) return score;

    const measure = { ...newMeasures[this.selection.measureIndex] };

    if (this.selection.eventId && this.selection.noteId) {
      const eventIndex = measure.events.findIndex((e) => idsMatch(e.id, this.selection.eventId));
      if (eventIndex === -1) return score;

      const event = { ...measure.events[eventIndex] };
      const noteIndex = event.notes.findIndex((n) => idsMatch(n.id, this.selection.noteId));

      if (noteIndex === -1) return score;

      const note = { ...event.notes[noteIndex] };
      if (note.pitch !== null) {
        note.pitch = this.transposePitch(note.pitch, keySig) ?? note.pitch;
      }

      const newNotes = [...event.notes];
      newNotes[noteIndex] = note;
      event.notes = newNotes;

      const newEvents = [...measure.events];
      newEvents[eventIndex] = event;
      measure.events = newEvents;
    }
    // Case 2: Transpose entire event (all notes)
    else if (this.selection.eventId) {
      const eventIndex = measure.events.findIndex((e) => idsMatch(e.id, this.selection.eventId));
      if (eventIndex === -1) return score;

      const event = { ...measure.events[eventIndex] };
      const newNotes = event.notes.map((n) => ({
        ...n,
        pitch: n.pitch !== null ? (this.transposePitch(n.pitch, keySig) ?? n.pitch) : null,
      }));

      event.notes = newNotes;

      const newEvents = [...measure.events];
      newEvents[eventIndex] = event;
      measure.events = newEvents;
    }

    newMeasures[this.selection.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    // Lossless undo: restore the captured pre-images verbatim (exact state
    // restoration of pitch spelling AND all other note fields), NOT inverse
    // re-transposition — so a range-clamp no-op or enharmonic drift on
    // execute() can never corrupt the note on undo().
    return restoreNoteSnapshots(score, this.preImage);
  }
}
