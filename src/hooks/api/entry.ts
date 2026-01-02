/**
 * Entry API Methods
 *
 * Factory for creating programmatic API methods for note/rest creation,
 * tuplets, and ties. Used by the MusicEditorAPI.
 *
 * @see MusicEditorAPI
 */
import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import { Measure } from '@/types';
import { AddEventCommand } from '@/commands/AddEventCommand';
import { AddNoteToEventCommand } from '@/commands/AddNoteToEventCommand';
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';
import { ApplyTupletCommand } from '@/commands/TupletCommands';
import { RemoveTupletCommand } from '@/commands/RemoveTupletCommand';
import { UpdateNoteCommand } from '@/commands/UpdateNoteCommand';
import { AddMeasureCommand } from '@/commands/MeasureCommands';
import { isValidPitch } from '@/utils/validation';
import { noteId, eventId as createEventId } from '@/utils/id';
import { createNotePayload } from '@/utils/entry';
import {
  calculateInsertionQuant,
  getRemainingCapacity,
  getOverwritePlan,
  createRestsForRange,
} from '@/utils/entry/insertion';
import { getBreakdownOfQuants, getNoteDuration } from '@/utils/core';

/**
 * Entry method names provided by this factory
 */
type EntryMethodNames =
  | 'addNote'
  | 'addRest'
  | 'addTone'
  | 'makeTuplet'
  | 'unmakeTuplet'
  | 'toggleTie'
  | 'setTie'
  | 'setInputMode';

// ============================================================================
// Internal Types
// ============================================================================

interface InsertEventConfig {
  isRest: boolean;
  pitch: string | null;
  duration: string;
  dotted: boolean;
  mode: 'overwrite' | 'insert';
}

interface InsertionLoopState {
  currentDuration: string;
  currentDotted: boolean;
  warnings: string[];
  info: string[];
  /** When true, next iteration should start at quant 0 (not append) */
  isOverflowContinuation: boolean;
}

// ============================================================================
// Core Insertion Logic (DRY - shared by addNote and addRest)
// ============================================================================

/**
 * Computes the start quant for insertion based on current selection.
 * FIX: Uses nullish coalescing to prevent NaN from null arithmetic.
 */
function computeStartQuant(measure: Measure, selectedEventId: string | null): number {
  if (selectedEventId) {
    return calculateInsertionQuant(measure, selectedEventId) ?? 0;
  }

  const events = measure.events;
  if (events.length === 0) {
    return 0;
  }

  const lastEvent = events[events.length - 1];
  // FIX: Use ?? 0 to prevent null arithmetic
  const lastStart = calculateInsertionQuant(measure, lastEvent.id) ?? 0;
  return lastStart + getNoteDuration(lastEvent.duration, lastEvent.dotted, lastEvent.tuplet);
}

/**
 * Computes cursor target from the ORIGINAL measure state.
 * FIX: Computes BEFORE insertion to avoid stale reference issues.
 */
function computeCursorTarget(
  originalMeasure: Measure,
  insertIndex: number,
  deletedIds: Set<string>
): { eventId: string | null; noteId: string | null } {
  // Look for next non-deleted event starting from insertIndex
  for (let i = insertIndex; i < originalMeasure.events.length; i++) {
    const e = originalMeasure.events[i];
    if (!deletedIds.has(e.id)) {
      return {
        eventId: e.id,
        noteId: e.notes[0]?.id || null,
      };
    }
  }

  // No next event = end of measure (append mode)
  return { eventId: null, noteId: null };
}

/**
 * Unified event insertion logic shared by addNote and addRest.
 * This eliminates the 95% code duplication between the two methods.
 *
 * Returns the state (warnings, info) so caller can set result AFTER commit.
 */
