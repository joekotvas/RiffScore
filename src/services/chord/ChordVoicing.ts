/**
 * ChordVoicing - Generate chord voicings for playback.
 *
 * Produces balanced MIDI note arrays with proper register spread.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 */

import { Chord, Note } from 'tonal';

// ============================================================================
// VOICING GENERATION
// ============================================================================

/**
 * Generate MIDI notes for chord playback.
 * Returns a balanced voicing with proper register spread.
 *
 * @param symbol - Chord symbol (e.g., 'Cmaj7', 'Dm7')
 * @returns Array of note names with octave (e.g., ['C3', 'E3', 'G4', 'B4'])
 */
export const getChordVoicing = (symbol: string): string[] => {
  const chord = Chord.get(symbol.split('/')[0]);
  if (!chord.tonic || !chord.notes.length) return [];

  const notes = chord.notes;
  const voicing: string[] = [];

  // Dynamic bass octave: high roots (G and above) use octave 2, others use octave 3
  const highRoots = ['G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];
  const rootPc = Note.pitchClass(notes[0]) || notes[0];
  const bassOctave = highRoots.some((r) => rootPc.startsWith(r)) ? 2 : 3;

  // Root in dynamic octave
  voicing.push(`${rootPc}${bassOctave}`);

  // 3rd (if present) in octave 3
  if (notes[1]) {
    const third = Note.pitchClass(notes[1]) || notes[1];
    voicing.push(`${third}3`);
  }

  // 5th (if present) in octave 4
  if (notes[2]) {
    const fifth = Note.pitchClass(notes[2]) || notes[2];
    voicing.push(`${fifth}4`);
  }

  // 7th and extensions in octave 4 (limit to 5 notes total)
  for (let i = 3; i < Math.min(notes.length, 5); i++) {
    const ext = Note.pitchClass(notes[i]) || notes[i];
    voicing.push(`${ext}4`);
  }

  return voicing;
};
