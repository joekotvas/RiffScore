import { useCallback, RefObject } from 'react';
import { canModifyEventDuration, canToggleEventDot } from '../utils/validation';
import { getNoteDuration } from '../utils/core';
import { playTone } from '../engines/audioEngine';
import { Score, getActiveStaff } from '../types';
import { Command } from '../commands/types';
import { UpdateEventCommand } from '../commands/UpdateEventCommand';
import { UpdateNoteCommand } from '../commands/UpdateNoteCommand';

interface UseModifiersProps {
  scoreRef: RefObject<Score>;
  selection: { measureIndex: number | null; eventId: string | number | null; noteId: string | number | null };
  currentQuantsPerMeasure: number;
  tools: {
    handleDurationChange: (duration: string) => void;
    handleDotToggle: () => boolean;
    handleAccidentalToggle: (type: 'flat' | 'natural' | 'sharp' | null) => string | null;
    handleTieToggle: () => boolean;
  };
  dispatch: (command: Command) => void;
}

interface UseModifiersReturn {
  handleDurationChange: (newDuration: string, applyToSelection?: boolean) => void;
  handleDotToggle: () => void;
  handleAccidentalToggle: (type: 'flat' | 'natural' | 'sharp' | null) => void;
  handleTieToggle: () => void;
  checkDurationValidity: (targetDuration: string) => boolean;
  checkDotValidity: () => boolean;
}

/**
 * Hook for modifier actions: duration, dot, accidental, and tie toggles.
 */
export const useModifiers = ({
  scoreRef,
  selection,
  currentQuantsPerMeasure,
  tools,
  dispatch
}: UseModifiersProps): UseModifiersReturn => {

  const handleDurationChange = useCallback((newDuration: string, applyToSelection = false) => {
    // Always update the active tool state
    tools.handleDurationChange(newDuration);

    // If requested, try to apply to selection
    if (applyToSelection && selection.measureIndex !== null && selection.eventId) {
        dispatch(new UpdateEventCommand(selection.measureIndex, selection.eventId, { duration: newDuration }));
    }
  }, [selection, tools, dispatch]);

  const handleDotToggle = useCallback(() => {
    const newDotted = tools.handleDotToggle();
    
    if (selection.measureIndex !== null && selection.eventId) {
        dispatch(new UpdateEventCommand(selection.measureIndex, selection.eventId, { dotted: newDotted }));
    }
  }, [selection, tools, dispatch]);

  const handleAccidentalToggle = useCallback((type: 'flat' | 'natural' | 'sharp' | null) => {
    const newAccidental = tools.handleAccidentalToggle(type);
    
    if (selection.measureIndex !== null && selection.eventId && selection.noteId) {
        // Note: UpdateNoteCommand expects accidental as string | null, but tools returns string | null.
        dispatch(new UpdateNoteCommand(selection.measureIndex, selection.eventId, selection.noteId, { accidental: newAccidental as any }));
        
        // Play tone to preview change
        const currentScore = scoreRef.current;
        const measure = getActiveStaff(currentScore).measures[selection.measureIndex];
        const event = measure.events.find((e: any) => e.id === selection.eventId);
        if (event) {
            const note = event.notes.find((n: any) => n.id === selection.noteId);
            if (note) {
                 playTone(note.pitch, event.duration, event.dotted, newAccidental as any, getActiveStaff(currentScore).keySignature || 'C');
            }
        }
    }
  }, [selection, tools, dispatch, scoreRef]);

  const handleTieToggle = useCallback(() => {
    const newTie = tools.handleTieToggle();
    
    if (selection.measureIndex !== null && selection.eventId && selection.noteId) {
        dispatch(new UpdateNoteCommand(selection.measureIndex, selection.eventId, selection.noteId, { tied: newTie }));
    }
  }, [selection, tools, dispatch]);

  const checkDurationValidity = useCallback((targetDuration: string) => {
    if (selection.measureIndex === null || !selection.eventId) return true;

    const measure = getActiveStaff(scoreRef.current).measures[selection.measureIndex];
    if (!measure) return true;

    return canModifyEventDuration(measure.events, selection.eventId, targetDuration, currentQuantsPerMeasure);
  }, [selection, currentQuantsPerMeasure, scoreRef]);

  const checkDotValidity = useCallback(() => {
    if (selection.measureIndex === null || !selection.eventId) return true;

    const measure = getActiveStaff(scoreRef.current).measures[selection.measureIndex];
    if (!measure) return true;

    return canToggleEventDot(measure.events, selection.eventId, currentQuantsPerMeasure);
  }, [selection, currentQuantsPerMeasure, scoreRef]);

  return {
    handleDurationChange,
    handleDotToggle,
    handleAccidentalToggle,
    handleTieToggle,
    checkDurationValidity,
    checkDotValidity,
  };
};
