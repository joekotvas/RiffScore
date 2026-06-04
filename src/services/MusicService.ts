/**
 * MusicService - Centralized Music Theory & Notation Logic
 *
 * Adapts TonalJS to the specific needs of a score renderer,
 * distinguishing between "Musical Pitch" (Audio/Theory) and
 * "Visual Pitch" (Staff positioning).
 */

import { Note, Key } from 'tonal';
import { ACCIDENTALS } from '@/constants/SMuFL';
import { getEffectiveScale, getEffectiveAlteration } from '@/utils/keyResolution';

// --- Constants ---

export const STAFF_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * The full chromatic alteration of a displayed accidental.
 * Distinguishes double sharps/flats; `null` means "no accidental glyph".
 */
export type AccidentalKind = 'doubleSharp' | 'sharp' | 'natural' | 'flat' | 'doubleFlat' | null;

/**
 * Derives the accidental of a pitch SOLELY from the pitch string (the single
 * source of truth per contract C1). Returns the tri-state legacy mirror value
 * used by `note.accidental` and existing readers.
 *
 * NOTE: this collapses double accidentals to their single counterpart for the
 * legacy field (which is typed tri-state). Use {@link deriveAccidentalKind} when
 * you need to distinguish ±2.
 *
 * @example deriveAccidental('F#4')  -> 'sharp'
 * @example deriveAccidental('Bb3')  -> 'flat'
 * @example deriveAccidental('C4')   -> 'natural'
 * @example deriveAccidental('Fx4')  -> 'sharp'  (double sharp folds to sharp in the mirror)
 */
export const deriveAccidental = (
  pitch: string | null | undefined
): 'sharp' | 'flat' | 'natural' | null => {
  if (!pitch) return null;
  const n = Note.get(pitch);
  if (n.empty || n.pc === '') return null;
  if (n.alt > 0) return 'sharp';
  if (n.alt < 0) return 'flat';
  return 'natural';
};

/**
 * Derives the FULL chromatic alteration of a pitch (including double
 * sharps/flats) from the pitch string. `alt === 0` returns 'natural'.
 */
export const deriveAccidentalKind = (pitch: string | null | undefined): AccidentalKind => {
  if (!pitch) return null;
  const n = Note.get(pitch);
  if (n.empty || n.pc === '') return null;
  switch (n.alt) {
    case 2:
      return 'doubleSharp';
    case 1:
      return 'sharp';
    case 0:
      return 'natural';
    case -1:
      return 'flat';
    case -2:
      return 'doubleFlat';
    default:
      return n.alt > 0 ? 'doubleSharp' : 'doubleFlat';
  }
};

// ============================================================================
// 1. ANALYSIS (Audio & Midi)
// ============================================================================

/** Returns frequency in Hz (0 if invalid). */
export const getFrequency = (pitch: string): number => Note.freq(pitch) ?? 0;

/** Returns MIDI number 0-127 (defaults to Middle C/60 if invalid). */
export const getMidi = (pitch: string): number => Note.midi(pitch) ?? 60;

/** Returns scientific notation from MIDI (e.g. 60 -> "C4"). */
export const midiToPitch = (midi: number): string => Note.fromMidi(midi) ?? 'C4';

// ============================================================================
// 2. THEORY (Keys & Scales)
// ============================================================================

export const getKeyInfo = (root: string) => Key.majorKey(root);

/**
 * Signed accidental count for a key. Mode-aware: correct for minor keys
 * (e.g. 'Em' -> +1) which `Key.majorKey` previously reported as 0.
 */
export const getKeyAlteration = (root: string): number => getEffectiveAlteration(root);

/**
 * Diatonic scale (pitch classes) for a key. Mode-aware: returns the natural
 * minor scale for minor keys instead of the empty array `Key.majorKey('Em')`
 * used to return.
 */
export const getScaleNotes = (root: string): string[] => getEffectiveScale(root);

/**
 * Returns the diatonic scale degree for a pitch in a key.
 * @example getScaleDegree("G4", "C") -> 5
 */
export const getScaleDegree = (pitch: string, keyRoot: string): number => {
  const pc = Note.pitchClass(pitch);
  const scale = getScaleNotes(keyRoot);
  const idx = scale.indexOf(pc);
  return idx === -1 ? 0 : idx + 1;
};

// ============================================================================
// 3. NOTATION (Rendering Logic)
// ============================================================================

/**
 * Returns the "Visual Pitch" - the letter and octave without accidentals.
 * Used to determine the Y-position on the staff.
 * @example "F#4" -> "F4", "Fb4" -> "F4"
 */
export const getStaffPitch = (pitch: string): string => {
  const n = Note.get(pitch);
  return n.letter && n.oct !== undefined ? `${n.letter}${n.oct}` : pitch;
};

/**
 * Decides if a note needs an accidental glyph based on the Key Signature.
 *
 * Logic:
 * 1. If note is in the key scale -> No accidental.
 * 2. If note is Natural but key expects Sharp/Flat -> Show Natural.
 * 3. If note is Sharp/Flat and not in key -> Show Sharp/Flat.
 */
export const needsAccidental = (
  pitch: string,
  keyRoot: string
): { show: boolean; type: AccidentalKind } => {
  const n = Note.get(pitch);
  if (!n.pc) return { show: false, type: null };

  // Mode-aware scale: minor keys resolve to natural minor instead of the empty
  // array that `Key.majorKey('Em')` returned (which made every diatonic note
  // look chromatic).
  const scale = getEffectiveScale(keyRoot);

  // Case A: Diatonic Note (e.g. F# in G Major, F# in E minor) -> Clean
  if (scale.includes(n.pc)) {
    return { show: false, type: null };
  }

  // Case B: Chromatic Note
  // If the note is natural (alt === 0), it forces a Natural sign against the key
  if (n.alt === 0) {
    return { show: true, type: 'natural' };
  }

  // Otherwise, return the full alteration (preserving double sharps/flats).
  return { show: true, type: deriveAccidentalKind(pitch) };
};

