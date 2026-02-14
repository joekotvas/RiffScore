/**
 * Machine-Addressable API Type Definitions
 *
 * This file defines the public contract for external script control.
 * Kept separate from data model types for clarity and maintainability.
 *
 * @see docs/migration/api_reference_draft.md
 */

import type {
  Score,
  ScoreEvent,
  Selection,
  RiffScoreConfig,
  ChordSymbol,
  ChordDisplayConfig,
  ChordPlaybackConfig,
} from './types';

// ========== UTILITY TYPES ==========

/** Unsubscribe function returned by event subscriptions */
export type Unsubscribe = () => void;

/** Supported API event types */
export type APIEventType = 'score' | 'selection' | 'playback' | 'batch' | 'operation' | 'error';

/**
 * Payload for 'batch' events, providing a digest of composite operations.
 */
export interface BatchEventPayload {
  type: 'batch';
  label?: string;
  timestamp: number;
  commands: { type: string; summary?: string }[];
  affectedMeasures: number[];
}

/**
 * Result of a single API operation.
 */
export interface Result {
  /** True when status is 'info' or 'warning' (false for 'error') */
  ok: boolean;
  /** 'info' = success, 'warning' = success w/ caveat, 'error' = failure */
  status: 'info' | 'warning' | 'error';
  /** Name of the method that produced this result */
  method: string;
  /** Human-readable message */
  message: string;
  /** Timestamp of the operation */
  timestamp: number;
  /** Optional machine-readable error/status code */
  code?: string;
  /** Additional context (counts, measures affected, etc.) */
  details?: Record<string, unknown>;
}

/**
 * Result of a batch collection.
 */
export interface BatchResult {
  /** True if all operations were warning/info (no errors) */
  ok: boolean;
  /** All captured results */
  results: Result[];
  /** Subset of results with status='warning' */
  warnings: Result[];
  /** Subset of results with status='error' */
  errors: Result[];
}

// ========== REGISTRY ==========

/**
 * Global registry for multiple RiffScore instances.
 * Access via `window.riffScore`.
 */
export interface RiffScoreRegistry {
  instances: Map<string, MusicEditorAPI>;
  get(id: string): MusicEditorAPI | undefined;
  active: MusicEditorAPI | null;
}

// ========== MUSIC EDITOR API ==========

/**
 * Machine-Addressable API for external script control.
 * All mutation/navigation methods return `this` for chaining.
 *
 * @example
 * ```typescript
 * window.riffScore.active
 *   .select(1)
 *   .addNote('C4', 'quarter')
 *   .move('right')
 *   .addNote('D4');
 * ```
 */
export interface MusicEditorAPI {
  // --- Navigation ---
  /**
   * Move cursor in the specified direction.
   * @status implemented
   */
  move(direction: 'left' | 'right' | 'up' | 'down'): this;
  /**
   * Jump to a specific position in the score.
   * @status implemented
   */
  jump(target: 'start-score' | 'end-score' | 'start-measure' | 'end-measure'): this;
  /**
   * Select an event by measure number (1-based) and optional indices.
   * @status implemented
   */
  select(measureNum: number, staffIndex?: number, eventIndex?: number, noteIndex?: number): this;
  /**
   * Select by rhythmic position within a measure.
   * @status implemented
   */
  selectAtQuant(measureNum: number, quant: number, staffIndex?: number): this;
  /**
   * Select by internal event/note IDs.
   * @status implemented
   */
  selectById(eventId: string, noteId?: string): this;

  // --- Feedback & Status ---
  /**
   * Result of the last operation.
   * @status implemented
   */
  readonly result: Result;
  /**
   * True if the last operation succeeded (info or warning).
   * @status implemented
   */
  readonly ok: boolean;
  /**
   * True if ANY error has occurred since the last clearStatus().
   * @status implemented
   */
  readonly hasError: boolean;
  /**
   * Clear the sticky error state and reset result to generic success.
   * @status implemented
   */
  clearStatus(): this;
  /**
   * Enable/disable verbose debug logging to console.
   * @status implemented
   */
  debug(enabled: boolean): this;
  /**
   * Collect results from a batch of operations without affecting global state history.
   * Useful for validating chains or "dry runs".
   * @status implemented
   */
  collect(callback: (api: MusicEditorAPI) => void): BatchResult;

