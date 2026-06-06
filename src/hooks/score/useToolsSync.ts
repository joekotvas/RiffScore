/**
 * useToolsSync
 *
 * Synchronizes toolbar state (accidental, tie, input mode) with the current selection.
 * When a note is selected, its properties are reflected in the toolbar.
 *
 * @see useScoreLogic - Orchestrator that uses this hook
 */

import { useEffect } from 'react';
import { Selection, Score, ScoreEvent, getActiveStaff } from '@/types';
import { deriveAccidental } from '@/services/MusicService';
import { hasTieTarget } from '@/utils/ties';

interface UseToolsSyncProps {
  score: Score;
  selection: Selection;
  inputMode: 'NOTE' | 'REST';
  setActiveAccidental: (acc: 'flat' | 'natural' | 'sharp' | null) => void;
  setActiveTie: (tied: boolean) => void;
  setInputMode: (mode: 'NOTE' | 'REST') => void;
}

/**
 * Syncs toolbar state with current selection.
 *
 * Updates accidental, tie, and input mode when selection changes.
 * Uses "sticky" tools behavior - doesn't reset when no selection.
 *
 * @internal
 */
export const useToolsSync = ({
  score,
  selection,
  inputMode,
  setActiveAccidental,
  setActiveTie,
  setInputMode,
}: UseToolsSyncProps): void => {
  useEffect(() => {
    const { measureIndex, eventId, noteId, staffIndex } = selection;

    if (measureIndex === null || !eventId) {
      // No selection - DO NOT reset accidental/tie.
      // This allows "sticky" tools for note entry (User Request).
      return;
    }

    const staff = getActiveStaff(score, staffIndex || 0);
    const measure = staff.measures[measureIndex];
    if (!measure) return;

    const eventIndex = measure.events.findIndex((e: ScoreEvent) => e.id === eventId);
    const event = eventIndex >= 0 ? measure.events[eventIndex] : undefined;

    if (event) {
      // Duration is NOT synced - user controls duration independently

      if (noteId) {
        const note = event.notes.find((n) => n.id === noteId);
        if (note) {
          // Derive from pitch (source of truth), not the stored mirror which may be
          // null/stale. Only a real alteration (sharp/flat) becomes sticky — a plain
          // or natural note must NOT leak a sticky 'natural', or it would suppress
          // key-signature snapping on the next note entry.
          const acc = note.pitch ? deriveAccidental(note.pitch) : null;
          setActiveAccidental(acc && acc !== 'natural' ? acc : null);
          // Lane E: the tie button reflects what RENDERS — a forward `tied` flag whose target was
          // deleted/rested draws no tie, so it must not light the button (button-lit ⟺ tie-visible).
          setActiveTie(
            !!note.tied &&
              note.pitch != null &&
              hasTieTarget(staff.measures, { measureIndex, eventIndex, pitch: note.pitch })
          );
        }
      } else {
        // When no specific note selected (rest or event selection), clear
        setActiveAccidental(null);
        setActiveTie(false);
      }

      // Sync inputMode based on selection composition
      const targetMode = event.isRest ? 'REST' : 'NOTE';
      if (inputMode !== targetMode) {
        setInputMode(targetMode);
      }
    }
  }, [selection, score, setActiveAccidental, setActiveTie, setInputMode, inputMode]);
};
