
import { Selection, createDefaultSelection } from '../types';

/**
 * Robustly compares two IDs (string or number)
 */
export const compareIds = (id1: string | number | null | undefined, id2: string | number | null | undefined): boolean => {
    if (id1 == null && id2 == null) return true; // Both null or undefined
    if (id1 == null || id2 == null) return false; // One is nullish
    return String(id1) === String(id2);
};

interface NoteContext {
    staffIndex: number;
    measureIndex: number;
    eventId: string | number;
    noteId: string | number | null;
}

/**
 * Checks if a specific note is currently selected.
 * Handles both primary selection (cursor) and multi-selection list.
 */
export const isNoteSelected = (selection: Selection, context: NoteContext): boolean => {
    const { staffIndex, measureIndex, eventId, noteId } = context;

    // 1. Check Primary Selection (Cursor)
    // If entire event is selected (no noteId in selection) -> All notes selected
    // If specific note is selected -> Match noteId
    const isPrimaryEventMatch = 
        compareIds(selection.eventId, eventId) && 
        selection.measureIndex === measureIndex &&
        (selection.staffIndex === undefined || selection.staffIndex === staffIndex); // Optional staff check for legacy?

    if (isPrimaryEventMatch) {
        if (!selection.noteId) return true; // Whole event selected
        if (compareIds(selection.noteId, noteId)) return true; // Specific note match
    }

    // 2. Check Multi-Selection List
    if (selection.selectedNotes && selection.selectedNotes.length > 0) {
        return selection.selectedNotes.some(sn => 
            compareIds(sn.noteId, noteId) &&
            compareIds(sn.eventId, eventId) &&
            sn.measureIndex === measureIndex &&
            sn.staffIndex === staffIndex
        );
    }

    return false;
};

/**
 * Calculates the new selection state when toggling a note.
 * Handles single-select vs multi-select logic.
 */
export const toggleNoteInSelection = (
    prevSelection: Selection, 
    context: NoteContext, 
    isMulti: boolean
): Selection => {
    const { staffIndex, measureIndex, eventId, noteId } = context;

    if (!eventId) {
        return { ...createDefaultSelection(), staffIndex };
    }

    // Initialize list: preserve existing if multi, or reset if single
    let newSelectedNotes = isMulti ? (prevSelection.selectedNotes ? [...prevSelection.selectedNotes] : []) : [];

    // "Promote" existing primary selection to list if starting multi-select
    if (isMulti && prevSelection.noteId && prevSelection.eventId && prevSelection.measureIndex !== null) {
        const alreadyInList = newSelectedNotes.some(n => 
            compareIds(n.noteId, prevSelection.noteId) && 
            compareIds(n.eventId, prevSelection.eventId) &&
            n.measureIndex === prevSelection.measureIndex &&
            n.staffIndex === prevSelection.staffIndex
        );
        
        if (!alreadyInList) {
            newSelectedNotes.push({
                staffIndex: prevSelection.staffIndex,
                measureIndex: prevSelection.measureIndex,
                eventId: prevSelection.eventId,
                noteId: prevSelection.noteId
            });
        }
    }

    // Determine if target is currently in the list
    const existingIndex = newSelectedNotes.findIndex(n => 
        compareIds(n.noteId, noteId) && 
        compareIds(n.eventId, eventId) &&
        n.measureIndex === measureIndex &&
        n.staffIndex === staffIndex
    );

    if (isMulti) {
        if (existingIndex >= 0) {
            // Toggle OFF
            newSelectedNotes.splice(existingIndex, 1);
        } else {
            // Toggle ON
            if (noteId) {
                newSelectedNotes.push({ staffIndex, measureIndex, eventId, noteId });
            }
        }
        
        // When toggling, we usually update the "primary" cursor to the clicked note
        // even if we just untoggled it from the list? 
        // Or should we leave the primary cursor alone if we untoggled?
        // Standard convention: Clicked item gets focus.
        
        return {
            staffIndex,
            measureIndex,
            eventId,
            noteId, // Set as primary cursor
            selectedNotes: newSelectedNotes
        };

    } else {
        // Single Selection Mode
        // Clear list, set this as the only selected item
        if (noteId) {
            newSelectedNotes = [{ staffIndex, measureIndex, eventId, noteId }];
        }
        
        return {
            staffIndex,
            measureIndex,
            eventId,
            noteId,
            selectedNotes: newSelectedNotes
        };
    }
};
