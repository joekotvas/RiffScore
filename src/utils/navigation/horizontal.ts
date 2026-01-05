/**
 * Horizontal Navigation Utilities
 *
 * Functions for calculating left/right keyboard navigation between events.
 * Handles standard navigation, ghost cursor mode, and cross-measure navigation.
 *
 * @tested interactionUtils.test.ts
 */

import { calculateTotalQuants, getNoteDuration, getFirstNoteId } from '../core';
import { CONFIG } from '@/config';
import {
  Measure,
  ScoreEvent,
  PreviewNote,
  AudioFeedback,
  NavigationSelection,
  HorizontalNavigationResult,
  Selection as ScoreSelection,
} from '@/types';
import {
  getAppendPreviewNote,
  getDefaultPitchForClef,
  createGhostCursorResult,
} from './previewNote';
import { notesToAudioNotes } from './transposition';

// --- Helpers ---

/**
 * Helper to get the pitch from an event, or fall back to the clef default.
 */
const getLastPitch = (event: ScoreEvent | undefined, clef: string): string => {
  if (!event || event.isRest || !event.notes?.length) {
    return getDefaultPitchForClef(clef);
  }
  return event.notes[0].pitch ?? getDefaultPitchForClef(clef);
};

/**
 * Creates audio feedback object from an event.
 */
const createAudioFeedback = (event: ScoreEvent): AudioFeedback | null => {
  if (event.isRest) return null;
  const audioNotes = notesToAudioNotes(event.notes);
  if (audioNotes.length === 0) return null;
  return { notes: audioNotes, duration: event.duration, dotted: event.dotted };
};

/**
 * Attempts to create a ghost cursor result if the duration fits in the target measure.
 */
const createGhostResultIfFits = (
  measures: Measure[],
  targetMeasureIndex: number,
  staffIndex: number,
  availableQuants: number,
  activeDuration: string,
  isDotted: boolean,
  pitch: string,
  inputMode: 'NOTE' | 'REST'
): HorizontalNavigationResult | null => {
  const measure = measures[targetMeasureIndex];
  if (!measure) return null;

  // If specific space isn't checked (availableQuants <= 0), we might still allow it
  // if it's the last measure (overflow) or we simply want to force a fit (e.g. empty measure).
  const adjusted =
    availableQuants > 0
      ? getAdjustedDuration(availableQuants, activeDuration, isDotted)
      : { duration: activeDuration, dotted: isDotted };

  if (!adjusted) return null;

  return createGhostCursorResult(
    staffIndex,
    getAppendPreviewNote(
      measure,
      targetMeasureIndex,
      staffIndex,
      adjusted.duration,
      adjusted.dotted,
      pitch,
      inputMode === 'REST'
    )
  );
};

// --- Core Logic ---

/**
 * Navigates the selection horizontally (left/right) between events.
 */
export const navigateSelection = (
  measures: Measure[],
  selection: ScoreSelection,
  direction: 'left' | 'right'
): ScoreSelection => {
  const { measureIndex, eventId } = selection;
  if (measureIndex === null) return selection;

  const measure = measures[measureIndex];
  if (!measure) return selection;

  // Handle detached cursor (eventId is null) - Snap to start or end of measure
  if (!eventId) {
    if (measure.events.length === 0) {
      if (direction === 'left' && measureIndex > 0) {
        return { ...selection, measureIndex: measureIndex - 1, eventId: null };
      }
      if (direction === 'right' && measureIndex < measures.length - 1) {
        return { ...selection, measureIndex: measureIndex + 1, eventId: null };
      }
      return selection;
    }

    if (direction === 'left') {
      const lastEvent = measure.events[measure.events.length - 1];
      return { ...selection, eventId: lastEvent.id, noteId: getFirstNoteId(lastEvent) };
    } else {
      const firstEvent = measure.events[0];
      return { ...selection, eventId: firstEvent.id, noteId: getFirstNoteId(firstEvent) };
    }
  }

  const eventIdx = measure.events.findIndex((e) => e.id === eventId);
  if (eventIdx === -1) return selection;

  if (direction === 'left') {
    // 1. Previous event in current measure
    if (eventIdx > 0) {
      const prevEvent = measure.events[eventIdx - 1];
      return { ...selection, eventId: prevEvent.id, noteId: getFirstNoteId(prevEvent) };
    }
    // 2. Last event of previous measure
    else if (measureIndex > 0) {
      const prevMeasure = measures[measureIndex - 1];
      if (prevMeasure.events.length > 0) {
        const prevEvent = prevMeasure.events[prevMeasure.events.length - 1];
        return {
          ...selection,
          measureIndex: measureIndex - 1,
          eventId: prevEvent.id,
          noteId: getFirstNoteId(prevEvent),
        };
      }
    }
  } else if (direction === 'right') {
    // 1. Next event in current measure
    if (eventIdx < measure.events.length - 1) {
      const nextEvent = measure.events[eventIdx + 1];
      return { ...selection, eventId: nextEvent.id, noteId: getFirstNoteId(nextEvent) };
    }
    // 2. First event of next measure
    else if (measureIndex < measures.length - 1) {
      const nextMeasure = measures[measureIndex + 1];
      if (nextMeasure.events.length > 0) {
        const nextEvent = nextMeasure.events[0];
        return {
          ...selection,
          measureIndex: measureIndex + 1,
          eventId: nextEvent.id,
          noteId: getFirstNoteId(nextEvent),
        };
      }
    }
  }

  return selection;
};

