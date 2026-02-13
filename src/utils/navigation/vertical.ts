/**
 * Vertical Navigation Utilities
 *
 * Functions for calculating vertical (Cmd+Up/Down) keyboard navigation.
 * Handles chord traversal, cross-staff switching, and staff cycling.
 *
 * @tested navigationHelpers.test.ts
 */

import { calculateTotalQuants, getNoteDuration } from '../core';
import { getMidi } from '@/services/MusicService';
import { CONFIG } from '@/config';
import {
  Note,
  Score,
  ScoreEvent,
  PreviewNote,
  NavigationSelection,
  VerticalNavigationResult,
} from '@/types';
import { getAppendPreviewNote, getDefaultPitchForClef } from './previewNote';
import { findEventAtQuantPosition, selectNoteInEventByDirection } from './crossStaff';
import { getAdjustedDuration } from './horizontal';

/**
 * Calculates cross-staff selection based on quant alignment.
 * Finds the event in the target staff that overlaps with the current selection's
 * absolute quant position within the measure.
 *
 * @param score - The complete score object
 * @param selection - Current selection (must have valid staffIndex, measureIndex, eventId)
 * @param direction - 'up' or 'down'
 * @param activeDuration - Duration for ghost cursor if no aligned event found
 * @param isDotted - Whether duration is dotted
 * @returns New selection with aligned event, or null if target staff doesn't exist
 *
 * @see calculateVerticalNavigation - Higher-level function that includes chord traversal
 */
export const calculateCrossStaffSelection = (
  score: Score,
  selection: NavigationSelection,
  direction: 'up' | 'down',
  activeDuration: string = 'quarter',
  isDotted: boolean = false
): VerticalNavigationResult | null => {
  const { staffIndex, measureIndex, eventId } = selection;
  if (staffIndex === undefined || measureIndex === null || !eventId) return null;

  const currentStaff = score.staves[staffIndex];
  if (!currentStaff) return null;

  // Determine target staff
  const targetStaffIndex = direction === 'up' ? staffIndex - 1 : staffIndex + 1;
  if (targetStaffIndex < 0 || targetStaffIndex >= score.staves.length) return null;

  const targetStaff = score.staves[targetStaffIndex];

  // Get current event to determine Start Quant Offset within the measure
  const currentMeasure = currentStaff.measures[measureIndex];
  if (!currentMeasure) return null;

  let currentQuantStart = 0;
  const currentEvent = currentMeasure.events.find((e: ScoreEvent) => {
    if (e.id === eventId) return true;
    currentQuantStart += getNoteDuration(e.duration, e.dotted, e.tuplet);
    return false;
  });

  if (!currentEvent) return null;

  // Now look at target staff, same measure index assuming sync
  const targetMeasure = targetStaff.measures[measureIndex];

  if (!targetMeasure) return null;

  // Find event in target measure that contains currentQuantStart
  let targetEvent = null;
  let targetQuant = 0;

  for (const e of targetMeasure.events) {
    const duration = getNoteDuration(e.duration, e.dotted, e.tuplet);
    const start = targetQuant;
    const end = targetQuant + duration;

    // Check overlap: if currentQuantStart falls within [start, end)
    if (currentQuantStart >= start && currentQuantStart < end) {
      targetEvent = e;
      break;
    }
    targetQuant += duration;
  }

  if (targetEvent) {
    const noteId = targetEvent.notes.length > 0 ? targetEvent.notes[0].id : null;

    return {
      selection: {
        staffIndex: targetStaffIndex,
        measureIndex,
        eventId: targetEvent.id,
        noteId,
        selectedNotes: [], // Clear multi-select
        anchor: null, // Clear anchor
      },
      previewNote: null,
    };
  } else {
    // No event found at this time (Gap or Empty Measure)
    // Fallback to "Append Position" using consistent logic

    // Determine Pitch: Default to a "middle" note for the staff clef.
    const clef = targetStaff.clef || 'treble';
    const defaultPitch = getDefaultPitchForClef(clef);

    const previewNote = getAppendPreviewNote(
      targetMeasure,
      measureIndex,
      targetStaffIndex,
      activeDuration,
      isDotted,
      defaultPitch
    );

    return {
      selection: {
        staffIndex: targetStaffIndex,
        measureIndex,
        eventId: null,
        noteId: null,
        selectedNotes: [],
        anchor: null,
      },
      previewNote,
    };
  }
};

