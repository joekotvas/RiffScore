export interface Note {
  pitch: string | null; // null for rest notes
  tied?: boolean;
  id: string;
  accidental?: string | null;
  isRest?: boolean; // True for rest notes
}

export interface ScoreEvent {
  id: string;
  duration: string;
  dotted: boolean;
  notes: Note[];
  isRest?: boolean;
  x?: number;
  quant?: number;
  chordLayout?: ChordLayout;
  tuplet?: {
    ratio: [number, number];
    groupSize: number;
    position: number;
    baseDuration?: string;
    id?: string;
  };
}

export interface ChordLayout {
  sortedNotes: Note[];
  direction: 'up' | 'down';
  noteOffsets: Record<string, number>;
  maxNoteShift: number;
  minNoteShift?: number;
  minY: number;
  maxY: number;
}

export interface MeasureLayout {
  hitZones: HitZone[];
  eventPositions: Record<string, number>;
  totalWidth: number;
  processedEvents: ScoreEvent[];
}

export interface HitZone {
  startX: number;
  endX: number;
  index: number;
  type: 'APPEND' | 'INSERT' | 'EVENT';
  eventId?: string;
}

export interface BeamGroup {
  ids: string[];
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  direction: 'up' | 'down';
  type: string;
}

export interface TupletBracketGroup {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  direction: 'up' | 'down';
  number: number;
}

export interface HeaderLayout {
  keySigStartX: number;
  keySigVisualWidth: number;
  timeSigStartX: number;
  startOfMeasures: number;
}

// ========== SINGLE SOURCE OF TRUTH LAYOUT TYPES ==========

/**
 * Vertical bounds for layout elements.
 * Used by getY accessors to return top/bottom positions.
 */
export interface YBounds {
  top: number;
  bottom: number;
}

export interface NoteLayout {
  x: number;
  y: number;
  noteId: string;
  eventId: string;
  measureIndex: number;
  staffIndex: number;
  pitch: string | null;
  hitZone: HitZone; // Specific hit zone for this note
}

export interface EventLayout {
  x: number;
  y: number; // Base Y for the staff
  width: number;
  notes: Record<string, NoteLayout>; // noteId -> layout
  hitZones: HitZone[];
}

export interface MeasureLayoutV2 {
  x: number;
  y: number;
  width: number;
  events: Record<string, EventLayout>; // eventId -> layout
  beamGroups: BeamGroup[];
  tupletGroups: TupletBracketGroup[];
  // Keep compatibility with V1 layout for now?
  legacyLayout?: MeasureLayout;
}

export interface StaffLayout {
  y: number;
  index: number;
  measures: MeasureLayoutV2[];
}

export interface ScoreLayout {
  staves: StaffLayout[];
  // Flat maps for O(1) lookup during interaction
  // Key format: `${staffIndex}-${measureIndex}-${eventId}-${noteId}`
  notes: Record<string, NoteLayout>;
  // Key format: `${staffIndex}-${measureIndex}-${eventId}`
  events: Record<string, EventLayout>;

  /**
   * Get X coordinate for any quant position.
   * Single entry point for ALL positioned elements (chords, cursor, lyrics, dynamics).
   * Handles exact match lookup and interpolation fallback.
   */
  getX: (quant: number) => number;

  /**
   * Get Y coordinates for vertical positioning.
   * Forward-flow design: positions derive from elements above.
   * @see docs/migration/y-positioning-spec.md
   */
  getY: {
    /** Content region bounds (contains all systems) */
    content: YBounds;

    /** System bounds. Returns null for invalid index. Currently only system(0) is valid. */
    system: (index: number) => YBounds | null;

    /** Staff bounds. Returns null for invalid index. */
    staff: (index: number) => YBounds | null;

    /**
     * Note extent for collision avoidance.
     * - No arg: returns system-wide extent (memoized)
     * - With quant: returns extent at that position, falls back to system-wide
     */
    notes: (quant?: number) => YBounds;

    /** Pitch Y position (clef-aware). Returns null for invalid staff index. */
    pitch: (pitch: string, staffIndex: number) => number | null;
  };
}
