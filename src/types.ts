import { ThemeName } from './themes';
import { TIME_SIGNATURES } from './constants';
import { getNoteDuration } from './utils/core';

/**
 * Type definitions for the Sheet Music Editor
 *
 * This file defines the data model for scores, staves, measures, events, and notes.
 * The model supports multiple staves for Grand Staff rendering.
 */

// ========== SCHEMA VERSION ==========

/**
 * Current persisted-score schema version.
 *
 * Bump this whenever a migration step is added to {@link migrateScore} so that
 * loaded scores can be deterministically upgraded and `migrateScore` can short
 * out (idempotency) on an already-current score.
 *
 * History:
 * - 1: staves model + measure-local chordTrack (accumulated, not modulo).
 */
export const SCHEMA_VERSION = 1 as const;

// ========== NOTE ==========

export interface Note {
  id: string;
  pitch: string | null; // e.g., 'C4', 'D#5', 'Bb3', or null for rests
  accidental?: 'sharp' | 'flat' | 'natural' | null;
  tied?: boolean; // Tied to next note
  isRest?: boolean; // True for rest notes (pitchless)
}

// ========== EVENT ==========

export interface ScoreEvent {
  id: string;
  duration: string; // 'whole', 'half', 'quarter', etc.
  dotted: boolean;
  notes: Note[]; // Multiple notes = chord
  isRest?: boolean;
  chord?: string | null; // Chord symbol (e.g., "G", "C", "D7")
  tuplet?: {
    ratio: [number, number]; // e.g., [3, 2] for triplet (3 notes in space of 2)
    groupSize: number; // Total notes in tuplet group (e.g., 3 for triplet)
    position: number; // Position within tuplet (0, 1, 2 for triplet)
    baseDuration?: string; // Base duration of the tuplet (e.g., 'eighth' for eighth note triplet)
    id?: string; // Unique ID for the tuplet group
  };
}

// ========== MEASURE ==========

export interface Measure {
  id: string;
  events: ScoreEvent[];
  isPickup?: boolean;
}

// ========== STAFF ==========

export type ClefType = 'treble' | 'bass' | 'alto' | 'tenor' | 'grand';

export interface Staff {
  id: string;
  clef: ClefType;
  keySignature: string; // e.g., 'C', 'G', 'F', 'Bb'
  measures: Measure[];
}

// ========== CHORD SYMBOLS ==========

/**
 * Represents a chord symbol in the chord track.
 * Anchored to a measure-local position for robust measure operations.
 */
export interface ChordSymbol {
  /** Unique identifier (generated via chordId() from utils/id.ts) */
  id: string;

  /** Measure index (0-based) */
  measure: number;

  /** Local quant position within the measure (0 = start of measure) */
  quant: number;

  /** Canonical chord symbol (letter-name notation, e.g., 'Cmaj7', 'Am', 'G7') */
  symbol: string;
}

/**
 * Configuration for chord display notation.
 */
export interface ChordDisplayConfig {
  /** Notation system for rendering */
  notation: 'letter' | 'roman' | 'nashville' | 'fixedDo' | 'movableDo';

  /** Use typographic symbols (△, °, +) vs text (maj, dim, aug) */
  useSymbols: boolean;
}

/**
 * Configuration for chord playback.
 */
export interface ChordPlaybackConfig {
  /** Enable/disable chord playback */
  enabled: boolean;

  /** Velocity (0-127), default 50 */
  velocity: number;
}

/**
 * Default chord display configuration.
 */
export const DEFAULT_CHORD_DISPLAY: ChordDisplayConfig = {
  notation: 'letter',
  useSymbols: false,
};

/**
 * Default chord playback configuration.
 */
export const DEFAULT_CHORD_PLAYBACK: ChordPlaybackConfig = {
  enabled: true,
  velocity: 50,
};

// ========== SCORE METADATA ==========

/**
 * Score metadata for display and export.
 */
export interface ScoreMetadata {
  /** Score title (required, pre-filled to "Untitled") */
  title: string;
  /** Composer name */
  composer?: string;
  /** Lyricist name */
  lyricist?: string;
  /** Copyright notice */
  copyright?: string;
}

