import { useMemo } from 'react';
import { ScoreEvent } from '@/types';
import {
  resolveMeasureAccidentals,
  type AccidentalGlyphDecision,
} from '@/utils/accidentalContext';

/**
 * Hook: which accidental glyph (if any) each note in a measure should display,
 * with full MEASURE MEMORY (standard engraving rules).
 *
 * This is a thin memoized wrapper over {@link resolveMeasureAccidentals} — the
 * SAME engine the MusicXML/ABC exporters use — so the on-screen glyph and the
 * exported accidental can never drift apart (#234). The resolver derives
 * everything from each note's `pitch` (contract C1); `note.accidental` is never
 * consulted.
 *
 * @param events - The events in the measure (already in temporal order)
 * @param keySignature - The current key signature (e.g. 'G', 'Bb', 'Em')
 * @returns A map of noteId -> glyph decision ({ glyph, parenthesized }), or null.
 *
 * @tested src/__tests__/theory/accidentalContext.test.ts
 */
export function useAccidentalContext(
  events: ScoreEvent[],
  keySignature: string
): Record<string, AccidentalGlyphDecision | null> {
  return useMemo(() => resolveMeasureAccidentals(events, keySignature), [events, keySignature]);
}
