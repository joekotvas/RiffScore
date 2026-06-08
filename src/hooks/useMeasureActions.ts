import { useCallback } from 'react';
import { Score } from '@/types';
import { tupletsFitTimeSignature } from '@/utils/core';
import { Command } from '@/commands/types';
import { AddMeasureCommand, DeleteMeasureCommand } from '@/commands/MeasureCommands';
import { TogglePickupCommand } from '@/commands/TogglePickupCommand';
import { SetGrandStaffCommand } from '@/commands/SetGrandStaffCommand';
import { SetTimeSignatureCommand } from '@/commands/SetTimeSignatureCommand';
import { SetKeySignatureCommand } from '@/commands/SetKeySignatureCommand';

interface UseMeasureActionsProps {
  score: Score;
  clearSelection: () => void;
  setPreviewNote: (note: null) => void;
  dispatch: (command: Command) => void;
  /** Surface a non-blocking message (e.g. refusing a time-signature change a tuplet can't fit). */
  setFeedback?: (message: string | null) => void;
}

interface UseMeasureActionsReturn {
  handleTimeSignatureChange: (newSig: string) => void;
  handleKeySignatureChange: (newKey: string) => void;
  addMeasure: () => void;
  removeMeasure: () => void;
  togglePickup: () => void;
  setGrandStaff: () => void;
}

/**
 * Hook for measure-level actions: time/key signature changes, add/remove measures.
 */
export const useMeasureActions = ({
  score,
  clearSelection,
  setPreviewNote,
  dispatch,
  setFeedback,
}: UseMeasureActionsProps): UseMeasureActionsReturn => {
  const handleTimeSignatureChange = useCallback(
    (newSig: string) => {
      if (newSig === score.timeSignature) return;
      // A tuplet group is atomic; if one is longer than a whole bar of the new meter, reflow can't
      // place it without an overfull, invalid bar — refuse and explain rather than corrupt. (#256)
      if (!tupletsFitTimeSignature(score.staves, newSig)) {
        setFeedback?.('A tuplet is longer than one bar of that time signature — delete it first.');
        return;
      }
      dispatch(new SetTimeSignatureCommand(newSig));
      clearSelection();
      setPreviewNote(null);
    },
    [score.timeSignature, score.staves, dispatch, clearSelection, setPreviewNote, setFeedback]
  );

  const handleKeySignatureChange = useCallback(
    (newKey: string) => {
      if (newKey === score.keySignature) return;
      dispatch(new SetKeySignatureCommand(newKey));
    },
    [score.keySignature, dispatch]
  );

  const addMeasure = useCallback(() => {
    dispatch(new AddMeasureCommand());
  }, [dispatch]);

  const removeMeasure = useCallback(() => {
    dispatch(new DeleteMeasureCommand());
  }, [dispatch]);

  return {
    handleTimeSignatureChange,
    handleKeySignatureChange,
    addMeasure,
    removeMeasure,
    togglePickup: useCallback(() => {
      dispatch(new TogglePickupCommand());
    }, [dispatch]),
    setGrandStaff: useCallback(() => {
      dispatch(new SetGrandStaffCommand());
    }, [dispatch]),
  };
};