// ========== EDITOR CONFIG ==========

/**
 * Low-level editor configuration constants.
 * Controls rendering dimensions, spacing, and debug settings.
 */
export interface EditorConfig {
  lineHeight: number;
  topMargin: number;
  baseY: number;
  quantsPerMeasure: number;
  measurePaddingLeft: number;
  measurePaddingRight: number;
  scoreMarginLeft: number;
  staffSpacing: number;

  /** Chord track positioning */
  chordTrack: {
    /** Minimum distance above staff top line */
    minDistanceFromStaff: number;
    /** Gap between highest note and chord symbol */
    paddingAboveNotes: number;
    /** Absolute minimum Y position (top of canvas) */
    minY: number;
  };

  /** Toolbar sizing */
  toolbar: {
    /** Icon size for toolbar buttons */
    iconSize: number;
  };

  /** System preamble layout (clef, key sig, time sig at start of each system) */
  preamble: {
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

  /** Debug settings */
  debug?: {
    enabled: boolean;
    logCommands: boolean;
    logStateChanges: boolean;
    logValidation: boolean;
    showHitZones?: boolean;
  };

  /** Editor footer settings */
  footer: {
    /** Footer height in pixels */
    height: number;
    /** Padding inside footer */
    paddingHorizontal: number;
    /** Zoom control settings */
    zoom: {
      /** Minimum zoom level (percentage) */
      min: number;
      /** Maximum zoom level (percentage) */
      max: number;
      /** Step size for drag (percentage per pixel) */
      dragStep: number;
      /** Width of the drag handle hit area */
      handleWidth: number;
    };
  };
}

// ========== LAYOUT CONFIG ==========

/**
 * Layout configuration for page view.
 */
export interface LayoutConfig {
  /** Page size identifier */
  pageSize: 'letter' | 'a4';
  /** Page margins preset */
  margins: 'narrow' | 'normal' | 'wide';
  /** Staff size as percentage (100 = default), stepped by 10 */
  staffSize: number;
  /** Spacing between systems */
  systemSpacing: 'compact' | 'normal' | 'relaxed';
  /** Current view mode */
  viewMode: 'scroll' | 'page';
}

/**
 * Position of a single measure within a system.
 */
export interface MeasurePosition {
  /** 0-based measure index */
  measureIndex: number;
  /** Absolute X position of measure start */
  x: number;
  /** Computed width (may be stretched for justification) */
  width: number;
}

/**
 * Computed layout for a single system (line of music).
 *
 * Coordinate reference:
 * - All X values are in PAGE coordinates (pixels at final render size)
 * - preambleWidth is in STAFF coordinates (unscaled, multiply by staffScale for page coords)
 */
export interface SystemLayout {
  /** 0-based system index */
  index: number;
  /** Measure indices contained in this system (0-based) */
  measures: number[];
  /** Y position of system top (page coords) */
  y: number;
  /** Total height of system (page coords) */
  height: number;
  /** X position where measures start (page coords, includes preamble + indent) */
  xOffset: number;
  /** Available width for measures (page coords, preamble already excluded) */
  contentWidth: number;
  /** Preamble width in staff coords (narrower on subsequent systems - no time sig) */
  preambleWidth: number;
  /** First system flag (has time signature in preamble) */
  isFirst: boolean;
  /** Last system flag */
  isLast: boolean;
  /** Justification factor (1.0 = full, <1.0 = natural) */
  justification: number;
  /** Pre-computed measure positions within this system */
  measurePositions: MeasurePosition[];
}

/**
 * Content area within page margins (the drawable region).
 */
export interface ContentArea {
  /** Absolute X of content start (after left margin) */
  x: number;
  /** Absolute Y of content start (after top margin) */
  y: number;
  /** Width of content area (page width - left - right margins) */
  width: number;
  /** Height of content area (page height - top - bottom margins) */
  height: number;
}

/**
 * Computed margins in pixels.
 */
export interface MarginsPx {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Layout for metadata (title, composer, lyricist) at top of page.
 */
export interface MetadataLayout {
  /** Title text and position (null if no title) */
  title: { text: string; x: number; y: number } | null;
  /** Composer text and position - right-aligned below title (null if no composer) */
  composer: { text: string; x: number; y: number } | null;
  /** Lyricist text and position - left-aligned below title (null if no lyricist) */
  lyricist: { text: string; x: number; y: number } | null;
  /** Y position where metadata ends (systems start below this) */
  bottom: number;
}

/**
 * Layout for page footer (page numbers, copyright).
 */
export interface FooterLayout {
  /** Y position of footer top */
  y: number;
  /** Page number position and text */
  pageNumber: { text: string; x: number; y: number };
  /** Copyright position and text (page 1 only) */
  copyright?: { text: string; x: number; y: number };
}

/**
 * Layout for a single page in multi-page pagination.
 */
export interface Page {
  /** 0-based page index */
  index: number;
  /** Systems on this page (Y coordinates are page-relative) */
  systems: SystemLayout[];
  /** Footer layout for this page */
  footer: FooterLayout;
  /** Y offset of this page within the canvas */
  canvasY: number;
  /** Whether this is the first page (shows metadata) */
  isFirst: boolean;
  /** Whether this is the last page */
  isLast: boolean;
}

/**
 * Complete page layout with all pages and systems.
 */
export interface PageLayout {
  /** All pages in the score (for multi-page pagination) */
  pages: Page[];
  /** Total number of pages */
  pageCount: number;
  /** Visual gap between pages in pixels */
  pageGap: number;
  /** Total canvas height (all pages + gaps) */
  totalHeight: number;
  /** Systems on first page (backwards compatibility) */
  systems: SystemLayout[];
  /** Page dimensions */
  pageSize: 'letter' | 'a4';
  dimensions: { width: number; height: number };
  /** Margins preset */
  margins: LayoutConfig['margins'];
  /** Computed content width */
  contentWidth: number;
  /** First system indent (0-1) */
  firstSystemIndent: number;
  /** Staff scale factor */
  staffScale: number;
  /** Content area (drawable region within margins) */
  contentArea: ContentArea;
  /** Computed pixel margins */
  marginsPx: MarginsPx;
  /** Metadata layout (title, composer positioning) */
  metadata: MetadataLayout;
  /** Footer layout for first page (backwards compatibility) */
  footer: FooterLayout;
}

// ========== SCORE ==========

export interface Score {
  /**
   * Persisted schema version. Stamped by {@link migrateScore} to the current
   * {@link SCHEMA_VERSION}. Absent on legacy (pre-versioning) scores, which are
   * migrated and stamped on load.
   */
  schemaVersion?: number;

