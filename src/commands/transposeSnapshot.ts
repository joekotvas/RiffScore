/**
 * transposeSnapshot
 *
 * Shared pre-image snapshot helpers for the transpose commands' lossless undo
 * (contract C3). A snapshot captures the FULL state of a note (a deep clone)
 * keyed by its stable coordinate identity (staff / measure / event / note id).
 *
 * undo() restores these clones verbatim, replacing the matching note in a new
 * immutable score. This is exact state restoration — never inverse
 * transformation through a lossy spelling function — so enharmonic spelling and
 * all other note fields return exactly, and a no-op clamp at the piano-range
 * boundary on execute() cannot corrupt the note on undo().
 */

import { Score, Note } from '@/types';

/** A coordinate that uniquely locates a note within a score. */
export interface NoteCoordinate {
  staffIndex: number;
  measureIndex: number;
  eventId: string;
  noteId: string;
}

/** A captured pre-image: a note's coordinate plus a deep clone of the note. */
export interface NoteSnapshot extends NoteCoordinate {
  /** Deep clone of the note as it was BEFORE the command mutated it. */
  note: Note;
}

const idsMatch = (a: string | null, b: string | null): boolean => String(a) === String(b);

/**
 * Deep-clone a single note so later mutations cannot alias the snapshot.
 * Prefer structuredClone (Node 17+), with a JSON fallback for runtimes that do
 * not expose it (e.g. the jsdom test environment). A Note is fully serializable
 * (only primitive fields), so the JSON fallback is exact.
 */
const cloneNote = (note: Note): Note =>
  typeof globalThis.structuredClone === 'function'
    ? (globalThis.structuredClone(note) as Note)
    : (JSON.parse(JSON.stringify(note)) as Note);

/**
 * Capture a deep-clone pre-image of every note at the given coordinates, read
 * from `score` (the pre-mutation state). Coordinates that do not resolve to an
 * existing note are skipped (they were never mutated, so nothing to restore).
 */
export function snapshotNotes(score: Score, targets: NoteCoordinate[]): NoteSnapshot[] {
  const snapshots: NoteSnapshot[] = [];

  for (const t of targets) {
    const staff = score.staves[t.staffIndex];
    if (!staff) continue;
    const measure = staff.measures[t.measureIndex];
    if (!measure) continue;
    const event = measure.events.find((e) => idsMatch(e.id, t.eventId));
    if (!event) continue;
    const note = event.notes.find((n) => idsMatch(n.id, t.noteId));
    if (!note) continue;

    snapshots.push({
      staffIndex: t.staffIndex,
      measureIndex: t.measureIndex,
      eventId: t.eventId,
      noteId: t.noteId,
      note: cloneNote(note),
    });
  }

  return snapshots;
}

/**
 * Return a NEW immutable score with each snapshotted note replaced by its
 * pre-image clone. Only the staves / measures / events / notes that actually
 * contain a restored note are copied; everything else is shared structurally.
 */
export function restoreNoteSnapshots(score: Score, snapshots: NoteSnapshot[]): Score {
  if (snapshots.length === 0) return score;

  // Group snapshots by staff -> measure -> event so each container is cloned
  // at most once, regardless of how many notes within it are restored.
  const byStaff = new Map<number, NoteSnapshot[]>();
  for (const s of snapshots) {
    const list = byStaff.get(s.staffIndex);
    if (list) list.push(s);
    else byStaff.set(s.staffIndex, [s]);
  }

  const newStaves = [...score.staves];

  byStaff.forEach((staffSnapshots, staffIndex) => {
    const originalStaff = newStaves[staffIndex];
    if (!originalStaff) return;

    const newMeasures = [...originalStaff.measures];

    const byMeasure = new Map<number, NoteSnapshot[]>();
    for (const s of staffSnapshots) {
      const list = byMeasure.get(s.measureIndex);
      if (list) list.push(s);
      else byMeasure.set(s.measureIndex, [s]);
    }

    byMeasure.forEach((measureSnapshots, measureIndex) => {
      const originalMeasure = newMeasures[measureIndex];
      if (!originalMeasure) return;

      const newEvents = [...originalMeasure.events];

      const byEvent = new Map<string, NoteSnapshot[]>();
      for (const s of measureSnapshots) {
        const key = String(s.eventId);
        const list = byEvent.get(key);
        if (list) list.push(s);
        else byEvent.set(key, [s]);
      }

      byEvent.forEach((eventSnapshots, eventId) => {
        const eventIndex = newEvents.findIndex((e) => idsMatch(e.id, eventId));
        if (eventIndex === -1) return;

        const originalEvent = newEvents[eventIndex];
        const newNotes = [...originalEvent.notes];

        for (const s of eventSnapshots) {
          const noteIndex = newNotes.findIndex((n) => idsMatch(n.id, s.noteId));
          if (noteIndex === -1) continue;
          // Restore a fresh clone so the snapshot stays immune to later edits.
          newNotes[noteIndex] = cloneNote(s.note);
        }

        newEvents[eventIndex] = { ...originalEvent, notes: newNotes };
      });

      newMeasures[measureIndex] = { ...originalMeasure, events: newEvents };
    });

    newStaves[staffIndex] = { ...originalStaff, measures: newMeasures };
  });

  return { ...score, staves: newStaves };
}
