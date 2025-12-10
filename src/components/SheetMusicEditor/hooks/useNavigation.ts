import React, { useCallback, RefObject } from 'react';
import { Selection, Score, getActiveStaff, createDefaultSelection } from '../types';
import { calculateNextSelection, calculateTranspositionWithPreview, calculateCrossStaffSelection } from '../utils/interaction';
import { toggleNoteInSelection, getLinearizedNotes, calculateNoteRange } from '../utils/selection';
import { playNote } from '../engines/toneEngine';
import { Command } from '../commands/types';
import { AddMeasureCommand } from '../commands/MeasureCommands';
import { TransposeSelectionCommand } from '../commands/TransposeSelectionCommand';

interface UseNavigationProps {
  scoreRef: RefObject<Score>;
  selection: Selection;
  setSelection: React.Dispatch<React.SetStateAction<Selection>>;
  previewNote: any;
  setPreviewNote: (note: any) => void;
  syncToolbarState: (measureIndex: number | null, eventId: string | number | null, noteId: string | number | null, staffIndex?: number) => void;
  activeDuration: string;
  isDotted: boolean;
  currentQuantsPerMeasure: number;
  dispatch: (command: Command) => void;
}

interface UseNavigationReturn {
  handleNoteSelection: (measureIndex: number, eventId: string | number, noteId: string | number | null, staffIndex?: number, isMulti?: boolean, selectAllInEvent?: boolean, isShift?: boolean) => void;
  moveSelection: (direction: string, isShift: boolean) => void;
  transposeSelection: (direction: string, isShift: boolean) => void;
  switchStaff: (direction: 'up' | 'down') => void;
}

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

  // --- Internal Helpers ---

  /** Plays all notes in a given list or event for auditory feedback. */
  const playAudioFeedback = useCallback((notes: any[]) => {
      notes.forEach(n => playNote(n.pitch));
  }, []);

  /** Handles the logic for Shift+Arrow selection (Range Extension). */
  const getRangeSelection = (newFocus: Selection, currentSelection: Selection, score: Score): Selection => {
      // 1. Establish Anchor (default to current selection if none exists)
      const anchor = currentSelection.anchor || {
          staffIndex: currentSelection.staffIndex || 0,
          measureIndex: currentSelection.measureIndex!,
          eventId: currentSelection.eventId!,
          noteId: currentSelection.noteId
      };

      // 2. Define Focus (where the cursor moved to)
      const focus = {
          staffIndex: newFocus.staffIndex || 0,
          measureIndex: newFocus.measureIndex!,
          eventId: newFocus.eventId!,
          noteId: newFocus.noteId
      };

      // 3. Calculate Range (Linearize score to find notes between anchor and focus)
      const linearNotes = getLinearizedNotes(score);
      const selectedNotes = calculateNoteRange(anchor, focus, linearNotes);

      return {
          ...newFocus,
          anchor, // Anchor persists during shift-selection
          selectedNotes
      };
  };

  /** Handles the logic for Standard Arrow selection (Moving Cursor). */
  const getStandardSelection = (newFocus: Selection, currentSelection: Selection, score: Score): Selection => {
      const isSameEvent = newFocus.eventId === currentSelection.eventId &&
                          newFocus.measureIndex === currentSelection.measureIndex &&
                          newFocus.staffIndex === currentSelection.staffIndex;

      // Case A: Drill Down (Moving within the same chord) -> Select single note
      if (isSameEvent && newFocus.noteId) {
          return {
              ...newFocus,
              anchor: null,
              selectedNotes: [{
                  staffIndex: newFocus.staffIndex || 0,
                  measureIndex: newFocus.measureIndex!,
                  eventId: newFocus.eventId!,
                  noteId: newFocus.noteId
              }]
          };
      }

      // Case B: Traverse (Moving to new event) -> Select ALL notes in target event
      const targetStaff = score.staves[newFocus.staffIndex || 0];
      const targetEvent = targetStaff?.measures[newFocus.measureIndex!]?.events.find(e => e.id === newFocus.eventId);
      
      const targetNotes = targetEvent?.notes 
          ? targetEvent.notes.map(n => ({
              staffIndex: newFocus.staffIndex || 0,
              measureIndex: newFocus.measureIndex!,
              eventId: newFocus.eventId!,
              noteId: n.id
            }))
          : [];

      return {
          ...newFocus,
          anchor: null, // Clear anchor on standard move
          selectedNotes: targetNotes
      };
  };


  // --- Public Handlers ---

  const handleNoteSelection = useCallback((
    measureIndex: number, 
    eventId: string | number, 
    noteId: string | number | null, 
    staffIndex: number = 0, 
    isMulti: boolean = false, 
    selectAllInEvent: boolean = false,
    isShift: boolean = false
  ) => {
    // 1. Handle Empty Selection
    if (!eventId) { 
       setSelection(prev => ({ ...createDefaultSelection(), staffIndex: prev.staffIndex }));
       syncToolbarState(null, null, null, staffIndex);
       return; 
    }

    const measure = getActiveStaff(scoreRef.current, staffIndex).measures[measureIndex];
    const event = measure?.events.find((e: any) => e.id === eventId);
    if (!event) return;

    // 2. Handle Shift+Click (Range Selection)
    if (isShift) {
        const clickedFocus: Selection = {
            staffIndex,
            measureIndex,
            eventId,
            noteId: noteId || event.notes[0]?.id,
            selectedNotes: [],
            anchor: null
        };
        
        const rangeSelection = getRangeSelection(clickedFocus, selection, scoreRef.current);
        setSelection(rangeSelection);
        syncToolbarState(measureIndex, eventId, noteId || event.notes[0]?.id, staffIndex);
        return;
    }

    // 3. Handle "Select All" (e.g. clicking the event stem/body)
    if (selectAllInEvent && event.notes?.length > 0) {
        const allNotes = event.notes.map((n: any) => ({
            staffIndex, measureIndex, eventId, noteId: n.id
        }));

        setSelection({
            staffIndex,
            measureIndex,
            eventId,
            noteId: noteId || event.notes[0].id, // Focus defaults to clicked note or first
            selectedNotes: allNotes,
            anchor: null
        });
        
        syncToolbarState(measureIndex, eventId, noteId || event.notes[0].id, staffIndex);
        playAudioFeedback(event.notes);
        return;
    } 

    // 4. Handle Standard Toggle (Single or Multi-select)
    setSelection(prev => toggleNoteInSelection(prev, { staffIndex, measureIndex, eventId, noteId }, isMulti));
    syncToolbarState(measureIndex, eventId, noteId, staffIndex);

    // Audio Feedback
    if (noteId) {
        const note = event.notes.find((n: any) => n.id === noteId);
        if (note) playAudioFeedback([note]);
    } else {
        playAudioFeedback(event.notes);
    }
  }, [setSelection, syncToolbarState, scoreRef, playAudioFeedback]);


  const moveSelection = useCallback((direction: string, isShift: boolean = false) => {
    const activeStaff = getActiveStaff(scoreRef.current, selection.staffIndex || 0);

    // 1. Calculate the hypothetical next position
    const navResult = calculateNextSelection(
        activeStaff.measures,
        selection,
        direction,
        previewNote,
        activeDuration,
        isDotted,
        currentQuantsPerMeasure,
        activeStaff.clef,
        selection.staffIndex || 0
    );

    if (!navResult) return;

    // 2. Process Selection Update
    if (navResult.selection) {
        const nextSelection = isShift 
            ? getRangeSelection(navResult.selection, selection, scoreRef.current)
            : getStandardSelection(navResult.selection, selection, scoreRef.current);

        setSelection(nextSelection);
        syncToolbarState(
            nextSelection.measureIndex, 
            nextSelection.eventId, 
            nextSelection.noteId, 
            nextSelection.staffIndex || 0
        );
    }
    
    // 3. Process Side Effects (Preview, Measures, Audio)
    if (navResult.previewNote !== undefined) {
        setPreviewNote(navResult.previewNote);
    }

    if (navResult.shouldCreateMeasure) {
         dispatch(new AddMeasureCommand());
    }

    if (navResult.audio) {
        playAudioFeedback(navResult.audio.notes);
    }
  }, [selection, previewNote, activeDuration, isDotted, currentQuantsPerMeasure, scoreRef, dispatch, setSelection, setPreviewNote, syncToolbarState, playAudioFeedback]);


  const transposeSelection = useCallback((direction: string, isShift: boolean) => {
    // 1. Determine Semitone Shift (Up/Down = +/-1, Shift = +/- Octave)
    let semitones = 0;
    if (direction === 'up') semitones = isShift ? 12 : 1;
    if (direction === 'down') semitones = isShift ? -12 : -1;
    if (semitones === 0) return;

    const activeStaff = getActiveStaff(scoreRef.current, selection.staffIndex || 0);

    // 2. Scenario A: Transposing a "Ghost Note" (Preview Cursor)
    if (selection.eventId === null && previewNote) {
        const previewResult = calculateTranspositionWithPreview(
            activeStaff.measures,
            selection,
            previewNote,
            direction,
            isShift,
            activeStaff.clef
        );
        
        if (previewResult?.previewNote) {
            setPreviewNote(previewResult.previewNote);
            if (previewResult.audio) playAudioFeedback(previewResult.audio.notes);
        }
        return;
    }

    // 3. Scenario B: Transposing Real Selection
    // Dispatch Command
    const keySignature = activeStaff.keySignature || 'C';
    dispatch(new TransposeSelectionCommand(selection, semitones, keySignature));

    // Calculate Audio Preview
    if (selection.measureIndex !== null && selection.eventId) {
         const audioResult = calculateTranspositionWithPreview(
            activeStaff.measures,
            selection,
            previewNote,
            direction,
            isShift,
            activeStaff.clef
        );
        
        if (audioResult?.audio) playAudioFeedback(audioResult.audio.notes);
    }
  }, [selection, previewNote, scoreRef, dispatch, setPreviewNote, playAudioFeedback]);


  const switchStaff = useCallback((direction: 'up' | 'down') => {
    const numStaves = scoreRef.current.staves?.length || 1;
    if (numStaves <= 1) return;
    
    // 1. Attempt Smart Cross-Staff Selection (maintains rhythmic position)
    if (selection.eventId) {
        const crossResult = calculateCrossStaffSelection(scoreRef.current, selection, direction, activeDuration, isDotted);
        
        if (crossResult && crossResult.selection) {
            setSelection(crossResult.selection);
            syncToolbarState(
                crossResult.selection.measureIndex, 
                crossResult.selection.eventId, 
                crossResult.selection.noteId, 
                crossResult.selection.staffIndex
            );
            
            setPreviewNote(crossResult.previewNote || null);

            // Audio Feedback
            if (crossResult.selection.eventId && crossResult.selection.measureIndex !== null) {
                const staff = getActiveStaff(scoreRef.current, crossResult.selection.staffIndex);
                const event = staff.measures[crossResult.selection.measureIndex]?.events.find(e => e.id === crossResult.selection.eventId);
                if (event) playAudioFeedback(event.notes);
            }
            return;
        }
    }

    // 2. Fallback: Simple Staff Index Switch
    const currentIdx = selection.staffIndex || 0;
    let newIdx = currentIdx;
    
    if (direction === 'up' && currentIdx > 0) newIdx--;
    else if (direction === 'down' && currentIdx < numStaves - 1) newIdx++;
    
    if (newIdx !== currentIdx) {
      setSelection({
        ...createDefaultSelection(),
        staffIndex: newIdx,
        measureIndex: selection.measureIndex // Keep measure index if possible
      });
      syncToolbarState(null, null, null, newIdx);
    }
  }, [selection, scoreRef, setSelection, syncToolbarState, activeDuration, isDotted, playAudioFeedback, setPreviewNote]);

  return {
    handleNoteSelection,
    moveSelection,
    transposeSelection,
    switchStaff,
  };
};
