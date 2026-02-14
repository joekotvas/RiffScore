/**
 * useScoreSetup
 *
 * Manages Score Setup dialog state including open/close and
 * transaction management for batch undo on cancel.
 *
 * @module hooks/layout
 */

import { useState, useCallback, useRef } from 'react';
import { useScoreContext } from '@/context/ScoreContext';

interface UseScoreSetupResult {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Open the dialog and begin transaction */
  open: () => void;
  /** Close the dialog (no save, no rollback - use save/cancel instead) */
  close: () => void;
  /** Toggle dialog open state */
  toggle: () => void;
  /** Save changes and close dialog */
  save: () => void;
  /** Cancel changes (rollback transaction) and close dialog */
  cancel: () => void;
}

/**
 * Hook for managing Score Setup dialog state.
 *
 * Uses transaction batching to enable:
 * - Live preview: changes apply immediately
 * - Save: commits all changes as single undo step
 * - Cancel: rolls back all changes made during session
 *
 * @example
 * ```tsx
 * const { isOpen, open, save, cancel } = useScoreSetup();
 *
 * return (
 *   <>
 *     <button onClick={open}>Score Setup</button>
 *     <ScoreSetupDialog
 *       isOpen={isOpen}
 *       onSave={save}
 *       onCancel={cancel}
 *     />
 *   </>
 * );
 * ```
 */
export const useScoreSetup = (): UseScoreSetupResult => {
  const [isOpen, setIsOpen] = useState(false);
  const ctx = useScoreContext();
  const { begin, commit, rollback } = ctx.historyAPI;

  // Track if we started a transaction (for safety)
  const hasTransactionRef = useRef(false);

  const open = useCallback(() => {
    // Begin transaction for batch undo on cancel
    begin();
    hasTransactionRef.current = true;
    setIsOpen(true);
  }, [begin]);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      // Default close behavior - commits changes
      if (hasTransactionRef.current) {
        commit('Score Setup');
        hasTransactionRef.current = false;
      }
      setIsOpen(false);
    } else {
      open();
    }
  }, [isOpen, open, commit]);

  const save = useCallback(() => {
    // Commit all changes as single undo step
    if (hasTransactionRef.current) {
      commit('Score Setup');
      hasTransactionRef.current = false;
    }
    setIsOpen(false);
  }, [commit]);

  const cancel = useCallback(() => {
    // Rollback all changes made during dialog session
    if (hasTransactionRef.current) {
      rollback();
      hasTransactionRef.current = false;
    }
    setIsOpen(false);
  }, [rollback]);

  return { isOpen, open, close, toggle, save, cancel };
};
