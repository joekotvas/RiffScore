import { useCallback, RefObject } from 'react';
import { calculateNextSelection, calculateTranspositionWithPreview } from '../utils/interaction';
import { playNote } from '../engines/toneEngine';
import { Score, getActiveStaff, createDefaultSelection } from '../types';
import { Command } from '../commands/types';
import { AddMeasureCommand } from '../commands/MeasureCommands';
import { TransposeSelectionCommand } from '../commands/TransposeSelectionCommand';

interface UseNavigationProps {
  scoreRef: RefObject<Score>;
  selection: { staffIndex: number; measureIndex: number | null; eventId: string | number | null; noteId: string | number | null };
  setSelection: (selection: { staffIndex: number; measureIndex: number | null; eventId: string | number | null; noteId: string | number | null }) => void;
  previewNote: any;
  setPreviewNote: (note: any) => void;
  syncToolbarState: (measureIndex: number | null, eventId: string | number | null, noteId: string | number | null, staffIndex?: number) => void;
  activeDuration: string;
  isDotted: boolean;
  currentQuantsPerMeasure: number;
  dispatch: (command: Command) => void;
}

interface UseNavigationReturn {
  handleNoteSelection: (measureIndex: number, eventId: string | number, noteId: string | number | null, staffIndex?: number) => void;
  moveSelection: (direction: string) => void;
  transposeSelection: (direction: string, isShift: boolean) => void;
  switchStaff: (direction: 'up' | 'down') => void;
}

/**
 * Hook for navigation actions: selection, arrow key navigation, and transposition.
 */
