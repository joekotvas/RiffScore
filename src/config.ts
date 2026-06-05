/**
 * Configuration Constants for Sheet Music Editor
 */

import type { ScoreMetadata, LayoutConfig, EditorConfig } from './types';

// Re-export themes for backwards compatibility
export { COLORS, THEMES, DEFAULT_THEME } from './themes';
export type { ThemeName, Theme } from './themes';

// Re-export EditorConfig type (formerly Config, now defined in types.ts)
export type { EditorConfig } from './types';

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
  compact: 0.5,
  normal: 1,
  relaxed: 1.5,
} as const;

/**
 * First system indent as percentage of content width (0-1).
 */
export const FIRST_SYSTEM_INDENT = 0.15;

/**
 * Visual gap between pages in pixels (for multi-page pagination).
 */
export const PAGE_GAP = 24;

/**
 * Footer height reserved at bottom of each page in pixels.
 * Note: Footer content (page number, copyright) renders in the margin,
 * so this is just a buffer to keep systems from touching the content edge.
 */
export const FOOTER_HEIGHT = 20;

/**
 * Metadata typography heights in pixels.
 */
export const METADATA_TYPOGRAPHY = {
  titleHeight: 30,
  titleSpacing: 8,
  composerHeight: 16,
  blockSpacing: 40,
} as const;

/**
 * Timing constants in milliseconds.
 */
export const TIMING = {
  printStyleSettleMs: 100,
} as const;

// =============================================================================
// EDITOR CONFIGURATION
// =============================================================================

export const CONFIG: EditorConfig = {
  lineHeight: 12,
  topMargin: 20,
  baseY: 80,
  quantsPerMeasure: 64,
  measurePaddingLeft: 36,
  measurePaddingRight: 0,
  scoreMarginLeft: 60,
  staffSpacing: 120,

  chordTrack: {
    minDistanceFromStaff: 40,
    paddingAboveNotes: 20,
    minY: 0,
  },

  toolbar: {
    iconSize: 20,
  },

  /** System preamble widths (clef, key signature, time signature) */
  preamble: {
    clefWidth: 40,
    keySigStartX: 45,
    keySigAccidentalWidth: 13,
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

  /** Editor footer settings */
  footer: {
    /** Footer height in pixels */
    height: 28,
    /** Padding inside footer */
    paddingHorizontal: 12,
    /** Zoom control settings */
    zoom: {
      /** Minimum zoom level (percentage) */
      min: 25,
      /** Maximum zoom level (percentage) */
      max: 400,
      /** Step size for drag (percentage per pixel) */
      dragStep: 1,
      /** Width of the drag handle hit area */
      handleWidth: 24,
    },
  },
};