  // --- Selection (Multi-Select) ---
  /**
   * Add an event to the current selection (Cmd+Click toggle behavior).
   * @status implemented
   */
  addToSelection(
    measureNum: number,
    staffIndex: number,
    eventIndex: number,
    noteIndex?: number
  ): this;
  /**
   * Extend selection from anchor to target (Shift+Click range behavior).
   * @status implemented
   */
  selectRangeTo(
    measureNum: number,
    staffIndex: number,
    eventIndex: number,
    noteIndex?: number
  ): this;
  /**
   * Select all events in the specified scope.
   * @status implemented
   */
  selectAll(scope?: 'score' | 'measure' | 'staff' | 'event'): this;
  /**
   * Select all notes in an event (chord).
   * @status implemented
   */
  selectEvent(measureNum?: number, staffIndex?: number, eventIndex?: number): this;
  /**
   * Clear all selections.
   * @status implemented
   */
  deselectAll(): this;
  /**
   * Select all notes in all touched events (fill partial chords).
   * @status implemented
   */
  selectFullEvents(): this;
  /**
   * Extend selection vertically to staff above (anchor-based).
   * @status implemented
   */
  extendSelectionUp(): this;
  /**
   * Extend selection vertically to staff below (anchor-based).
   * @status implemented
   */
  extendSelectionDown(): this;
  /**
   * Extend selection vertically to all staves.
   * @status implemented
   */
  extendSelectionAllStaves(): this;

  // --- Entry (Create) ---
  /**
   * Add a note at the cursor position.
   * @status implemented
   */
  addNote(
    pitch: string,
    duration?: string,
    dotted?: boolean,
    options?: { mode?: 'overwrite' | 'insert' }
  ): this;

  /**
   * Adds a rest at the current cursor position.
   *
   * @param duration - Duration of the rest (default: 'quarter')
   * @param dotted - Whether the rest is dotted (default: false)
   * @param options - Entry options
   */
  addRest(duration?: string, dotted?: boolean, options?: { mode?: 'overwrite' | 'insert' }): this;
  /**
   * Add a pitch to the current chord.
   * @status implemented
   */
  addTone(pitch: string): this;
  /**
   * Convert selected notes to a tuplet.
   * @status implemented
   */
  makeTuplet(numNotes: number, inSpaceOf: number): this;
  /**
   * Remove tuplet grouping from selected notes.
   * @status implemented
   */
  unmakeTuplet(): this;
  /**
   * Toggle tie on the selected note.
   * @status implemented
   */
  toggleTie(): this;
  /**
   * Set tie state explicitly.
   * @status implemented
   */
  setTie(tied: boolean): this;
  /**
   * Set input mode for next entry.
   * @status implemented
   */
  setInputMode(mode: 'note' | 'rest'): this;

  // --- Modification (Update) ---
  /**
   * Update pitch of selected note(s).
   * @status implemented
   */
  setPitch(pitch: string): this;
  /**
   * Update duration of selected event(s).
   * @status implemented
   */
  setDuration(duration: string, dotted?: boolean): this;
  /**
   * Set accidental on selected note(s).
   * @status implemented
   */
  setAccidental(type: 'sharp' | 'flat' | 'natural' | null): this;
  /**
   * Cycle through accidental states.
   * @status implemented
   */
  toggleAccidental(): this;
  /**
   * Transpose selected notes by semitones (chromatic).
   * @status implemented
   */
  transpose(semitones: number): this;
  /**
   * Transpose selected notes by scale degrees (diatonic).
   * @status implemented
   */
  transposeDiatonic(steps: number): this;
  /**
   * Generic event update (escape hatch).
   * @status implemented
   */
  updateEvent(props: Partial<ScoreEvent>): this;

  // --- Structure ---
  /**
   * Add a measure at the specified index (default: end).
   * @status implemented
   */
  addMeasure(atIndex?: number): this;
  /**
   * Delete a measure by index (default: selected).
   * @status implemented
   */
  deleteMeasure(measureIndex?: number): this;
  /**
   * Delete selected events intelligently.
   * @status implemented
   */
  deleteSelected(): this;
  /**
   * Change the key signature.
   * @status implemented
   */
  setKeySignature(key: string): this;
  /**
   * Change the time signature.
   * @status implemented
   */
  setTimeSignature(sig: string): this;
  /**
   * Mark/unmark a measure as pickup.
   * @status implemented
   */
  setMeasurePickup(isPickup: boolean): this;