  title: string;
  timeSignature: string; // Shared across staves (e.g., '4/4', '3/4')
  keySignature: string; // Shared across staves (e.g., 'C', 'G')
  bpm: number;
  staves: Staff[];

  /** Chord symbols for harmonic annotation (sorted by quant ascending) */
  chordTrack?: ChordSymbol[];

  /** Score metadata for display and export */
  metadata?: ScoreMetadata;

  /** Layout configuration */
  layout?: LayoutConfig;
}

// ========== HELPER FUNCTIONS ==========

/**
 * Creates a default empty score with a single treble staff
 */
export const createDefaultScore = (): Score => ({
  title: 'Composition',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        { id: 'm1', events: [] },
        { id: 'm2', events: [] },
      ],
    },
    {
      id: 'staff-2',
      clef: 'bass',
      keySignature: 'C',
      measures: [
        { id: 'm1-bass', events: [] },
        { id: 'm2-bass', events: [] },
      ],
    },
  ],
});

/**
 * Gets the active staff from a score (currently always the first staff)
 * In future, this could support staff switching for Grand Staff editing
 */
export const getActiveStaff = (score: Score, staffIndex: number = 0): Staff => {
  return score.staves[staffIndex] || score.staves[0];
};

/**
 * Computes the quant capacity of each measure of a score from its actual content.
 *
 * A measure's capacity is the maximum, across all staves, of the summed event
 * durations at that measure index. This is the SAME accumulation
 * `getValidChordQuants` performs, so the legacy global quant (built by summing
 * real measure spans) inverts exactly.
 *
 * Crucially the capacity is the measure's *actual* span, not a fixed nominal
 * width: a pickup bar (deliberately short) or a partially-filled bar consumes
 * only its real span, which is what makes the migration lossless where modulo is
 * not. The nominal time-signature width is used only as a fallback for a measure
 * that is empty across every staff (span 0 would otherwise trap accumulation and
 * collapse every later chord onto it).
 *
 * @param staves - The score's staves (may be undefined for very old formats)
 * @param timeSignature - Time signature string, used as the empty-measure fallback
 * @returns Array of measure capacities in quants, indexed by measure
 */