/**
 * Adjusts requested duration to fit available space in a measure.
 */
export const getAdjustedDuration = (
  availableQuants: number,
  requestedDuration: string,
  isDotted: boolean
): { duration: string; dotted: boolean } | null => {
  if (getNoteDuration(requestedDuration, isDotted) <= availableQuants) {
    return { duration: requestedDuration, dotted: isDotted };
  }

  const durations = ['whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirtysecond'];
  for (const dur of durations) {
    if (getNoteDuration(dur, true) <= availableQuants) return { duration: dur, dotted: true };
    if (getNoteDuration(dur, false) <= availableQuants) return { duration: dur, dotted: false };
  }

  return null;
};

/**
 * Creates a navigation result for selecting an event.
 */
export const createEventResult = (
  staffIndex: number,
  measureIndex: number,
  event: ScoreEvent
): HorizontalNavigationResult => {
  const noteId = getFirstNoteId(event);
  return {
    selection: { staffIndex, measureIndex, eventId: event.id, noteId },
    previewNote: null,
    audio: createAudioFeedback(event),
    shouldCreateMeasure: false,
  };
};

/**
 * Handles logic when the user is currently in Ghost/Preview mode.
 */
const handleGhostNavigation = (
  measures: Measure[],
  previewNote: PreviewNote,
  direction: 'left' | 'right',
  params: {
    staffIndex: number;
    activeDuration: string;
    isDotted: boolean;
    currentQuantsPerMeasure: number;
    clef: string;
    inputMode: 'NOTE' | 'REST';
  }
): HorizontalNavigationResult | null => {
  const { staffIndex, activeDuration, isDotted, currentQuantsPerMeasure, clef, inputMode } = params;
  const { measureIndex } = previewNote;
  const measure = measures[measureIndex];

  // --- Left: Snap to existing event or prev measure ghost ---
  if (direction === 'left') {
    // 1. Try to find an event in the current measure before the ghost cursor
    if (measure && measure.events.length > 0) {
      // Calculate ghost quant position
      const totalMeasureQuants = calculateTotalQuants(measure.events);
      const ghostQuant =
        previewNote.quant ?? (previewNote.mode === 'APPEND' ? totalMeasureQuants : 0);

      let eventQuant = 0;
      let targetEvent: ScoreEvent | null = null;

      // Find event ending at or containing the ghost quant
      for (const e of measure.events) {
        const dur = getNoteDuration(e.duration, e.dotted, e.tuplet);
        if (eventQuant + dur <= ghostQuant) targetEvent = e;
        else if (eventQuant < ghostQuant && ghostQuant < eventQuant + dur) {
          targetEvent = e;
          break;
        }
        eventQuant += dur;
      }

      if (targetEvent) return createEventResult(staffIndex, measureIndex, targetEvent);
    }

    // 2. Go to previous measure (Ghost or Event)
    if (measureIndex > 0) {
      const prevMeasure = measures[measureIndex - 1];
      const prevTotal = calculateTotalQuants(prevMeasure.events);
      const available = currentQuantsPerMeasure - prevTotal;

      // Try Ghost in prev measure
      if (available > 0) {
        const pitch = previewNote.pitch || getDefaultPitchForClef(clef);
        const ghostResult = createGhostResultIfFits(
          measures,
          measureIndex - 1,
          staffIndex,
          available,
          activeDuration,
          isDotted,
          pitch,
          inputMode
        );
        if (ghostResult) return ghostResult;
      }

      // Fallback: Last event of prev measure
      if (prevMeasure.events.length > 0) {
        return createEventResult(
          staffIndex,
          measureIndex - 1,
          prevMeasure.events[prevMeasure.events.length - 1]
        );
      }
    }
  }

  // --- Right: Snap to next measure (Event or Ghost) ---
  if (direction === 'right') {
    const nextIndex = measureIndex + 1;
    if (nextIndex < measures.length) {
      const nextMeasure = measures[nextIndex];

      // 1. Existing event in next measure
      if (nextMeasure.events.length > 0) {
        return createEventResult(staffIndex, nextIndex, nextMeasure.events[0]);
      }

      // 2. Ghost in next measure
      const nextTotal = calculateTotalQuants(nextMeasure.events);
      const available = currentQuantsPerMeasure - nextTotal;
      const pitch = previewNote.pitch || getDefaultPitchForClef(clef);

      return createGhostResultIfFits(
        measures,
        nextIndex,
        staffIndex,
        available,
        activeDuration,
        isDotted,
        pitch,
        inputMode
      );
    }
  }

  return null;
};

