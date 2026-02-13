import { MusicEditorAPI } from '@/api.types';
import { APIContext } from './types';
import {
  SelectAllCommand,
  SelectAllInEventCommand,
  SelectFullEventsCommand,
  ExtendSelectionVerticallyCommand,
  ToggleNoteCommand,
  RangeSelectCommand,
} from '@/commands/selection';

/**
 * Selection method names provided by this factory
 */
type SelectionMethodNames =
  | 'addToSelection'
  | 'selectRangeTo'
  | 'selectAll'
  | 'selectEvent'
  | 'deselectAll'
  | 'selectFullEvents'
  | 'extendSelectionUp'
  | 'extendSelectionDown'
  | 'extendSelectionAllStaves';

/**
 * Factory for creating Selection API methods.
 * Handles multi-selection, expansion, and range operations.
 *
 * Uses ThisType<MusicEditorAPI> so `this` is correctly typed without explicit casts.
 *
 * @param ctx - Shared API context
 * @returns Partial API implementation for selection
 */
export const createSelectionMethods = (
  ctx: APIContext
): Pick<MusicEditorAPI, SelectionMethodNames> & ThisType<MusicEditorAPI> => {
  const { getScore, selectionRef, syncSelection, selectionEngine, setResult } = ctx;

  return {
    addToSelection(measureNum, staffIndex, eventIndex, noteIndex = 0) {
      const measureIndex = measureNum - 1;
      const staff = getScore().staves[staffIndex];
      const event = staff?.measures[measureIndex]?.events[eventIndex];
      if (!event) {
        setResult({
          ok: false,
          status: 'error',
          method: 'addToSelection',
          message: 'Target event not found',
          code: 'EVENT_NOT_FOUND',
        });
        return this;
      }

      const noteId = event.notes?.[noteIndex]?.id ?? null;

      selectionEngine.dispatch(
        new ToggleNoteCommand({
          staffIndex,
          measureIndex,
          eventId: event.id,
          noteId,
        })
      );
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'addToSelection',
        message: 'Toggled selection',
        details: { measureIndex, eventIndex, noteIndex },
      });
      return this;
    },

    selectRangeTo(measureNum, staffIndex, eventIndex, noteIndex = 0) {
      const measureIndex = measureNum - 1;
      const staff = getScore().staves[staffIndex];
      const event = staff?.measures[measureIndex]?.events[eventIndex];
      if (!event) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectRangeTo',
          message: 'Target event not found',
          code: 'EVENT_NOT_FOUND',
        });
        return this;
      }

      const noteId = event.notes?.[noteIndex]?.id ?? null;
      const sel = selectionRef.current;

      // Use existing anchor or create one from current selection
      // Require valid eventId for anchor
      if (!sel.anchor && sel.eventId === null) {
        // No valid anchor - set current as anchor first
        syncSelection({
          ...sel,
          anchor: { staffIndex, measureIndex, eventId: event.id, noteId },
        });
      }

      // Use existing anchor, or derive from current selection, or create new from target
      const anchor =
        sel.anchor ??
        (sel.eventId != null
          ? {
              staffIndex: sel.staffIndex,
              measureIndex: sel.measureIndex ?? 0,
              eventId: sel.eventId,
              noteId: sel.noteId,
            }
          : {
              staffIndex,
              measureIndex,
              eventId: event.id,
              noteId,
            });

      selectionEngine.dispatch(
        new RangeSelectCommand({
          anchor,
          focus: { staffIndex, measureIndex, eventId: event.id, noteId },
        })
      );
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'selectRangeTo',
        message: 'Range selected',
        details: { from: anchor, to: { staffIndex, measureIndex, eventIndex } },
      });
      return this;
    },

    selectAll(scope = 'score') {
      const sel = selectionRef.current;
      selectionEngine.dispatch(
        new SelectAllCommand({
          scope: scope as 'score' | 'staff' | 'measure' | 'event',
          staffIndex: sel.staffIndex,
          measureIndex: sel.measureIndex ?? undefined,
          expandIfSelected: false, // API uses explicit scope
        })
      );
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'selectAll',
        message: `Selected all (${scope})`,
        details: { scope },
      });
      return this;
    },

    /** Select all notes in the current event (chord) */
    selectEvent(measureNum?: number, staffIndex?: number, eventIndex?: number) {
      const sel = selectionRef.current;
      const sIdx = staffIndex ?? sel.staffIndex;
      const mIdx = measureNum !== undefined ? measureNum - 1 : sel.measureIndex;

      if (mIdx === null) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectEvent',
          message: 'No measure selected',
          code: 'NO_SELECTION',
        });
        return this;
      }

      const staff = getScore().staves[sIdx];
      if (!staff) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectEvent',
          message: 'Staff not found',
          code: 'STAFF_NOT_FOUND',
        });
        return this;
      }

      const measure = staff.measures[mIdx];
      if (!measure) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectEvent',
          message: 'Measure not found',
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Get event
      const eIdx = eventIndex ?? measure.events.findIndex((e) => e.id === sel.eventId);
      const event = measure.events[eIdx];
      if (!event) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectEvent',
          message: 'Event not found',
          code: 'EVENT_NOT_FOUND',
        });
        return this;
      }

      selectionEngine.dispatch(
        new SelectAllInEventCommand({
          staffIndex: sIdx,
          measureIndex: mIdx,
          eventId: event.id,
        })
      );
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'selectEvent',
        message: 'Event selected',
        details: { eventId: event.id },
      });
      return this;
    },

    deselectAll() {
      syncSelection({
        staffIndex: selectionRef.current.staffIndex,
        measureIndex: null,
        eventId: null,
        noteId: null,
        selectedNotes: [],
        anchor: null,
      });
      setResult({
        ok: true,
        status: 'info',
        method: 'deselectAll',
        message: 'Selection cleared',
      });
      return this;
    },

    /**
     * Select all notes in all touched events (fill partial chords).
     * "Touched" = any event that has at least one note selected.
     */
    selectFullEvents() {
      selectionEngine.dispatch(new SelectFullEventsCommand());
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'selectFullEvents',
        message: 'Expanded selection to full events',
      });
      return this;
    },

    /**
     * Extend selection to quant-aligned events in the staff above.
     * Uses anchor-based cursor model - can expand OR contract.
     */
    extendSelectionUp() {
      selectionEngine.dispatch(new ExtendSelectionVerticallyCommand({ direction: 'up' }));
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'extendSelectionUp',
        message: 'Extended selection up',
      });
      return this;
    },

    /**
     * Extend selection to quant-aligned events in the staff below.
     * Uses anchor-based cursor model - can expand OR contract.
     */
    extendSelectionDown() {
      selectionEngine.dispatch(new ExtendSelectionVerticallyCommand({ direction: 'down' }));
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'extendSelectionDown',
        message: 'Extended selection down',
      });
      return this;
    },

    /**
     * Extend selection to quant-aligned events across ALL staves.
     */
    extendSelectionAllStaves() {
      selectionEngine.dispatch(new ExtendSelectionVerticallyCommand({ direction: 'all' }));
      selectionRef.current = selectionEngine.getState();
      setResult({
        ok: true,
        status: 'info',
        method: 'extendSelectionAllStaves',
        message: 'Extended selection to all staves',
      });
      return this;
    },
  };
};
