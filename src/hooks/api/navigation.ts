import { MusicEditorAPI } from '@/api.types';
import { PreviewNote } from '@/types';
import { APIContext } from './types';
import { getFirstNoteId, getNoteDuration } from '@/utils/core';
import { calculateVerticalNavigation } from '@/utils/navigation/vertical';
import { calculateNextSelection } from '@/utils/navigation/horizontal';
import { SelectEventCommand } from '@/commands/selection';
import { refuse } from '@/refusals';

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
  const { getScore, selectionRef, syncSelection, selectionEngine, setResult } = ctx;

  // Ghost-cursor state persisted across move() calls. Stepping onto a ghost (a tuplet-fill or append
  // cursor) leaves selection.eventId null; the NEXT move must feed that ghost back to the navigators
  // so their ghost branch engages — the API used to pass null and mis-navigated (e.g. a second
  // right-arrow jumped backward into the tuplet). It's only valid while sitting on a ghost, so it's
  // cleared whenever the selection is on a real event. (#6)
  let ghostPreview: PreviewNote | null = null;

  return {
    move(direction) {
      const sel = selectionRef.current;
      // Drop the persisted ghost unless the selection is STILL sitting on it. It's stale if the
      // cursor is now on a real event (eventId set), or if an intervening jump()/select() moved the
      // cursor to a different bar that merely also has eventId:null (e.g. an empty measure — common
      // after grand-staff padding). Validating the ghost's own coordinates here covers every
      // navigation entry point, so move() can't navigate from a stale bar. (#6 follow-up)
      if (
        sel.eventId ||
        (ghostPreview &&
          (ghostPreview.measureIndex !== sel.measureIndex ||
            ghostPreview.staffIndex !== sel.staffIndex))
      ) {
        ghostPreview = null;
      }
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
        // Use calculateNextSelection for horizontal movement (same as keyboard). Feed the persisted
        // ghost so stepping off/through a ghost engages the ghost branch (other params default).
        const navResult = calculateNextSelection(measures, sel, direction, ghostPreview);

        if (!navResult) {
          setResult({
            method: 'move',
            ...refuse('BOUNDARY_REACHED', { message: `Cannot move ${direction} (boundary)` }),
          });
          return this;
        }

        // Remember only a SLOT-ANCHORED ghost (a tuplet-fill ghost carries the reserved slot's
        // eventId) for the next step. A plain APPEND ghost is left unpersisted so move() keeps its
        // long-standing append-cursor navigation (which chord-building recipes rely on).
        ghostPreview = navResult.previewNote?.eventId ? navResult.previewNote : null;

        // When navigating to append position, selection has measureIndex: null
        // but previewNote contains the actual measure. Merge them for API selection.
        const newSel = navResult.selection;
        const measureIndex =
          newSel?.measureIndex ?? navResult.previewNote?.measureIndex ?? sel.measureIndex;

        if (newSel || navResult.previewNote) {
          const fullSelection = {
            ...sel,
            ...(newSel || {}),
            measureIndex, // Use merged measureIndex
            selectedNotes:
              newSel?.eventId && measureIndex !== null
                ? [
                    {
                      staffIndex: newSel.staffIndex ?? sel.staffIndex,
                      measureIndex,
                      eventId: newSel.eventId,
                      noteId: newSel.noteId,
                    },
                  ]
                : [],
            anchor: null,
          };
          syncSelection(fullSelection);
        }

        setResult({
          ok: true,
          status: 'info',
          method: 'move',
          message: `Moved ${direction}`,
          details: {
            direction,
            newSelection: { measure: measureIndex, event: newSel?.eventId ?? null },
            // A COPY of the ghost cursor (a tuplet's free slot, or null) — never the internal
            // closure object, so a caller can't mutate it and corrupt the next navigation.
            previewNote: ghostPreview ? { ...ghostPreview } : null,
          },
        });
      } else if (direction === 'up' || direction === 'down') {
        // Use calculateVerticalNavigation for cross-staff and chord navigation. Feed the persisted
        // ghost so vertical stepping from a ghost cursor works too.
        const result = calculateVerticalNavigation(
          score,
          sel,
          direction,
          'quarter', // Default duration for ghost cursor creation
          false, // Default dotted state
          ghostPreview
        );
        ghostPreview = result?.previewNote?.eventId ? result.previewNote : null;

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
            details: {
              direction,
              newSelection: fullSelection,
              previewNote: ghostPreview ? { ...ghostPreview } : null,
            },
          });
        } else {
          // Single-sourced severity (info) via the registry — the vertical case used to emit
          // 'warning', contradicting the horizontal case and the registry. (#13)
          setResult({
            method: 'move',
            ...refuse('BOUNDARY_REACHED', { message: `Cannot move ${direction} (boundary reached)` }),
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

      // Reserved tuplet slots are blank free space (packed at a group's end) — never a jump target.
      const firstRealIndex = (events: typeof measures[number]['events']) => {
        const idx = events.findIndex((e) => !e.reserved);
        return idx < 0 ? 0 : idx;
      };
      const lastRealIndex = (events: typeof measures[number]['events']) => {
        for (let i = events.length - 1; i >= 0; i--) if (!events[i].reserved) return i;
        return 0;
      };

      switch (target) {
        case 'start-score':
          targetMeasureIndex = 0;
          targetEventIndex = firstRealIndex(measures[0].events);
          break;
        case 'end-score':
          targetMeasureIndex = measures.length - 1;
          targetEventIndex = lastRealIndex(measures[targetMeasureIndex].events);
          break;
        case 'start-measure':
          targetMeasureIndex = sel.measureIndex ?? 0;
          targetEventIndex = firstRealIndex(measures[targetMeasureIndex]?.events ?? []);
          break;
        case 'end-measure':
          targetMeasureIndex = sel.measureIndex ?? 0;
          targetEventIndex = lastRealIndex(measures[targetMeasureIndex]?.events ?? []);
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

    select(measureIndex, staffIndex = 0, eventIndex = 0, noteIndex = 0) {
      const staff = getScore().staves[staffIndex];

      if (!staff?.measures[measureIndex]) {
        setResult({
          ok: false,
          status: 'error',
          method: 'select',
          message: `Measure index ${measureIndex} does not exist`,
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      // Bounds-check the event/note so an out-of-range index reports a failure instead of a false ok
      // + silent append-to-end (mirrors selectAtQuant/selectById). The ONLY carve-out is the default
      // append cursor — eventIndex 0 on an EMPTY measure (a measure/append-position selection). An
      // explicit nonzero index that resolves to nothing is still EVENT_NOT_FOUND, even in an empty bar
      // (Codex P2 on #267).
      const targetMeasure = staff.measures[measureIndex];
      const targetEvent = targetMeasure.events[eventIndex];
      const isEmptyMeasureAppendCursor = targetMeasure.events.length === 0 && eventIndex === 0;
      if (!targetEvent && !isEmptyMeasureAppendCursor) {
        setResult({
          ok: false,
          status: 'error',
          method: 'select',
          message: `Event index ${eventIndex} not found in measure ${measureIndex}`,
          code: 'EVENT_NOT_FOUND',
        });
        return this;
      }
      if (targetEvent && noteIndex !== 0 && !targetEvent.notes[noteIndex]) {
        setResult({
          ok: false,
          status: 'error',
          method: 'select',
          message: `Note index ${noteIndex} not found in measure ${measureIndex}`,
          code: 'NOTE_NOT_FOUND',
        });
        return this;
      }

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
        message: `Selected measure ${measureIndex}`,
        details: { measureIndex, staffIndex, eventIndex, noteIndex },
      });

      return this;
    },

    selectAtQuant(measureIndex, quant, staffIndex = 0) {
      const staff = getScore().staves[staffIndex];
      if (!staff?.measures[measureIndex]) {
        setResult({
          ok: false,
          status: 'error',
          method: 'selectAtQuant',
          message: `Measure index ${measureIndex} does not exist`,
          code: 'MEASURE_NOT_FOUND',
        });
        return this;
      }

      const measure = staff.measures[measureIndex];

      // Walk events to find event at quant position. Use the tuplet ratio (footprint quants) so the
      // quant axis matches every other walker (getStops, chord anchors); a plain nominal duration
      // mis-maps every position after a tuplet. Skip reserved placeholder slots — they draw nothing,
      // so a quant inside a tuplet's free space must not select the blank slot.
      let currentQuant = 0;
      let found = false;
      for (let i = 0; i < measure.events.length; i++) {
        const event = measure.events[i];
        const eventDuration = getNoteDuration(event.duration, event.dotted, event.tuplet);

        if (!event.reserved && currentQuant <= quant && quant < currentQuant + eventDuration) {
          // Found the event at this quant position
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
          message: `No event found at quant ${quant} in measure ${measureIndex}`,
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