function executeInsertion(
  ctx: APIContext,
  api: MusicEditorAPI,
  config: InsertEventConfig
): InsertionLoopState {
  const { getScore, getSelection, syncSelection, dispatch } = ctx;

  const state: InsertionLoopState = {
    currentDuration: config.duration,
    currentDotted: config.dotted,
    warnings: [],
    info: [],
    isOverflowContinuation: false,
  };

  // Overflow loop - handles note splitting across measures
  while (true) {
    const sel = getSelection();
    let staffIndex = sel.staffIndex;
    let measureIndex = sel.measureIndex;

    if (measureIndex === null) {
      staffIndex = 0;
      measureIndex = 0;
    }

    const staff = getScore().staves[staffIndex];
    if (!staff) throw new Error('No staff found');

    // Capture original measure state BEFORE any modifications
    const originalMeasure = staff.measures[measureIndex];
    if (!originalMeasure) throw new Error(`Measure ${measureIndex} not found`);

    // Compute insertion point
    // If this is an overflow continuation, start at quant 0 to overwrite existing content
    const startQuant = state.isOverflowContinuation
      ? 0
      : computeStartQuant(originalMeasure, sel.eventId);
    state.isOverflowContinuation = false; // Reset flag after use

    const capacity = getRemainingCapacity(originalMeasure, startQuant);
    const noteQuants = getNoteDuration(state.currentDuration, state.currentDotted);

    // Determine what to insert in this measure
    const eventsToInsert: { duration: string; dotted: boolean; tied: boolean }[] = [];
    let remainingQuants = noteQuants;

    if (noteQuants > capacity) {
      if (capacity > 0) {
        const headParts = getBreakdownOfQuants(capacity);
        headParts.forEach((p) =>
          eventsToInsert.push({
            duration: p.duration,
            dotted: p.dotted,
            tied: !config.isRest, // Notes get tied, rests don't
          })
        );
        remainingQuants -= capacity;
        state.info.push(
          config.isRest ? 'Rest split across measures' : 'Note split across measures'
        );
      }
      // If capacity is 0, we insert nothing here and move to next measure
    } else {
      eventsToInsert.push({
        duration: state.currentDuration,
        dotted: state.currentDotted,
        tied: false,
      });
      remainingQuants = 0;
    }

    // Process each event to insert
    let currentInsertQuant = startQuant;

    for (const evt of eventsToInsert) {
      const evtQuants = getNoteDuration(evt.duration, evt.dotted);

      // FIX: Store overwrite plan ONCE before any modifications
      let overwritePlan: { toRemove: string[] } = { toRemove: [] };
      if (config.mode === 'overwrite') {
        overwritePlan = getOverwritePlan(originalMeasure, currentInsertQuant, evtQuants);

        // Delete conflicting events
        if (overwritePlan.toRemove.length > 0) {
          overwritePlan.toRemove.forEach((id) => {
            dispatch(new DeleteEventCommand(measureIndex, id, staffIndex));
          });
          state.warnings.push(`Overwrote ${overwritePlan.toRemove.length} event(s)`);
        }
      }

      // Get fresh measure state after deletions
      const currentMeasure = getScore().staves[staffIndex].measures[measureIndex];

      // Find insertion index
      let insertIndex = 0;
      let scannedQuant = 0;
      while (insertIndex < currentMeasure.events.length && scannedQuant < currentInsertQuant) {
        const e = currentMeasure.events[insertIndex];
        scannedQuant += getNoteDuration(e.duration, e.dotted, e.tuplet);
        insertIndex++;
      }

      // Fill gap if needed
      if (scannedQuant < currentInsertQuant) {
        const gap = currentInsertQuant - scannedQuant;
        const gapRests = createRestsForRange(gap, createEventId);
        gapRests.forEach((r) => {
          dispatch(
            new AddEventCommand(
              measureIndex,
              true,
              null,
              r.duration,
              r.dotted,
              insertIndex,
              r.id,
              staffIndex
            )
          );
          insertIndex++;
        });
      }

      // Insert the event
      const eventId = createEventId();
      if (config.isRest) {
        dispatch(
          new AddEventCommand(
            measureIndex,
            true,
            null,
            evt.duration,
            evt.dotted,
            insertIndex,
            eventId,
            staffIndex
          )
        );
      } else {
        const note = createNotePayload({ pitch: config.pitch!, tied: evt.tied, id: noteId() });
        dispatch(
          new AddEventCommand(
            measureIndex,
            false,
            note,
            evt.duration,
            evt.dotted,
            insertIndex,
            eventId,
            staffIndex
          )
        );
      }

      // FIX: Compute cursor target from ORIGINAL measure state using stored plan
      const deletedIds = new Set(overwritePlan.toRemove);
      const cursorTarget = computeCursorTarget(originalMeasure, insertIndex, deletedIds);

      syncSelection({
        staffIndex,
        measureIndex,
        eventId: cursorTarget.eventId,
        noteId: cursorTarget.noteId,
        selectedNotes: [],
        anchor: null,
      });

      currentInsertQuant += evtQuants;
    }

    // Handle overflow to next measure
    if (remainingQuants > 0) {
      const parts = getBreakdownOfQuants(remainingQuants);
      const nextMeasureIndex = measureIndex + 1;

      if (nextMeasureIndex >= staff.measures.length) {
        dispatch(new AddMeasureCommand());
        state.info.push(`Created measure ${nextMeasureIndex + 1}`);
      }

      syncSelection({
        staffIndex,
        measureIndex: nextMeasureIndex,
        eventId: null,
        noteId: null,
        selectedNotes: [],
        anchor: null,
      });

      state.currentDuration = parts[0].duration;
      state.currentDotted = parts[0].dotted;
      state.isOverflowContinuation = true; // Signal next iteration to start at quant 0

      // Continue loop to handle next measure
    } else {
      // Done
      break;
    }
  }

  return state;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Factory for creating Entry API methods.
 * Handles note/rest creation, tuplets, and ties.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for entry
 */
export const createEntryMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, EntryMethodNames> & ThisType<MusicEditorAPI> => {
  const { getScore, getSelection, syncSelection, dispatch, setResult } = ctx;

  return {
    addNote(pitch, duration = 'quarter', dotted = false, options = { mode: 'overwrite' }) {
      // Validate pitch format
      if (!isValidPitch(pitch)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addNote',
          message: `Invalid pitch format '${pitch}'. Expected format: 'C4', 'F#5', 'Bb3', etc.`,
          code: 'INVALID_PITCH',
          details: { pitch },
        });
        return this;
      }

      this.beginTransaction();

      try {
        const result = executeInsertion(ctx, this, {
          isRest: false,
          pitch,
          duration,
          dotted,
          mode: options.mode ?? 'overwrite',
        });

        this.commitTransaction();

        // Set result AFTER commit so it doesn't get overwritten
        setResult({
          ok: true,
          status: result.warnings.length > 0 ? 'warning' : 'info',
          method: 'addNote',
          message: `Added note ${pitch}`,
          details: {
            pitch,
            duration,
            dotted,
            warnings: result.warnings,
            info: result.info,
          },
        });
      } catch (e) {
        this.rollbackTransaction();
        setResult({
          ok: false,
          status: 'error',
          method: 'addNote',
          message: e instanceof Error ? e.message : 'Unknown error',
          code: 'ADD_NOTE_FAILED',
        });
      }

      return this;
    },

    addRest(duration = 'quarter', dotted = false, options = { mode: 'overwrite' }) {
      this.beginTransaction();

      try {
        const result = executeInsertion(ctx, this, {
          isRest: true,
          pitch: null,
          duration,
          dotted,
          mode: options.mode ?? 'overwrite',
        });

        this.commitTransaction();

        // Set result AFTER commit so it doesn't get overwritten
        setResult({
          ok: true,
          status: result.warnings.length > 0 ? 'warning' : 'info',
          method: 'addRest',
          message: 'Added rest',
          details: {
            duration,
            dotted,
            warnings: result.warnings,
            info: result.info,
          },
        });
      } catch (e) {
        this.rollbackTransaction();
        setResult({
          ok: false,
          status: 'error',
          method: 'addRest',
          message: e instanceof Error ? e.message : 'Unknown error',
          code: 'ADD_REST_FAILED',
        });
      }

      return this;
    },

    addTone(pitch) {
      // Validate pitch format
      if (!isValidPitch(pitch)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addTone',
          message: `Invalid pitch format '${pitch}'. Expected format: 'C4', 'F#5', 'Bb3', etc.`,
          code: 'INVALID_PITCH',
          details: { pitch },
        });
        return this;
      }

      const sel = getSelection();
      if (sel.measureIndex === null || sel.eventId === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addTone',
          message: 'No event selected to add tone to',
          code: 'NO_SELECTION',
        });
        return this;
      }

      const staffIndex = sel.staffIndex;
      const measureIndex = sel.measureIndex;
      const eventId = sel.eventId;

      // Create note using shared utility
      const note = createNotePayload({ pitch, id: noteId() });

      // Dispatch AddNoteToEventCommand
      dispatch(new AddNoteToEventCommand(measureIndex, eventId, note, staffIndex));

      // Update selection to include new note
      const newSelection = {
        ...sel,
        noteId: note.id,
        selectedNotes: [{ staffIndex, measureIndex, eventId, noteId: note.id }],
      };
      syncSelection(newSelection);

      setResult({
        ok: true,
        status: 'info',
        method: 'addTone',
        message: `Added tone ${pitch} to chord`,
        details: { pitch, eventId },
      });

      return this;
    },

    makeTuplet(numNotes = 3, inSpaceOf = 2) {
      const sel = getSelection();
      if (sel.measureIndex === null || sel.eventId === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'makeTuplet',
          message: 'No selection to make tuplet from',
          code: 'NO_SELECTION',
        });
        return this;
      }

      const staff = getScore().staves[sel.staffIndex];
      const measure = staff?.measures[sel.measureIndex];
      if (!measure) {
        setResult({
          ok: false,
          status: 'error',
          method: 'makeTuplet',
          message: 'Measure not found',
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Find the index of the selected event
      const eventIndex = measure.events.findIndex((e) => e.id === sel.eventId);
      if (eventIndex === -1) {
        setResult({
          ok: false,
          status: 'error',
          method: 'makeTuplet',
          message: 'Event not found',
          code: 'EVENT_NOT_FOUND',
        });
        return this;
      }

      // Check if we have enough events for the tuplet
      if (eventIndex + numNotes > measure.events.length) {
        setResult({
          ok: false,
          status: 'error',
          method: 'makeTuplet',
          message: `Not enough events (need ${numNotes}, have ${measure.events.length - eventIndex})`,
          code: 'INSUFFICIENT_EVENTS',
        });
        return this;
      }

      // Check if any target events are already in a tuplet
      for (let i = 0; i < numNotes; i++) {
        if (measure.events[eventIndex + i]?.tuplet) {
          setResult({
            ok: false,
            status: 'error',
            method: 'makeTuplet',
            message: 'Target events already contain a tuplet',
            code: 'NESTED_TUPLET_NOT_SUPPORTED',
          });
          return this;
        }
      }

      dispatch(
        new ApplyTupletCommand(
          sel.measureIndex,
          eventIndex,
          numNotes,
          [numNotes, inSpaceOf] as [number, number],
          sel.staffIndex
        )
      );

      setResult({
        ok: true,
        status: 'info',
        method: 'makeTuplet',
        message: `Created ${numNotes}:${inSpaceOf} tuplet`,
        details: { numNotes, inSpaceOf, measureIndex: sel.measureIndex },
      });

      return this;
    },

    unmakeTuplet() {
      const sel = getSelection();
      if (sel.measureIndex === null || sel.eventId === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'unmakeTuplet',
          message: 'No selection',
          code: 'NO_SELECTION',
        });
        return this;
      }

      const staff = getScore().staves[sel.staffIndex];
      const measure = staff?.measures[sel.measureIndex];
      if (!measure) {
        setResult({
          ok: false,
          status: 'error',
          method: 'unmakeTuplet',
          message: 'Measure not found',
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Find the selected event and its index
      const eventIndex = measure.events.findIndex((e) => e.id === sel.eventId);
      const event = eventIndex >= 0 ? measure.events[eventIndex] : null;
      if (!event?.tuplet) {
        setResult({
          ok: true, // Warning, not error (idempotent-ish)
          status: 'warning',
          method: 'unmakeTuplet',
          message: 'Selected event is not part of a tuplet',
          code: 'NOT_A_TUPLET',
        });
        return this;
      }

      dispatch(new RemoveTupletCommand(sel.measureIndex, eventIndex, sel.staffIndex));

      setResult({
        ok: true,
        status: 'info',
        method: 'unmakeTuplet',
        message: 'Removed tuplet',
        details: { measureIndex: sel.measureIndex },
      });

      return this;
    },

    toggleTie() {
      const sel = getSelection();
      if (sel.measureIndex === null || sel.eventId === null || sel.noteId === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'toggleTie',
          message: 'No note selected',
          code: 'NO_NOTE_SELECTED',
        });
        return this;
      }

      const staff = getScore().staves[sel.staffIndex];
      const measure = staff?.measures[sel.measureIndex];
      const event = measure?.events.find((e) => e.id === sel.eventId);
      const note = event?.notes?.find((n) => n.id === sel.noteId);

      if (!note) {
        setResult({
          ok: false,
          status: 'error',
          method: 'toggleTie',
          message: 'Note not found',
          code: 'NOTE_NOT_FOUND',
        });
        return this;
      }

      dispatch(
        new UpdateNoteCommand(
          sel.measureIndex,
          sel.eventId,
          sel.noteId,
          { tied: !note.tied },
          sel.staffIndex
        )
      );

      setResult({
        ok: true,
        status: 'info',
        method: 'toggleTie',
        message: `Tie ${!note.tied ? 'added' : 'removed'}`,
        details: { tied: !note.tied, noteId: sel.noteId },
      });

      return this;
    },

    setTie(tied) {
      const sel = getSelection();
      if (sel.measureIndex === null || sel.eventId === null || sel.noteId === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'setTie',
          message: 'No note selected',
          code: 'NO_NOTE_SELECTED',
        });
        return this;
      }

      const staff = getScore().staves[sel.staffIndex];
      const measure = staff?.measures[sel.measureIndex];
      const event = measure?.events.find((e) => e.id === sel.eventId);
      const note = event?.notes?.find((n) => n.id === sel.noteId);

      if (!note) {
        setResult({
          ok: false,
          status: 'error',
          method: 'setTie',
          message: 'Note not found',
          code: 'NOTE_NOT_FOUND',
        });
        return this;
      }

      dispatch(
        new UpdateNoteCommand(sel.measureIndex, sel.eventId, sel.noteId, { tied }, sel.staffIndex)
      );

      setResult({
        ok: true,
        status: 'info',
        method: 'setTie',
        message: `Tie set to ${tied}`,
        details: { tied, noteId: sel.noteId },
      });

      return this;
    },

    setInputMode(mode) {
      if (ctx.setInputMode) {
        // useScoreAPI handles the result for this delegation
        ctx.setInputMode(mode);
      }
      return this;
    },
  };
};
