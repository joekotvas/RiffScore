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
import { AddEventCommand } from '@/commands/AddEventCommand';
import { AddNoteToEventCommand } from '@/commands/AddNoteToEventCommand';
import { ApplyTupletCommand } from '@/commands/TupletCommands';
import { RemoveTupletCommand } from '@/commands/RemoveTupletCommand';
import { UpdateNoteCommand } from '@/commands/UpdateNoteCommand';
import { canAddEventToMeasure, isValidPitch } from '@/utils/validation';
import { noteId, eventId as createEventId } from '@/utils/id';
import { createNotePayload } from '@/utils/entry';

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
    addNote(pitch, duration = 'quarter', dotted = false) {
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

      const sel = getSelection();
      let staffIndex = sel.staffIndex;
      let measureIndex = sel.measureIndex;

      // If no measure is selected, default to first measure
      if (measureIndex === null) {
        staffIndex = 0;
        measureIndex = 0;
      }

      const staff = getScore().staves[staffIndex];
      if (!staff || staff.measures.length === 0) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addNote',
          message: 'No measures exist in the score',
          code: 'NO_MEASURES',
        });
        return this;
      }

      const measure = staff.measures[measureIndex];
      if (!measure) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addNote',
          message: `Measure ${measureIndex + 1} does not exist`,
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Check if measure has capacity for this note
      if (!canAddEventToMeasure(measure.events, duration, dotted)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addNote',
          message: `Measure ${measureIndex + 1} is full. Cannot add ${dotted ? 'dotted ' : ''}${duration} note.`,
          code: 'MEASURE_FULL',
        });
        return this;
      }

      // Create note payload using shared utility
      const note = createNotePayload({ pitch, id: noteId() });

      // Dispatch AddEventCommand
      const eventId = createEventId();
      dispatch(
        new AddEventCommand(
          measureIndex,
          false,
          note,
          duration,
          dotted,
          undefined,
          eventId,
          staffIndex
        )
      );

      // Advance cursor to the new event
      const newSelection = {
        staffIndex,
        measureIndex,
        eventId,
        noteId: note.id,
        selectedNotes: [{ staffIndex, measureIndex, eventId, noteId: note.id }],
        anchor: null,
      };
      syncSelection(newSelection);

      setResult({
        ok: true,
        status: 'info',
        method: 'addNote',
        message: `Added note ${pitch}`,
        details: { pitch, duration, dotted, measureIndex, staffIndex },
      });

      return this;
    },

    addRest(duration = 'quarter', dotted = false) {
      const sel = getSelection();
      let staffIndex = sel.staffIndex;
      let measureIndex = sel.measureIndex;

      // If no measure is selected, default to first measure
      if (measureIndex === null) {
        staffIndex = 0;
        measureIndex = 0;
      }

      const staff = getScore().staves[staffIndex];
      if (!staff || staff.measures.length === 0) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addRest',
          message: 'No measures exist in the score',
          code: 'NO_MEASURES',
        });
        return this;
      }

      const measure = staff.measures[measureIndex];
      if (!measure) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addRest',
          message: `Measure ${measureIndex + 1} does not exist`,
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Check if measure has capacity for this rest
      if (!canAddEventToMeasure(measure.events, duration, dotted)) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addRest',
          message: `Measure ${measureIndex + 1} is full. Cannot add ${dotted ? 'dotted ' : ''}${duration} rest.`,
          code: 'MEASURE_FULL',
        });
        return this;
      }

      // Dispatch AddEventCommand with isRest=true
      const eventId = createEventId();
      dispatch(
        new AddEventCommand(
          measureIndex,
          true,
          null,
          duration,
          dotted,
          undefined,
          eventId,
          staffIndex
        )
      );

      // Advance cursor - use the same rest note ID pattern as AddEventCommand
      const restNoteId = `${eventId}-rest`;
      const newSelection = {
        staffIndex,
        measureIndex,
        eventId,
        noteId: restNoteId,
        selectedNotes: [{ staffIndex, measureIndex, eventId, noteId: restNoteId }],
        anchor: null,
      };
      syncSelection(newSelection);

      setResult({
        ok: true,
        status: 'info',
        method: 'addRest',
        message: `Added rest (${duration})`,
        details: { duration, dotted, measureIndex, staffIndex },
      });

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
