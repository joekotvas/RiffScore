/**
 * Chord API Methods
 *
 * Factory for creating programmatic API methods for chord symbol
 * management, selection, and navigation. Used by the MusicEditorAPI.
 *
 * @see MusicEditorAPI
 */
import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import { ChordDisplayConfig, ChordPlaybackConfig } from '@/types';
import { AddChordCommand, UpdateChordCommand, RemoveChordCommand } from '@/commands/chord';
import { ChordPosition } from '@/commands/chord/AddChordCommand';
import { parseChord, getValidChordQuants, isValidChordPosition } from '@/services/ChordService';
import { getNoteDuration } from '@/utils/core';
import { findChordById, findChordAt, findChordIndex } from '@/utils/chord/queries';

/**
 * Chord method names provided by this factory
 */
export type ChordMethodNames =
  | 'addChord'
  | 'updateChord'
  | 'removeChord'
  | 'getChords'
  | 'getChord'
  | 'getChordAt'
  | 'getValidChordPositions'
  | 'selectChord'
  | 'selectChordAt'
  | 'deselectChord'
  | 'getSelectedChord'
  | 'hasChordSelection'
  | 'selectNextChord'
  | 'selectPrevChord'
  | 'selectFirstChord'
  | 'selectLastChord'
  | 'focusChordTrack'
  | 'blurChordTrack'
  | 'isChordTrackFocused'
  | 'deleteSelectedChord'
  | 'setChordDisplay'
  | 'getChordDisplay'
  | 'setChordPlayback'
  | 'getChordPlayback';

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory for creating Chord API methods.
 * Handles chord symbol CRUD, selection, and navigation.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for chords
 */
