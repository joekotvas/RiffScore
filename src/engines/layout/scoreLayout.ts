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
  calculateMeasureExtent,
  calculateStaffOffsets,
  unionExtents,
  type StaffExtent,
} from './vertical';
import { TIME_SIGNATURES } from '@/constants';
import { getNoteDuration } from '@/utils/core';
import {
  calculateSystemPreamble,
  calculateMeasureLayout,
  getOffsetForPitch,
  calculateBeamingGroups,
  calculateSystemLayout,
  getNoteWidth,
} from '@/engines/layout';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import {
  ScoreLayout,
  StaffLayout,
  MeasureLayoutV2,
  MeasureLayout,
  BeamGroup,
  TupletBracketGroup,
  EventLayout,
  NoteLayout,
  YBounds,
} from './types';

// --- Phase 1: Synchronization Helper ---

/**
 * Calculates the synchronized widths for every measure column across the system.
 * Returns an array of widths and an array of forced positioning maps.
 */
const calculateSystemMetrics = (staves: Staff[], keySignature: string = 'C') => {
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

    const currentForcedPositions = calculateSystemLayout(measuresAtIndices, keySignature);
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

/**
 * Synchronized natural measure widths for the whole score (unscaled): the widths every staff
 * actually renders with — cross-staff union of onsets, key-aware accidental spacing, pickup
 * minimums. Page layout must size measures from THIS rather than from a per-staff natural
 * layout, or measure positions, hit boxes, the cursor, chord X and the right margin drift from
 * what is drawn.
 */
export const calculateSynchronizedMeasureWidths = (score: Score): number[] => {
  if (!score.staves || score.staves.length === 0) return [];
  const keySignature = score.keySignature || score.staves[0].keySignature || 'C';
  return calculateSystemMetrics(score.staves, keySignature).widths;
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

  // 1. Position Calculation (measure-relative)
  const localX = relativeLayout.eventPositions[event.id] || CONFIG.measurePaddingLeft;
  const processedEvent = relativeLayout.processedEvents.find((e) => e.id === event.id);

  // 2. Width Calculation
  let eventWidth = 20;
  if (processedEvent?.chordLayout) {
    eventWidth = 30 + (processedEvent.chordLayout.maxNoteShift || 0);
  }

  const eventLayout: EventLayout = {
    localX,
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
      const noteLocalX = localX + xShift;

      // Compute absolute X for hit zones (needed for hit detection)
      const absoluteX = measureX + noteLocalX;

      const noteLayout: NoteLayout = {
        localX: noteLocalX,
        y: staffY + getOffsetForPitch(note.pitch, clef),
        noteId: note.id,
        eventId: event.id,
        measureIndex: measureIdx,
        staffIndex: staffIdx,
        pitch: note.pitch,
        hitZone: {
          startX: absoluteX - halfWidth,
          endX: absoluteX + halfWidth,
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

/** Per-measure geometry shared by the SSOT layout and the page layout's vertical model. */
interface MeasureGeometry {
  relativeLayout: MeasureLayout;
  beamGroups: BeamGroup[];
  tupletGroups: TupletBracketGroup[];
  extent: StaffExtent;
}

const buildMeasureGeometries = (
  score: Score,
  keySignature: string,
  timeSignature: string,
  forcedPositions: Record<number, number>[]
): MeasureGeometry[][] =>
  score.staves.map((staff, staffIdx) => {
    const clef = staff.clef || (staffIdx === 0 ? 'treble' : 'bass');
    return staff.measures.map((measure, measureIdx) => {
      const relativeLayout = calculateMeasureLayout(
        measure.events,
        undefined,
        clef,
        measure.isPickup || false,
        forcedPositions[measureIdx],
        1.0,
        keySignature
      );
      const beamGroups = calculateBeamingGroups(
        measure.events,
        relativeLayout.eventPositions,
        clef,
        timeSignature
      );
      // Pass the beams so a beamed tuplet's bracket can run parallel to its beam.
      const tupletGroups = calculateTupletBrackets(
        relativeLayout.processedEvents,
        relativeLayout.eventPositions,
        clef,
        beamGroups
      );
      return {
        relativeLayout,
        beamGroups,
        tupletGroups,
        extent: calculateMeasureExtent(relativeLayout, beamGroups, tupletGroups),
      };
    });
  });

/**
 * Drawn extent of every measure of every staff (staff px relative to each staff's top line),
 * from the same geometry the SSOT layout renders. Page layout unions these per system to space
 * the staves of each system by their content.
 */
export const calculateMeasureExtents = (score: Score): StaffExtent[][] => {
  if (!score.staves || score.staves.length === 0) return [];
  const keySignature = score.keySignature || score.staves[0].keySignature || 'C';
  const timeSignature = score.timeSignature || '4/4';
  const { forcedPositions } = calculateSystemMetrics(score.staves, keySignature);
  return buildMeasureGeometries(score, keySignature, timeSignature, forcedPositions).map(
    (measures) => measures.map((m) => m.extent)
  );
};

/**
 * Calculates the complete layout for the score.
 * This is the SINGLE SOURCE OF TRUTH for where everything is on the canvas.
 *
 * @param score - The score data
 * @returns ScoreLayout object containing full position maps and getX function
 */
export const calculateScoreLayout = (score: Score): ScoreLayout => {
  // Default getX for empty scores - returns null for any position
  const emptyGetX = Object.assign(
    (_params: { measure: number; quant: number }): number | null => null,
    { measureOrigin: (_params: { measure: number }): number | null => null }
  );

  // Default getY for empty scores
  const emptyGetY: ScoreLayout['getY'] = {
    content: { top: 0, bottom: 0 },
    system: () => null,
    staff: () => null,
    notes: () => ({ top: 0, bottom: 0 }),
    pitch: () => null,
  };

  if (!score.staves || score.staves.length === 0) {
    return {
      staves: [],
      notes: {},
      events: {},
      vertical: { offsets: [], top: 0, bottom: 0, lyricBands: [] },
      getX: emptyGetX,
      getY: emptyGetY,
    };
  }

  // Partial layout that we'll populate
  const layout: Omit<ScoreLayout, 'getX' | 'getY' | 'vertical'> = {
    staves: [],
    notes: {},
    events: {},
  };

  const activeStaff = score.staves[0];
  // Single key-signature source for the whole layout pass — the score-level key
  // (canonicalized at load), falling back to staff[0] then C. The preamble, the
  // measure accidental spacing, and the renderer all read this same value so the
  // canvas can never disagree with the exporters about the key (#234).
  const scoreKeySignature = score.keySignature || activeStaff.keySignature || 'C';
  const preamble = calculateSystemPreamble(scoreKeySignature);

  // Resolve the time signature once so beam grouping is meter-aware (e.g. 6/8
  // beams in dotted-quarter beats rather than assuming 4/4).
  const scoreTimeSignature = score.timeSignature || '4/4';

  // 1. Calculate System Metrics (Grand Staff Logic)
  const { widths: synchronizedWidths, forcedPositions: synchronizedForcedPositions } =
    calculateSystemMetrics(score.staves, scoreKeySignature);

  // 2. Per-measure geometry (event positions, beams, tuplet brackets, drawn extent), computed
  //    once per staff so the vertical layout can be settled before any absolute Y is assigned.
  const geometries = buildMeasureGeometries(
    score,
    scoreKeySignature,
    scoreTimeSignature,
    synchronizedForcedPositions
  );

  // 3. Content-aware staff distance: the default spacing, opened where ink or lyric bands need it.
  const vertical = calculateStaffOffsets(
    geometries.map((measures) => unionExtents(measures.map((m) => m.extent))),
    score.staves.map((staff) => staff.lyricLines ?? 0)
  );

  // 4. Build Tree
  score.staves.forEach((staff, staffIdx) => {
    const staffY = CONFIG.baseY + vertical.offsets[staffIdx];
    const staffClef = staff.clef || (staffIdx === 0 ? 'treble' : 'bass');

    const staffLayout: StaffLayout = {
      y: staffY,
      index: staffIdx,
      measures: [],
    };

    let currentMeasureX = preamble.measuresX;

    staff.measures.forEach((measure, measureIdx) => {
      const width = synchronizedWidths[measureIdx];
      const forcedPos = synchronizedForcedPositions[measureIdx];
      const { relativeLayout, beamGroups, tupletGroups } = geometries[staffIdx][measureIdx];

      const measureLayout: MeasureLayoutV2 = {
        x: currentMeasureX,
        y: staffY,
        width,
        events: {},
        syncedEventPositions: forcedPos,
        beamGroups,
        tupletGroups,
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

  // --- Build getX function (measure-relative) ---
  const timeSignature = scoreTimeSignature;
  const quantsPerMeasure = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

  // Build per-measure quant→X map (measure-relative coordinates)
  // Map<measureIndex, Map<localQuant, relativeX>>
  const measureQuantMaps = new Map<number, Map<number, number>>();

  Object.values(layout.notes).forEach((noteLayout) => {
    const measureData = score.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
    const measureLayout = layout.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
    if (!measureData || !measureLayout) return;

    // Calculate local quant for this note
    let localQuant = 0;
    for (const event of measureData.events) {
      if (event.id === noteLayout.eventId) {
        // Initialize measure map if needed
        if (!measureQuantMaps.has(noteLayout.measureIndex)) {
          measureQuantMaps.set(noteLayout.measureIndex, new Map<number, number>());
        }
        const measureMap = measureQuantMaps.get(noteLayout.measureIndex)!;

        // Store measure-relative X (noteLayout.localX is already relative)
        if (!measureMap.has(localQuant)) {
          measureMap.set(localQuant, noteLayout.localX);
        }
        break;
      }
      localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
    }
  });

  // Get measure layouts for origin lookup and interpolation
  const measureLayouts = layout.staves[0]?.measures ?? [];

  // Measure origin lookup function
  const measureOrigin = (params: { measure: number }): number | null => {
    const measureLayout = measureLayouts[params.measure];
    return measureLayout?.x ?? null;
  };

  // Main getX function (measure-relative)
  const getXFn = (params: { measure: number; quant: number }): number | null => {
    const { measure, quant } = params;

    // Check bounds
    const measureLayout = measureLayouts[measure];
    if (!measureLayout) return null;

    // Stage 1: Exact match lookup
    const measureMap = measureQuantMaps.get(measure);
    if (measureMap) {
      const exact = measureMap.get(quant);
      if (exact !== undefined) return exact;
    }

    // Stage 2: Interpolation fallback
    // Calculate relative X within the measure based on quant proportion
    const proportion = quant / quantsPerMeasure;
    // Use measure width minus padding for content area
    return (
      CONFIG.measurePaddingLeft +
      proportion * (measureLayout.width - CONFIG.measurePaddingLeft - CONFIG.measurePaddingRight)
    );
  };

  // Combine into callable with measureOrigin property
  const getX = Object.assign(getXFn, { measureOrigin });

  // --- Build getY object ---

  // Staff height is 5 lines = 4 gaps
  const staffHeight = CONFIG.lineHeight * 4;

  // Content region bounds: the staff block (first top line to last bottom line). Ink and lyric
  // bands that reach further are in `vertical.bottom`; the canvas sizes itself from that.
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

  return { ...layout, vertical, getX, getY };
};