/**
 * Resolves the final SMuFL glyph for a note, considering overrides.
 */
export const getAccidentalGlyph = (
  pitch: string,
  keySignature: string,
  overrideSymbol?: string | null
): string | null => {
  // 1. Manual Override (User forced an accidental or forced it hidden)
  if (overrideSymbol !== undefined) return overrideSymbol;

  // 2. Standard Theory Calculation
  const { show, type } = needsAccidental(pitch, keySignature);
  return show && type ? ACCIDENTALS[type] : null;
};

// ============================================================================
// 4. INTERACTION (Drag & Drop Math)
// ============================================================================

/**
 * Snaps a "Visual Pitch" (derived from staff Y-position) to the Musical Key.
 *
 * @example
 * // User clicks "F" line in G Major
 * applyKeySignature("F4", "G") // -> "F#4"
 */
export const applyKeySignature = (visualPitch: string, keyRoot: string): string => {
  const n = Note.get(visualPitch);
  if (!n.letter || n.oct === undefined) return visualPitch;

  // Find the pitch class in the (mode-aware) scale that shares this letter.
  // Minor keys now resolve correctly: clicking the F line in E minor yields F#4.
  const scale = getEffectiveScale(keyRoot);
  const match = scale.find((pc) => Note.get(pc).letter === n.letter);

  // If found (e.g. found "F#" for letter "F"), combine with octave
  return match ? `${match}${n.oct}` : visualPitch;
};

/**
 * Folds an accidental selection into a pitch, recomputing the SOUNDING pitch
 * (contract C1: pitch is the single source of truth). This is the shared helper
 * behind both the keyboard accidental toggle and the public `setAccidental` /
 * `toggleAccidental` API, so they can never diverge.
 *
 * The accidental is applied to the note's LETTER + OCTAVE (its staff line),
 * discarding any prior alteration — exactly how a performer reads an accidental:
 *
 * - 'sharp'   -> letter + '#'  (C4  -> C#4, Cb4 -> C#4)
 * - 'flat'    -> letter + 'b'  (C#4 -> Cb4)
 * - 'natural' -> letter        (C#4 -> C4)
 * - null      -> the key-implied spelling for that letter (no explicit
 *                accidental, i.e. "follow the key signature")
 *
 * @param pitch        Current absolute pitch (e.g. 'C#4').
 * @param type         Accidental to apply, or null to return to key-implied.
 * @param keySignature Key context, used only when `type` is null.
 * @returns The new absolute pitch, or the input pitch if it cannot be parsed.
 */
export const foldAccidentalIntoPitch = (
  pitch: string,
  type: 'sharp' | 'flat' | 'natural' | null,
  keySignature: string = 'C'
): string => {
  const n = Note.get(pitch);
  if (n.empty || !n.letter || n.oct === undefined) return pitch;

  const letter = n.letter;
  const oct = n.oct;

  switch (type) {
    case 'sharp':
      return `${letter}#${oct}`;
    case 'flat':
      return `${letter}b${oct}`;
    case 'natural':
      return `${letter}${oct}`;
    case null:
      // No explicit accidental: snap the bare letter to the key signature.
      return applyKeySignature(`${letter}${oct}`, keySignature);
    default:
      return pitch;
  }
};

/**
 * Compares two pitches and returns -1, 0, or 1 (like a comparator).
 * Uses MIDI values for comparison.
 */
export const comparePitch = (a: string, b: string): number => {
  const midiA = getMidi(a);
  const midiB = getMidi(b);
  return midiA < midiB ? -1 : midiA > midiB ? 1 : 0;
};

/**
 * Clamps a pitch to the allowed range for a clef.
 * If pitch is out of bounds, returns the boundary pitch.
 */
export const clampPitch = (pitch: string, minPitch: string, maxPitch: string): string => {
  if (comparePitch(pitch, minPitch) < 0) return minPitch;
  if (comparePitch(pitch, maxPitch) > 0) return maxPitch;
  return pitch;
};

/**
 * Calculates a new pitch by moving visually along staff lines,
 * automatically applying the key signature to the destination.
 *
 * @param pitch Starting pitch (e.g. "C4")
 * @param steps Visual steps to move (e.g. 1 = next line/space)
 * @param keyRoot Key context (e.g. "G")
 * @param pitchRange Optional pitch range for clamping (if provided, result will be clamped)
 */
export const movePitchVisual = (
  pitch: string,
  steps: number,
  keyRoot: string = 'C',
  pitchRange?: { min: string; max: string }
): string => {
  const n = Note.get(pitch);
  if (!n.letter || n.oct === undefined) return pitch;

  // 1. Calculate new Letter & Octave (Geometry)
  const currentIdx = STAFF_LETTERS.indexOf(n.letter);
  const totalIdx = currentIdx + steps;

  // Handle wrapping (modulo with support for negative numbers)
  const wrappedIdx = ((totalIdx % 7) + 7) % 7;
  const octaveChange = Math.floor(totalIdx / 7);

  const newLetter = STAFF_LETTERS[wrappedIdx];
  const newOctave = n.oct + octaveChange;

  // 2. Snap to Key (Music Theory)
  let result = applyKeySignature(`${newLetter}${newOctave}`, keyRoot);

  // 3. Clamp to allowed range (if pitchRange provided)
  if (pitchRange) {
    result = clampPitch(result, pitchRange.min, pitchRange.max);
  }

  return result;
};