  // --- Configuration ---
  /**
   * Change the clef.
   * @status implemented
   */
  setClef(clef: 'treble' | 'bass' | 'alto' | 'tenor' | 'grand'): this;
  /**
   * Update the score title.
   * @status implemented
   */
  setScoreTitle(title: string): this;
  /**
   * Set the tempo in BPM.
   * @status implemented
   */
  setBpm(bpm: number): this;
  /**
   * Change the visual theme.
   * @status implemented
   */
  setTheme(theme: string): this;
  /**
   * Set the zoom scale.
   * @status implemented
   */
  setScale(scale: number): this;
  /**
   * Switch between grand and single staff layouts.
   * @status implemented
   */
  setStaffLayout(type: 'grand' | 'single'): this;

  // --- Lifecycle & IO ---
  /**
   * Load or replace the current score.
   * @status implemented
   */
  loadScore(score: Score): this;
  /**
   * Reset to a blank score.
   * @status implemented
   */
  reset(template?: 'grand' | 'treble' | 'bass', measures?: number): this;
  /**
   * Export the score in the specified format.
   * @status implemented
   */
  export(format: 'json' | 'abc' | 'musicxml'): string;

  // --- Playback ---
  /**
   * Start playback from specified position (or current/beginning).
   * @param startMeasure - Optional measure index to start from
   * @param startQuant - Optional quant position within measure
   * @status implemented
   */
  play(startMeasure?: number, startQuant?: number): Promise<this>;
  /**
   * Pause playback (retains position for resume).
   * @status implemented
   */
  pause(): this;
  /**
   * Stop playback and reset to beginning.
   * @status implemented
   */
  stop(): this;
  /**
   * Jump playback to a specific measure.
   * @status implemented
   */
  rewind(measureNum?: number): this;
  /**
   * Change the playback instrument.
   * @param instrumentId - One of: 'bright', 'mellow', 'organ', 'piano'
   * @status implemented
   */
  setInstrument(instrumentId: string): this;

  // --- Data (Queries) ---
  /**
   * Get the current score state (read-only).
   * @status implemented
   */
  getScore(): Score;
  /**
   * Get the current configuration.
   * @status implemented
   */
  getConfig(): RiffScoreConfig;
  /**
   * Get the current selection state.
   * @status implemented
   */
  getSelection(): Selection;

  // --- History & Clipboard ---
  /**
   * Undo the last mutation.
   * @status implemented
   */
  undo(): this;
  /**
   * Redo the last undone mutation.
   * @status implemented
   */
  redo(): this;
  /**
   * Begin a transaction (batch mutations).
   * @status implemented
   */
  beginTransaction(): this;
  /**
   * Commit the transaction with optional label.
   * Note: label parameter is not yet used by the history system.
   * @status implemented
   */
  commitTransaction(label?: string): this;
  /**
   * Rollback the current transaction.
   * @status implemented
   */
  rollbackTransaction(): this;
  /**
   * Copy selected events to clipboard.
   * @status stub
   */
  copy(): this;
  /**
   * Cut selected events to clipboard.
   * @status stub
   */
  cut(): this;
  /**
   * Paste from clipboard at cursor.
   * @status stub
   */
  paste(): this;

  // --- Events ---
  /**
   * Subscribe to state changes.
   * @status implemented
   * @returns Unsubscribe function
   */
  on(event: 'score', callback: (state: Score) => void): Unsubscribe;
  on(event: 'selection', callback: (state: Selection) => void): Unsubscribe;
  on(event: 'playback', callback: (state: unknown) => void): Unsubscribe;
  on(event: 'operation', callback: (result: Result) => void): Unsubscribe;
  on(event: 'error', callback: (result: Result) => void): Unsubscribe;
  on(event: 'batch', callback: (payload: BatchEventPayload) => void): Unsubscribe;
  on(event: APIEventType, callback: (state: unknown) => void): Unsubscribe;