/**
 * Handles logic when the user currently has a specific event selected.
 */
const handleEventNavigation = (
  measures: Measure[],
  selection: ScoreSelection,
  direction: 'left' | 'right',
  params: {
    staffIndex: number;
    activeDuration: string;
    isDotted: boolean;
    currentQuantsPerMeasure: number;
    clef: string;
    inputMode: 'NOTE' | 'REST';
  }
): HorizontalNavigationResult | null => {
  const { staffIndex, activeDuration, isDotted, currentQuantsPerMeasure, clef, inputMode } = params;
  const { measureIndex, eventId } = selection;

  if (measureIndex === null || !eventId) return null;

  const measure = measures[measureIndex];
  const eventIdx = measure.events.findIndex((e) => e.id === eventId);
  const currentEvent = measure.events[eventIdx];

  // --- Boundary Checks (Entering Ghost Mode) ---

  // 1. Moving Left from First Event -> Try Ghost in Prev Measure
  if (direction === 'left' && eventIdx === 0 && measureIndex > 0) {
    const prevMeasure = measures[measureIndex - 1];
    const prevTotal = calculateTotalQuants(prevMeasure.events);
    const available = currentQuantsPerMeasure - prevTotal;

    if (available > 0) {
      const pitch = getLastPitch(currentEvent, clef);
      const ghostResult = createGhostResultIfFits(
        measures,
        measureIndex - 1,
        staffIndex,
        available,
        activeDuration,
        isDotted,
        pitch,
        inputMode
      );
      if (ghostResult) return ghostResult;
    }
  }

  // 2. Moving Right from Last Event -> Try Ghost in Current or Next Measure
  if (direction === 'right' && eventIdx === measure.events.length - 1) {
    const totalQuants = calculateTotalQuants(measure.events);
    const available = currentQuantsPerMeasure - totalQuants;
    const isLastMeasure = measureIndex === measures.length - 1;
    const pitch = getLastPitch(currentEvent, clef);

    // A. Ghost in Current Measure (if space exists OR it's the very last measure)
    if (available > 0 || isLastMeasure) {
      // If we are overflowing the last measure, just pass the raw duration (available=0 usually implies full)
      // If we have space, pass the calculated space.
      const _quantsToCheck = available > 0 ? available : 0; // 0 forces 'fit whatever' logic in helper if we change it, but here we use simple logic:

      const ghostResult = createGhostResultIfFits(
        measures,
        measureIndex,
        staffIndex,
        // Pass a high number if it's the last measure to force acceptance, or actual available
        available > 0 ? available : 99999,
        activeDuration,
        isDotted,
        pitch,
        inputMode
      );

      if (ghostResult) return ghostResult;
    }

    // B. Ghost in Next Measure (if next measure is empty)
    const nextIndex = measureIndex + 1;
    if (nextIndex < measures.length) {
      const nextMeasure = measures[nextIndex];
      if (nextMeasure.events.length === 0) {
        return createGhostResultIfFits(
          measures,
          nextIndex,
          staffIndex,
          currentQuantsPerMeasure,
          activeDuration,
          isDotted,
          pitch,
          inputMode
        );
      }
    }

    // C. Create New Measure (End of Score)
    if (nextIndex >= measures.length) {
      return {
        selection: { staffIndex, measureIndex: null, eventId: null, noteId: null },
        previewNote: {
          measureIndex: nextIndex,
          staffIndex,
          quant: 0,
          visualQuant: 0,
          pitch,
          duration: activeDuration,
          dotted: isDotted,
          mode: 'APPEND',
          index: 0,
          isRest: inputMode === 'REST',
        },
        shouldCreateMeasure: true,
        audio: null,
      };
    }
  }

  // --- Standard Event Navigation ---
  const selectionForNav: ScoreSelection = {
    ...selection,
    selectedNotes: selection.selectedNotes ?? [],
    anchor: selection.anchor ?? null,
  };
  const newSelection = navigateSelection(measures, selectionForNav, direction);

  if (newSelection !== selection && newSelection.measureIndex !== null && newSelection.eventId) {
    const newMeasure = measures[newSelection.measureIndex];
    const newEvent = newMeasure.events.find((e) => e.id === newSelection.eventId);

    // Create specific audio based on note selection or whole event
    let audio: AudioFeedback | null = null;
    if (newEvent) {
      if (newSelection.noteId) {
        const note = newEvent.notes.find((n) => n.id === newSelection.noteId);
        if (note?.pitch) {
          audio = {
            notes: [{ pitch: note.pitch, id: note.id }],
            duration: newEvent.duration,
            dotted: newEvent.dotted,
          };
        }
      } else {
        audio = createAudioFeedback(newEvent);
      }
    }

    return {
      selection: { ...newSelection, staffIndex },
      previewNote: null,
      audio,
      shouldCreateMeasure: false,
    };
  }

  return null;
};

