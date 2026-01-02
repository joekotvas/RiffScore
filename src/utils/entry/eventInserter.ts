/**
 * Event Inserter
 *
 * Pure functions for planning event insertions. These functions compute
 * what changes need to be made without actually dispatching commands,
 * making them easy to test and reason about.
 *
 * @module utils/entry/eventInserter
 */

import { Measure } from '@/types';
import { getNoteDuration, getBreakdownOfQuants } from '@/utils/core';
import { calculateInsertionQuant, getRemainingCapacity, getOverwritePlan } from './insertion';

// ============================================================================
// Types
// ============================================================================

/**
 * Specification for an event to be inserted.
 */
export interface EventSpec {
  duration: string;
  dotted: boolean;
  tied: boolean;
}

/**
 * Context for planning an insertion.
 */
export interface InsertionContext {
  measure: Measure;
  staffIndex: number;
  measureIndex: number;
  startQuant: number;
  mode: 'overwrite' | 'insert';
}

/**
 * Result of planning an insertion operation.
 */
export interface InsertionPlan {
  /** Events to insert in current measure */
  eventsToInsert: EventSpec[];

  /** IDs of events to remove (overwrite mode) */
  eventsToRemove: string[];

  /** Gap-filling rests needed before insertion */
  gapRests: { duration: string; dotted: boolean }[];

  /** Where to insert in the events array */
  insertIndex: number;

  /** Target for cursor after insertion */
  cursorTarget: CursorTarget;

  /** Remaining quants that overflow to next measure */
  overflowQuants: number;

  /** Warning messages for feedback */
  warnings: string[];

  /** Info messages for feedback */
  info: string[];
}

/**
 * Where to place the cursor after an operation.
 */
export interface CursorTarget {
  staffIndex: number;
  measureIndex: number;
  eventId: string | null;
  noteId: string | null;
}

// ============================================================================
// Pure Planning Functions
// ============================================================================

/**
 * Computes the start quant for an insertion based on selection state.
 *
 * @param measure - The target measure
 * @param selectedEventId - Currently selected event ID, or null for append
 * @returns The quant position to insert at
 */
export function computeStartQuant(measure: Measure, selectedEventId: string | null): number {
  if (selectedEventId) {
    return calculateInsertionQuant(measure, selectedEventId) ?? 0;
  }

  // No selection = append after last event
  const events = measure.events;
  if (events.length === 0) {
    return 0;
  }

  const lastEvent = events[events.length - 1];
  const lastStart = calculateInsertionQuant(measure, lastEvent.id) ?? 0;
  return lastStart + getNoteDuration(lastEvent.duration, lastEvent.dotted, lastEvent.tuplet);
}

/**
 * Computes the insertion index and any gap rests needed.
 *
 * @param measure - Current measure state
 * @param targetQuant - The quant position we want to insert at
 * @returns Object with insertIndex and any gap rests needed
 */
export function computeInsertPosition(
  measure: Measure,
  targetQuant: number
): { insertIndex: number; gapRests: { duration: string; dotted: boolean }[] } {
  let insertIndex = 0;
  let scannedQuant = 0;

  while (insertIndex < measure.events.length && scannedQuant < targetQuant) {
    const e = measure.events[insertIndex];
    scannedQuant += getNoteDuration(e.duration, e.dotted, e.tuplet);
    insertIndex++;
  }

  const gapRests: { duration: string; dotted: boolean }[] = [];

  if (scannedQuant < targetQuant) {
    const gap = targetQuant - scannedQuant;
    const parts = getBreakdownOfQuants(gap);
    parts.forEach((p) => gapRests.push({ duration: p.duration, dotted: p.dotted }));
  }

  return { insertIndex, gapRests };
}

/**
 * Plans what events need to be inserted and removed for a single event insertion.
 * This is a pure function that doesn't modify state.
 *
 * @param ctx - Insertion context
 * @param noteQuants - Duration of the event to insert in quants
 * @returns Complete insertion plan
 */