/**
 * Unified vertical navigation for Cmd+Up/Down keyboard shortcuts.
 * Handles scenarios in priority order:
 * 1. **Chord track navigation**: Navigate to/from chord symbols above the staff
 * 2. **Chord traversal**: Navigate between notes within a chord
 * 3. **Cross-staff switching**: Move to aligned event in adjacent staff
 * 4. **Staff cycling**: Wrap to opposite staff at boundaries
 *
 * Also supports ghost cursor navigation (moving preview between staves).
 *
 * @param score - The complete score object
 * @param selection - Current selection state
 * @param direction - 'up' or 'down'
 * @param activeDuration - Duration for ghost cursor if needed
 * @param isDotted - Whether duration is dotted
 * @param previewNote - Optional ghost cursor state
 * @param currentQuantsPerMeasure - Time signature quants
 * @param chordTrackFocused - Whether chord track currently has focus
 * @param selectedChordId - Currently selected chord ID (when chord track focused)
 * @returns Navigation result, or null if no change
 *
 * @tested navigationHelpers.test.ts
 */
export const calculateVerticalNavigation = (
  score: Score,
  selection: NavigationSelection,
  direction: 'up' | 'down',
  activeDuration: string = 'quarter',
  isDotted: boolean = false,
  previewNote: PreviewNote | null = null,
  currentQuantsPerMeasure: number = CONFIG.quantsPerMeasure,
  chordTrackFocused: boolean = false,
  selectedChordId: string | null = null
): VerticalNavigationResult | null => {
  const { staffIndex = 0, measureIndex, eventId } = selection;

  // --- 0. Handle chord track navigation ---

  // If currently focused on chord track and going DOWN, return to notes
  if (chordTrackFocused && direction === 'down' && selectedChordId) {
    const selectedChord = score.chordTrack?.find((c) => c.id === selectedChordId);
    if (selectedChord) {
      const targetMeasureIndex = Math.floor(selectedChord.quant / currentQuantsPerMeasure);
      const localQuant = selectedChord.quant % currentQuantsPerMeasure;
      const topStaff = score.staves[0];
      const targetMeasure = topStaff?.measures[targetMeasureIndex];

      if (targetMeasure) {
        // Find event at this quant
        let currentQuant = 0;
        for (const event of targetMeasure.events) {
          if (currentQuant === localQuant && !event.isRest && event.notes?.length > 0) {
            return {
              selection: {
                staffIndex: 0,
                measureIndex: targetMeasureIndex,
                eventId: event.id,
                noteId: event.notes[0].id,
                selectedNotes: [],
                anchor: null,
              },
              previewNote: null,
              leavingChordTrack: true,
            };
          }
          currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
          if (currentQuant > localQuant) break;
        }
      }
    }
    return null;
  }

  // If on chord track and going UP, no action (already at top)
  if (chordTrackFocused && direction === 'up') {
    return null;
  }

  // Handle ghost cursor navigation (no eventId)
  if (!eventId && previewNote) {
    const ghostMeasureIndex = previewNote.measureIndex;
    const ghostStaffIndex = previewNote.staffIndex ?? staffIndex;
    const currentQuantStart = previewNote.quant ?? 0;

    // Determine target staff for ghost cursor
    const targetStaffIndex = direction === 'up' ? ghostStaffIndex - 1 : ghostStaffIndex + 1;

    // Check if we can switch staff
    if (targetStaffIndex >= 0 && targetStaffIndex < score.staves.length) {
      const targetStaff = score.staves[targetStaffIndex];
      const targetMeasure = targetStaff?.measures[ghostMeasureIndex];

      if (targetMeasure) {
        // Find event that overlaps with ghost cursor's quant position
        let targetEvent = null;
        let targetQuant = 0;

        for (const e of targetMeasure.events) {
          const duration = getNoteDuration(e.duration, e.dotted, e.tuplet);
          const start = targetQuant;
          const end = targetQuant + duration;

          if (currentQuantStart >= start && currentQuantStart < end) {
            targetEvent = e;
            break;
          }
          targetQuant += duration;
        }

        if (targetEvent) {
          return {
            selection: {
              staffIndex: targetStaffIndex,
              measureIndex: ghostMeasureIndex,
              eventId: targetEvent.id,
              noteId: selectNoteInEventByDirection(targetEvent, direction),
              selectedNotes: [],
              anchor: null,
            },
            previewNote: null,
          };
        } else if (targetMeasure.events.length > 0) {
          // No overlapping event, but measure has events - select first event
          const firstEvent = targetMeasure.events[0];
          return {
            selection: {
              staffIndex: targetStaffIndex,
              measureIndex: ghostMeasureIndex,
              eventId: firstEvent.id,
              noteId: selectNoteInEventByDirection(firstEvent, direction),
              selectedNotes: [],
              anchor: null,
            },
            previewNote: null,
          };
        } else {
          // No events - move ghost cursor to target staff
          const defaultPitch = getDefaultPitchForClef(targetStaff.clef || 'treble');

          return {
            selection: {
              staffIndex: targetStaffIndex,
              measureIndex: null, // Ghost cursor: measure is in previewNote
              eventId: null,
              noteId: null,
              selectedNotes: [],
              anchor: null,
            },
            previewNote: {
              ...previewNote,
              staffIndex: targetStaffIndex,
              pitch: defaultPitch,
            },
          };
        }
      }
    }

    // At boundary - cycle to opposite staff (ghost cursor)
    // Guard: single-staff scores can't cycle
    if (score.staves.length <= 1) return null;

    const cycleStaffIndex = direction === 'up' ? score.staves.length - 1 : 0;
    const cycleStaff = score.staves[cycleStaffIndex];
    const cycleMeasure = cycleStaff?.measures[ghostMeasureIndex];

    // Cycle ghost cursor to opposite staff if measure exists and we're not already there
    if (cycleMeasure && cycleStaffIndex !== ghostStaffIndex) {
      const defaultPitch = getDefaultPitchForClef(cycleStaff.clef || 'treble');

      return {
        selection: {
          staffIndex: cycleStaffIndex,
          measureIndex: null, // Ghost cursor: measure is in previewNote
          eventId: null,
          noteId: null,
          selectedNotes: [],
          anchor: null,
        },
        previewNote: {
          ...previewNote,
          staffIndex: cycleStaffIndex,
          pitch: defaultPitch,
        },
      };
    }

    return null;
  }

  if (measureIndex === null || !eventId) return null;

  const currentStaff = score.staves[staffIndex];
  if (!currentStaff) return null;

  const measures = currentStaff.measures;
  const measure = measures[measureIndex];
  if (!measure) return null;

  // Find current event and its quant position
  let currentQuantStart = 0;
  const eventIdx = measure.events.findIndex((e: ScoreEvent) => {
    if (e.id === eventId) return true;
    currentQuantStart += getNoteDuration(e.duration, e.dotted, e.tuplet);
    return false;
  });

  if (eventIdx === -1) return null;

  const currentEvent = measure.events[eventIdx];
  const sortedNotes = currentEvent.notes?.length
    ? [...currentEvent.notes].sort(
        (a: Note, b: Note) => getMidi(a.pitch ?? 'C4') - getMidi(b.pitch ?? 'C4')
      )
    : [];

  // 1. Try chord navigation first (between notes within a chord)
  if (sortedNotes.length > 1 && selection.noteId) {
    const currentNoteIdx = sortedNotes.findIndex((n: Note) => n.id === selection.noteId);
    if (currentNoteIdx !== -1) {
      const newIdx = direction === 'up' ? currentNoteIdx + 1 : currentNoteIdx - 1;
      if (newIdx >= 0 && newIdx < sortedNotes.length) {
        // Navigate within chord
        return {
          selection: { ...selection, noteId: sortedNotes[newIdx].id },
          previewNote: null,
        };
      }
    }
  }

  // 2. Check for chord track navigation (UP from topmost staff, top note)
  if (direction === 'up' && staffIndex === 0 && score.chordTrack?.length) {
    // Check if we're at the top note of the chord
    const isAtTopNote =
      sortedNotes.length <= 1 ||
      !selection.noteId ||
      sortedNotes[sortedNotes.length - 1]?.id === selection.noteId;

    if (isAtTopNote) {
      // Calculate global quant for current position
      const globalQuant = measureIndex * currentQuantsPerMeasure + currentQuantStart;

      // Check if there's a chord at this position
      const chordAtQuant = score.chordTrack.find((c) => c.quant === globalQuant);
      if (chordAtQuant) {
        return {
          selection: {
            ...selection,
            selectedNotes: [],
            anchor: null,
          },
          previewNote: null,
          chordId: chordAtQuant.id,
        };
      }
    }
  }

  // 3. At chord boundary - try cross-staff navigation
  const targetStaffIndex = direction === 'up' ? staffIndex - 1 : staffIndex + 1;
  const canSwitchStaff = targetStaffIndex >= 0 && targetStaffIndex < score.staves.length;

  if (canSwitchStaff) {
    const targetStaff = score.staves[targetStaffIndex];
    const targetMeasure = targetStaff.measures[measureIndex];

    if (targetMeasure) {
      // Find event that overlaps with current quant position
      let targetEvent = null;
      let targetQuant = 0;

      for (const e of targetMeasure.events) {
        const duration = getNoteDuration(e.duration, e.dotted, e.tuplet);
        const start = targetQuant;
        const end = targetQuant + duration;

        if (currentQuantStart >= start && currentQuantStart < end) {
          targetEvent = e;
          break;
        }
        targetQuant += duration;
      }

      if (targetEvent) {
        return {
          selection: {
            staffIndex: targetStaffIndex,
            measureIndex,
            eventId: targetEvent.id,
            noteId: selectNoteInEventByDirection(targetEvent, direction),
            selectedNotes: [],
            anchor: null,
          },
          previewNote: null,
        };
      } else {
        // No event at this quant - show ghost cursor with adjusted duration
        const totalQuants = calculateTotalQuants(targetMeasure.events);
        const availableQuants = currentQuantsPerMeasure - totalQuants;
        const adjusted = getAdjustedDuration(availableQuants, activeDuration, isDotted);

        if (adjusted) {
          const defaultPitch = getDefaultPitchForClef(targetStaff.clef || 'treble');

          return {
            selection: {
              staffIndex: targetStaffIndex,
              measureIndex: null, // Clear measureIndex for ghost cursor state
              eventId: null,
              noteId: null,
              selectedNotes: [],
              anchor: null,
            },
            previewNote: {
              measureIndex,
              staffIndex: targetStaffIndex,
              quant: totalQuants, // Position where ghost would be added
              visualQuant: totalQuants,
              pitch: defaultPitch,
              duration: adjusted.duration,
              dotted: adjusted.dotted,
              mode: 'APPEND',
              index: targetMeasure.events.length,
              isRest: false,
            },
          };
        }
      }
    }
  }

  // 4. At staff boundary - check for chord track navigation on DOWN cycle
  // When going DOWN from the last staff, cycle to chord track if chord exists
  if (
    direction === 'down' &&
    staffIndex === score.staves.length - 1 &&
    score.chordTrack?.length
  ) {
    // Check if we're at the bottom note
    const isAtBottomNote =
      sortedNotes.length <= 1 ||
      !selection.noteId ||
      sortedNotes[0]?.id === selection.noteId;

    if (isAtBottomNote) {
      // Calculate global quant for current position
      const globalQuant = measureIndex * currentQuantsPerMeasure + currentQuantStart;

      // Check if there's a chord at this position
      const chordAtQuant = score.chordTrack.find((c) => c.quant === globalQuant);
      if (chordAtQuant) {
        return {
          selection: {
            ...selection,
            selectedNotes: [],
            anchor: null,
          },
          previewNote: null,
          chordId: chordAtQuant.id,
        };
      }
    }
  }

  // 5. At staff boundary (top or bottom) - cycle to opposite staff
  // Guard: single-staff scores can't cycle
  if (score.staves.length <= 1) return null;

  const cycleStaffIndex = direction === 'up' ? score.staves.length - 1 : 0;
  if (cycleStaffIndex === staffIndex) return null; // Already on this staff

  const cycleStaff = score.staves[cycleStaffIndex];
  const cycleMeasure = cycleStaff?.measures[measureIndex];

  if (cycleMeasure) {
    // Find event at current quant in cycle target
    const cycleEvent = findEventAtQuantPosition(cycleMeasure, currentQuantStart);

    if (cycleEvent) {
      return {
        selection: {
          staffIndex: cycleStaffIndex,
          measureIndex,
          eventId: cycleEvent.id,
          noteId: selectNoteInEventByDirection(cycleEvent, direction),
          selectedNotes: [],
          anchor: null,
        },
        previewNote: null,
      };
    } else {
      // No event - show ghost cursor with adjusted duration
      const totalQuants = calculateTotalQuants(cycleMeasure.events);
      const availableQuants = currentQuantsPerMeasure - totalQuants;
      const adjusted = getAdjustedDuration(availableQuants, activeDuration, isDotted);

      if (adjusted) {
        const defaultPitch = getDefaultPitchForClef(cycleStaff.clef || 'treble');

        return {
          selection: {
            staffIndex: cycleStaffIndex,
            measureIndex: null, // Clear for ghost cursor state
            eventId: null,
            noteId: null,
            selectedNotes: [],
            anchor: null,
          },
          previewNote: {
            measureIndex,
            staffIndex: cycleStaffIndex,
            quant: totalQuants,
            visualQuant: totalQuants,
            pitch: defaultPitch,
            duration: adjusted.duration,
            dotted: adjusted.dotted,
            mode: 'APPEND',
            index: cycleMeasure.events.length,
            isRest: false,
          },
        };
      }
    }
  }

  return null;
};

