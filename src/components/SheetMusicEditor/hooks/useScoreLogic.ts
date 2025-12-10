import { useState, useRef, useCallback, useMemo } from 'react';
import { TIME_SIGNATURES } from '../constants';
import { CONFIG } from '../config';
import { useScoreEngine } from './useScoreEngine';
import { useEditorTools } from './useEditorTools';
import { useMeasureActions } from './useMeasureActions';
import { useNoteActions } from './useNoteActions';
import { useModifiers } from './useModifiers';
import { useNavigation } from './useNavigation';
import { useTupletActions } from './useTupletActions';

import { Score, createDefaultScore, migrateScore, getActiveStaff, createDefaultSelection } from '../types';

/**
 * Main score logic orchestrator hook.
 * Composes focused hooks for measure, note, modifier, and navigation actions.
 */
export const useScoreLogic = (initialScore: any) => {
  // --- STATE ---
  const defaultScore = createDefaultScore();

  // Migrate incoming score to new staves format
  const migratedInitialScore = initialScore ? migrateScore(initialScore) : defaultScore;

  // --- ENGINE INTEGRATION ---
  const { score, engine } = useScoreEngine(migratedInitialScore);

  const undo = useCallback(() => engine.undo(), [engine]);
  const redo = useCallback(() => engine.redo(), [engine]);

  const history = engine.getHistory();
  const redoStack = engine.getRedoStack();

  // --- REFS ---
  const scoreRef = useRef(score);
  scoreRef.current = score;



  // --- EDITOR TOOLS ---
  const tools = useEditorTools();
  const { 
      activeDuration, setActiveDuration, 
      isDotted, setIsDotted, 
      activeAccidental, setActiveAccidental, 
      activeTie, setActiveTie,
  } = tools;

  // --- SELECTION & PREVIEW STATE ---
  const [selection, setSelection] = useState<import('../types').Selection>(createDefaultSelection());
  const [previewNote, setPreviewNote] = useState<any>(null);

  // --- COMPUTED VALUES ---
  if (!score || !score.staves) {
      console.error('CRITICAL: Score corrupted in useScoreLogic', score);
      // Fallback to prevent crash and allow inspection
      if (!score) console.error('Score is null/undefined');
      else if (!score.staves) console.error('Score.staves is undefined');
  }
  
  
  const currentQuantsPerMeasure = useMemo(() => {
      if (score.timeSignature) {
          return TIME_SIGNATURES[score.timeSignature as keyof typeof TIME_SIGNATURES] || 64;
      }
      return CONFIG.quantsPerMeasure;
  }, [score.timeSignature]);

  // --- SYNC TOOLBAR STATE ---
  // Only syncs accidental and tie state on selection - duration is NOT synced
  const syncToolbarState = useCallback((measureIndex: number | null, eventId: string | number | null, noteId: string | number | null, staffIndex: number = 0) => {
      if (measureIndex === null || !eventId) {
          // No selection - reset accidental and tie only
          setActiveAccidental(null);
          setActiveTie(false);
          return;
      }

      const measure = getActiveStaff(scoreRef.current, staffIndex).measures[measureIndex];
      if (!measure) return;
      const event = measure.events.find((e: any) => e.id === eventId);
      
      if (event) {
          // Duration is NOT synced - user controls duration independently
          
          if (noteId) {
              const note = event.notes.find((n: any) => n.id === noteId);
              if (note) {
                  setActiveAccidental(note.accidental || null);
                  setActiveTie(!!note.tied);
              }
          } else {
              // When no specific note selected, clear accidental/tie
              setActiveAccidental(null);
              setActiveTie(false);
          }
      }
  }, [setActiveAccidental, setActiveTie]);

  // --- COMPOSED HOOKS ---
  
  // Measure Actions: time/key signature, add/remove measures
  const measureActions = useMeasureActions({
    score,
    setSelection,
    setPreviewNote,
    dispatch: engine.dispatch.bind(engine)
  });

  // Note Actions: add/delete notes, chords
  const noteActions = useNoteActions({
    scoreRef,
    selection,
    setSelection,
    setPreviewNote,
    syncToolbarState,
    activeDuration,
    isDotted,
    activeAccidental,
    activeTie,
    currentQuantsPerMeasure,
    dispatch: engine.dispatch.bind(engine)
  });

  // Modifiers: duration, dots, accidentals, ties
  const modifiers = useModifiers({
    scoreRef,
    selection,
    currentQuantsPerMeasure,
    tools,
    dispatch: engine.dispatch.bind(engine)
  });

  // Navigation: selection, movement, transposition
  const navigation = useNavigation({
    scoreRef,
    selection,
    setSelection,
    previewNote,
    setPreviewNote,
    syncToolbarState,
    activeDuration,
    isDotted,
    currentQuantsPerMeasure,
    dispatch: engine.dispatch.bind(engine)
  });

  // Tuplet Actions: apply/remove tuplets
  const tupletActions = useTupletActions(
    scoreRef,
    selection,
    engine.dispatch.bind(engine)
  );

  // --- EXPORTS ---
  return {
    score,
    selection,
    setSelection,
    previewNote,
    setPreviewNote,
    history,
    redoStack,
    undo,
    redo,
    dispatch: engine.dispatch.bind(engine),
    activeDuration,
    setActiveDuration,
    isDotted,
    setIsDotted,
    activeAccidental,
    activeTie,
    handleTimeSignatureChange: measureActions.handleTimeSignatureChange,
    handleKeySignatureChange: measureActions.handleKeySignatureChange,
    addMeasure: measureActions.addMeasure,
    removeMeasure: measureActions.removeMeasure,
    togglePickup: measureActions.togglePickup,
    setGrandStaff: measureActions.setGrandStaff,
    handleMeasureHover: noteActions.handleMeasureHover,
    addNoteToMeasure: noteActions.addNoteToMeasure,
    addChordToMeasure: noteActions.addChordToMeasure,
    deleteSelected: noteActions.deleteSelected,
    handleNoteSelection: navigation.handleNoteSelection,
    handleDurationChange: modifiers.handleDurationChange,
    handleDotToggle: modifiers.handleDotToggle,
    handleAccidentalToggle: modifiers.handleAccidentalToggle,
    handleTieToggle: modifiers.handleTieToggle,
    currentQuantsPerMeasure,
    scoreRef,
    checkDurationValidity: modifiers.checkDurationValidity,
    checkDotValidity: modifiers.checkDotValidity,
    updateNotePitch: noteActions.updateNotePitch,
    // Tuplet actions
    applyTuplet: tupletActions.applyTuplet,
    removeTuplet: tupletActions.removeTuplet,
    canApplyTuplet: tupletActions.canApplyTuplet,
    activeTupletRatio: tupletActions.getActiveTupletRatio(),
    transposeSelection: navigation.transposeSelection,
    moveSelection: navigation.moveSelection,
    switchStaff: navigation.switchStaff
  };
};
