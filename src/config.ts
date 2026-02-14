/**
 * Configuration Constants for Sheet Music Editor
 */

import type { ScoreMetadata, LayoutConfig } from './types';

// Re-export themes for backwards compatibility
export { COLORS, THEMES, DEFAULT_THEME } from './themes';
export type { ThemeName, Theme } from './themes';

// =============================================================================
// PAGE VIEW CONFIGURATION
// =============================================================================

/**
 * Default score metadata.
 */
export const DEFAULT_SCORE_METADATA: ScoreMetadata = {
  title: 'Untitled',
};

/**
 * Default layout configuration.
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  pageSize: 'letter',
  margins: 'normal',
  staffSize: 100,
  systemSpacing: 'normal',
  viewMode: 'scroll',
};

/**
 * Page margin presets in millimeters.
 */
export const MARGIN_PRESETS = {
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  normal: { top: 19, right: 19, bottom: 19, left: 19 },
  wide: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
} as const;

/**
 * Page dimensions in millimeters.
 */
export const PAGE_DIMENSIONS = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
} as const;

/**
 * System spacing multipliers (relative to staff height).
 */
export const SYSTEM_SPACING_MULTIPLIERS = {
  compact: 1.5,
  normal: 2.0,
  relaxed: 2.5,
} as const;

/**
 * First system indent as percentage of content width (0-1).
 */
export const FIRST_SYSTEM_INDENT = 0.15;

/**
 * Layout element widths in pixels (at 100% scale).
 */
export const LAYOUT_WIDTHS = {
  clef: 30,
  timeSignature: 24,
  barline: 2,
  keySignaturePerAccidental: 10,
} as const;

/**
 * Metadata typography heights in pixels.
 */
export const METADATA_TYPOGRAPHY = {
  titleHeight: 30,
  composerHeight: 16,
  blockSpacing: 20,
} as const;

/**
 * Timing constants in milliseconds.
 */
export const TIMING = {
  printStyleSettleMs: 100,
} as const;

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
