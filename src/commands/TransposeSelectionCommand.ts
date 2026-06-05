import { Command } from './types';
import { Score, getActiveStaff, Selection, Staff, ScoreEvent, Note } from '@/types';
import { movePitchVisual } from '@/services/MusicService';
import { PIANO_RANGE } from '@/constants';
import { NoteSnapshot, snapshotNotes, restoreNoteSnapshots } from './transposeSnapshot';

export class TransposeSelectionCommand implements Command {
  public readonly type = 'TRANSPOSE_SELECTION';

  /**
   * Pre-image of every note this command is about to mutate, captured on the
   * MOST RECENT execute(). undo() restores these verbatim, so spelling and all
   * other note fields return exactly — and a no-op clamp at the piano-range
   * boundary cannot corrupt the note (the old inverse-re-transpose undo did).
   */
  private preImage: NoteSnapshot[] = [];

  constructor(
    private selection: Selection,
    // DIATONIC STEPS (not semitones): movePitchVisual walks the staff letters by
    // this count and snaps to the key. An octave is 7 steps. The misnomer this
    // field used to carry ('semitones') is gone (#239).
    private steps: number,
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

    const pushEventNotes = (
      staffIndex: number,
      measureIndex: number,
      event: ScoreEvent
    ) => {
      event.notes.forEach((n) => {
        if (n.pitch !== null) {
          targets.push({ staffIndex, measureIndex, eventId: event.id, noteId: n.id });
        }
      });
    };

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
    // execute() reads measures from getActiveStaff() but writes them back to
    // newStaves[staffIndex]; mirror that write target so undo restores exactly
    // the notes execute() changed.
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
        pushEventNotes(staffIndex, this.selection.measureIndex, event);
      }
    }
    // Case 3: entire measure
    else {
      measure.events.forEach((event) => {
        pushEventNotes(staffIndex, this.selection.measureIndex!, event);
      });
    }

    return targets;
  }

  execute(score: Score): Score {
    // Capture the pre-image of every note we are about to mutate BEFORE we
    // mutate anything. Refreshed on every execute() so redo (execute again
    // after undo) snapshots the post-undo state and stays lossless.
    this.preImage = snapshotNotes(score, this.collectTargets(score));

    if (this.selection.measureIndex === null) return score;

    const staffIndex = this.selection.staffIndex ?? 0;
    const activeStaff = getActiveStaff(score, staffIndex);
    // Key-aware transposition uses the key signature, not clef
    const keySig = activeStaff.keySignature || this.keySignature || 'C';

    const newMeasures = [...activeStaff.measures];

    if (!newMeasures[this.selection.measureIndex]) return score;

    const measure = { ...newMeasures[this.selection.measureIndex] };

    // Move by literal diatonic steps. Callers pass step counts directly (an
    // octave is 7 steps; the keyboard sends ±7 for Shift+Arrow). There is no
    // |steps|==12 → 7 coercion: it silently corrupted api.transposeDiatonic(12)
    // into an octave and existed only to paper over a caller that mislabeled the
    // octave jump as 12 (#239).
    const steps = this.steps;

    // Helper for robust ID comparison
    const idsMatch = (a: string | null, b: string | null) => String(a) === String(b);

    const transposeFn = (pitch: string) => movePitchVisual(pitch, steps, keySig, PIANO_RANGE);

    // CASE 0: Multi-Note Selection (using selection.selectedNotes)
    if (this.selection.selectedNotes && this.selection.selectedNotes.length > 0) {
      // We need to apply changes to potentially multiple measures/events/notes
      // We'll iterate through all selected notes and build a map of changes

      // Group by staff -> measure -> event
      // But since we return a new score, we have to copy structures.
      // Easiest way in this immutable pattern:
      // Deep copy the staves we need? Or just iterate and update?
      // Since performance matters less than correctness here (few selected notes usually):

      const newStaves = [...score.staves];
      const staffMap = new Map<number, Staff>(); // Cache modified staves

      this.selection.selectedNotes.forEach((sn) => {
        const sIndex = sn.staffIndex;
        let currentStaff = staffMap.get(sIndex);
        if (!currentStaff) {
          // First time touching this staff, copy it from newStaves (which starts as shallow copy of score.staves)
          currentStaff = { ...newStaves[sIndex], measures: [...newStaves[sIndex].measures] };
          staffMap.set(sIndex, currentStaff);
          newStaves[sIndex] = currentStaff; // Update result array reference
        }

        // Now find measure
        if (!currentStaff.measures[sn.measureIndex]) return;

        // We need to modify the measure. But we might have already modified it in this loop?
        // currentStaff.measures is a NEW array (copied above).
        // But the objects inside are shared until modified.

        // We need a way to ensure we edit the same object instance if we hit it twice.
        // Right now currentStaff.measures[i] might be original or already cloned.
        // We can clone it on demand.

        // BUT, if we clone it, we need to replace it in the array.
        // Since we are iterating effectively random access, we should probably check if we've cloned it?
        // A Set of cloned measure indices?

        // Actually, let's just do it directly on the structure we are building.
        // We need to be careful not to clone twice (losing previous edits) or edit original.

        // Let's assume we clone the measure object the first time we touch it?
        // Hard to track "dirty" state without a map.

        // SIMPLIFICATION:
        // Since `selectedNotes` is usually small, we can just process them.
        // But to avoid overwriting edits to the same measure:
        // We need a `measuresToUpdate` map per staff?
        // Map<measureIndex, Measure>
      });

      // Let's restart the approach:
      // 1. Identify all unique (staffIndex, measureIndex) pairs that need updates.
      // 2. For each such measure, find all selected notes within it.
      // 3. Apply changes.
      // 4. Update the score staves.

      // Step 1: Group notes by staff -> measure
      const notesByMeasure = new Map<string, typeof this.selection.selectedNotes>();

      this.selection.selectedNotes.forEach((sn) => {
        const key = `${sn.staffIndex}-${sn.measureIndex}`;
        if (!notesByMeasure.has(key)) notesByMeasure.set(key, []);
        notesByMeasure.get(key)!.push(sn);
      });

      // Step 2 & 3: Apply updates
      notesByMeasure.forEach((notesInMeasure, key) => {
        const [sIdxStr, mIdxStr] = key.split('-');
        const sIdx = parseInt(sIdxStr, 10);
        const mIdx = parseInt(mIdxStr, 10);

        // Ensure we have a working copy of the staff
        if (!staffMap.has(sIdx)) {
          staffMap.set(sIdx, {
            ...newStaves[sIdx],
            measures: [...newStaves[sIdx].measures],
          });
          newStaves[sIdx] = staffMap.get(sIdx)!;
        }
        const workingStaff = staffMap.get(sIdx)!;

        // Ensure working copy of measure
        const originalMeasure = workingStaff.measures[mIdx];
        if (!originalMeasure) return;

        const newMeasure = { ...originalMeasure, events: [...originalMeasure.events] };
        workingStaff.measures[mIdx] = newMeasure;

        // Process events in this measure
        // Group notes by event to avoid cloning event multiple times
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
            const noteIndex = newEvent.notes.findIndex((note: Note) =>
              idsMatch(note.id, nTarget.noteId)
            );
            if (noteIndex !== -1) {
              const currentPitch = newEvent.notes[noteIndex].pitch;
              // Skip rest notes (null pitch)
              if (currentPitch !== null) {
                newEvent.notes[noteIndex] = {
                  ...newEvent.notes[noteIndex],
                  pitch: transposeFn(currentPitch),
                };
              }
            }
          });
        });
      });

      return { ...score, staves: newStaves };
    }

    // Case 1: Transpose specific note (Fallback for single selection or if selectedNotes is empty but noteId is set)
    if (this.selection.eventId && this.selection.noteId) {
      const eventIndex = measure.events.findIndex((e) => idsMatch(e.id, this.selection.eventId));
      if (eventIndex === -1) return score;

      const event = { ...measure.events[eventIndex] };
      const noteIndex = event.notes.findIndex((n) => idsMatch(n.id, this.selection.noteId));

      if (noteIndex === -1) return score;

      const note = { ...event.notes[noteIndex] };
      // Skip rest notes (null pitch)
      if (note.pitch !== null) {
        note.pitch = transposeFn(note.pitch);
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
        // Skip rest notes (null pitch)
        pitch: n.pitch !== null ? transposeFn(n.pitch) : null,
      }));

      event.notes = newNotes;

      const newEvents = [...measure.events];
      newEvents[eventIndex] = event;
      measure.events = newEvents;
    }
    // Case 3: Transpose entire measure
    else {
      const newEvents = measure.events.map((e) => ({
        ...e,
        notes: e.notes.map((n) => ({
          ...n,
          // Skip rest notes (null pitch)
          pitch: n.pitch !== null ? transposeFn(n.pitch) : null,
        })),
      }));
      measure.events = newEvents;
    }

    newMeasures[this.selection.measureIndex] = measure;
    const newStaves = [...score.staves];
    newStaves[staffIndex] = { ...activeStaff, measures: newMeasures };

    return { ...score, staves: newStaves };
  }

  undo(score: Score): Score {
    // Lossless undo: restore the captured pre-images verbatim. This is exact
    // state restoration (pitch spelling AND all other note fields return
    // exactly), NOT inverse re-transposition — so a no-op clamp at the
    // piano-range boundary and enharmonic drift can never corrupt the note.
    return restoreNoteSnapshots(score, this.preImage);
  }
}