/**
 * Main calculation entry point.
 * Delegates to specific handlers based on whether we are currently on a ghost note or an event.
 */
export const calculateNextSelection = (
  measures: Measure[],
  selection: NavigationSelection,
  direction: 'left' | 'right',
  previewNote: PreviewNote | null = null,
  activeDuration: string = 'quarter',
  isDotted: boolean = false,
  currentQuantsPerMeasure: number = CONFIG.quantsPerMeasure,
  clef: string = 'treble',
  staffIndex: number = 0,
  inputMode: 'NOTE' | 'REST' = 'NOTE'
): HorizontalNavigationResult | null => {
  const params = {
    staffIndex,
    activeDuration,
    isDotted,
    currentQuantsPerMeasure,
    clef,
    inputMode,
  };

  // 1. Ghost Cursor Navigation (with previewNote)
  if (selection.eventId === null && previewNote) {
    return handleGhostNavigation(measures, previewNote, direction, params);
  }

  // 2. Append Position without previewNote (API case)
  // When at an append position (measureIndex set, eventId null) without a previewNote,
  // use navigateSelection to snap to the appropriate event
  if (selection.eventId === null && selection.measureIndex !== null) {
    const selectionWithDefaults: ScoreSelection = {
      ...selection,
      selectedNotes: selection.selectedNotes ?? [],
      anchor: selection.anchor ?? null,
    };
    const newSelection = navigateSelection(measures, selectionWithDefaults, direction);
    if (newSelection !== selection) {
      if (newSelection.eventId) {
        const measure = measures[newSelection.measureIndex!];
        const event = measure.events.find((e) => e.id === newSelection.eventId);
        if (event) {
          return {
            selection: { ...newSelection, staffIndex },
            previewNote: null,
            audio: createAudioFeedback(event),
            shouldCreateMeasure: false,
          };
        }
      } else {
        // Measure Index changed but still at append position (common in empty measures)
        return {
          selection: { ...newSelection, staffIndex },
          previewNote: null,
          audio: null,
          shouldCreateMeasure: false,
        };
      }
    }
    return null;
  }

  // 3. Event Selection Navigation
  const eventSelectionWithDefaults: ScoreSelection = {
    ...selection,
    selectedNotes: selection.selectedNotes ?? [],
    anchor: selection.anchor ?? null,
  };
  return handleEventNavigation(measures, eventSelectionWithDefaults, direction, params);
};