export const createChordMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, ChordMethodNames> & ThisType<MusicEditorAPI> => {
  const { getScore, getSelection, syncSelection, dispatch, setResult, config } = ctx;

  return {
    // ========================================================================
    // CRUD Operations
    // ========================================================================

    addChord(position: ChordPosition, symbol: string) {
      const score = getScore();
      const keySignature = score.keySignature;

      // Parse and validate the chord symbol
      const parseResult = parseChord(symbol, keySignature);
      if (!parseResult.ok) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addChord',
          message: parseResult.message,
          code: parseResult.code,
          details: { symbol, position },
        });
        return this;
      }

      // Validate position is valid (has note anchor)
      const validPositions = getValidChordQuants(score);
      if (!isValidChordPosition(validPositions, position.measure, position.quant)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addChord',
          message: `Invalid position { measure: ${position.measure}, quant: ${position.quant} }. Chords must be placed at note positions.`,
          code: 'INVALID_POSITION',
          details: { position },
        });
        return this;
      }

      // Check if chord already exists at this position
      const existingChord = findChordAt(score.chordTrack, position);
      const isReplacement = existingChord !== null;

      // Dispatch the command (handles both add and replace)
      dispatch(new AddChordCommand(position, parseResult.symbol));

      // Get the newly added chord ID for selection
      const updatedScore = getScore();
      const newChord = findChordAt(updatedScore.chordTrack, position);

      // Update selection to the new chord
      if (newChord) {
        const sel = getSelection();
        syncSelection({
          ...sel,
          chordId: newChord.id,
          chordTrackFocused: true,
        });
      }

      setResult({
        ok: true,
        status: isReplacement ? 'warning' : 'info',
        method: 'addChord',
        message: isReplacement
          ? `Replaced chord at { measure: ${position.measure}, quant: ${position.quant} } with ${parseResult.symbol}`
          : `Added chord ${parseResult.symbol} at { measure: ${position.measure}, quant: ${position.quant} }`,
        details: {
          symbol: parseResult.symbol,
          position,
          chordId: newChord?.id,
          replaced: isReplacement,
        },
      });

      return this;
    },

    updateChord(chordId: string, symbol: string) {
      const score = getScore();
      const chord = findChordById(score.chordTrack, chordId);

      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          method: 'updateChord',
          message: `Chord with ID ${chordId} not found`,
          code: 'CHORD_NOT_FOUND',
          details: { chordId },
        });
        return this;
      }

      // Parse and validate the new symbol
      const parseResult = parseChord(symbol, score.keySignature);
      if (!parseResult.ok) {
        setResult({
          ok: false,
          status: 'error',
          method: 'updateChord',
          message: parseResult.message,
          code: parseResult.code,
          details: { symbol, chordId },
        });
        return this;
      }

      dispatch(new UpdateChordCommand(chordId, { symbol: parseResult.symbol }));

      setResult({
        ok: true,
        status: 'info',
        method: 'updateChord',
        message: `Updated chord ${chordId} to ${parseResult.symbol}`,
        details: { chordId, symbol: parseResult.symbol, previousSymbol: chord.symbol },
      });

      return this;
    },

    removeChord(chordId: string) {
      const score = getScore();
      const chord = findChordById(score.chordTrack, chordId);

      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          method: 'removeChord',
          message: `Chord with ID ${chordId} not found`,
          code: 'CHORD_NOT_FOUND',
          details: { chordId },
        });
        return this;
      }

      dispatch(new RemoveChordCommand(chordId));

      // Clear chord selection if the removed chord was selected
      const sel = getSelection();
      if (sel.chordId === chordId) {
        syncSelection({
          ...sel,
          chordId: null,
        });
      }

      setResult({
        ok: true,
        status: 'info',
        method: 'removeChord',
        message: `Removed chord ${chord.symbol} at { measure: ${chord.measure}, quant: ${chord.quant} }`,
        details: { chordId, symbol: chord.symbol, measure: chord.measure, quant: chord.quant },
      });

      return this;
    },

    // ========================================================================
    // Query Operations
    // ========================================================================

    getChords() {
      const chordTrack = getScore().chordTrack ?? [];
      setResult({
        ok: true,
        status: 'info',
        method: 'getChords',
        message: `Retrieved ${chordTrack.length} chord(s)`,
        details: { count: chordTrack.length },
      });
      return chordTrack;
    },

    getChord(chordId: string) {
      const chord = findChordById(getScore().chordTrack, chordId);
      if (chord) {
        setResult({
          ok: true,
          status: 'info',
          method: 'getChord',
          message: `Found chord ${chord.symbol}`,
          details: { chordId, symbol: chord.symbol, measure: chord.measure, quant: chord.quant },
        });
      } else {
        setResult({
          ok: false,
          status: 'error',
          method: 'getChord',
          message: `Chord with ID ${chordId} not found`,
          code: 'CHORD_NOT_FOUND',
          details: { chordId },
        });
      }
      return chord;
    },

    getChordAt(position: ChordPosition) {
      const chord = findChordAt(getScore().chordTrack, position);
      if (chord) {
        setResult({
          ok: true,
          status: 'info',
          method: 'getChordAt',
          message: `Found chord ${chord.symbol} at { measure: ${position.measure}, quant: ${position.quant} }`,
          details: { position, chordId: chord.id, symbol: chord.symbol },
        });
      } else {
        setResult({
          ok: true,
          status: 'info',
          method: 'getChordAt',
          message: `No chord at { measure: ${position.measure}, quant: ${position.quant} }`,
          details: { position },
        });
      }
      return chord;
    },

    getValidChordPositions() {
      const validPositions = getValidChordQuants(getScore());
      // Count total positions for logging
      let count = 0;
      for (const quants of validPositions.values()) {
        count += quants.size;
      }
      setResult({
        ok: true,
        status: 'info',
        method: 'getValidChordPositions',
        message: `Found ${count} valid chord position(s) in ${validPositions.size} measure(s)`,
        details: { count, measureCount: validPositions.size },
      });
      return validPositions;
    },

    // ========================================================================
    // Selection Operations
    // ========================================================================

    selectChord(chordId: string) {
      const chord = findChordById(getScore().chordTrack, chordId);
      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectChord',
          message: `Chord with ID ${chordId} not found`,
          code: 'CHORD_NOT_FOUND',
          details: { chordId },
        });
        return this;
      }

      const sel = getSelection();
      syncSelection({
        ...sel,
        chordId,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'selectChord',
        message: `Selected chord ${chord.symbol}`,
        details: { chordId, symbol: chord.symbol, measure: chord.measure, quant: chord.quant },
      });

      return this;
    },

    selectChordAt(position: ChordPosition) {
      const chord = findChordAt(getScore().chordTrack, position);
      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectChordAt',
          message: `No chord at { measure: ${position.measure}, quant: ${position.quant} }`,
          code: 'NO_CHORD_AT_POSITION',
          details: { position },
        });
        return this;
      }

      const sel = getSelection();
      syncSelection({
        ...sel,
        chordId: chord.id,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'selectChordAt',
        message: `Selected chord ${chord.symbol} at { measure: ${position.measure}, quant: ${position.quant} }`,
        details: { position, chordId: chord.id, symbol: chord.symbol },
      });

      return this;
    },

    deselectChord() {
      const sel = getSelection();
      if (!sel.chordId) {
        setResult({
          ok: true,
          status: 'info',
          method: 'deselectChord',
          message: 'No chord was selected',
        });
        return this;
      }

      syncSelection({
        ...sel,
        chordId: null,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'deselectChord',
        message: 'Chord deselected',
      });

      return this;
    },

    getSelectedChord() {
      const sel = getSelection();
      if (!sel.chordId) {
        setResult({
          ok: true,
          status: 'info',
          method: 'getSelectedChord',
          message: 'No chord selected',
        });
        return null;
      }

      const chord = findChordById(getScore().chordTrack, sel.chordId);
      if (chord) {
        setResult({
          ok: true,
          status: 'info',
          method: 'getSelectedChord',
          message: `Selected chord: ${chord.symbol}`,
          details: { chordId: chord.id, symbol: chord.symbol, measure: chord.measure, quant: chord.quant },
        });
      } else {
        setResult({
          ok: true,
          status: 'warning',
          method: 'getSelectedChord',
          message: 'Selected chord no longer exists',
          code: 'STALE_SELECTION',
        });
      }
      return chord;
    },

    hasChordSelection() {
      const sel = getSelection();
      const hasSelection = sel.chordId !== null && sel.chordId !== undefined;
      setResult({
        ok: true,
        status: 'info',
        method: 'hasChordSelection',
        message: hasSelection ? 'Chord is selected' : 'No chord selected',
        details: { hasSelection },
      });
      return hasSelection;
    },

    // ========================================================================
    // Navigation Operations
    // ========================================================================

    selectNextChord() {
      const score = getScore();
      const chordTrack = score.chordTrack ?? [];

      if (chordTrack.length === 0) {
        setResult({
          ok: true,
          status: 'warning',
          method: 'selectNextChord',
          message: 'No chords in track',
          code: 'EMPTY_CHORD_TRACK',
        });
        return this;
      }

      const sel = getSelection();
      const currentIndex = sel.chordId ? findChordIndex(chordTrack, sel.chordId) : -1;
      const nextIndex = currentIndex + 1;

      if (nextIndex >= chordTrack.length) {
        setResult({
          ok: true,
          status: 'info',
          method: 'selectNextChord',
          message: 'Already at last chord',
          code: 'BOUNDARY_REACHED',
        });
        return this;
      }

      const nextChord = chordTrack[nextIndex];
      syncSelection({
        ...sel,
        chordId: nextChord.id,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'selectNextChord',
        message: `Selected next chord: ${nextChord.symbol}`,
        details: { chordId: nextChord.id, symbol: nextChord.symbol, measure: nextChord.measure, quant: nextChord.quant },
      });

      return this;
    },

    selectPrevChord() {
      const score = getScore();
      const chordTrack = score.chordTrack ?? [];

      if (chordTrack.length === 0) {
        setResult({
          ok: true,
          status: 'warning',
          method: 'selectPrevChord',
          message: 'No chords in track',
          code: 'EMPTY_CHORD_TRACK',
        });
        return this;
      }

      const sel = getSelection();
      const currentIndex = sel.chordId
        ? findChordIndex(chordTrack, sel.chordId)
        : chordTrack.length;
      const prevIndex = currentIndex - 1;

      if (prevIndex < 0) {
        setResult({
          ok: true,
          status: 'info',
          method: 'selectPrevChord',
          message: 'Already at first chord',
          code: 'BOUNDARY_REACHED',
        });
        return this;
      }

      const prevChord = chordTrack[prevIndex];
      syncSelection({
        ...sel,
        chordId: prevChord.id,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'selectPrevChord',
        message: `Selected previous chord: ${prevChord.symbol}`,
        details: { chordId: prevChord.id, symbol: prevChord.symbol, measure: prevChord.measure, quant: prevChord.quant },
      });

      return this;
    },

    selectFirstChord() {
      const chordTrack = getScore().chordTrack ?? [];

      if (chordTrack.length === 0) {
        setResult({
          ok: true,
          status: 'warning',
          method: 'selectFirstChord',
          message: 'No chords in track',
          code: 'EMPTY_CHORD_TRACK',
        });
        return this;
      }

      const firstChord = chordTrack[0];
      const sel = getSelection();
      syncSelection({
        ...sel,
        chordId: firstChord.id,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'selectFirstChord',
        message: `Selected first chord: ${firstChord.symbol}`,
        details: { chordId: firstChord.id, symbol: firstChord.symbol, measure: firstChord.measure, quant: firstChord.quant },
      });

      return this;
    },

    selectLastChord() {
      const chordTrack = getScore().chordTrack ?? [];

      if (chordTrack.length === 0) {
        setResult({
          ok: true,
          status: 'warning',
          method: 'selectLastChord',
          message: 'No chords in track',
          code: 'EMPTY_CHORD_TRACK',
        });
        return this;
      }

      const lastChord = chordTrack[chordTrack.length - 1];
      const sel = getSelection();
      syncSelection({
        ...sel,
        chordId: lastChord.id,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'selectLastChord',
        message: `Selected last chord: ${lastChord.symbol}`,
        details: { chordId: lastChord.id, symbol: lastChord.symbol, measure: lastChord.measure, quant: lastChord.quant },
      });

      return this;
    },

    // ========================================================================
    // Focus Operations
    // ========================================================================

    focusChordTrack() {
      const sel = getSelection();
      if (sel.chordTrackFocused) {
        setResult({
          ok: true,
          status: 'info',
          method: 'focusChordTrack',
          message: 'Chord track already focused',
        });
        return this;
      }

      syncSelection({
        ...sel,
        chordTrackFocused: true,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'focusChordTrack',
        message: 'Chord track focused',
      });

      return this;
    },

    blurChordTrack(options?: { selectNoteAtQuant?: boolean }) {
      const sel = getSelection();
      const score = getScore();

      if (!sel.chordTrackFocused) {
        setResult({
          ok: true,
          status: 'info',
          method: 'blurChordTrack',
          message: 'Chord track already unfocused',
        });
        return this;
      }

      let newSelection = {
        ...sel,
        chordTrackFocused: false,
      };

      // Optionally select the note at the chord's position
      if (options?.selectNoteAtQuant && sel.chordId) {
        const chord = findChordById(score.chordTrack, sel.chordId);
        if (chord) {
          const measureIndex = chord.measure;
          const localQuant = chord.quant;

          // Find event at this quant in first staff
          const staff = score.staves[0];
          if (staff?.measures[measureIndex]) {
            const measure = staff.measures[measureIndex];
            let currentQuant = 0;
            for (const event of measure.events) {
              if (currentQuant === localQuant && !event.isRest) {
                newSelection = {
                  ...newSelection,
                  staffIndex: 0,
                  measureIndex,
                  eventId: event.id,
                  noteId: event.notes?.[0]?.id ?? null,
                  selectedNotes: event.notes?.[0]
                    ? [
                        {
                          staffIndex: 0,
                          measureIndex,
                          eventId: event.id,
                          noteId: event.notes[0].id,
                        },
                      ]
                    : [],
                };
                break;
              }
              currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
            }
          }
        }
      }

      syncSelection(newSelection);

      setResult({
        ok: true,
        status: 'info',
        method: 'blurChordTrack',
        message: options?.selectNoteAtQuant
          ? 'Chord track unfocused, selected note at quant'
          : 'Chord track unfocused',
        details: { selectNoteAtQuant: options?.selectNoteAtQuant },
      });

      return this;
    },

    isChordTrackFocused() {
      const isFocused = getSelection().chordTrackFocused ?? false;
      setResult({
        ok: true,
        status: 'info',
        method: 'isChordTrackFocused',
        message: isFocused ? 'Chord track is focused' : 'Chord track is not focused',
        details: { isFocused },
      });
      return isFocused;
    },

    // ========================================================================
    // Delete Selected Operation
    // ========================================================================

    deleteSelectedChord() {
      const sel = getSelection();
      if (!sel.chordId) {
        setResult({
          ok: false,
          status: 'error',
          method: 'deleteSelectedChord',
          message: 'No chord selected',
          code: 'NO_SELECTION',
        });
        return this;
      }

      const chord = findChordById(getScore().chordTrack, sel.chordId);
      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          method: 'deleteSelectedChord',
          message: 'Selected chord no longer exists',
          code: 'CHORD_NOT_FOUND',
        });
        return this;
      }

      const chordTrack = getScore().chordTrack ?? [];
      const currentIndex = findChordIndex(chordTrack, sel.chordId);

      // Dispatch remove command
      dispatch(new RemoveChordCommand(sel.chordId));

      // Select next chord, or previous if at end, or null if none left
      const updatedChordTrack = getScore().chordTrack ?? [];
      let newChordId: string | null = null;

      if (updatedChordTrack.length > 0) {
        if (currentIndex < updatedChordTrack.length) {
          newChordId = updatedChordTrack[currentIndex].id;
        } else if (updatedChordTrack.length > 0) {
          newChordId = updatedChordTrack[updatedChordTrack.length - 1].id;
        }
      }

      syncSelection({
        ...sel,
        chordId: newChordId,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'deleteSelectedChord',
        message: `Deleted chord ${chord.symbol}`,
        details: { deletedChordId: chord.id, symbol: chord.symbol, measure: chord.measure, quant: chord.quant },
      });

      return this;
    },

    // ========================================================================
    // Display & Playback Configuration
    // ========================================================================

    setChordDisplay(displayConfig: Partial<ChordDisplayConfig>) {
      // TODO: Wire to config state management when available
      // For now, explicitly return NOT_IMPLEMENTED to be clear this is a stub
      setResult({
        ok: false,
        status: 'warning',
        method: 'setChordDisplay',
        message: 'setChordDisplay is not yet implemented - config state integration required',
        code: 'NOT_IMPLEMENTED',
        details: { displayConfig },
      });
      return this;
    },

    getChordDisplay() {
      const display = config.chord?.display ?? {
        notation: 'letter' as const,
        useSymbols: false,
      };
      setResult({
        ok: true,
        status: 'info',
        method: 'getChordDisplay',
        message: `Chord display: ${display.notation}, symbols: ${display.useSymbols}`,
        details: { display },
      });
      return display;
    },

    setChordPlayback(playbackConfig: Partial<ChordPlaybackConfig>) {
      // TODO: Wire to config state management when available
      // For now, explicitly return NOT_IMPLEMENTED to be clear this is a stub
      setResult({
        ok: false,
        status: 'warning',
        method: 'setChordPlayback',
        message: 'setChordPlayback is not yet implemented - config state integration required',
        code: 'NOT_IMPLEMENTED',
        details: { playbackConfig },
      });
      return this;
    },

    getChordPlayback() {
      const playback = config.chord?.playback ?? {
        enabled: true,
        velocity: 50,
      };
      setResult({
        ok: true,
        status: 'info',
        method: 'getChordPlayback',
        message: `Chord playback: ${playback.enabled ? 'enabled' : 'disabled'}, velocity: ${playback.velocity}`,
        details: { playback },
      });
      return playback;
    },
  };
};
