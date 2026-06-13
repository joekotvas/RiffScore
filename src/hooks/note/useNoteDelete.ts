import { useCallback, RefObject } from 'react';
import { Score, Selection, getValidStaff } from '@/types';
import { Command } from '@/commands/types';
import { DeleteNoteCommand } from '@/commands/DeleteNoteCommand';
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';
import type { SelectionEngine } from '@/engines/SelectionEngine';

/**
 * Props for the useNoteDelete hook.
 */
export interface UseNoteDeleteProps {
  /** Current selection state */
  selection: Selection;
  /** Function to update selection */
  select: (
    measureIndex: number | null,
    eventId: string | null,
    noteId: string | null,
    staffIndex?: number
  ) => void;
  /** Command dispatcher */
  dispatch: (command: Command) => void;
  /** Live score ref — used to pick the post-delete re-anchor target (#242 Lane G) */
  scoreRef: RefObject<Score>;
  /** Selection engine — stashes the pre-delete coord when a delete empties the selection (#257) */
  selectionEngine: SelectionEngine;
}

/**
 * Return type for useNoteDelete hook.
 */
export interface UseNoteDeleteReturn {
  /** Delete currently selected notes/events */
  deleteSelected: () => void;
}

/**
 * Hook for handling note and event deletion.
 *
 * Handles:
 * - Multi-selection deletion (all selected notes)
 * - Single note deletion
 * - Event deletion (fallback when no noteId)
 *
 * @param props - Hook props
 * @returns Object with deleteSelected callback
 *
 * @example
 * ```typescript
 * const { deleteSelected } = useNoteDelete({
 *   selection,
 *   select,
 *   dispatch,
 * });
 *
 * // Delete on keypress
 * if (key === 'Delete') deleteSelected();
 * ```
 *
 * @tested src/__tests__/hooks/note/useNoteDelete.test.tsx
 */
export function useNoteDelete({
  selection,
  select,
  dispatch,
  scoreRef,
  selectionEngine,
}: UseNoteDeleteProps): UseNoteDeleteReturn {
  const deleteSelected = useCallback(() => {
    // Stash the pre-delete primary coord before clearing the selection to null (#257), so the next
    // undo that re-materializes that exact event/note (ids are stable across undo) re-selects it —
    // the Lane G repair effect only prunes, never re-anchors. EventIds are unique, so the stash can
    // only resolve by undoing this delete; it can't fire on an unrelated edit. Used by both the
    // multi-selection clear and the single no-neighbor clear below.
    const stashClearedSelection = () => {
      if (selection.measureIndex !== null && selection.eventId) {
        selectionEngine.stashPendingRestore({
          staffIndex: selection.staffIndex,
          measureIndex: selection.measureIndex,
          eventId: selection.eventId,
          noteId: selection.noteId,
        });
      }
    };

    // 1. Delete Multi-Selection
    if (selection.selectedNotes && selection.selectedNotes.length > 0) {
      const notesToDelete = [...selection.selectedNotes];
      notesToDelete.forEach((note) => {
        if (note.noteId) {
          dispatch(
            new DeleteNoteCommand(note.measureIndex, note.eventId, note.noteId, note.staffIndex)
          );
        } else {
          // Fallback: delete event if no noteId
          dispatch(new DeleteEventCommand(note.measureIndex, note.eventId, note.staffIndex));
        }
      });
      // Clear selection after delete. Only stash for a single-note selection (a click populates
      // selectedNotes with one entry == the primary): a true multi-note delete dispatches N separate
      // history entries, so one undo restores only the last and a primary-coord stash would re-select
      // partially or mis-fire on a later undo (#257 review). Re-anchoring a multi-delete undo is out
      // of #257 scope — leave it unstashed.
      if (notesToDelete.length === 1) stashClearedSelection();
      select(null, null, null, selection.staffIndex);
      return;
    }

    if (selection.measureIndex === null || !selection.eventId) return;

    // Re-anchor target, computed from the PRE-delete measure (ids are stable across the delete; the
    // selection-repair effect clears it if it didn't survive, e.g. a whole tuplet-group removal).
    const measure = getValidStaff(scoreRef.current, selection.staffIndex)?.measures[
      selection.measureIndex
    ];
    const idx = measure?.events.findIndex((e) => e.id === selection.eventId) ?? -1;
    const event = idx >= 0 ? measure!.events[idx] : undefined;

    let reanchorEventId: string | null = null;
    let reanchorNoteId: string | null = null;
    if (event && selection.noteId && event.notes.length > 1) {
      // Chord-note delete: the event survives — keep it selected on a remaining note.
      reanchorEventId = event.id;
      reanchorNoteId = event.notes.find((n) => n.id !== selection.noteId)?.id ?? null;
    } else if (measure && idx >= 0) {
      // Whole-event delete shifts the measure left: select the note that takes its place — the next
      // selectable (non-reserved) event, else the previous one, else nothing (empty measure).
      const neighbor =
        measure.events.slice(idx + 1).find((e) => !e.reserved) ??
        [...measure.events.slice(0, idx)].reverse().find((e) => !e.reserved);
      if (neighbor) {
        reanchorEventId = neighbor.id;
        reanchorNoteId = neighbor.notes[0]?.id ?? null;
      }
    }

    // 2. Delete Single Selection
    if (selection.noteId) {
      dispatch(
        new DeleteNoteCommand(
          selection.measureIndex,
          selection.eventId,
          selection.noteId,
          selection.staffIndex
        )
      );
    } else {
      // Fallback for event without specific note
      dispatch(
        new DeleteEventCommand(selection.measureIndex, selection.eventId, selection.staffIndex)
      );
    }

    if (reanchorEventId === null) {
      // No surviving neighbor — the selection clears to null. Stash so an undo re-selects it (#257).
      stashClearedSelection();
      select(null, null, null, selection.staffIndex);
    } else {
      select(selection.measureIndex, reanchorEventId, reanchorNoteId, selection.staffIndex);
    }
  }, [selection, dispatch, select, scoreRef, selectionEngine]);

  return { deleteSelected };
}