/**
 * Result of horizontal chord navigation.
 */
export interface ChordNavigationResult {
  /** ID of the chord to select, or null if navigation should leave chord track */
  chordId: string | null;
  /** If true, no more chords in this direction - stay on current chord */
  atBoundary: boolean;
}

/**
 * Calculates horizontal navigation between chord symbols.
 * Used when chord track has focus and user presses left/right or tab/shift+tab.
 *
 * @param chordTrack - Array of chord symbols sorted by quant
 * @param selectedChordId - Currently selected chord ID
 * @param direction - 'left' or 'right'
 * @returns Navigation result with target chord ID, or null if no chords
 */
export const calculateChordHorizontalNavigation = (
  chordTrack: { id: string; quant: number }[] | undefined,
  selectedChordId: string | null,
  direction: 'left' | 'right'
): ChordNavigationResult | null => {
  if (!chordTrack?.length) return null;
  if (!selectedChordId) return null;

  const currentIndex = chordTrack.findIndex((c) => c.id === selectedChordId);
  if (currentIndex === -1) return null;

  const newIndex = direction === 'right' ? currentIndex + 1 : currentIndex - 1;

  // At boundary - stay on current chord
  if (newIndex < 0 || newIndex >= chordTrack.length) {
    return { chordId: selectedChordId, atBoundary: true };
  }

  return { chordId: chordTrack[newIndex].id, atBoundary: false };
};
