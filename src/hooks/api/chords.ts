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
import { parseChord, getValidChordQuants, getQuantsPerMeasure } from '@/services/ChordService';
import { getNoteDuration } from '@/utils/core';
import { findChordById, findChordAtQuant, findChordIndex } from '@/utils/chord/queries';

/**
 * Chord method names provided by this factory
 */
export type ChordMethodNames =
  | 'addChord'
  | 'updateChord'
  | 'removeChord'
  | 'getChords'
  | 'getChord'
  | 'getChordAtQuant'
  | 'getValidChordQuants'
  | 'selectChord'
  | 'selectChordAtQuant'
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

    addChord(quant: number, symbol: string) {
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
          details: { symbol, quant },
        });
        return this;
      }

      // Validate quant position is valid (has note anchor)
      const validQuants = getValidChordQuants(score);
      if (!validQuants.has(quant)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addChord',
          message: `Invalid quant position ${quant}. Chords must be placed at note positions.`,
          code: 'INVALID_QUANT_POSITION',
          details: { quant, validQuants: Array.from(validQuants) },
        });
        return this;
      }

      // Check if chord already exists at this position
      const existingChord = findChordAtQuant(score.chordTrack, quant);
      const isReplacement = existingChord !== null;

      // Dispatch the command (handles both add and replace)
      dispatch(new AddChordCommand(quant, parseResult.symbol));

      // Get the newly added chord ID for selection
      const updatedScore = getScore();
      const newChord = findChordAtQuant(updatedScore.chordTrack, quant);

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
          ? `Replaced chord at quant ${quant} with ${parseResult.symbol}`
          : `Added chord ${parseResult.symbol} at quant ${quant}`,
        details: {
          symbol: parseResult.symbol,
          quant,
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
        message: `Removed chord ${chord.symbol} at quant ${chord.quant}`,
        details: { chordId, symbol: chord.symbol, quant: chord.quant },
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
          details: { chordId, symbol: chord.symbol, quant: chord.quant },
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

    getChordAtQuant(quant: number) {
      const chord = findChordAtQuant(getScore().chordTrack, quant);
      if (chord) {
        setResult({
          ok: true,
          status: 'info',
          method: 'getChordAtQuant',
          message: `Found chord ${chord.symbol} at quant ${quant}`,
          details: { quant, chordId: chord.id, symbol: chord.symbol },
        });
      } else {
        setResult({
          ok: true,
          status: 'info',
          method: 'getChordAtQuant',
          message: `No chord at quant ${quant}`,
          details: { quant },
        });
      }
      return chord;
    },

    getValidChordQuants() {
      const validQuants = getValidChordQuants(getScore());
      const quantArray = Array.from(validQuants).sort((a, b) => a - b);
      setResult({
        ok: true,
        status: 'info',
        method: 'getValidChordQuants',
        message: `Found ${quantArray.length} valid chord position(s)`,
        details: { count: quantArray.length },
      });
      return quantArray;
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
        details: { chordId, symbol: chord.symbol, quant: chord.quant },
      });

      return this;
    },

    selectChordAtQuant(quant: number) {
      const chord = findChordAtQuant(getScore().chordTrack, quant);
      if (!chord) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectChordAtQuant',
          message: `No chord at quant ${quant}`,
          code: 'NO_CHORD_AT_QUANT',
          details: { quant },
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
        method: 'selectChordAtQuant',
        message: `Selected chord ${chord.symbol} at quant ${quant}`,
        details: { quant, chordId: chord.id, symbol: chord.symbol },
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
          details: { chordId: chord.id, symbol: chord.symbol, quant: chord.quant },
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
        details: { chordId: nextChord.id, symbol: nextChord.symbol, quant: nextChord.quant },
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
        details: { chordId: prevChord.id, symbol: prevChord.symbol, quant: prevChord.quant },
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
        details: { chordId: firstChord.id, symbol: firstChord.symbol, quant: firstChord.quant },
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
        details: { chordId: lastChord.id, symbol: lastChord.symbol, quant: lastChord.quant },
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

      // Optionally select the note at the chord's quant position
      if (options?.selectNoteAtQuant && sel.chordId) {
        const chord = findChordById(score.chordTrack, sel.chordId);
        if (chord) {
          const quantsPerMeasure = getQuantsPerMeasure(score.timeSignature);
          const measureIndex = Math.floor(chord.quant / quantsPerMeasure);
          const localQuant = chord.quant % quantsPerMeasure;

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
        details: { deletedChordId: chord.id, symbol: chord.symbol, quant: chord.quant },
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
