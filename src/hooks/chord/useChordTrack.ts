/**
 * useChordTrack - Hook for Chord Track Editing
 *
 * Manages chord track editing state and handlers. Selection state (chordId,
 * chordTrackFocused) lives in SelectionEngine, while editing state (editingChordId,
 * creatingAt, initialValue) is local to this hook.
 *
 * Key design decisions:
 * - Selection state in SelectionEngine for single source of truth
 * - Local state only for transient editing UI state
 * - Subscribes to SelectionEngine for selection changes
 * - Uses command pattern for all score mutations
 *
 * @module hooks/chord/useChordTrack
 */

import { useState, useCallback, useEffect, useMemo, RefObject } from 'react';
import { Score, ChordSymbol } from '@/types';
import { Command } from '@/commands/types';
import { SelectionEngine } from '@/engines/SelectionEngine';
import { AddChordCommand, UpdateChordCommand, RemoveChordCommand } from '@/commands/chord';
import { ChordPosition } from '@/commands/chord/AddChordCommand';
import { getValidChordQuants } from '@/services/ChordService';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Props for the useChordTrack hook.
 */
export interface UseChordTrackProps {
  /** Ref to current score state */
  scoreRef: RefObject<Score>;

  /** Current score state (for reactive updates) */
  score: Score;

  /** SelectionEngine instance for selection state */
  selectionEngine: SelectionEngine;

  /** Command dispatcher for score mutations */
  dispatch: (command: Command) => void;
}

/**
 * Local editing state for the chord track.
 * This state is transient and not persisted in SelectionEngine.
 */
export interface ChordTrackEditingState {
  /** ID of chord currently being edited (null if not editing) */
  editingChordId: string | null;

  /** Position where a new chord is being created (null if not creating) */
  creatingAt: ChordPosition | null;

  /** Initial value for the editing input (for cancel/restore) */
  initialValue: string | null;
}

/**
 * Options for starting an edit operation.
 */
export interface StartEditingOptions {
  /** Select all text in input on focus */
  selectAll?: boolean;

  /** Initial value override (defaults to chord's current symbol) */
  initialValue?: string;
}

/**
 * Return type for the useChordTrack hook.
 */
export interface UseChordTrackReturn {
  // --- Derived from score ---
  /** All chords in the chord track (sorted by measure, then quant) */
  chords: ChordSymbol[];

  /** Valid positions where chords can be placed (Map<measure, Set<quant>>) */
  validPositions: Map<number, Set<number>>;

  // --- From SelectionEngine ---
  /** Currently selected chord ID (null if none) */
  selectedChordId: string | null;

  /** Whether the chord track has focus */
  isFocused: boolean;

  // --- Local editing state ---
  /** ID of chord currently being edited */
  editingChordId: string | null;

  /** Position where a new chord is being created */
  creatingAt: ChordPosition | null;

  /** Initial value for the editing input */
  initialValue: string | null;

  // --- Actions ---
  /**
   * Start editing an existing chord.
   * @param chordId - ID of the chord to edit
   * @param options - Optional settings (selectAll, initialValue)
   */
  startEditing: (chordId: string, options?: StartEditingOptions) => void;

  /**
   * Start creating a new chord at a position.
   * @param position - Measure-local position for the new chord
   */
  startCreating: (position: ChordPosition) => void;

  /**
   * Complete the edit operation (create or update).
   * @param chordId - ID of the chord being edited (null for new chord)
   * @param value - New chord symbol value
   */
  completeEdit: (chordId: string | null, value: string) => void;

  /**
   * Cancel the current edit operation.
   */
  cancelEdit: () => void;

  /**
   * Delete a chord by ID.
   * @param chordId - ID of the chord to delete
   */
  deleteChord: (chordId: string) => void;

