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
import { TIME_SIGNATURES } from '@/constants';
import { getNoteDuration } from '@/utils/core';
import {
  calculateHeaderLayout,
  calculateMeasureLayout,
  getOffsetForPitch,
  calculateBeamingGroups,
  calculateSystemLayout,
  getNoteWidth,
  quantToX,
  MeasurePosition,
} from '@/engines/layout';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import { ScoreLayout, StaffLayout, MeasureLayoutV2, EventLayout, NoteLayout, YBounds } from './types';

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
 * @returns ScoreLayout object containing full position maps and getX function
 */
export const calculateScoreLayout = (score: Score): ScoreLayout => {
  // Default getX for empty scores - returns 0 for any quant
  const emptyGetX = (): number => 0;

  // Default getY for empty scores
  const emptyGetY: ScoreLayout['getY'] = {
    content: { top: 0, bottom: 0 },
    system: () => null,
    staff: () => null,
    notes: () => ({ top: 0, bottom: 0 }),
    pitch: () => null,
  };

  if (!score.staves || score.staves.length === 0) {
    return { staves: [], notes: {}, events: {}, getX: emptyGetX, getY: emptyGetY };
  }

  // Partial layout that we'll populate
  const layout: Omit<ScoreLayout, 'getX' | 'getY'> = { staves: [], notes: {}, events: {} };

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

  // --- Build getX function ---
  const timeSignature = score.timeSignature || '4/4';
  const quantsPerMeasure = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

  // Build quant→X map from note positions
  const quantToXMap = new Map<number, number>();
  Object.values(layout.notes).forEach((noteLayout) => {
    const measure = score.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
    if (!measure) return;

    // Calculate global quant for this note
    let localQuant = 0;
    for (const event of measure.events) {
      if (event.id === noteLayout.eventId) {
        const globalQuant = noteLayout.measureIndex * quantsPerMeasure + localQuant;
        // Only set if not already set (use first note's X at each quant)
        if (!quantToXMap.has(globalQuant)) {
          quantToXMap.set(globalQuant, noteLayout.x);
        }
        break;
      }
      localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
    }
  });

  // Build measure positions for interpolation fallback
  const measurePositions: MeasurePosition[] =
    layout.staves[0]?.measures.map((m) => ({ x: m.x, width: m.width })) ?? [];

  // Pre-bind the lookup function
  const getX = (quant: number): number =>
    quantToX(quant, quantToXMap, measurePositions, quantsPerMeasure) ?? 0;

  // --- Build getY object ---

  // Staff height is 5 lines = 4 gaps
  const staffHeight = CONFIG.lineHeight * 4;

  // Content region bounds
  const lastStaffLayout = layout.staves[layout.staves.length - 1];
  const contentTop = CONFIG.baseY;
  const contentBottom = lastStaffLayout
    ? lastStaffLayout.y + staffHeight
    : CONFIG.baseY + staffHeight;

  // Memoized system bounds (currently single-system)
  const systemBoundsCache = new Map<number, YBounds | null>();
  const system = (index: number): YBounds | null => {
    if (systemBoundsCache.has(index)) return systemBoundsCache.get(index)!;

    // Currently single-system; returns null for index > 0
    if (index !== 0 || layout.staves.length === 0) {
      systemBoundsCache.set(index, null);
      return null;
    }

    const bounds: YBounds = { top: contentTop, bottom: contentBottom };
    systemBoundsCache.set(index, bounds);
    return bounds;
  };

  // Memoized staff bounds
  const staffBoundsCache = new Map<number, YBounds | null>();
  const staff = (index: number): YBounds | null => {
    if (staffBoundsCache.has(index)) return staffBoundsCache.get(index)!;

    const staffLayout = layout.staves[index];
    if (!staffLayout) {
      staffBoundsCache.set(index, null);
      return null;
    }

    const bounds: YBounds = { top: staffLayout.y, bottom: staffLayout.y + staffHeight };
    staffBoundsCache.set(index, bounds);
    return bounds;
  };

  // Note extent (system-wide) - computed once
  const allNoteYs = Object.values(layout.notes).map((n) => n.y);
  const defaultBounds = staff(0) ?? { top: CONFIG.baseY, bottom: CONFIG.baseY + staffHeight };
  const systemNoteBounds: YBounds =
    allNoteYs.length > 0
      ? { top: Math.min(...allNoteYs), bottom: Math.max(...allNoteYs) }
      : defaultBounds;

  // Per-quant note extent maps (built once)
  const noteTopByQuant = new Map<number, number>();
  const noteBottomByQuant = new Map<number, number>();

  Object.values(layout.notes).forEach((noteLayout) => {
    const measure = score.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
    if (!measure) return;

    // Calculate global quant for this note (reuse logic from getX)
    let localQuant = 0;
    for (const event of measure.events) {
      if (event.id === noteLayout.eventId) {
        const globalQuant = noteLayout.measureIndex * quantsPerMeasure + localQuant;

        const currentTop = noteTopByQuant.get(globalQuant) ?? Infinity;
        if (noteLayout.y < currentTop) noteTopByQuant.set(globalQuant, noteLayout.y);

        const currentBottom = noteBottomByQuant.get(globalQuant) ?? -Infinity;
        if (noteLayout.y > currentBottom) noteBottomByQuant.set(globalQuant, noteLayout.y);
        break;
      }
      localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
    }
  });

  const notes = (quant?: number): YBounds => {
    if (quant === undefined) {
      return systemNoteBounds;
    }
    return {
      top: noteTopByQuant.get(quant) ?? systemNoteBounds.top,
      bottom: noteBottomByQuant.get(quant) ?? systemNoteBounds.bottom,
    };
  };

  // Pitch positioning (clef-aware)
  const pitch = (p: string, staffIndex: number): number | null => {
    const staffLayout = layout.staves[staffIndex];
    if (!staffLayout) return null;

    const clef = score.staves[staffIndex]?.clef ?? (staffIndex === 0 ? 'treble' : 'bass');
    return staffLayout.y + getOffsetForPitch(p, clef);
  };

  const getY: ScoreLayout['getY'] = {
    content: { top: contentTop, bottom: contentBottom },
    system,
    staff,
    notes,
    pitch,
  };

  return { ...layout, getX, getY };
};
