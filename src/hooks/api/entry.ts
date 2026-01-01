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
  createRestsForRange 
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
        let currentDuration = duration;
        let currentDotted = dotted;
        const warnings: string[] = [];
        const info: string[] = [];

        // Loop to handle overflow across measures
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
          
          let measure = staff.measures[measureIndex];
          if (!measure) throw new Error(`Measure ${measureIndex} not found`);

          // Determine Insertion Point
          const events = measure.events;
          const lastEvent = events[events.length - 1];
          let startQuant = 0;

          if (sel.eventId) {
            startQuant = calculateInsertionQuant(measure, sel.eventId) ?? 0;
          } else if (lastEvent) {
             const lastStart = calculateInsertionQuant(measure, lastEvent.id);
             if (lastStart !== undefined && lastStart !== null) {
                startQuant = lastStart + getNoteDuration(lastEvent.duration, lastEvent.dotted, lastEvent.tuplet);
             }
          }
              
          const capacity = getRemainingCapacity(measure, startQuant);
          const noteQuants = getNoteDuration(currentDuration, currentDotted);
          
          const eventsToInsert: { duration: string; dotted: boolean; tied: boolean }[] = [];
          let remainingQuantsOfNote = noteQuants;
          
          if (noteQuants > capacity) {
             if (capacity > 0) {
                const headParts = getBreakdownOfQuants(capacity);
                headParts.forEach(p => eventsToInsert.push({ ...p, tied: true }));
                remainingQuantsOfNote -= capacity; 
                info.push(`Note split across measures`);
             }
             // If capacity 0, we insert nothing here, just move to next.
          } else {
             eventsToInsert.push({ duration: currentDuration, dotted: currentDotted, tied: false }); 
             remainingQuantsOfNote = 0;
          }

          let currentInsertQuant = startQuant;
          
          for (const evt of eventsToInsert) {
             const evtQuants = getNoteDuration(evt.duration, evt.dotted);
             
             // Overwrite Check
             if (options.mode === 'overwrite') {
               const plan = getOverwritePlan(measure, currentInsertQuant, evtQuants);
               if (plan.toRemove.length > 0) {
                 plan.toRemove.forEach(id => {
                   dispatch(new DeleteEventCommand(measureIndex, id, staffIndex));
                 });
                 warnings.push(`Overwrote ${plan.toRemove.length} event(s)`);
               }
             }
             
             // Refresh measure state
             measure = getScore().staves[staffIndex].measures[measureIndex]; 
             
             // Find insertion index
             let insertIndex = 0;
             let scannedQuant = 0;
             while (insertIndex < measure.events.length && scannedQuant < currentInsertQuant) {
                const e = measure.events[insertIndex];
                scannedQuant += getNoteDuration(e.duration, e.dotted, e.tuplet);
                insertIndex++;
             }
             
             // Fill gap
             if (scannedQuant < currentInsertQuant) {
               const gap = currentInsertQuant - scannedQuant;
               const gapRests = createRestsForRange(gap, createEventId);
               gapRests.forEach(r => {
                  dispatch(new AddEventCommand(measureIndex, true, null, r.duration, r.dotted, insertIndex, r.id, staffIndex));
                  insertIndex++;
               });
             }
             
             // Insert Note
             const note = createNotePayload({ pitch, tied: evt.tied, id: noteId() });
             const eventId = createEventId();
             dispatch(new AddEventCommand(measureIndex, false, note, evt.duration, evt.dotted, insertIndex, eventId, staffIndex));
             
             // Advance Cursor Logic:
             // We cannot rely on getScore() returning the updated state immediately (it might be stale).
             // Instead, we use the original 'measure' snapshot and find the next valid event that wasn't deleted.
             
             // Start looking from the index where we inserted (or would have inserted).
             // Any event at 'insertIndex' or later in the original measure is a candidate for "Next",
             // UNLESS it was deleted by the overwrite logic.
             
             let nextEventId: string | null = null;
             let nextNoteId: string | null = null;
             
             // IDs deleted in this step
             const deletedIds = new Set(options.mode === 'overwrite' ? getOverwritePlan(measure, currentInsertQuant, evtQuants).toRemove : []);

             // Look for the next non-deleted event starting from insertIndex
             // We check original measure because that's our stable reference.
             // ROBUSTNESS: Check if 'measure' updated to include the new event (Fresh State).
             // If measure.events[insertIndex] is our new event, skip it.
             let searchStartIndex = insertIndex;
             if (measure.events[insertIndex]?.id === eventId) {
                searchStartIndex = insertIndex + 1;
             }

             for (let i = searchStartIndex; i < measure.events.length; i++) {
                const e = measure.events[i];
                if (!deletedIds.has(e.id)) {
                    nextEventId = e.id;
                    nextNoteId = e.notes[0]?.id || null;
                    break;
                }
             }

             if (nextEventId) {
                syncSelection({
                    staffIndex,
                    measureIndex,
                    eventId: nextEventId,
                    noteId: nextNoteId,
                    selectedNotes: [],
                    anchor: null
                });
             } else {
                // End of measure / Append mode
                syncSelection({
                    staffIndex,
                    measureIndex,
                    eventId: null,
                    noteId: null,
                    selectedNotes: [],
                    anchor: null
                });
             }
             
             currentInsertQuant += evtQuants;
          }
          
          // Handle Overflow
          if (remainingQuantsOfNote > 0) {
              
             const parts = getBreakdownOfQuants(remainingQuantsOfNote);
             
             const nextMeasureIndex = measureIndex + 1;
              if (nextMeasureIndex >= staff.measures.length) {
                dispatch(new AddMeasureCommand());
                info.push(`Created measure ${nextMeasureIndex + 1}`);
              }
              
              syncSelection({
                staffIndex,
                measureIndex: nextMeasureIndex,
                eventId: null,
                noteId: null,
                selectedNotes: [],
                anchor: null
              });
              
              currentDuration = parts[0].duration;
              currentDotted = parts[0].dotted;
             
             // Note: if parts.length > 1, we are simplifying by processing parts[0] in next loop.
             // Ideally we should process all parts. But splitting across barline rarely results in > 2 chunks unless note is huge.
             // If remaining > parts[0], the next loop will split IT again.
             // Recursion by loop.
             
          } else {
             break;
          }
        }

        this.commitTransaction();
        
        setResult({
          ok: true,
          status: warnings.length > 0 ? 'warning' : 'info',
          method: 'addNote',
          message: `Added note ${pitch}`,
          details: { 
             pitch, duration, dotted, 
             warnings, 
             info 
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
        let currentDuration = duration;
        let currentDotted = dotted;
        const warnings: string[] = [];
        const info: string[] = [];

        // Loop to handle overflow across measures
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
          
          let measure = staff.measures[measureIndex];
          if (!measure) throw new Error(`Measure ${measureIndex} not found`);

          // Determine Insertion Point
          const events = measure.events;
          const lastEvent = events[events.length - 1];
          let startQuant = 0;

          if (sel.eventId) {
            startQuant = calculateInsertionQuant(measure, sel.eventId) ?? 0;
          } else if (lastEvent) {
             const lastStart = calculateInsertionQuant(measure, lastEvent.id);
             if (lastStart !== undefined && lastStart !== null) {
                startQuant = lastStart + getNoteDuration(lastEvent.duration, lastEvent.dotted, lastEvent.tuplet);
             }
          }
              
          const capacity = getRemainingCapacity(measure, startQuant);
          const noteQuants = getNoteDuration(currentDuration, currentDotted);
          
          const eventsToInsert: { duration: string; dotted: boolean; tied: boolean }[] = [];
          let remainingQuantsOfNote = noteQuants;
          
          if (noteQuants > capacity) {
             if (capacity > 0) {
                const headParts = getBreakdownOfQuants(capacity);
                headParts.forEach(p => eventsToInsert.push({ ...p, tied: true }));
                remainingQuantsOfNote -= capacity; 
                info.push(`Rest split across measures`);
             }
          } else {
             // Rests technically don't have ties in the same way notes do, but we handle them sequentially.
             // We can use 'tied' metaphor for continuity if visualized, but usually just split rests.
             eventsToInsert.push({ duration: currentDuration, dotted: currentDotted, tied: false }); 
             remainingQuantsOfNote = 0;
          }

          let currentInsertQuant = startQuant;
          
          for (const evt of eventsToInsert) {
             const evtQuants = getNoteDuration(evt.duration, evt.dotted);
             
             // Overwrite Check
             if (options.mode === 'overwrite') {
               const plan = getOverwritePlan(measure, currentInsertQuant, evtQuants);
               if (plan.toRemove.length > 0) {
                 plan.toRemove.forEach(id => {
                   dispatch(new DeleteEventCommand(measureIndex, id, staffIndex));
                 });
                 warnings.push(`Overwrote ${plan.toRemove.length} event(s)`);
               }
             }
             
             measure = getScore().staves[staffIndex].measures[measureIndex]; 
             
             let insertIndex = 0;
             let scannedQuant = 0;
             while (insertIndex < measure.events.length && scannedQuant < currentInsertQuant) {
                const e = measure.events[insertIndex];
                scannedQuant += getNoteDuration(e.duration, e.dotted, e.tuplet);
                insertIndex++;
             }
             
             if (scannedQuant < currentInsertQuant) {
               const gap = currentInsertQuant - scannedQuant;
               const gapRests = createRestsForRange(gap, createEventId);
               gapRests.forEach(r => {
                  dispatch(new AddEventCommand(measureIndex, true, null, r.duration, r.dotted, insertIndex, r.id, staffIndex));
                  insertIndex++;
               });
             }
             
             // Insert Rest
             const eventId = createEventId();
             dispatch(new AddEventCommand(measureIndex, true, null, evt.duration, evt.dotted, insertIndex, eventId, staffIndex));
             
             // Advance Cursor Logic:
             // Use stable measure reference and skip deleted events
              let nextEventId: string | null = null;
              let nextNoteId: string | null = null;
              
              const deletedIds = new Set(options.mode === 'overwrite' ? getOverwritePlan(measure, currentInsertQuant, evtQuants).toRemove : []);

              let searchStartIndex = insertIndex;
              if (measure.events[insertIndex]?.id === eventId) {
                 searchStartIndex = insertIndex + 1;
              }

              for (let i = searchStartIndex; i < measure.events.length; i++) {
                const e = measure.events[i];
                if (!deletedIds.has(e.id)) {
                    nextEventId = e.id;
                    nextNoteId = e.notes[0]?.id || null;
                    break;
                }
             }
             
             if (nextEventId) {
                syncSelection({
                    staffIndex,
                    measureIndex,
                    eventId: nextEventId,
                    noteId: nextNoteId,
                    selectedNotes: [],
                    anchor: null
                });
             } else {
                syncSelection({
                    staffIndex,
                    measureIndex,
                    eventId: null,
                    noteId: null,
                    selectedNotes: [],
                    anchor: null
                });
             }
             
             currentInsertQuant += evtQuants;
          }
          
          // Handle Overflow
          if (remainingQuantsOfNote > 0) {
              
             const parts = getBreakdownOfQuants(remainingQuantsOfNote);
             
             const nextMeasureIndex = measureIndex + 1;
             if (nextMeasureIndex >= staff.measures.length) {
               dispatch(new AddMeasureCommand());
               info.push(`Created measure ${nextMeasureIndex + 1}`);
             }
             
             syncSelection({
               staffIndex,
               measureIndex: nextMeasureIndex,
               eventId: null,
               noteId: null,
               selectedNotes: [],
               anchor: null
             });
             
             currentDuration = parts[0].duration;
             currentDotted = parts[0].dotted;
             
          } else {
             break;
          }
        }

        this.commitTransaction();
        
        setResult({
           ok: true,
           status: warnings.length > 0 ? 'warning' : 'info',
           method: 'addRest',
           message: `Added rest`,
           details: { duration, dotted, warnings, info }
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