export const useNavigation = ({
  scoreRef,
  selection,
  setSelection,
  previewNote,
  setPreviewNote,
  syncToolbarState,
  activeDuration,
  isDotted,
  currentQuantsPerMeasure,
  dispatch
}: UseNavigationProps): UseNavigationReturn => {

  const handleNoteSelection = useCallback((measureIndex: number, eventId: string | number, noteId: string | number | null, staffIndex: number = 0, isMulti: boolean = false) => {
    if (!eventId) { 
       setSelection(prev => ({ ...createDefaultSelection(), staffIndex: prev.staffIndex }));
       syncToolbarState(null, null, null, staffIndex);
       return; 
    }

    setSelection(prev => {
        let newSelectedNotes = isMulti ? (prev.selectedNotes ? [...prev.selectedNotes] : []) : [];
        
        // If starting multi-select and we have a single selection not yet in array, add it
        if (isMulti && prev.noteId && prev.eventId && prev.measureIndex !== null) {
            const alreadyInList = newSelectedNotes.some(n => 
                String(n.noteId) === String(prev.noteId) && 
                String(n.eventId) === String(prev.eventId) &&
                n.measureIndex === prev.measureIndex
            );
            if (!alreadyInList) {
                newSelectedNotes.push({
                    staffIndex: prev.staffIndex,
                    measureIndex: prev.measureIndex,
                    eventId: prev.eventId,
                    noteId: prev.noteId
                });
            }
        }
        
        // Normalize ID types for comparison
        const currentIdStr = String(noteId);
        const currentEventIdStr = String(eventId);
        
        const existingIndex = newSelectedNotes.findIndex(n => 
            String(n.noteId) === currentIdStr && 
            String(n.eventId) === currentEventIdStr &&
            n.measureIndex === measureIndex
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
        } else {
            // Single select replacement
            if (noteId) {
                newSelectedNotes = [{ staffIndex, measureIndex, eventId, noteId }];
            }
        }
        
        // Update Primary Selection (Cursor)
        // If we just toggled off the primary cursor, we should move cursor to another selected note if possible,
        // or just keep the clicked one as "Last Focused" even if descaled? 
        // Standard behavior: Clicked item becomes primary focus.
        
        return {
            staffIndex, 
            measureIndex, 
            eventId, 
            noteId, // Set the clicked item as primary (cursor)
            selectedNotes: newSelectedNotes 
        };
    });

    syncToolbarState(measureIndex, eventId, noteId, staffIndex);

    // Play Selection
    // Only play if we are adding it (not toggling off, theoretically, but playing on click is good feedback regardless)
    const measure = getActiveStaff(scoreRef.current, staffIndex).measures[measureIndex];
    if (measure) {
        const event = measure.events.find((e: any) => e.id === eventId);
        if (event) {
            const keySignature = getActiveStaff(scoreRef.current, staffIndex).keySignature || 'C';
            if (noteId) {
                const note = event.notes.find((n: any) => n.id === noteId);
                if (note) playNote(note.pitch);
            } else {
                event.notes.forEach((n: any) => playNote(n.pitch));
            }
        }
    }
  }, [setSelection, syncToolbarState, scoreRef]);

  const moveSelection = useCallback((direction: string) => {
    const result = calculateNextSelection(
        getActiveStaff(scoreRef.current, selection.staffIndex || 0).measures,
        selection,
        direction,
        previewNote,
        activeDuration,
        isDotted,
        currentQuantsPerMeasure,
        getActiveStaff(scoreRef.current, selection.staffIndex || 0).clef,
        selection.staffIndex || 0
    );

    if (result) {
        if (result.selection) {
            setSelection(result.selection);
            syncToolbarState(result.selection.measureIndex, result.selection.eventId, result.selection.noteId, result.selection.staffIndex || 0);
        }
        
        if (result.previewNote !== undefined) {
            setPreviewNote(result.previewNote);
        }

        if (result.shouldCreateMeasure) {
             dispatch(new AddMeasureCommand());
        }

        const audio = result.audio;
        if (audio) {
            const keySignature = getActiveStaff(scoreRef.current, selection.staffIndex || 0).keySignature || 'C';
            audio.notes.forEach((n: any) => playNote(n.pitch));
        }
    }
  }, [selection, previewNote, activeDuration, isDotted, currentQuantsPerMeasure, scoreRef, dispatch, setSelection, setPreviewNote, syncToolbarState]);

  const transposeSelection = useCallback((direction: string, isShift: boolean) => {
    // Calculate semitones based on direction and shift
    // Up = 1, Down = -1. Shift = Octave (12)
    let semitones = 0;
    if (direction === 'up') semitones = isShift ? 12 : 1;
    if (direction === 'down') semitones = isShift ? -12 : -1;

    if (semitones === 0) return;

    // Handle Preview Note Transposition (Ghost Note)
    // If no selection exists but a preview note does, we adjust the preview note pitch directly
    if (selection.eventId === null && previewNote) {
        const activeStaff = getActiveStaff(scoreRef.current, selection.staffIndex || 0);
        const result = calculateTranspositionWithPreview(
            activeStaff.measures,
            selection,
            previewNote,
            direction,
            isShift,
            activeStaff.clef
        );
        
        if (result && result.previewNote) {
            setPreviewNote(result.previewNote);
            
            if (result.audio) {
                const keySig = activeStaff.keySignature || 'C';
                result.audio.notes.forEach((n: any) => playNote(n.pitch));
            }
        }
        return;
    }

    // Dispatch command
    const keySignature = getActiveStaff(scoreRef.current).keySignature || 'C';
    dispatch(new TransposeSelectionCommand(selection, semitones, keySignature));

    // Preview audio for selection change
    const activeStaff = getActiveStaff(scoreRef.current, selection.staffIndex || 0);
    if (selection.measureIndex !== null && selection.eventId) {
         // Use the utility just for audio preview
         const result = calculateTranspositionWithPreview(
            activeStaff.measures,
            selection,
            previewNote,
            direction,
            isShift,
            activeStaff.clef
        );
        
        if (result && result.audio) {
            const audio = result.audio;
            const keySig = activeStaff.keySignature || 'C';
            audio.notes.forEach((n: any) => playNote(n.pitch));
        }
    }
  }, [selection, previewNote, scoreRef, dispatch, setPreviewNote]);

  const switchStaff = useCallback((direction: 'up' | 'down') => {
    const numStaves = scoreRef.current.staves?.length || 1;
    if (numStaves <= 1) return; // Can't switch if only one staff
    
    const currentStaffIndex = selection.staffIndex || 0;
    let newStaffIndex = currentStaffIndex;
    
    if (direction === 'up' && currentStaffIndex > 0) {
      newStaffIndex = currentStaffIndex - 1;
    } else if (direction === 'down' && currentStaffIndex < numStaves - 1) {
      newStaffIndex = currentStaffIndex + 1;
    }
    
    if (newStaffIndex !== currentStaffIndex) {
      // Clear specific selection when switching staff, keep measure context
      setSelection({
        staffIndex: newStaffIndex,
        measureIndex: selection.measureIndex,
        eventId: null,
        noteId: null
      });
      syncToolbarState(null, null, null, newStaffIndex);
    }
  }, [selection, scoreRef, setSelection, syncToolbarState]);

  return {
    handleNoteSelection,
    moveSelection,
    transposeSelection,
    switchStaff,
  };
};
