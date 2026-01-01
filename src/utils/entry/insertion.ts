/**
 * Entry Insertion Utilities
 *
 * Helper functions for calculating insertion points, resolving overwrite conflicts,
 * and managing measure capacity for the addNote/addRest API.
 *
 * @module utils/entry/insertion
 */

import { Measure, ScoreEvent } from '@/types';
import { getNoteDuration, getBreakdownOfQuants } from '@/utils/core';
import { eventId } from '@/utils/id';
import { CONFIG } from '@/config';

/**
 * Calculates the quant start position of a specific event within a measure.
 *
 * @param measure - The measure containing the event
 * @param eventId - The ID of the event to locate
 * @returns The start quant (0-based) or null if event not found
 */
export const calculateInsertionQuant = (
  measure: Measure,
  targetEventId: string | null
): number | null => {
  if (!targetEventId) return null;

  let currentQuant = 0;
  for (const event of measure.events) {
    if (event.id === targetEventId) {
      return currentQuant;
    }
    currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
  }
  return null;
};

/**
 * Result of an overwrite analysis.
 */
export interface OverwritePlan {
  /** Events that are fully covered by the new range and should be removed */
  toRemove: string[];
  /** Events that partially overlap and need to be truncated/split */
  toModify: {
    id: string;
    newDuration: string;
    newDotted: boolean;
    startTime: number; // For keeping order
  }[];
}

/**
 * Identifies events that conflict with a proposed insertion range.
 *
 * @param measure - The target measure
 * @param startQuant - Start of the new event
 * @param durationQuant - Duration of the new event
 * @returns Plan for removing/modifying events
 */
export const getOverwritePlan = (
  measure: Measure,
  startQuant: number,
  durationQuant: number
): OverwritePlan => {
  const endQuant = startQuant + durationQuant;
  const plan: OverwritePlan = {
    toRemove: [],
    toModify: [],
  };

  let currentQuant = 0;

  for (const event of measure.events) {
    const eventDuration = getNoteDuration(event.duration, event.dotted, event.tuplet);
    const eventEnd = currentQuant + eventDuration;

    // Check for overlap
    // Overlap exists if (EventStart < NewEnd) AND (EventEnd > NewStart)
    if (currentQuant < endQuant && eventEnd > startQuant) {
      // For MVP: Aggressively remove any event that conflicts with the insertion range.
      // This supports "Overwrite" behavior by clearing the path.
      // Future improvements can handle splitting/truncating (toModify).
      plan.toRemove.push(event.id);
    }

    currentQuant += eventDuration;
  }

  return plan;
};

/**
 * Calculates remaining capacity in a measure from a given point.
 */
export const getRemainingCapacity = (
  measure: Measure,
  startQuant: number,
  maxQuants: number = CONFIG.quantsPerMeasure
): number => {
  return Math.max(0, maxQuants - startQuant);
};

/**
 * Calculates a 'patch' of rests to fill a specific time range.
 */
export const createRestsForRange = (
  durationQuants: number,
  eventIdGenerator: () => string = eventId
): ScoreEvent[] => {
  const parts = getBreakdownOfQuants(durationQuants);
  return parts.map(part => {
    const id = eventIdGenerator();
    const restNoteId = `${id}-rest`;
    return {
      id,
      duration: part.duration,
      dotted: part.dotted,
      isRest: true,
      notes: [{
        id: restNoteId,
        pitch: null,
        isRest: true
      }]
    };
  });
};