export function planInsertion(ctx: InsertionContext, noteQuants: number): InsertionPlan {
  const { measure, staffIndex, measureIndex, startQuant, mode } = ctx;

  const capacity = getRemainingCapacity(measure, startQuant);
  const warnings: string[] = [];
  const info: string[] = [];

  // Determine what events to insert in this measure
  const eventsToInsert: EventSpec[] = [];
  let overflowQuants = 0;

  if (noteQuants > capacity) {
    if (capacity > 0) {
      // Split: insert head in current measure
      const headParts = getBreakdownOfQuants(capacity);
      headParts.forEach((p) =>
        eventsToInsert.push({
          duration: p.duration,
          dotted: p.dotted,
          tied: true,
        })
      );
      info.push('Note split across measures');
    }
    overflowQuants = noteQuants - capacity;
  } else {
    // Fits entirely
    eventsToInsert.push({
      duration: '', // Will be set by caller based on original duration
      dotted: false,
      tied: false,
    });
  }

  // Determine events to remove (overwrite mode)
  let eventsToRemove: string[] = [];
  if (mode === 'overwrite' && eventsToInsert.length > 0) {
    // Calculate total quants we're inserting in this measure
    let insertQuants = 0;
    for (const evt of eventsToInsert) {
      if (evt.duration) {
        insertQuants += getNoteDuration(evt.duration, evt.dotted);
      }
    }
    // Use capacity if we're using breakdown parts, otherwise use noteQuants
    const effectiveQuants = insertQuants > 0 ? insertQuants : Math.min(noteQuants, capacity);

    const plan = getOverwritePlan(measure, startQuant, effectiveQuants);
    eventsToRemove = plan.toRemove;

    if (eventsToRemove.length > 0) {
      warnings.push(`Overwrote ${eventsToRemove.length} event(s)`);
    }
  }

  // Compute insertion position (after deletions would occur)
  const { insertIndex, gapRests } = computeInsertPosition(measure, startQuant);

  // Compute cursor target: find next event that won't be deleted
  const cursorTarget = computeCursorTarget(
    measure,
    staffIndex,
    measureIndex,
    insertIndex,
    new Set(eventsToRemove)
  );

  return {
    eventsToInsert,
    eventsToRemove,
    gapRests,
    insertIndex,
    cursorTarget,
    overflowQuants,
    warnings,
    info,
  };
}

/**
 * Computes where the cursor should go after insertion.
 *
 * @param measure - The measure (state before insertion)
 * @param staffIndex - Current staff
 * @param measureIndex - Current measure
 * @param insertIndex - Where we're inserting
 * @param deletedIds - IDs of events being deleted
 * @returns Cursor target
 */
export function computeCursorTarget(
  measure: Measure,
  staffIndex: number,
  measureIndex: number,
  insertIndex: number,
  deletedIds: Set<string>
): CursorTarget {
  // Look for next non-deleted event after the insertion point
  for (let i = insertIndex; i < measure.events.length; i++) {
    const e = measure.events[i];
    if (!deletedIds.has(e.id)) {
      return {
        staffIndex,
        measureIndex,
        eventId: e.id,
        noteId: e.notes[0]?.id || null,
      };
    }
  }

  // No next event found = end of measure (append mode)
  return {
    staffIndex,
    measureIndex,
    eventId: null,
    noteId: null,
  };
}

/**
 * Plans the next measure for overflow handling.
 *
 * @param currentMeasureCount - Number of measures in staff
 * @param staffIndex - Current staff
 * @param measureIndex - Current measure
 * @param overflowQuants - Remaining quants to insert
 * @returns Info about next measure and what to create
 */
export function planOverflow(
  currentMeasureCount: number,
  staffIndex: number,
  measureIndex: number,
  overflowQuants: number
): {
  nextMeasureIndex: number;
  needsNewMeasure: boolean;
  eventSpec: EventSpec;
  info: string[];
} {
  const nextMeasureIndex = measureIndex + 1;
  const needsNewMeasure = nextMeasureIndex >= currentMeasureCount;
  const info: string[] = [];

  if (needsNewMeasure) {
    info.push(`Created measure ${nextMeasureIndex + 1}`);
  }

  // Break down overflow into note values
  const parts = getBreakdownOfQuants(overflowQuants);
  const firstPart = parts[0] || { duration: 'quarter', dotted: false };

  return {
    nextMeasureIndex,
    needsNewMeasure,
    eventSpec: {
      duration: firstPart.duration,
      dotted: firstPart.dotted,
      tied: false, // Last part of a tied chain is not tied
    },
    info,
  };
}
