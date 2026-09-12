import React from 'react';
import { CONFIG } from '@/config';
import { useTheme } from '@/context/ThemeContext';
import {
  calculateMeasureWidth,
  calculateMeasureLayout,
  getOffsetForPitch,
  calculateSystemPreamble,
} from '@/engines/layout';
import { StaffLayout } from '@/engines/layout/types';
import { isNoteSelected } from '@/utils/selection';
import { findTieTarget } from '@/utils/ties';
import Measure from './Measure';
import Tie from './Tie';
import ScoreHeader from './ScoreHeader';

import { InteractionState } from '../../componentTypes';
import { Measure as MeasureData } from '@/types';

/**
 * Represents a note with tie information for rendering
 */
interface TieNote {
  localMeasureIndex: number;
  measureIndex: number;
  eventIndex: number;
  noteIndex: number;
  eventId: string;
  pitch: string;
  tied: boolean;
  x: number;
  y: number;
  id: string;
}

interface TieSource {
  measureIndex: number;
  eventIndex: number;
  noteIndex: number;
  eventId: string;
  noteId: string;
}

/**
 * Props for a self-contained Staff component.
 * Each Staff is independent and can be stacked for Grand Staff.
 */
export interface StaffProps {
  // Staff-specific data
  staffIndex: number; // Index of this staff in the score
  clef: string;
  keySignature: string;
  timeSignature: string;
  measures: MeasureData[];

  // Layout
  baseY?: number; // Y offset for stacking staves (default: CONFIG.baseY)
  staffLayout?: StaffLayout;
  /**
   * Pointer-to-staff divisor for mouse interaction: ui scale × viewport zoom, × staffScale in
   * page view. Rendering scale is applied by the parent transform, not here.
   */
  scale: number;

  // Page view props
  /** Whether this is the start of a system (renders clef/key sig). Default: true */
  isSystemStart?: boolean;
  /** System index (0 = first system, shows time signature). Default: 0 */
  systemIndex?: number;
  /** Whether this is the last system (controls final barline). Default: true */
  isLastSystem?: boolean;
  /** Actual measure indices in the score (for page view). If not provided, uses array index. */
  measureIndices?: number[];
  /** Full staff measures used to resolve ties that cross page-view system breaks. */
  allMeasures?: MeasureData[];
  /** Pre-computed stretch factor for justified systems (page view only) */
  stretchFactor?: number;

  // Interaction (Grouped)
  interaction: InteractionState;

  mouseLimits?: { min: number; max: number }; // For Grand Staff clamping

  // Header click callbacks (Panel/Menu interactions)
  onClefClick?: () => void;
  onKeySigClick?: () => void;
  onTimeSigClick?: () => void;
}

/**
 * A self-contained Staff component that renders a single staff with:
 * - System preamble (clef, key signature, time signature)
 * - Measures with notes
 * - Ties between notes
 *
 * Designed to be stacked for Grand Staff support.
 */