  /**
   * Check if a position is valid for chord placement.
   */
  isValidPosition: (position: ChordPosition) => boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default/reset state for chord track editing.
 * Used when clearing editing state after completing, canceling, or deleting.
 */
const INITIAL_EDITING_STATE: ChordTrackEditingState = {
  editingChordId: null,
  creatingAt: null,
  initialValue: null,
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for chord track editing state and handlers.
 *
 * Manages the interaction between:
 * - SelectionEngine (selection state: chordId, chordTrackFocused)
 * - Local state (editing state: editingChordId, creatingAt, initialValue)
 * - ScoreEngine (score mutations via dispatch)
 *
 * @param props - Hook configuration
 * @returns Chord track state and action handlers
 *
 * @example
 * ```typescript
 * const chordTrack = useChordTrack({
 *   scoreRef,
 *   selectionEngine,
 *   dispatch,
 * });
 *
 * // Start editing a chord
 * chordTrack.startEditing('chord-1', { selectAll: true });
 *
 * // Complete the edit
 * chordTrack.completeEdit('chord-1', 'Cmaj7');
 *
 * // Delete a chord
 * chordTrack.deleteChord('chord-1');
 * ```
 */
export const useChordTrack = ({
  scoreRef,
  score,
  selectionEngine,
  dispatch,
}: UseChordTrackProps): UseChordTrackReturn => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Local Editing State
  // ─────────────────────────────────────────────────────────────────────────────

  const [editingState, setEditingState] = useState<ChordTrackEditingState>(INITIAL_EDITING_STATE);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Subscribe to SelectionEngine
  // ─────────────────────────────────────────────────────────────────────────────

  const [selectionState, setSelectionState] = useState(() => selectionEngine.getState());

  useEffect(() => {
    const unsubscribe = selectionEngine.subscribe(setSelectionState);
    return unsubscribe;
  }, [selectionEngine]);

  // Extract chord-specific selection state
  const selectedChordId = selectionState.chordId ?? null;
  const isFocused = selectionState.chordTrackFocused ?? false;

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Derived State from Score
  // ─────────────────────────────────────────────────────────────────────────────

  const chords = useMemo((): ChordSymbol[] => {
    if (!score) return [];
    return score.chordTrack ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow: only recompute when chordTrack changes
  }, [score.chordTrack]);

  const validPositions = useMemo((): Map<number, Set<number>> => {
    if (!score) return new Map();
    return getValidChordQuants(score);
  }, [score]);

  const isValidPosition = useCallback(
    (position: ChordPosition): boolean => {
      const measureQuants = validPositions.get(position.measure);
      return measureQuants?.has(position.quant) ?? false;
    },
    [validPositions]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start editing an existing chord.
   * Clears any existing chord selection (unified selection: can't have
   * one chord selected while editing another).
   */
  const startEditing = useCallback(
    (chordId: string, options?: StartEditingOptions) => {
      const score = scoreRef.current;
      if (!score) return;

      // Find the chord to get its current value
      const chord = score.chordTrack?.find((c) => c.id === chordId);
      if (!chord) return;

      // Clear any existing chord selection (editing is a separate state)
      selectionEngine.selectChord(null);

      const initialValue = options?.initialValue ?? chord.symbol;

      setEditingState({
        editingChordId: chordId,
        creatingAt: null,
        initialValue,
      });
    },
    [scoreRef, selectionEngine]
  );

  /**
   * Start creating a new chord at a position.
   * Clears any existing chord selection (unified selection: can't have
   * a chord selected while creating a new one).
   */
  const startCreating = useCallback(
    (position: ChordPosition) => {
      // Clear any existing chord selection (creating is a separate state)
      selectionEngine.selectChord(null);

      setEditingState({
        editingChordId: 'new',
        creatingAt: position,
        initialValue: '',
      });
    },
    [selectionEngine]
  );

  /**
   * Complete the edit operation (create or update).
   */
  const completeEdit = useCallback(
    (chordId: string | null, value: string) => {
      const trimmedValue = value.trim();

      // If empty value, cancel instead
      if (!trimmedValue) {
        setEditingState(INITIAL_EDITING_STATE);
        return;
      }

      if (chordId) {
        // Update existing chord
        dispatch(new UpdateChordCommand(chordId, { symbol: trimmedValue }));
      } else if (editingState.creatingAt !== null) {
        // Create new chord at position
        dispatch(new AddChordCommand(editingState.creatingAt, trimmedValue));
      }

      // Clear editing state
      setEditingState(INITIAL_EDITING_STATE);
    },
    [dispatch, editingState.creatingAt]
  );

  /**
   * Cancel the current edit operation.
   */
  const cancelEdit = useCallback(() => {
    setEditingState(INITIAL_EDITING_STATE);
  }, []);

  /**
   * Delete a chord by ID.
   */
  const deleteChord = useCallback(
    (chordId: string) => {
      dispatch(new RemoveChordCommand(chordId));

      // If we were editing this chord, clear the editing state
      if (editingState.editingChordId === chordId) {
        setEditingState(INITIAL_EDITING_STATE);
      }
    },
    [dispatch, editingState.editingChordId]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Return
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    // Derived from score
    chords,
    validPositions,

    // From SelectionEngine
    selectedChordId,
    isFocused,

    // Local editing state
    editingChordId: editingState.editingChordId,
    creatingAt: editingState.creatingAt,
    initialValue: editingState.initialValue,

    // Actions
    startEditing,
    startCreating,
    completeEdit,
    cancelEdit,
    deleteChord,
    isValidPosition,
  };
};