const computeMeasureCapacities = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accepts unknown legacy staff formats during migration
  staves: any[] | undefined,
  timeSignature: string
): number[] => {
  const nominal = TIME_SIGNATURES[timeSignature] || 64;

  if (!staves || staves.length === 0) return [];

  // Per measure index, the largest actual content span seen across staves.
  const spans: number[] = [];

  for (const staff of staves) {
    const measures = staff?.measures;
    if (!Array.isArray(measures)) continue;

    for (let i = 0; i < measures.length; i++) {
      const events = measures[i]?.events;
      let sum = 0;
      if (Array.isArray(events)) {
        for (const event of events) {
          sum += getNoteDuration(event.duration, event.dotted, event.tuplet);
        }
      }
      spans[i] = Math.max(spans[i] ?? 0, sum);
    }
  }

  // Replace any empty (span 0) measure with the nominal width so accumulation
  // still advances past it.
  return spans.map((span) => (span > 0 ? span : nominal));
};

/**
 * Maps an absolute (global) quant position to a measure-local { measure, quant }
 * pair by accumulating real measure capacities, never by modulo.
 *
 * The legacy global-quant convention was `measureIndex * quantsPerMeasure +
 * localQuant` under the assumption that every measure was exactly the nominal
 * width. Modulo (`global % nominal`) reproduces that assumption and therefore
 * silently mis-places any chord once a measure is not the nominal width (pickup
 * bars, ragged trailing bars). Accumulating the actual capacities tiles the
 * timeline exactly, so the local position is recovered losslessly.
 *
 * @param globalQuant - Absolute quant position from the legacy format
 * @param capacities - Per-measure capacities (see computeMeasureCapacities)
 * @param nominal - Nominal measure capacity, used past the end of `capacities`
 */
const globalQuantToLocal = (
  globalQuant: number,
  capacities: number[],
  nominal: number
): { measure: number; quant: number } => {
  let remaining = globalQuant;
  let measure = 0;

  // Walk known measures, subtracting each real capacity until the position lands
  // inside the current measure.
  while (measure < capacities.length) {
    const cap = capacities[measure];
    if (remaining < cap) break;
    remaining -= cap;
    measure++;
  }

  // Past the last known measure, fall back to the nominal width so positions
  // beyond the authored content still map deterministically.
  if (measure >= capacities.length && nominal > 0) {
    measure += Math.floor(remaining / nominal);
    remaining = remaining % nominal;
  }

  return { measure, quant: remaining };
};

/**
 * Migrates chordTrack from global quant to measure-local { measure, quant } format.
 * Old format: { id, quant, symbol } where quant is global
 * New format: { id, measure, quant, symbol } where quant is local to measure
 *
 * Migration accumulates real per-measure capacities (lossless) rather than
 * applying a fixed modulo, so chord positions survive pickup bars and any score
 * whose measures are not all the nominal width. Already-migrated chord tracks
 * (every chord carries a `measure`) are returned unchanged (idempotent).
 *
 * @param chordTrack - Chord symbols in either old or new format
 * @param timeSignature - Time signature for nominal measure width
 * @param staves - The score's staves, used to derive real measure capacities
 */
