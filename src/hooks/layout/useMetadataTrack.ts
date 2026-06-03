/**
 * useMetadataTrack - Hook for Metadata Track Editing
 *
 * Manages metadata field editing state and handlers for the MetadataTrack
 * component. Follows the same pattern as useChordTrack.
 *
 * Key design decisions:
 * - Local state only for transient editing UI state
 * - Uses command pattern for all score mutations
 * - Tab navigation between fields with exit to score
 *
 * @module hooks/layout/useMetadataTrack
 */

import { useState, useCallback, useMemo, RefObject } from 'react';
import { Score, ScoreMetadata } from '@/types';
import { Command } from '@/commands/types';
import { SetMetadataCommand } from '@/commands/layout';
import { DEFAULT_SCORE_METADATA } from '@/config';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Metadata field names that can be edited inline.
 */
export type MetadataFieldName = 'title' | 'composer' | 'lyricist' | 'copyright';

/**
 * Field order for tab navigation.
 */
export const FIELD_ORDER: MetadataFieldName[] = ['title', 'composer', 'lyricist'];

/**
 * Props for the useMetadataTrack hook.
 */
export interface UseMetadataTrackProps {
  /** Ref to current score state */
  scoreRef: RefObject<Score>;

  /** Current score state (for reactive updates) */
  score: Score;

  /** Command dispatcher for score mutations */
  dispatch: (command: Command) => void;

  /** Callback to select the first element in the score (for Tab exit) */
  selectFirstElement: () => void;

  /** Callback to select the last element in the score (for Shift+Tab exit) */
  selectLastElement: () => void;
}

/**
 * Local editing state for the metadata track.
 */
export interface MetadataTrackEditingState {
  /** Field currently being edited (null if not editing) */
  editingField: MetadataFieldName | null;

  /** Field currently selected but not editing (null if none) */
  selectedField: MetadataFieldName | null;

  /** Initial value for the editing input (for cancel/restore) */
  initialValue: string | null;
}

/**
 * Props to pass to the MetadataTrack component.
 * Returned by the hook for easy component wiring.
 */
export interface MetadataTrackProps {
  /** Current metadata values */
  metadata: ScoreMetadata;

  /** Field currently being edited */
  editingField: MetadataFieldName | null;

  /** Field currently selected */
  selectedField: MetadataFieldName | null;

  /** Initial value for editing */
  initialValue: string | null;

  /** Start editing a field */
  onFieldClick: (field: MetadataFieldName) => void;

  /** Select a field without editing (Cmd/Ctrl+click) */
  onFieldSelect: (field: MetadataFieldName) => void;

  /** Complete editing with new value */
  onEditComplete: (field: MetadataFieldName, value: string) => void;

  /** Cancel editing */
  onEditCancel: () => void;

  /** Delete field content (clear to empty) */
  onDelete: (field: MetadataFieldName) => void;

  /** Navigate to next field */
  onNavigateNext: (field: MetadataFieldName, value: string) => void;

  /** Navigate to previous field */
  onNavigatePrevious: (field: MetadataFieldName, value: string) => void;
}

/**
 * Return type for the useMetadataTrack hook.
 */
export interface UseMetadataTrackReturn {
  // --- Derived from score ---
  /** Current metadata values */
  metadata: ScoreMetadata;

  // --- Local editing state ---
  /** Field currently being edited */
  editingField: MetadataFieldName | null;

  /** Field currently selected */
  selectedField: MetadataFieldName | null;

  /** Initial value for the editing input */
  initialValue: string | null;

  // --- Actions ---
  /**
   * Start editing a field.
   * @param field - Field to edit
   */
  startEditing: (field: MetadataFieldName) => void;

  /**
   * Select a field without editing.
   * @param field - Field to select
   */
  selectField: (field: MetadataFieldName) => void;

  /**
   * Complete the edit operation.
   * @param field - Field being edited
   * @param value - New value
   */
  completeEdit: (field: MetadataFieldName, value: string) => void;

  /**
   * Cancel the current edit operation.
   */
  cancelEdit: () => void;

