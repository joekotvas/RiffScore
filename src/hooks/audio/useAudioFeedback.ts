/**
 * useAudioFeedback Hook
 *
 * Provides a callback for playing audio feedback when notes are selected or navigated.
 * Extracted from useNavigation and useSelection to eliminate DRY violations.
 *
 * @module hooks/audio/useAudioFeedback
 * @tested src/__tests__/hooks/audio/useAudioFeedback.test.ts
 */

import { useCallback } from "react";
import { playNote } from "@/engines/toneEngine";

/**
 * Shape of a note that can provide audio feedback.
 * Accepts any object with an optional pitch property.
 */
export interface AudioFeedbackNote {
  pitch: string | null;
}

/**
 * Hook that provides audio feedback for note playback.
 *
 * @returns A callback that plays audio for an array of notes
 */
export const useAudioFeedback = (): ((notes: AudioFeedbackNote[]) => void) => {
  return useCallback((notes: AudioFeedbackNote[]) => {
    if (!notes || notes.length === 0) return;
    notes.forEach((n) => {
      if (n.pitch) playNote(n.pitch);
    });
  }, []);
};
