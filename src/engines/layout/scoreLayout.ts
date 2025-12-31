/**
 * scoreLayout.ts
 *
 * Centralized layout engine for calculating absolute positions of all score elements.
 * This is the SINGLE SOURCE OF TRUTH for where everything renders on the canvas.
 *
 * @see Issue #109
 * @tested src/engines/layout/scoreLayout.test.ts
 */
import { Score, Staff, ScoreEvent } from '@/types';
import { CONFIG } from '@/config';
import {
  calculateHeaderLayout,
  calculateMeasureLayout,
  getOffsetForPitch,
  calculateBeamingGroups,
  calculateSystemLayout,
  getNoteWidth,
} from '@/engines/layout';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import { ScoreLayout, StaffLayout, MeasureLayoutV2, EventLayout, NoteLayout } from './types';

// --- Phase 1: Synchronization Helper ---

/**
 * Calculates the synchronized widths for every measure column across the system.
 * Returns an array of widths and an array of forced positioning maps.
 */
const calculateSystemMetrics = (staves: Staff[]) => {
  const maxMeasures = Math.max(...staves.map((s) => s.measures.length));
  const widths: number[] = [];
  const forcedPositions: Record<number, number>[] = [];

  for (let i = 0; i < maxMeasures; i++) {
    const measuresAtIndices = staves.map((s) => s.measures[i]).filter(Boolean);

    if (measuresAtIndices.length === 0) {
      widths[i] =
        getNoteWidth('whole', false) + CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight;
      forcedPositions[i] = {};
      continue;
    }

    const currentForcedPositions = calculateSystemLayout(measuresAtIndices);
    const maxX = Math.max(...Object.values(currentForcedPositions));

    // Determine minimum width based on content (pickup vs regular)
    const isPickup = measuresAtIndices[0]?.isPickup;
    const minDuration = isPickup ? 'quarter' : 'whole';
    const minWidth =
      getNoteWidth(minDuration, false) + CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight;

    widths[i] = Math.max(maxX + CONFIG.measurePaddingRight, minWidth);
    forcedPositions[i] = currentForcedPositions;
  }

  return { widths, forcedPositions };
};

// --- Phase 2: Atomic Event/Note Helper ---

interface MeasureContext {
  measureX: number;
  staffY: number;
  staffIdx: number;
  measureIdx: number;
  clef: string;
}

interface ProcessedEventData {
  id: string;
  chordLayout?: {
    noteOffsets: Record<string, number>;
    maxNoteShift?: number;
  };
}

interface RelativeLayoutData {
  eventPositions: Record<string, number>;
  processedEvents: ProcessedEventData[];
}

/**
 * Calculates layout for a single event and its notes,
 * and populates the global lookup maps (mutation is used for performance here).
 */
const processEventLayout = (
  event: ScoreEvent,
  measureContext: MeasureContext,
  relativeLayout: RelativeLayoutData,
  lookupMaps: {
    notes: Record<string, NoteLayout>;
    events: Record<string, EventLayout>;
  }
): EventLayout => {
  const { measureX, staffY, staffIdx, measureIdx, clef } = measureContext;

  // 1. Position Calculation
  const relativeX = relativeLayout.eventPositions[event.id] || CONFIG.measurePaddingLeft;
  const absoluteX = measureX + relativeX;
  const processedEvent = relativeLayout.processedEvents.find((e) => e.id === event.id);

  // 2. Width Calculation
  let eventWidth = 20;
  if (processedEvent?.chordLayout) {
    eventWidth = 30 + (processedEvent.chordLayout.maxNoteShift || 0);
  }

  const eventLayout: EventLayout = {
    x: absoluteX,
    y: staffY,
    width: eventWidth,
    notes: {},
    hitZones: [],
  };

  // 3. Note Processing
  if (event.notes) {
    event.notes.forEach((note) => {
      if (!note.pitch) return;

      const halfWidth = eventWidth / 2;
      const xShift = processedEvent?.chordLayout?.noteOffsets[note.id] || 0;

      const noteLayout: NoteLayout = {
        x: absoluteX + xShift,
        y: staffY + getOffsetForPitch(note.pitch, clef),
        noteId: note.id,
        eventId: event.id,
        measureIndex: measureIdx,
        staffIndex: staffIdx,
        pitch: note.pitch,
        hitZone: {
          startX: absoluteX + xShift - halfWidth,
          endX: absoluteX + xShift + halfWidth,
          index: 0,
          type: 'EVENT',
          eventId: event.id,
        },
      };

      // Populate lookups
      const noteKey = `${staffIdx}-${measureIdx}-${event.id}-${note.id}`;
      eventLayout.notes[note.id] = noteLayout;
      lookupMaps.notes[noteKey] = noteLayout;
    });
  }

  // Populate event lookup
  const eventKey = `${staffIdx}-${measureIdx}-${event.id}`;
  lookupMaps.events[eventKey] = eventLayout;

  return eventLayout;
};

// --- Phase 3: Main Orchestrator ---

/**
 * Calculates the complete layout for the score.
 * This is the SINGLE SOURCE OF TRUTH for where everything is on the canvas.
 *
 * @param score - The score data
 * @returns ScoreLayout object containing full position maps
 */
export const calculateScoreLayout = (score: Score): ScoreLayout => {
  const layout: ScoreLayout = { staves: [], notes: {}, events: {} };

  if (!score.staves || score.staves.length === 0) return layout;

  const activeStaff = score.staves[0];
  const headerLayout = calculateHeaderLayout(score.keySignature || activeStaff.keySignature || 'C');

  // 1. Calculate System Metrics (Grand Staff Logic)
  const { widths: synchronizedWidths, forcedPositions: synchronizedForcedPositions } =
    calculateSystemMetrics(score.staves);

  // 2. Build Tree
  score.staves.forEach((staff, staffIdx) => {
    const staffY = CONFIG.baseY + staffIdx * CONFIG.staffSpacing;
    const staffClef = staff.clef || (staffIdx === 0 ? 'treble' : 'bass');

    const staffLayout: StaffLayout = {
      y: staffY,
      index: staffIdx,
      measures: [],
    };

    let currentMeasureX = headerLayout.startOfMeasures;

    staff.measures.forEach((measure, measureIdx) => {
      const width = synchronizedWidths[measureIdx];
      const forcedPos = synchronizedForcedPositions[measureIdx];

      // Run sub-engines
      const relativeLayout = calculateMeasureLayout(
        measure.events,
        undefined,
        staffClef,
        measure.isPickup || false,
        forcedPos
      );

      const measureLayout: MeasureLayoutV2 = {
        x: currentMeasureX,
        y: staffY,
        width,
        events: {},
        beamGroups: calculateBeamingGroups(
          measure.events,
          relativeLayout.eventPositions,
          staffClef
        ),
        tupletGroups: calculateTupletBrackets(
          relativeLayout.processedEvents,
          relativeLayout.eventPositions,
          staffClef
        ),
        legacyLayout: relativeLayout,
      };

      // Transform Events
      measure.events.forEach((event) => {
        const eventLayout = processEventLayout(
          event,
          { measureX: currentMeasureX, staffY, staffIdx, measureIdx, clef: staffClef },
          relativeLayout,
          layout // Pass layout reference to populate lookups
        );
        measureLayout.events[event.id] = eventLayout;
      });

      staffLayout.measures.push(measureLayout);
      currentMeasureX += width;
    });

    layout.staves.push(staffLayout);
  });

  return layout;
};