const Staff: React.FC<StaffProps> = ({
  staffIndex,
  clef,
  keySignature,
  timeSignature,
  measures,
  baseY = CONFIG.baseY,
  staffLayout,
  scale,
  isSystemStart = true,
  systemIndex = 0,
  isLastSystem = true,
  measureIndices,
  allMeasures,
  stretchFactor = 1.0,
  interaction,
  mouseLimits,
  onClefClick,
  onKeySigClick,
  onTimeSigClick,
}) => {
  const { theme } = useTheme();

  // Calculate vertical offset for this staff relative to the standard position
  // This is used for the SVG transform and passed to children for hit detection
  const verticalOffset = baseY - CONFIG.baseY;

  // Use centralized preamble layout calculation (SSOT)
  // First system (systemIndex=0) has time signature, subsequent systems don't
  const isFirstSystem = systemIndex === 0;
  const { measuresX } = calculateSystemPreamble(keySignature, { isFirstSystem });

  // Calculate measure positions and render.
  // stretchFactor is passed from parent (ScoreCanvas) which computes it using max measure widths
  // across all staves for grand staff alignment. Pre-compute each measure's stretched width and
  // cumulative start-x in a plain pass so the render map only READS positions — reassigning an
  // accumulator inside .map trips the React Compiler immutability rule (react-hooks/immutability).
  const stretchedWidths = measures.map((measure, index) => {
    const actualMeasureIndex = measureIndices?.[index] ?? index;
    const width =
      staffLayout?.measures[actualMeasureIndex]?.width ??
      calculateMeasureWidth(measure.events, measure.isPickup);
    return width * stretchFactor;
  });
  const measureStartXs: number[] = [];
  for (let i = 0, x = measuresX; i < stretchedWidths.length; i++) {
    measureStartXs.push(x);
    x += stretchedWidths[i];
  }

  const measureComponents = measures.map((measure, index: number) => {
    // Use actual measure index if provided (page view), otherwise use array index
    const actualMeasureIndex = measureIndices?.[index] ?? index;

    // Use centralized layout if available, otherwise calculate
    // Use actual measure index for layout lookup (important for page view)
    const measureLayoutV2 = staffLayout?.measures[actualMeasureIndex];

    // Quant-keyed synchronized positions so a justified (stretched) re-layout keeps the
    // treble/bass columns aligned; the id-keyed legacyLayout.eventPositions would be ignored.
    const forcedPositions = measureLayoutV2?.syncedEventPositions;
    const stretchedWidth = stretchedWidths[index];

    // Only show preview note if it belongs to this staff
    // We create a DERIVED InteractionState for this scope
    const staffPreviewNote =
      interaction.previewNote && interaction.previewNote.staffIndex === staffIndex
        ? interaction.previewNote
        : null;

    const scopedInteraction = {
      ...interaction,
      previewNote: staffPreviewNote,
    };

    return (
      <Measure
        key={measure.id}
        startX={measureStartXs[index]}
        measureIndex={actualMeasureIndex}
        measureData={measure}
        isLast={index === measures.length - 1 && isLastSystem}
        forcedWidth={stretchedWidth}
        forcedEventPositions={forcedPositions}
        measureLayout={measureLayoutV2}
        stretchFactor={stretchFactor}
        layout={{
          scale,
          baseY: CONFIG.baseY,
          clef,
          keySignature,
          timeSignature,
          staffIndex,
          verticalOffset: 0, // Staff is at 0 relative to itself (positioned by parent)
          mouseLimits, // Pass clamping limits
        }}
        interaction={scopedInteraction}
      />
    );
  });

  // Render ties between notes
  const renderTies = () => {
    const ties: React.ReactElement[] = [];
    const allNotes: TieNote[] = [];
    const tieMeasures = allMeasures ?? measures;
    const currentMeasureIndices = new Set(
      measures.map((_, index) => measureIndices?.[index] ?? index)
    );
    const systemStartX = measureStartXs[0] ?? measuresX;
    const systemEndX =
      measureStartXs.length > 0
        ? measureStartXs[measureStartXs.length - 1] + stretchedWidths[stretchedWidths.length - 1]
        : measuresX;

    const findTieSource = (target: TieNote): TieSource | null => {
      let sourceMeasureIndex = target.measureIndex;
      let sourceEventIndex = target.eventIndex - 1;

      if (sourceEventIndex < 0) {
        sourceMeasureIndex = target.measureIndex - 1;
        const sourceMeasure = tieMeasures[sourceMeasureIndex];
        if (!sourceMeasure) return null;
        sourceEventIndex = sourceMeasure.events.length - 1;
      }

      const sourceEvent = tieMeasures[sourceMeasureIndex]?.events[sourceEventIndex];
      if (!sourceEvent || sourceEvent.isRest || sourceEvent.reserved) return null;

      const sourceNoteIndex = sourceEvent.notes.findIndex(
        (candidate) => candidate.pitch === target.pitch && !candidate.isRest && !!candidate.tied
      );
      if (sourceNoteIndex === -1) return null;

      const resolvedTarget = findTieTarget(tieMeasures, {
        measureIndex: sourceMeasureIndex,
        eventIndex: sourceEventIndex,
        pitch: target.pitch,
      });

      if (
        !resolvedTarget ||
        resolvedTarget.measureIndex !== target.measureIndex ||
        resolvedTarget.eventIndex !== target.eventIndex ||
        resolvedTarget.noteIndex !== target.noteIndex
      ) {
        return null;
      }

      const sourceNote = sourceEvent.notes[sourceNoteIndex];
      return {
        measureIndex: sourceMeasureIndex,
        eventIndex: sourceEventIndex,
        noteIndex: sourceNoteIndex,
        eventId: sourceEvent.id,
        noteId: sourceNote?.id ?? '',
      };
    };

    const getTieColor = (source: TieSource | TieNote) => {
      const isSelected = isNoteSelected(interaction.selection, {
        staffIndex,
        measureIndex: source.measureIndex,
        eventId: source.eventId,
        noteId: 'noteId' in source ? source.noteId : source.id,
      });

      return isSelected ? theme.accent : theme.score.note;
    };

    measures.forEach((measure, mIndex: number) => {
      const actualMeasureIndex = measureIndices?.[mIndex] ?? mIndex;
      const layout =
        stretchFactor !== 1.0
          ? calculateMeasureLayout(
              measure.events,
              undefined,
              clef,
              measure.isPickup ?? false,
              undefined,
              stretchFactor,
              keySignature
            )
          : (staffLayout?.measures[actualMeasureIndex]?.legacyLayout ??
            calculateMeasureLayout(
              measure.events,
              undefined,
              clef,
              measure.isPickup ?? false,
              undefined,
              1.0,
              keySignature
            ));
      const measureX = measureStartXs[mIndex];
      measure.events.forEach((event, eIndex: number) => {
        const eventX = measureX + layout.eventPositions[event.id];
        event.notes.forEach((note, nIndex: number) => {
          // Skip rest notes (which have null pitch) - they can't have ties
          if (note.pitch === null) return;

          allNotes.push({
            localMeasureIndex: mIndex,
            measureIndex: actualMeasureIndex,
            eventIndex: eIndex,
            noteIndex: nIndex,
            eventId: event.id,
            pitch: note.pitch,
            tied: !!note.tied,
            x: eventX,
            y: CONFIG.baseY + getOffsetForPitch(note.pitch, clef), // Use CONFIG.baseY for normalized coords
            id: note.id,
          });
        });
      });
    });

    allNotes.forEach((note) => {
      const incomingSource = findTieSource(note);
      if (incomingSource && !currentMeasureIndices.has(incomingSource.measureIndex)) {
        const direction = getOffsetForPitch(note.pitch, clef) > 24 ? 'down' : 'up';
        ties.push(
          <Tie
            key={`tie-in-${incomingSource.noteId}-${note.id}`}
            startX={systemStartX}
            startY={note.y}
            endX={note.x}
            endY={note.y}
            direction={direction}
            color={getTieColor(incomingSource)}
            crossesSystemBreak
            isEndOfTie
          />
        );
      }

      if (note.tied) {
        // Lane E: a tie resolves to the same-pitch note in the immediate next event (cross-barline
        // aware; rests and reserved slots are never targets) via the canonical findTieTarget.
        const target = findTieTarget(tieMeasures, {
          measureIndex: note.measureIndex,
          eventIndex: note.eventIndex,
          pitch: note.pitch,
        });
        const nextNote = target
          ? allNotes.find(
              (n) =>
                n.measureIndex === target.measureIndex &&
                n.eventIndex === target.eventIndex &&
                n.noteIndex === target.noteIndex &&
                n.pitch === note.pitch
            )
          : null;

        const direction = getOffsetForPitch(note.pitch, clef) > 24 ? 'down' : 'up';

        // Render a tie ONLY when it resolves — no hanging stub. A tied flag whose target was
        // deleted or turned into a rest draws nothing (and reconnects if the target returns).
        if (nextNote) {
          ties.push(
            <Tie
              key={`tie-${note.id}`}
              startX={note.x + 10}
              startY={note.y}
              endX={nextNote.x}
              endY={nextNote.y}
              direction={direction}
              color={getTieColor(note)}
            />
          );
        } else if (target && !currentMeasureIndices.has(target.measureIndex)) {
          ties.push(
            <Tie
              key={`tie-out-${note.id}`}
              startX={note.x + 10}
              startY={note.y}
              endX={systemEndX}
              endY={note.y}
              direction={direction}
              color={getTieColor(note)}
              crossesSystemBreak
              isStartOfTie
            />
          );
        }
      }
    });

    return ties;
  };

  return (
    <g className="staff" transform={`translate(0, ${verticalOffset})`}>
      {/* Staff Header (Clef, Key Sig, Time Sig) - only at system start */}
      {isSystemStart && (
        <ScoreHeader
          clef={clef}
          keySignature={keySignature}
          timeSignature={timeSignature}
          baseY={CONFIG.baseY} // Use normalized baseY
          showTimeSignature={systemIndex === 0}
          onClefClick={(e) => {
            e.stopPropagation();
            if (onClefClick) onClefClick();
          }}
          onKeySigClick={(e) => {
            e.stopPropagation();
            if (onKeySigClick) onKeySigClick();
          }}
          onTimeSigClick={(e) => {
            e.stopPropagation();
            if (onTimeSigClick) onTimeSigClick();
          }}
        />
      )}

      {/* Measures */}
      {measureComponents}

      {/* Ties */}
      {renderTies()}
    </g>
  );
};

// Export totalWidth calculation for parent container sizing
export const calculateStaffWidth = (
  measures: MeasureData[],
  keySignature: string,
  isFirstSystem: boolean = true
): number => {
  const { measuresX } = calculateSystemPreamble(keySignature, { isFirstSystem });
  let width = measuresX;
  measures.forEach((measure) => {
    width += calculateMeasureWidth(measure.events, measure.isPickup);
  });
  return width + 50;
};

export default Staff;