const migrateChordTrack = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accepts unknown chord formats during migration
  chordTrack: any[] | undefined,
  timeSignature: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accepts unknown legacy staff formats during migration
  staves?: any[]
): ChordSymbol[] | undefined => {
  if (!chordTrack || chordTrack.length === 0) return chordTrack;

  // Already in new format if every chord carries a measure field. Checking every
  // chord (not just the first) makes a mixed/partial track migrate fully and
  // keeps repeated migration idempotent.
  const needsMigration = chordTrack.some((chord) => chord.measure === undefined);
  if (!needsMigration) return chordTrack;

  const nominal = TIME_SIGNATURES[timeSignature] || 64;
  const capacities = computeMeasureCapacities(staves, timeSignature);

  return chordTrack.map((chord) => {
    // A chord that already has a measure is left as-is (mixed-format safety).
    if (chord.measure !== undefined) {
      return { id: chord.id, measure: chord.measure, quant: chord.quant, symbol: chord.symbol };
    }

    const { measure, quant } = globalQuantToLocal(chord.quant, capacities, nominal);

    return {
      id: chord.id,
      measure,
      quant,
      symbol: chord.symbol,
    };
  });
};

/**
 * Migrates an old-format score to the new staves model
 * Also syncs top-level legacy fields (measures, keySignature, clef) back to staves[0]
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accepts unknown legacy score formats
export const migrateScore = (oldScore: any): Score => {
  // Idempotency fast-path: a score already stamped at the current schema version
  // (and already in the staves model) is fully migrated. Returning it verbatim
  // guarantees migrate(migrate(x)) deep-equals migrate(x).
  if (
    oldScore.schemaVersion === SCHEMA_VERSION &&
    oldScore.staves &&
    Array.isArray(oldScore.staves)
  ) {
    return oldScore as Score;
  }

  // If already in new format with staves
  if (oldScore.staves && Array.isArray(oldScore.staves)) {
    // Sync any top-level legacy fields back to staves[0]
    // This handles the case where code does: setScore({ ...score, measures: newMeasures })
    const result = { ...oldScore };

    // Stamp the current schema version (idempotent on re-migration).
    result.schemaVersion = SCHEMA_VERSION;

    // Ensure Score has keySignature
    if (!result.keySignature) {
      result.keySignature = result.staves[0]?.keySignature || 'C';
    }

    if (result.staves[0]) {
      const updatedStaff = { ...result.staves[0] };
      // If top-level measures exists and differs from staves[0].measures, use top-level
      if (oldScore.measures && oldScore.measures !== result.staves[0].measures) {
        updatedStaff.measures = oldScore.measures;
      }
      // If top-level keySignature exists and differs, use top-level
      if (oldScore.keySignature && oldScore.keySignature !== result.staves[0].keySignature) {
        updatedStaff.keySignature = oldScore.keySignature;
        result.keySignature = oldScore.keySignature; // Sync to Score
      }
      // If top-level clef exists and differs, use top-level
      if (oldScore.clef && oldScore.clef !== result.staves[0].clef) {
        updatedStaff.clef = oldScore.clef;
      }

      // Sync timeSignature from staff to score if score is missing it (common in imported melodies)
      if (!result.timeSignature && updatedStaff.timeSignature) {
        result.timeSignature = updatedStaff.timeSignature;
      }

      result.staves = [updatedStaff, ...result.staves.slice(1)];
    }

    // Migrate chord track from global quant to measure-local format. Accumulate
    // against the migrated staves so positions tile real measure boundaries.
    if (result.chordTrack) {
      result.chordTrack = migrateChordTrack(
        result.chordTrack,
        result.timeSignature || '4/4',
        result.staves
      );
    }

    return result as Score;
  }

  // Migrate legacy single-staff format (no staves array)
  const timeSig = oldScore.timeSignature || '4/4';
  const legacyStaves = [
    {
      id: 'staff-1',
      clef: oldScore.clef || 'treble',
      keySignature: oldScore.keySignature || 'C',
      measures: oldScore.measures || [
        { id: 'm1', events: [] },
        { id: 'm2', events: [] },
      ],
    },
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    title: oldScore.title || 'Composition',
    timeSignature: timeSig,
    keySignature: oldScore.keySignature || 'C',
    bpm: oldScore.bpm || 120,
    staves: legacyStaves,
    // Migrate chord track from global quant to measure-local format, accumulating
    // against the reconstructed single-staff measures.
    chordTrack: migrateChordTrack(oldScore.chordTrack, timeSig, legacyStaves),
  };
};

// ========== MELODY ==========

export interface Melody {
  id: string;
  title: string;
  score: Score;
}

// ========== SELECTION ==========

/**
 * Represents a note in the selection array.
 */
