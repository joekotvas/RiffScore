import { useState, useCallback, useMemo } from 'react';
import { Selection, createDefaultSelection, Score, getActiveStaff } from '../types';
import { toggleNoteInSelection, calculateNoteRange, getLinearizedNotes } from '../utils/selection';
import { playNote } from '../engines/toneEngine';

interface UseSelectionProps {
  score: Score;
  dispatch?: any; 
}

export const useSelection = ({ score }: UseSelectionProps) => {
  const [selection, setSelection] = useState<Selection>(createDefaultSelection());

  // --- Helpers ---
  
  const playAudioFeedback = useCallback((notes: any[]) => {
      notes.forEach(n => playNote(n.pitch));
  }, []);

  // --- Actions ---

  const clearSelection = useCallback(() => {
    setSelection(prev => ({
       ...createDefaultSelection(),
       staffIndex: prev.staffIndex // Maintain current staff focus
    }));
  }, []);

  const select = useCallback((
    measureIndex: number | null, 
    eventId: string | number | null, 
    noteId: string | number | null, 
    staffIndex: number = 0, 
    options: { 
        isMulti?: boolean; 
        isShift?: boolean; 
        selectAllInEvent?: boolean; 
    } = {}
  ) => {
    const { isMulti = false, isShift = false, selectAllInEvent = false } = options;

    if (!eventId || measureIndex === null) {
        clearSelection();
        return;
    }

    const startStaffIndex = staffIndex !== undefined ? staffIndex : (selection.staffIndex || 0);

    // 1. Handle Shift+Click (Range Selection)
    if (isShift) {
        // ... (Logic from useNavigation)
        const anchor = selection.anchor || {
            staffIndex: selection.staffIndex || 0,
            measureIndex: selection.measureIndex!,
            eventId: selection.eventId!,
            noteId: selection.noteId
        };
        
        // If anchor is invalid (e.g. initial state), just select the target
        if (!anchor.eventId) {
             // Fallthrough to standard selection
        } else {
            const context = {
                staffIndex: startStaffIndex,
                measureIndex,
                eventId,
                noteId
            };
            
            // Note: We need linearization logic here. 
            // We can import calculateNoteRange from utils/selection
             const linearNotes = getLinearizedNotes(score);
             // We need to make sure 'noteId' is not null for calculation.
             // If noteId is null (event selection), pick first note of event.
             let targetNoteId = noteId;
             if (!targetNoteId) {
                  const measure = getActiveStaff(score, startStaffIndex).measures[measureIndex];
                  const event = measure?.events.find((e: any) => e.id === eventId);
                  if (event && event.notes.length > 0) targetNoteId = event.notes[0].id;
             }

             if (targetNoteId) {
                const focus = { ...context, noteId: targetNoteId };
                // Ensure anchor has noteId too
                // ... (Assumption: anchor always has noteId if set correctly)
                
                const selectedNotes = calculateNoteRange(anchor as any, focus, linearNotes);
                
                setSelection(prev => ({
                    ...prev,
                    staffIndex: startStaffIndex,
                    measureIndex,
                    eventId,
                    noteId: targetNoteId, // Update cursor
                    selectedNotes,
                    anchor // Keep anchor
                }));
                return;
             }
        }
    }

    // 2. Resolve Event Selection (Select All Notes in Event)
    // If selectAllInEvent is TRUE, OR if noteId is NULL (clicking stem/body), we select all notes.
    // "Events cannot be independently selected."
    let targetNoteId = noteId;
    let notesToSelect: any[] = [];
    
    const measure = getActiveStaff(score, startStaffIndex).measures[measureIndex];
    const event = measure?.events.find((e: any) => e.id === eventId);

    if (selectAllInEvent || !noteId) {
        if (event && event.notes.length > 0) {
            notesToSelect = event.notes.map((n: any) => ({
                staffIndex: startStaffIndex,
                measureIndex,
                eventId,
                noteId: n.id
            }));
            // Set cursor to first note if not specified
            if (!targetNoteId) targetNoteId = event.notes[0].id;
        }
    }

    // 3. Update State
    if (notesToSelect.length > 0) {
        // Case: Selecting whole event (or adding whole event to multi-select?)
        // Implicit behavior: If I Cmd+Click a stem, I want to add that whole chord to selection.
        
        if (isMulti) {
             setSelection(prev => {
                const newSelectedNotes = prev.selectedNotes ? [...prev.selectedNotes] : [];
                // naive merge for now: add all notesToSelect that aren't already there
                // remove if they are ALL already there? (Toggle behavior for groups is complex)
                // Let's just ADD for now.
                notesToSelect.forEach(n => {
                    if (!newSelectedNotes.some(ex => ex.noteId === n.noteId)) {
                        newSelectedNotes.push(n);
                    }
                });
                return {
                    ...prev,
                    staffIndex: startStaffIndex,
                    measureIndex,
                    eventId,
                    noteId: targetNoteId,
                    selectedNotes: newSelectedNotes,
                    anchor: prev.anchor // Maintain anchor? Or reset?
                };
             });
        } else {
             // Single Select of Event -> Replace selection
             setSelection({
                 staffIndex: startStaffIndex,
                 measureIndex,
                 eventId,
                 noteId: targetNoteId,
                 selectedNotes: notesToSelect,
                 anchor: { staffIndex: startStaffIndex, measureIndex, eventId, noteId: targetNoteId } // New Anchor
             });
        }
        playAudioFeedback(event?.notes || []);
        return;
    }

    // 4. Standard Note Toggle (Single Note)
    // Delegate to existing utility, but ensure we don't end up with noteId: null
    setSelection(prev => {
         const emptySelection = { ...createDefaultSelection(), staffIndex: startStaffIndex };
         // If prev was undefined/null, use valid default
         const base = prev || emptySelection;
         
         const newSel = toggleNoteInSelection(base, { 
             staffIndex: startStaffIndex, 
             measureIndex, 
             eventId, 
             noteId: targetNoteId 
         }, isMulti);
         
         return newSel;
    });

    // Audio
    if (targetNoteId) {
         const note = event?.notes.find((n: any) => n.id === targetNoteId);
         if (note) playAudioFeedback([note]);
    }

  }, [selection, score, playAudioFeedback, clearSelection]);

  const updateSelection = useCallback((partial: Partial<Selection>) => {
      setSelection(prev => ({ ...prev, ...partial }));
  }, []);

  const selectAllInMeasure = useCallback((measureIndex: number, staffIndex: number = 0) => {
      const measure = getActiveStaff(score, staffIndex).measures[measureIndex];
      if (!measure) return;

      const allNotes: any[] = [];
      measure.events.forEach((event: any) => {
          if (event.notes) {
              event.notes.forEach((note: any) => {
                  allNotes.push({
                      staffIndex,
                      measureIndex,
                      eventId: event.id,
                      noteId: note.id
                  });
              });
          }
      });

      if (allNotes.length > 0) {
          const first = allNotes[0];
          setSelection({
              staffIndex,
              measureIndex,
              eventId: first.eventId,
              noteId: first.noteId,
              selectedNotes: allNotes,
              anchor: { ...first }
          });
      }
  }, [score]);

  return {
    selection,
    setSelection, // Exposed for low-level overrides if absolutely needed
    select,
    clearSelection,
    updateSelection,
    selectAllInMeasure
  };
};
