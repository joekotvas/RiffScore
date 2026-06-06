/**
 * Selection resolution + repair (#242 Lane G).
 *
 * `resolveTarget` is the ONE place that turns a selection coordinate (staff/measure/event/note)
 * into the live Score objects (or an actionable failure reason) — previously every caller
 * re-implemented the staff→measure→event→note walk. `repairSelection` prunes a Selection against
 * a new Score after any structural edit (delete/reflow/tuplet-pack) so a stale coordinate can't
 * leave a phantom selection that later commands operate on. It only ever PRUNES (never invents a
 * selection) and returns the SAME reference when nothing is stale, so the effect that drives it
 * can write back without causing a render loop.
 */
import {
  Score,
  Staff,
  Measure,
  ScoreEvent,
  Note,
  Selection,
  SelectedNote,
  getValidStaff,
} from '@/types';

export interface TargetCoord {
  staffIndex: number;
  measureIndex: number;
  eventId: string;
  noteId: string | null;
}

export type ResolvedTarget =
  | {
      ok: true;
      staff: Staff;
      measure: Measure;
      event: ScoreEvent;
      note: Note | null;
      eventIndex: number;
      noteIndex: number;
    }
  | { ok: false; reason: 'staff' | 'measure' | 'event' | 'note' };

/** Resolve a selection coordinate to live Score objects, or report the first level that fails. */
export const resolveTarget = (score: Score, coord: TargetCoord): ResolvedTarget => {
  const staff = getValidStaff(score, coord.staffIndex);
  if (!staff) return { ok: false, reason: 'staff' };

  const measure = staff.measures[coord.measureIndex];
  if (!measure) return { ok: false, reason: 'measure' };

  const eventIndex = measure.events.findIndex((e) => e.id === coord.eventId);
  if (eventIndex < 0) return { ok: false, reason: 'event' };
  const event = measure.events[eventIndex];

  if (coord.noteId === null) {
    return { ok: true, staff, measure, event, note: null, eventIndex, noteIndex: -1 };
  }

  const noteIndex = event.notes.findIndex((n) => n.id === coord.noteId);
  if (noteIndex < 0) return { ok: false, reason: 'note' };
  return { ok: true, staff, measure, event, note: event.notes[noteIndex], eventIndex, noteIndex };
};

/** Whether a selection coordinate still points at a live node. */
const resolves = (score: Score, coord: TargetCoord): boolean => resolveTarget(score, coord).ok;

/**
 * Prune `selection` against `score`. Returns the same reference when nothing is stale (so callers
 * can skip a no-op write); otherwise returns a new Selection with stale parts cleared:
 *  - primary (measureIndex/eventId/noteId) → cleared if it no longer resolves
 *  - selectedNotes[] → filtered to entries that still resolve
 *  - anchor → cleared if stale
 *  - verticalAnchors.sliceAnchors → stale entries dropped (null when none remain)
 *  - chordId → cleared if no chord with that id remains
 */
export const repairSelection = (selection: Selection, score: Score): Selection => {
  const { staffIndex } = selection;

  const primaryStale =
    selection.measureIndex !== null &&
    selection.eventId !== null &&
    !resolves(score, {
      staffIndex,
      measureIndex: selection.measureIndex,
      eventId: selection.eventId,
      noteId: selection.noteId,
    });

  const prunedNotes = selection.selectedNotes.filter((n: SelectedNote) => resolves(score, n));
  const notesChanged = prunedNotes.length !== selection.selectedNotes.length;

  const anchorStale = !!selection.anchor && !resolves(score, selection.anchor);

  let prunedVertical = selection.verticalAnchors;
  let verticalChanged = false;
  if (selection.verticalAnchors) {
    const kept = Object.entries(selection.verticalAnchors.sliceAnchors).filter(([, v]) =>
      resolves(score, v)
    );
    if (kept.length !== Object.keys(selection.verticalAnchors.sliceAnchors).length) {
      verticalChanged = true;
      prunedVertical =
        kept.length > 0
          ? {
              ...selection.verticalAnchors,
              sliceAnchors: Object.fromEntries(kept.map(([k, v]) => [Number(k), v])),
            }
          : null;
    }
  }

  const chordStale =
    !!selection.chordId && !(score.chordTrack ?? []).some((c) => c.id === selection.chordId);

  if (!primaryStale && !notesChanged && !anchorStale && !verticalChanged && !chordStale) {
    return selection;
  }

  return {
    ...selection,
    measureIndex: primaryStale ? null : selection.measureIndex,
    eventId: primaryStale ? null : selection.eventId,
    noteId: primaryStale ? null : selection.noteId,
    selectedNotes: notesChanged ? prunedNotes : selection.selectedNotes,
    anchor: anchorStale ? null : selection.anchor,
    verticalAnchors: verticalChanged ? prunedVertical : selection.verticalAnchors,
    chordId: chordStale ? null : selection.chordId,
  };
};