export interface SelectedNote {
  /** 0-based staff index */
  staffIndex: number;
  /** 0-based measure index (array index into staff.measures) */
  measureIndex: number;
  /** Event ID within the measure */
  eventId: string;
  /** Note ID within the event, or null for single-note events */
  noteId: string | null;
}

/**
 * Per-slice vertical anchors for vertical selection extension.
 * Set on first vertical extension, cleared when selection is modified.
 */
export interface VerticalAnchors {
  /** Direction of this vertical extension series */
  direction: 'up' | 'down';
  /** Map of global time (0-based measureIndex * 100000 + quant) to anchor note for that slice */
  sliceAnchors: Record<number, SelectedNote>;
  /** Snapshot of selection when vertical extension started */
  originSelection: SelectedNote[];
}

/**
 * Selection State for the editor.
 * All indices are 0-based (array indices).
 */
export interface Selection {
  /** 0-based staff index (0 for single staff, 0 or 1 for Grand Staff) */
  staffIndex: number;
  /** 0-based measure index (array index into staff.measures), or null if no selection */
  measureIndex: number | null;
  /** Event ID within the measure, or null if no selection */
  eventId: string | null;
  /** Note ID within the event (for chords), or null for single-note events */
  noteId: string | null;
  /** List of all selected notes (including the primary one above) */
  selectedNotes: SelectedNote[];
  /** The static "anchor" point for range selection */
  anchor?: SelectedNote | null;
  /** Per-slice anchors for vertical extension */
  verticalAnchors?: VerticalAnchors | null;

  /** Selected chord symbol ID (when chord track is focused). Default: null */
  chordId?: string | null;

  /** Whether chord track has focus. Default: false */
  chordTrackFocused?: boolean;
}

/**
 * Creates a default empty selection
 */
export const createDefaultSelection = (): Selection => ({
  staffIndex: 0,
  measureIndex: null,
  eventId: null,
  noteId: null,
  selectedNotes: [],
  anchor: null,
  verticalAnchors: null,
  chordId: null,
  chordTrackFocused: false,
});

// ========== PREVIEW NOTE (GHOST CURSOR) ==========

/**
 * Represents the ghost cursor state for note preview.
 * Used when navigating to empty space where a note could be placed.
 * All indices are 0-based (array indices).
 */
export interface PreviewNote {
  /** 0-based measure index (array index into staff.measures) */
  measureIndex: number;
  /** 0-based staff index */
  staffIndex: number;
  /** Position in quants within measure (0 = start of measure) */
  quant: number;
  /** Visual position (may differ from quant for display purposes) */
  visualQuant: number;
  /** Preview pitch (e.g., "C4") */
  pitch: string;
  /** Duration name ('quarter', 'half', etc.) */
  duration: string;
  /** Whether the preview note is dotted */
  dotted: boolean;
  /** Insertion mode: append at end, insert at position, or add to chord */
  mode: 'APPEND' | 'INSERT' | 'CHORD';
  /** 0-based event index where this would be inserted */
  index: number;
  /** Whether the preview is for a rest */
  isRest: boolean;
  /** How the ghost cursor was triggered */
  source?: 'keyboard' | 'mouse' | 'hover';
}

// ========== NAVIGATION RESULT TYPES ==========

/**
 * Audio feedback data for playing notes after navigation.
 */
export interface AudioFeedback {
  notes: Array<{ pitch: string; id?: string }>;
  duration: string;
  dotted: boolean;
}

/**
 * Partial selection used in navigation results.
 * Contains the core fields needed to update selection state.
 * All indices are 0-based (array indices).
 */
