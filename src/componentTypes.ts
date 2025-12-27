import { Selection, Measure, PreviewNote } from './types';
import { HitZone, MeasureLayoutV2, EventLayout, ChordLayout } from './engines/layout/types';
import { NoteInput, PlacementOverride } from './hooks/note/useNoteEntry';

/**
 * Encapsulates all layout configuration required for a measure to render.
 * These are visual settings that do not change the musical content.
 */
export interface LayoutConfig {
  scale: number;
  baseY: number; // Base Y for the system (e.g. CONFIG.baseY)
  clef: string; // Current Clef ('treble', 'bass')
  keySignature: string; // Current Key Sig
  staffIndex: number; // Which staff this measure belongs to
  verticalOffset: number; // Vertical offset for hit detection mapping
  mouseLimits?: { min: number; max: number }; // Optional clamping range
}

/**
 * Encapsulates all user interaction state and callbacks.
 * This object can be passed down the tree to avoid prop drilling.
 */
export interface DragStartParams {
  measureIndex: number;
  eventId: string;
  noteId: string;
  startPitch: string;
  startY: number;
  isMulti?: boolean;
  isShift?: boolean;
  selectAllInEvent?: boolean;
  staffIndex?: number;
}

export interface InteractionState {
  // State
  selection: Selection;
  previewNote: PreviewNote | null; // Note preview data
  activeDuration: string;
  isDotted: boolean;
  modifierHeld: boolean;
  isDragging: boolean;
  lassoPreviewIds?: Set<string>; // Composite keys for O(1) lasso preview lookup

  // Actions
  onAddNote: (
    measureIndex: number,
    note: NoteInput,
    shouldAutoAdvance?: boolean,
    placementOverride?: PlacementOverride
  ) => void;
  onSelectNote: (
    measureIndex: number | null,
    eventId: string | null,
    noteId: string | null,
    staffIndex?: number,
    isMulti?: boolean,
    selectAllInEvent?: boolean,
    isShift?: boolean
  ) => void;
  onDragStart: (params: DragStartParams) => void;
  onHover: (
    measureIndex: number | null,
    hit: HitZone | null,
    pitch: string | null,
    staffIndex?: number
  ) => void;
}

/**
 * Standardized props for the Measure component.
 */
export interface MeasureProps {
  // 1. Identity & Data
  measureIndex: number;
  measureData: Measure; // { events, isPickup, id }

  // 2. Formatting (Positioning)
  startX: number;
  isLast: boolean;
  forcedWidth?: number; // For Grand Staff sync
  forcedEventPositions?: Record<number, number>;
  measureLayout?: MeasureLayoutV2;

  // 3. Contexts (Grouped)
  layout: LayoutConfig;
  interaction: InteractionState;
}

/**
 * Beam specification for connected eighth/sixteenth notes.
 * Note: direction is passed separately to calculateStemGeometry.
 */
export interface BeamSpec {
  startY: number;
  endY: number;
  startX: number;
  endX: number;
  direction: 'up' | 'down'; // Used by ChordGroup for stem direction
}

/**
 * Props for the ChordGroup component (renders a single musical event/chord)
 */
export interface ChordGroupProps {
  // Identity & Musical Data
  notes: Array<{ id: string; pitch: string | null; isRest?: boolean }>;
  duration: string;
  dotted: boolean;
  measureIndex: number;
  eventId: string;
  staffIndex: number;

  // Layout Data
  chordLayout: ChordLayout;
  eventLayout?: EventLayout;
  beamSpec?: BeamSpec | null;

  // Appearance & Options
  isGhost?: boolean;
  opacity?: number;
  renderStem?: boolean;
  x?: number;
  filterNote?: ((note: { id: string; pitch: string | null }) => boolean) | null;
  accidentalOverrides?: Record<string, string | null> | null;

  // Contexts
  layout: LayoutConfig;
  interaction: InteractionState;
  onNoteHover?: ((noteId: string | null) => void) | null;
}

/**
 * Handler functions passed to Note component
 */
export interface NoteHandlers {
  onMouseEnter: (id: string) => void;
  onMouseLeave: () => void;
  onMouseDown: (e: React.MouseEvent, note: { id: string; pitch: string | null }) => void;
  onDoubleClick: (e: React.MouseEvent, note: { id: string; pitch: string | null }) => void;
}

/**
 * Props for the Note component (renders a single note head with accessories)
 */
export interface NoteProps {
  // Note data
  note?: { id: string; pitch: string | null };
  pitch?: string | null; // Alternative to note.pitch for simpler use cases
  duration: string;
  dotted?: boolean;

  // Positioning
  x: number;
  y?: number; // Explicit Y from Layout Engine
  baseY: number;
  clef: string;
  xShift?: number;
  dotShift?: number;

  // Appearance
  isSelected?: boolean;
  isPreview?: boolean; // Lasso preview state
  isGhost?: boolean;
  accidentalGlyph?: string | null;
  color?: string | null;

  // Interaction handlers (optional for interactive notes)
  handlers?: NoteHandlers | null;
}