  /**
   * Delete (clear) a field's content.
   * @param field - Field to clear
   */
  deleteField: (field: MetadataFieldName) => void;

  /**
   * Navigate to the next field.
   * @param field - Current field
   * @param value - Current value to save
   */
  navigateToNext: (field: MetadataFieldName, value: string) => void;

  /**
   * Navigate to the previous field.
   * @param field - Current field
   * @param value - Current value to save
   */
  navigateToPrevious: (field: MetadataFieldName, value: string) => void;

  /**
   * Exit metadata editing and select first element in score.
   */
  exitToScore: () => void;

  /**
   * Props object for easy MetadataTrack component wiring.
   */
  trackProps: MetadataTrackProps;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default/reset state for metadata track editing.
 */
const INITIAL_EDITING_STATE: MetadataTrackEditingState = {
  editingField: null,
  selectedField: null,
  initialValue: null,
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

/**
 * Hook for metadata track editing state and handlers.
 *
 * @param props - Hook configuration
 * @returns Metadata track state and action handlers
 *
 * @example
 * ```typescript
 * const metadataTrack = useMetadataTrack({
 *   scoreRef,
 *   score,
 *   dispatch,
 *   selectFirstElement: () => api.selectFirstElement(),
 *   selectLastElement: () => api.selectLastElement(),
 * });
 *
 * // Start editing a field
 * metadataTrack.startEditing('title');
 *
 * // Complete the edit
 * metadataTrack.completeEdit('title', 'My Song');
 * ```
 */
export const useMetadataTrack = ({
  scoreRef,
  score,
  dispatch,
  selectFirstElement,
  selectLastElement,
}: UseMetadataTrackProps): UseMetadataTrackReturn => {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Local Editing State
  // ─────────────────────────────────────────────────────────────────────────────

  const [editingState, setEditingState] = useState<MetadataTrackEditingState>(INITIAL_EDITING_STATE);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Derived State from Score
  // ─────────────────────────────────────────────────────────────────────────────

  const metadata = useMemo((): ScoreMetadata => {
    return score.metadata ?? { ...DEFAULT_SCORE_METADATA };
  }, [score.metadata]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Helper Functions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get the value of a metadata field.
   */
  const getFieldValue = useCallback(
    (field: MetadataFieldName): string => {
      const meta = scoreRef.current?.metadata ?? { ...DEFAULT_SCORE_METADATA };
      switch (field) {
        case 'title':
          return meta.title;
        case 'composer':
          return meta.composer ?? '';
        case 'lyricist':
          return meta.lyricist ?? '';
        case 'copyright':
          return meta.copyright ?? '';
      }
    },
    [scoreRef]
  );

  /**
   * Get the index of a field in the navigation order.
   */
  const getFieldIndex = useCallback((field: MetadataFieldName): number => {
    return FIELD_ORDER.indexOf(field);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Actions
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Start editing a field.
   */
  const startEditing = useCallback(
    (field: MetadataFieldName) => {
      const value = getFieldValue(field);

      setEditingState({
        editingField: field,
        selectedField: null,
        initialValue: value,
      });
    },
    [getFieldValue]
  );

  /**
   * Select a field without editing.
   */
  const selectField = useCallback((field: MetadataFieldName) => {
    setEditingState({
      editingField: null,
      selectedField: field,
      initialValue: null,
    });
  }, []);

  /**
   * Complete the edit operation.
   */
  const completeEdit = useCallback(
    (field: MetadataFieldName, value: string) => {
      const trimmedValue = value.trim();

      // Title is required - don't allow empty
      if (field === 'title' && !trimmedValue) {
        // Revert to initial value
        setEditingState(INITIAL_EDITING_STATE);
        return;
      }

      // Build the update object
      const updates: Partial<ScoreMetadata> = {};
      if (field === 'title') {
        updates.title = trimmedValue || DEFAULT_SCORE_METADATA.title;
      } else {
        // Optional fields: empty string means clear
        updates[field] = trimmedValue || undefined;
      }

      dispatch(new SetMetadataCommand(updates));

      // Clear editing state
      setEditingState(INITIAL_EDITING_STATE);
    },
    [dispatch]
  );

  /**
   * Cancel the current edit operation.
   */
  const cancelEdit = useCallback(() => {
    setEditingState(INITIAL_EDITING_STATE);
  }, []);

  /**
   * Delete (clear) a field's content.
   */
  const deleteField = useCallback(
    (field: MetadataFieldName) => {
      // Title cannot be deleted
      if (field === 'title') {
        return;
      }

      const updates: Partial<ScoreMetadata> = {
        [field]: undefined,
      };

      dispatch(new SetMetadataCommand(updates));

      // Clear editing state if this field was being edited
      if (editingState.editingField === field || editingState.selectedField === field) {
        setEditingState(INITIAL_EDITING_STATE);
      }
    },
    [dispatch, editingState.editingField, editingState.selectedField]
  );

  /**
   * Navigate to the next field.
   */
  const navigateToNext = useCallback(
    (field: MetadataFieldName, value: string) => {
      // Save current edit first
      completeEdit(field, value);

      // Find next field
      const currentIndex = getFieldIndex(field);
      const nextIndex = currentIndex + 1;

      if (nextIndex < FIELD_ORDER.length) {
        // Navigate to next field
        const nextField = FIELD_ORDER[nextIndex];
        // Use setTimeout to ensure state is updated after completeEdit
        setTimeout(() => {
          startEditing(nextField);
        }, 0);
      } else {
        // Tab from last field -> exit to score
        setTimeout(() => {
          selectFirstElement();
        }, 0);
      }
    },
    [completeEdit, getFieldIndex, startEditing, selectFirstElement]
  );

  /**
   * Navigate to the previous field.
   */
  const navigateToPrevious = useCallback(
    (field: MetadataFieldName, value: string) => {
      // Save current edit first
      completeEdit(field, value);

      // Find previous field
      const currentIndex = getFieldIndex(field);
      const prevIndex = currentIndex - 1;

      if (prevIndex >= 0) {
        // Navigate to previous field
        const prevField = FIELD_ORDER[prevIndex];
        // Use setTimeout to ensure state is updated after completeEdit
        setTimeout(() => {
          startEditing(prevField);
        }, 0);
      } else {
        // Shift+Tab from first field -> exit to last element in score
        setTimeout(() => {
          selectLastElement();
        }, 0);
      }
    },
    [completeEdit, getFieldIndex, startEditing, selectLastElement]
  );

  /**
   * Exit metadata editing and select first element in score.
   */
  const exitToScore = useCallback(() => {
    setEditingState(INITIAL_EDITING_STATE);
    selectFirstElement();
  }, [selectFirstElement]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Track Props (for easy component wiring)
  // ─────────────────────────────────────────────────────────────────────────────

  const trackProps: MetadataTrackProps = useMemo(
    () => ({
      metadata,
      editingField: editingState.editingField,
      selectedField: editingState.selectedField,
      initialValue: editingState.initialValue,
      onFieldClick: startEditing,
      onFieldSelect: selectField,
      onEditComplete: completeEdit,
      onEditCancel: cancelEdit,
      onDelete: deleteField,
      onNavigateNext: navigateToNext,
      onNavigatePrevious: navigateToPrevious,
    }),
    [
      metadata,
      editingState,
      startEditing,
      selectField,
      completeEdit,
      cancelEdit,
      deleteField,
      navigateToNext,
      navigateToPrevious,
    ]
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Return
  // ─────────────────────────────────────────────────────────────────────────────

  return {
    // Derived from score
    metadata,

    // Local editing state
    editingField: editingState.editingField,
    selectedField: editingState.selectedField,
    initialValue: editingState.initialValue,

    // Actions
    startEditing,
    selectField,
    completeEdit,
    cancelEdit,
    deleteField,
    navigateToNext,
    navigateToPrevious,
    exitToScore,

    // Track props for easy wiring
    trackProps,
  };
};