export interface NavigationSelection {
  /** 0-based staff index */
  staffIndex: number;
  /** 0-based measure index (array index), or null if not selecting a note */
  measureIndex: number | null;
  /** Event ID within the measure, or null */
  eventId: string | null;
  /** Note ID within the event, or null */
  noteId: string | null;
  /** Additional selected notes */
  selectedNotes?: Array<{
    /** 0-based staff index */
    staffIndex: number;
    /** 0-based measure index */
    measureIndex: number;
    /** Event ID within the measure */
    eventId: string;
    /** Note ID within the event, or null */
    noteId: string | null;
  }>;
  /** Anchor point for range selection */
  anchor?: {
    /** 0-based staff index */
    staffIndex: number;
    /** 0-based measure index */
    measureIndex: number;
    /** Event ID within the measure */
    eventId: string;
    /** Note ID within the event, or null */
    noteId: string | null;
  } | null;
}

/**
 * Result of horizontal navigation (left/right arrows).
 */
export interface HorizontalNavigationResult {
  selection: NavigationSelection;
  previewNote: PreviewNote | null;
  audio: AudioFeedback | null;
  shouldCreateMeasure: boolean;
}

/**
 * Result of vertical navigation (CMD+Up/Down).
 */
export interface VerticalNavigationResult {
  selection: NavigationSelection;
  previewNote: PreviewNote | null;
  /** If set, navigation should select this chord (move to chord track) */
  chordId?: string | null;
  /** If true, navigation is leaving the chord track (return to notes) */
  leavingChordTrack?: boolean;
}

/**
 * Result of transposition operations.
 */
export interface TranspositionResult {
  measures?: Measure[]; // Updated measures (for real note transposition)
  previewNote?: PreviewNote; // Updated preview (for ghost cursor transposition)
  audio: AudioFeedback | null;
}

// ========== RIFFSCORE CONFIG ==========

/**
 * Utility type for allowing partial nested objects
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Staff template options for score generation
 */
export type StaffTemplate = 'grand' | 'treble' | 'bass';

/**
 * Configuration interface for RiffScore component.
 * Supports two modes:
 * - Generator Mode: Pass `staff` + `measureCount` to create blank scores
 * - Render Mode: Pass `staves` array to load existing compositions
 */
/**
 * Configuration interface for RiffScore component.
 * Supports two modes:
 * - Generator Mode: Pass `staff` + `measureCount` to create blank scores
 * - Render Mode: Pass `staves` array to load existing compositions
 */
export interface RiffScoreConfig {
  ui: {
    showToolbar: boolean;
    scale: number;
    theme?: ThemeName;
    showBackground?: boolean; // Whether to show panel background (default: true)
    showScoreTitle?: boolean;
  };
  interaction: {
    isEnabled: boolean; // Master switch for all interactions
    enableKeyboard: boolean;
    enablePlayback: boolean;
  };
  score: {
    title: string;
    bpm: number;
    timeSignature: string;
    keySignature: string;

    // Generator Mode Options
    staff?: StaffTemplate;
    measureCount?: number;

    // Explicit Content (Overrides Generator Options)
    staves?: Staff[];
  };

  /** Chord track configuration */
  chord?: {
    /** Display notation preferences */
    display?: ChordDisplayConfig;

    /** Playback settings */
    playback?: ChordPlaybackConfig;
  };
}

/**
 * Default RiffScore configuration
 */
export const DEFAULT_RIFF_CONFIG: RiffScoreConfig = {
  ui: {
    showToolbar: true,
    scale: 0.75,
    showBackground: true,
    showScoreTitle: true,
  },
  interaction: {
    isEnabled: true,
    enableKeyboard: true,
    enablePlayback: true,
  },
  score: {
    title: 'Untitled',
    bpm: 120,
    timeSignature: '4/4',
    keySignature: 'C',
    staff: 'grand',
    measureCount: 4,
  },
  chord: {
    display: DEFAULT_CHORD_DISPLAY,
    playback: DEFAULT_CHORD_PLAYBACK,
  },
};
