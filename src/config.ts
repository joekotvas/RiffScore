/**
 * Configuration Constants for Sheet Music Editor
 */

// Re-export themes for backwards compatibility
export { COLORS, THEMES, DEFAULT_THEME } from './themes';
export type { ThemeName, Theme } from './themes';

// =============================================================================
// LAYOUT CONFIGURATION
// =============================================================================

export interface Config {
  lineHeight: number;
  topMargin: number;
  baseY: number;
  quantsPerMeasure: number;
  measurePaddingLeft: number;
  measurePaddingRight: number;
  scoreMarginLeft: number;
  headerWidth: number;
  staffSpacing: number;

  // Chord track positioning
  chordTrack: {
    /** Minimum distance above staff top line */
    minDistanceFromStaff: number;
    /** Gap between highest note and chord symbol */
    paddingAboveNotes: number;
    /** Absolute minimum Y position (top of canvas) */
    minY: number;
  };

  // Toolbar sizing
  toolbar: {
    /** Icon size for toolbar buttons */
    iconSize: number;
  };

  // Header layout (clef, key sig, time sig)
  header: {
    /** Clef symbol width */
    clefWidth: number;
    /** X position where key signature starts */
    keySigStartX: number;
    /** Width per accidental in key signature */
    keySigAccidentalWidth: number;
    /** Padding after key signature */
    keySigPadding: number;
    /** Time signature width */
    timeSigWidth: number;
    /** Padding after time signature */
    timeSigPadding: number;
  };

  debug?: {
    enabled: boolean;
    logCommands: boolean;
    logStateChanges: boolean;
    logValidation: boolean;
    showHitZones?: boolean;
  };
}

export const CONFIG: Config = {
  lineHeight: 12,
  topMargin: 20,
  baseY: 80,
  quantsPerMeasure: 64,
  measurePaddingLeft: 36,
  measurePaddingRight: 0,
  scoreMarginLeft: 60,
  headerWidth: 60,
  staffSpacing: 120,

  chordTrack: {
    minDistanceFromStaff: 40,
    paddingAboveNotes: 20,
    minY: 0,
  },

  toolbar: {
    iconSize: 20,
  },

  header: {
    clefWidth: 40,
    keySigStartX: 45,
    keySigAccidentalWidth: 10,
    keySigPadding: 10,
    timeSigWidth: 30,
    timeSigPadding: 20,
  },

  debug: {
    enabled: true,
    logCommands: true,
    logStateChanges: true,
    logValidation: true,
    showHitZones: false, // Show red/cyan debug rectangles for hit zones
  },
};
