import type { Score } from '@/types';
import { getChordVoicing } from './ChordService';
import { getMeasureTiming } from './MeasureTiming';

/**
 * Chord playback event for scheduling.
 */
export interface ChordPlaybackEvent {
  time: number; // Start time in seconds
  duration: number; // Duration in seconds
  notes: string[]; // Voicing notes (e.g., ['C3', 'E3', 'G3'])
  symbol: string; // Original chord symbol
  velocity: number; // Velocity 0-1
}

// --- CHORD PLAYBACK HELPERS ---

/**
 * Creates chord playback events from a score's chord track.
 * @param score - The score containing chord symbols
 * @param bpm - Tempo in beats per minute
 * @param velocity - Velocity for chord playback (0-127)
 * @returns Array of ChordPlaybackEvent for scheduling
 */
export const createChordPlaybackEvents = (
  score: Score,
  bpm: number,
  velocity: number = 50
): ChordPlaybackEvent[] => {
  const chordTrack = score.chordTrack;
  if (!chordTrack || chordTrack.length === 0) return [];

  const events: ChordPlaybackEvent[] = [];
  const timing = getMeasureTiming(score, true);
  const secondsPerBeat = 60 / bpm;
  const secondsPerQuant = secondsPerBeat / 16; // 16 quants per quarter note

  // Calculate total quants in score
  const totalQuants = timing.total;

  for (let i = 0; i < chordTrack.length; i++) {
    const chord = chordTrack[i];
    const nextChord = chordTrack[i + 1];

    // Get voicing notes
    const notes = getChordVoicing(chord.symbol);
    if (notes.length === 0) continue;

    // Convert measure-local position to global quant for timing
    const globalQuant = (timing.starts[chord.measure] ?? totalQuants) + chord.quant;
    const startTime = globalQuant * secondsPerQuant;

    // Calculate end position (until next chord, end of measure, or end of score)
    let endGlobalQuant: number;

    if (nextChord) {
      const nextGlobalQuant = (timing.starts[nextChord.measure] ?? totalQuants) + nextChord.quant;
      const measureEndQuant = timing.starts[chord.measure + 1] ?? totalQuants;

      if (nextGlobalQuant <= measureEndQuant) {
        // Next chord is in same measure or at measure boundary
        endGlobalQuant = nextGlobalQuant;
      } else {
        // Cap at end of current measure
        endGlobalQuant = Math.min(measureEndQuant, totalQuants);
      }
    } else {
      // Last chord: cap at end of current measure or score
      const measureEndQuant = timing.starts[chord.measure + 1] ?? totalQuants;
      endGlobalQuant = Math.min(measureEndQuant, totalQuants);
    }

    const duration = (endGlobalQuant - globalQuant) * secondsPerQuant;
    if (duration <= 0) continue;

    events.push({
      time: startTime,
      duration,
      notes,
      symbol: chord.symbol,
      velocity: velocity / 127, // Convert MIDI velocity to 0-1
    });
  }

  return events;
};
