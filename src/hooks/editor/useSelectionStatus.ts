import { useMemo } from 'react';
import type { Selection, PreviewNote, Score } from '@/types';

/**
 * Selection status types for the editor footer.
 */
export type SelectionStatusType =
  | 'inactive'
  | 'ready'
  | 'blocked'
  | 'note'
  | 'notes'
  | 'chord'
  | 'rest'
  | 'chord-symbol';

export interface SelectionStatus {
  /** The type of selection for styling purposes */
  type: SelectionStatusType;
  /** Human-readable status text */
  text: string;
  /** Number of items selected (for notes) */
  count?: number;
}

interface UseSelectionStatusProps {
  selection: Selection;
  previewNote: PreviewNote | null;
  score: Score;
}

/**
 * Derives the selection status text from the current selection state.
 * Used in the editor footer to show what's currently selected.
 *
 * @tested src/__tests__/hooks/useSelectionStatus.test.ts
 */
export const useSelectionStatus = ({
  selection,
  previewNote,
  score,
}: UseSelectionStatusProps): SelectionStatus => {
  return useMemo(() => {
    // Check if chord symbol is selected
    if (selection.chordId) {
      return {
        type: 'chord-symbol',
        text: 'Chord symbol selected',
      };
    }

    // Check if we're in ghost cursor mode (ready to insert)
    if (previewNote) {
      // A blocked position shows a status explaining why the note can't be placed (the ghost itself
      // renders greyed with an X as the primary signal).
      if (previewNote.blocked) {
        return {
          type: 'blocked',
          text: previewNote.blocked === 'tuplet-full' ? 'Tuplet is full' : 'Measure is full',
        };
      }
      return {
        type: 'ready',
        text: 'Ready to insert',
      };
    }

    // Check multi-selection
    const noteCount = selection.selectedNotes.length;

    if (noteCount === 0) {
      // No selection
      return {
        type: 'inactive',
        text: 'No selection',
      };
    }

    if (noteCount === 1) {
      // Single selection - determine type
      const selected = selection.selectedNotes[0];
      const staff = score.staves[selected.staffIndex];
      const measure = staff?.measures[selected.measureIndex];
      const event = measure?.events.find((e) => e.id === selected.eventId);

      if (event?.isRest) {
        return {
          type: 'rest',
          text: 'Rest selected',
        };
      }

      // Check if it's a chord (multiple notes in the event)
      if (event && event.notes.length > 1 && selected.noteId === null) {
        return {
          type: 'chord',
          text: 'Chord selected',
          count: event.notes.length,
        };
      }

      return {
        type: 'note',
        text: 'Note selected',
      };
    }

    // Multiple notes selected
    return {
      type: 'notes',
      text: `${noteCount} notes selected`,
      count: noteCount,
    };
  }, [selection, previewNote, score]);
};
