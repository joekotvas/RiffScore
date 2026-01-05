import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import { navigateSelection, getFirstNoteId, getNoteDuration } from '@/utils/core';
import { calculateVerticalNavigation } from '@/utils/navigation/vertical';
import { SelectEventCommand } from '@/commands/selection';

/**
 * Navigation method names provided by this factory
 */
type NavigationMethodNames = 'move' | 'jump' | 'select' | 'selectById' | 'selectAtQuant';

/**
 * Factory for creating Navigation API methods.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for navigation
 */
export const createNavigationMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, NavigationMethodNames> & ThisType<MusicEditorAPI> => {
  const { getScore, selectionRef, syncSelection, selectionEngine, setResult, lastInsertedEventIdRef } = ctx;

  return {
    move(direction) {
      const sel = selectionRef.current;
      const score = getScore();
      const staff = score.staves[sel.staffIndex];
      if (!staff) {
        setResult({
          ok: false,
          status: 'error',
          method: 'move',
          message: 'Invalid staff index',
          code: 'INVALID_STAFF',
        });
        return this;
      }

      const measures = staff.measures;

      if (direction === 'left' || direction === 'right') {
        // Use existing navigateSelection utility for horizontal movement
        const newSel = navigateSelection(measures, sel, direction);

        const fullSelection = {
          ...newSel,
          selectedNotes:
            newSel.eventId && newSel.measureIndex !== null
              ? [
                  {
                    staffIndex: newSel.staffIndex,
                    measureIndex: newSel.measureIndex,
                    eventId: newSel.eventId,
                    noteId: newSel.noteId,
                  },
                ]
              : [],
          anchor: null,
        };
        syncSelection(fullSelection);
        setResult({
          ok: true,
          status: 'info',
          method: 'move',
          message: `Moved ${direction}`,
          details: {
            direction,
            newSelection: { measure: newSel.measureIndex, event: newSel.eventId },
          },
        });
      } else if (direction === 'up' || direction === 'down') {
        // Use calculateVerticalNavigation for cross-staff and chord navigation
        // Note: activeDuration defaults to 'quarter' - if needed, expose via API context
        const result = calculateVerticalNavigation(
          score,
          sel,
          direction,
          'quarter', // Default duration for ghost cursor creation
          false, // Default dotted state
          null // No preview note in API context
        );

        if (result?.selection) {
          const fullSelection = {
            ...result.selection,
            selectedNotes:
              result.selection.eventId && result.selection.measureIndex !== null
                ? [
                    {
                      staffIndex: result.selection.staffIndex,
                      measureIndex: result.selection.measureIndex,
                      eventId: result.selection.eventId,
                      noteId: result.selection.noteId,
                    },
                  ]
                : [],
            anchor: null,
          };
          syncSelection(fullSelection);
          setResult({
            ok: true,
            status: 'info',
            method: 'move',
            message: `Moved ${direction}`,
            details: { direction, newSelection: fullSelection },
          });
        } else {
          setResult({
            ok: true,
            status: 'warning',
            method: 'move',
            message: `Cannot move ${direction} (boundary reached)`,
            code: 'BOUNDARY_REACHED',
          });
        }
      }
      return this;
    },

    jump(target) {
      const sel = selectionRef.current;
      const staff = getScore().staves[sel.staffIndex];
      if (!staff || staff.measures.length === 0) {
        setResult({
          ok: false,
          status: 'error',
          method: 'jump',
          message: 'No measures exist',
          code: 'NO_MEASURES',
        });
        return this;
      }

      const measures = staff.measures;
      let targetMeasureIndex: number;
      let targetEventIndex: number;

      switch (target) {
        case 'start-score':
          targetMeasureIndex = 0;
          targetEventIndex = 0;
          break;
        case 'end-score':
          targetMeasureIndex = measures.length - 1;
          targetEventIndex = Math.max(0, measures[targetMeasureIndex].events.length - 1);
          break;
        case 'start-measure':
          targetMeasureIndex = sel.measureIndex ?? 0;
          targetEventIndex = 0;
          break;
        case 'end-measure':
          targetMeasureIndex = sel.measureIndex ?? 0;
          targetEventIndex = Math.max(0, measures[targetMeasureIndex]?.events.length - 1);
          break;
        default:
          setResult({
            ok: false,
            status: 'error',
            method: 'jump',
            message: `Invalid jump target "${target}"`,
            code: 'INVALID_TARGET',
          });
          return this;
      }

      const measure = measures[targetMeasureIndex];
      if (!measure) {
        setResult({
          ok: false,
          status: 'error',
          method: 'jump',
          message: 'Target measure not found',
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      const event = measure.events[targetEventIndex];
      const eventId = event?.id ?? null;
      const noteId = getFirstNoteId(event);

      syncSelection({
        staffIndex: sel.staffIndex,
        measureIndex: targetMeasureIndex,
        eventId,
        noteId,
        selectedNotes: eventId
          ? [{ staffIndex: sel.staffIndex, measureIndex: targetMeasureIndex, eventId, noteId }]
          : [],
        anchor: null,
      });

      setResult({
        ok: true,
        status: 'info',
        method: 'jump',
        message: `Jumped to ${target}`,
        details: { target, measureIndex: targetMeasureIndex, eventIndex: targetEventIndex },
      });

      return this;
    },

    select(measureNum, staffIndex = 0, eventIndex = 0, noteIndex = 0) {
      // Convert 1-based measureNum to 0-based index
      const measureIndex = measureNum - 1;
      const staff = getScore().staves[staffIndex];

      if (!staff?.measures[measureIndex]) {
        setResult({
          ok: false, // Error because invalid direct selection
          status: 'error',
          method: 'select',
          message: `Measure ${measureNum} does not exist`,
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Reset cursor-advance tracking since this is an explicit selection
      // This ensures subsequent addNote() calls insert AT this position
      lastInsertedEventIdRef.current = null;

      // Use SelectEventCommand for proper selection
      selectionEngine.dispatch(
        new SelectEventCommand({
          staffIndex,
          measureIndex,
          eventIndex,
          noteIndex,
        })
      );

      // Sync the ref for chaining
      selectionRef.current = selectionEngine.getState();

      setResult({
        ok: true,
        status: 'info',
        method: 'select',
        message: `Selected measure ${measureNum}`,
        details: { measureNum, staffIndex, eventIndex, noteIndex },
      });

      return this;
    },

    selectAtQuant(measureNum, quant, staffIndex = 0) {
      const measureIndex = measureNum - 1;
      const staff = getScore().staves[staffIndex];
      if (!staff?.measures[measureIndex]) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectAtQuant',
          message: `Measure ${measureNum} does not exist`,
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      const measure = staff.measures[measureIndex];

      // Walk events to find event at quant position
      let currentQuant = 0;
      let found = false;
      for (let i = 0; i < measure.events.length; i++) {
        const event = measure.events[i];
        const eventDuration = getNoteDuration(event.duration, event.dotted);

        if (currentQuant <= quant && quant < currentQuant + eventDuration) {
          // Found the event at this quant position
          // Reset cursor-advance tracking since this is an explicit selection
          lastInsertedEventIdRef.current = null;
          
          selectionEngine.dispatch(
            new SelectEventCommand({
              staffIndex,
              measureIndex,
              eventIndex: i,
              noteIndex: 0,
            })
          );
          selectionRef.current = selectionEngine.getState();
          found = true;
          setResult({
            ok: true,
            status: 'info',
            method: 'selectAtQuant',
            message: `Selected at quant ${quant}`,
            details: { quant, eventIndex: i },
          });
          break;
        }
        currentQuant += eventDuration;
      }

      if (!found) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectAtQuant',
          message: `No event found at quant ${quant} in measure ${measureNum}`,
          code: 'NO_EVENT_AT_QUANT',
        });
      }
      return this;
    },

    selectById(eventId, noteId) {
      const sel = selectionRef.current;
      const staff = getScore().staves[sel.staffIndex];
      if (!staff) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectById',
          message: 'Invalid staff index',
          code: 'INVALID_STAFF',
        });
        return this;
      }

      // Find the event and measure containing this eventId
      // TODO: Optimize lookup map
      let found = false;
      for (let mIdx = 0; mIdx < staff.measures.length; mIdx++) {
        const measure = staff.measures[mIdx];
        const eIdx = measure.events.findIndex((e) => e.id === eventId);
        if (eIdx !== -1) {
          // Find note index if noteId provided
          let noteIndex = 0;
          if (noteId && measure.events[eIdx].notes) {
            const nIdx = measure.events[eIdx].notes.findIndex((n) => n.id === noteId);
            if (nIdx !== -1) noteIndex = nIdx;
          }
          // Reset cursor-advance tracking since this is an explicit selection
          lastInsertedEventIdRef.current = null;
          
          selectionEngine.dispatch(
            new SelectEventCommand({
              staffIndex: sel.staffIndex,
              measureIndex: mIdx,
              eventIndex: eIdx,
              noteIndex,
            })
          );
          selectionRef.current = selectionEngine.getState();
          found = true;
          setResult({
            ok: true,
            status: 'info',
            method: 'selectById',
            message: 'Selected by ID',
            details: { eventId, noteId },
          });
          break;
        }
      }

      if (!found) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectById',
          message: `Event ID ${eventId} not found`,
          code: 'EVENT_NOT_FOUND',
        });
      }
      return this;
    },
  };
};
