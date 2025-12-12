import { Score, Selection, getActiveStaff } from '../types';
import { calculateTotalQuants } from './core';
import { TIME_SIGNATURES } from '../constants';

/**
 * Calculates the selection state for focusing the score.
 * 
 * Priority:
 * 1. If existingSelection has an eventId, validate it still exists in the score
 * 2. If valid, keep the existing selection (focus memory)
 * 3. Otherwise, position at the first available entry point (first empty or incomplete measure)
 * 
 * @param score - The current score
 * @param existingSelection - The current selection state
 * @returns The new selection state for focusing the score
 */
export function calculateFocusSelection(
  score: Score,
  existingSelection: Selection
): Selection {
  // If there's an existing selection with a valid event, validate it
  if (existingSelection.eventId) {
    const staffIndex = existingSelection.staffIndex || 0;
    const staff = score.staves[staffIndex];
    
    if (staff && existingSelection.measureIndex !== null) {
      const measure = staff.measures[existingSelection.measureIndex];
      if (measure) {
        const event = measure.events.find(
          (e: any) => e.id === existingSelection.eventId
        );
        if (event) {
          // Selection is still valid - keep it (focus memory)
          return existingSelection;
        }
      }
    }
    // Selection was stale, fall through to default positioning
  }

  // No valid selection - find first empty or incomplete measure
  const activeStaff = getActiveStaff(score, 0);
  
  // Guard: handle empty staves (no measures)
  if (!activeStaff.measures || activeStaff.measures.length === 0) {
    return {
      staffIndex: 0,
      measureIndex: null,
      eventId: null,
      noteId: null,
      selectedNotes: []
    };
  }

  // Get quants per measure based on time signature
  const quantsPerMeasure = TIME_SIGNATURES[score.timeSignature as keyof typeof TIME_SIGNATURES] || 64;
  
  // Find first measure that isn't full
  for (let i = 0; i < activeStaff.measures.length; i++) {
    const measure = activeStaff.measures[i];
    
    // Empty measure - position here
    if (!measure.events || measure.events.length === 0) {
      return {
        staffIndex: 0,
        measureIndex: i,
        eventId: null,
        noteId: null,
        selectedNotes: []
      };
    }
    
    // Check if measure is incomplete (has room for more notes)
    const totalQuants = calculateTotalQuants(measure.events);
    if (totalQuants < quantsPerMeasure) {
      // Incomplete measure - select the last event (cursor will be after it)
      const lastEvent = measure.events[measure.events.length - 1];
      return {
        staffIndex: 0,
        measureIndex: i,
        eventId: lastEvent.id,
        noteId: lastEvent.notes?.[0]?.id || null,
        selectedNotes: []
      };
    }
  }

  // All measures are full - position at the last measure's last event
  const lastMeasureIndex = activeStaff.measures.length - 1;
  const lastMeasure = activeStaff.measures[lastMeasureIndex];
  
  if (lastMeasure.events && lastMeasure.events.length > 0) {
    const lastEvent = lastMeasure.events[lastMeasure.events.length - 1];
    return {
      staffIndex: 0,
      measureIndex: lastMeasureIndex,
      eventId: lastEvent.id,
      noteId: lastEvent.notes?.[0]?.id || null,
      selectedNotes: []
    };
  }

  // Empty last measure
  return {
    staffIndex: 0,
    measureIndex: lastMeasureIndex,
    eventId: null,
    noteId: null,
    selectedNotes: []
  };
}