  // --- Chord CRUD Operations ---
  /**
   * Add a chord symbol at the specified position.
   * @param position - Position as { measure, quant }
   * @param symbol - Chord symbol string (e.g., 'Cmaj7', 'Dm', 'G7')
   * @status implemented
   */
  addChord(position: { measure: number; quant: number }, symbol: string): this;
  /**
   * Update an existing chord symbol.
   * @param chordId - ID of the chord to update
   * @param symbol - New chord symbol string
   * @status implemented
   */
  updateChord(chordId: string, symbol: string): this;
  /**
   * Remove a chord symbol by ID.
   * @param chordId - ID of the chord to remove
   * @status implemented
   */
  removeChord(chordId: string): this;
  /**
   * Get all chord symbols in the score.
   * @returns Array of chord symbols sorted by position ascending
   * @status implemented
   */
  getChords(): ChordSymbol[];
  /**
   * Get a specific chord by ID.
   * @param chordId - ID of the chord to retrieve
   * @returns The chord symbol or null if not found
   * @status implemented
   */
  getChord(chordId: string): ChordSymbol | null;
  /**
   * Get the chord at a specific position.
   * @param position - Position as { measure, quant }
   * @returns The chord at that position or null if none exists
   * @status implemented
   */
  getChordAt(position: { measure: number; quant: number }): ChordSymbol | null;
  /**
   * Get all valid positions where chords can be placed.
   * @returns Map of measure index to set of valid local quants
   * @status implemented
   */
  getValidChordPositions(): Map<number, Set<number>>;

  // --- Chord Selection ---
  /**
   * Select a chord by ID.
   * @param chordId - ID of the chord to select
   * @status implemented
   */
  selectChord(chordId: string): this;
  /**
   * Select the chord at a specific position.
   * @param position - Position as { measure, quant }
   * @status implemented
   */
  selectChordAt(position: { measure: number; quant: number }): this;
  /**
   * Deselect the currently selected chord.
   * @status implemented
   */
  deselectChord(): this;
  /**
   * Get the currently selected chord.
   * @returns The selected chord or null if none selected
   * @status implemented
   */
  getSelectedChord(): ChordSymbol | null;
  /**
   * Check if a chord is currently selected.
   * @returns True if a chord is selected
   * @status implemented
   */
  hasChordSelection(): boolean;

  // --- Chord Navigation ---
  /**
   * Select the next chord in sequence.
   * @status implemented
   */
  selectNextChord(): this;
  /**
   * Select the previous chord in sequence.
   * @status implemented
   */
  selectPrevChord(): this;
  /**
   * Select the first chord in the score.
   * @status implemented
   */
  selectFirstChord(): this;
  /**
   * Select the last chord in the score.
   * @status implemented
   */
  selectLastChord(): this;
  /**
   * Focus the chord track for keyboard input.
   * @status implemented
   */
  focusChordTrack(): this;
  /**
   * Blur the chord track, optionally selecting a note at the current quant.
   * @param options - Optional configuration
   * @param options.selectNoteAtQuant - If true, select the note at the chord's quant position
   * @status implemented
   */
  blurChordTrack(options?: { selectNoteAtQuant?: boolean }): this;
  /**
   * Check if the chord track is currently focused.
   * @returns True if the chord track has focus
   * @status implemented
   */
  isChordTrackFocused(): boolean;

  // --- Chord Editing ---
  /**
   * Delete the currently selected chord.
   * @status implemented
   */
  deleteSelectedChord(): this;

  // --- Chord Configuration ---
  /**
   * Set chord display configuration.
   * @param config - Partial display configuration to merge
   * @status stub
   */
  setChordDisplay(config: Partial<ChordDisplayConfig>): this;
  /**
   * Get the current chord display configuration.
   * @returns Current display configuration
   * @status implemented
   */
  getChordDisplay(): ChordDisplayConfig;
  /**
   * Set chord playback configuration.
   * @param config - Partial playback configuration to merge
   * @status stub
   */
  setChordPlayback(config: Partial<ChordPlaybackConfig>): this;
  /**
   * Get the current chord playback configuration.
   * @returns Current playback configuration
   * @status implemented
   */
  getChordPlayback(): ChordPlaybackConfig;
}
