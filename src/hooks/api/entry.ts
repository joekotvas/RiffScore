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
import { Measure, ScoreEvent } from '@/types';
import { AddEventCommand } from '@/commands/AddEventCommand';
import { AddNoteToEventCommand } from '@/commands/AddNoteToEventCommand';
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';
import { InsertEventCommand } from '@/commands/InsertEventCommand';
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
  /** If set, when selectedEventId matches this, we insert AFTER it (cursor auto-advance) */
  previousInsertedEventId?: string | null;
}

interface InsertionLoopState {
  currentDuration: string;
  currentDotted: boolean;
  warnings: string[];
  info: string[];
  /** When true, next iteration should start at quant 0 (not append) */
  isOverflowContinuation: boolean;
  /** ID of the last event inserted in this insertion operation */
  lastInsertedEventId: string | null;
}

// ============================================================================
// Core Insertion Logic (DRY - shared by addNote and addRest)
// ============================================================================

/**
 * Computes the start quant for insertion based on current selection.
 * 
 * When cursor was auto-advanced after insertion (selectedEventId === previousInsertedEventId),
 * we insert AFTER that event to enable sequential chaining (addNote().addNote()).
 * 
 * When user explicitly selected an event (via selectById), we insert AT that position
 * for overwrite mode compatibility.
 * 
 * When no event is selected, inserts at end of measure (append mode).
 */
function computeStartQuant(
  measure: Measure, 
  selectedEventId: string | null,
  previousInsertedEventId: string | null | undefined
): number {
  if (selectedEventId) {
    // Check if this is the cursor that was auto-advanced after our own insertion
    // If so, insert AFTER this event (append behavior for chaining)
    if (previousInsertedEventId && selectedEventId === previousInsertedEventId) {
      const eventStart = calculateInsertionQuant(measure, selectedEventId) ?? 0;
      const event = measure.events.find((e) => e.id === selectedEventId);
      if (event) {
        return eventStart + getNoteDuration(event.duration, event.dotted, event.tuplet);
      }
      return eventStart;
    }
    
    // Explicit selection - insert AT the selected event's position (overwrite)
    return calculateInsertionQuant(measure, selectedEventId) ?? 0;
  }

  // No event selected - append to end of measure
  const events = measure.events;
  if (events.length === 0) {
    return 0;
  }

  const lastEvent = events[events.length - 1];
  const lastStart = calculateInsertionQuant(measure, lastEvent.id) ?? 0;
  return lastStart + getNoteDuration(lastEvent.duration, lastEvent.dotted, lastEvent.tuplet);
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
    lastInsertedEventId: null,
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
      : computeStartQuant(originalMeasure, sel.eventId, config.previousInsertedEventId);
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
      let insertedNoteId: string | null = null;
      
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
        insertedNoteId = noteId();
        const note = createNotePayload({ pitch: config.pitch!, tied: evt.tied, id: insertedNoteId });
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

      // FIX: Select the JUST-INSERTED event and note so chaining works
      // (toggleTie, setTie, etc. need noteId to be set)
      syncSelection({
        staffIndex,
        measureIndex,
        eventId: eventId,
        noteId: insertedNoteId,
        selectedNotes: [],
        anchor: null,
      });

      // Track the inserted event ID for cursor-advance detection
      state.lastInsertedEventId = eventId;

      currentInsertQuant += evtQuants;

      // INSERT MODE: Handle overflow of displaced events
      if (config.mode === 'insert') {
        const measureAfterInsert = getScore().staves[staffIndex].measures[measureIndex];
        const measureCapacity = 64; // TODO: get from time signature

        // Calculate total measure duration
        let totalQuants = 0;
        for (const e of measureAfterInsert.events) {
          totalQuants += getNoteDuration(e.duration, e.dotted, e.tuplet);
        }

        // If overfilled, move excess events to next measure
        if (totalQuants > measureCapacity) {
          const overflowQuants = totalQuants - measureCapacity;

          // STEP 1: Collect initial events to move (from the end, working backwards)
          let quantsToMove = 0;
          const initialEventsToMove: ScoreEvent[] = [];
          for (
            let i = measureAfterInsert.events.length - 1;
            i >= 0 && quantsToMove < overflowQuants;
            i--
          ) {
            const e = measureAfterInsert.events[i];
            const eQuants = getNoteDuration(e.duration, e.dotted, e.tuplet);
            initialEventsToMove.unshift(e);
            quantsToMove += eQuants;
          }

          // STEP 2: Expand to include complete tuplet groups (atomic tuplet handling)
          // Collect all tuplet IDs from initial overflow events
          const tupletIdsInOverflow = new Set<string>();
          for (const e of initialEventsToMove) {
            if (e.tuplet?.id) {
              tupletIdsInOverflow.add(e.tuplet.id);
            }
          }

          // Find ALL events belonging to those tuplet groups
          const eventsToMove: ScoreEvent[] = [];
          const eventIdsToMove = new Set<string>();

          // First pass: add all events from tuplet groups that have any event in overflow
          for (const e of measureAfterInsert.events) {
            if (e.tuplet?.id && tupletIdsInOverflow.has(e.tuplet.id)) {
              if (!eventIdsToMove.has(e.id)) {
                eventsToMove.push(e);
                eventIdsToMove.add(e.id);
              }
            }
          }

          // Second pass: add remaining non-tuplet events from initial overflow
          for (const e of initialEventsToMove) {
            if (!eventIdsToMove.has(e.id)) {
              eventsToMove.push(e);
              eventIdsToMove.add(e.id);
            }
          }

          // Sort by original measure order (important for correct re-insertion)
          eventsToMove.sort((a, b) => {
            const aIdx = measureAfterInsert.events.findIndex((e) => e.id === a.id);
            const bIdx = measureAfterInsert.events.findIndex((e) => e.id === b.id);
            return aIdx - bIdx;
          });

          // Track if we expanded due to tuplet atomicity
          const tupletExpansion = eventsToMove.length > initialEventsToMove.length;
          if (tupletExpansion && tupletIdsInOverflow.size > 0) {
            state.info.push(
              `Moved entire tuplet group(s) to preserve atomicity (${tupletIdsInOverflow.size} group(s))`
            );
          }

          // Ensure next measure exists
          const currentStaff = getScore().staves[staffIndex];
          if (measureIndex + 1 >= currentStaff.measures.length) {
            dispatch(new AddMeasureCommand());
            state.info.push(`Created measure ${measureIndex + 2} for insert overflow`);
          }

          // Delete events from current measure and re-add to next
          eventsToMove.forEach((movedEvent) => {
            dispatch(new DeleteEventCommand(measureIndex, movedEvent.id, staffIndex));
          });

          // Re-add at start of next measure using InsertEventCommand to preserve ALL properties
          eventsToMove.forEach((movedEvent, idx) => {
            // InsertEventCommand accepts the complete ScoreEvent, preserving tuplet, tied, etc.
            dispatch(new InsertEventCommand(measureIndex + 1, movedEvent, idx, staffIndex));
          });

          state.warnings.push(
            `Insert overflow: ${eventsToMove.length} event(s) moved to next measure`
          );
        }
      }
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
  const { getScore, getSelection, syncSelection, dispatch, setResult, lastInsertedEventIdRef } = ctx;

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
          previousInsertedEventId: lastInsertedEventIdRef.current,
        });

        // Track for next sequential addNote call
        lastInsertedEventIdRef.current = result.lastInsertedEventId;

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
          previousInsertedEventId: lastInsertedEventIdRef.current,
        });

        // Track for next sequential addNote/addRest call
        lastInsertedEventIdRef.current = result.lastInsertedEventId;

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
