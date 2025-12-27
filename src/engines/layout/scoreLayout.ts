import { Score, Staff, Measure, ScoreEvent } from '@/types';
import { CONFIG } from '@/config';
import { calculateHeaderLayout, calculateMeasureLayout, getOffsetForPitch } from '@/engines/layout';
import { ScoreLayout, StaffLayout, MeasureLayoutV2, NoteLayout, EventLayout } from './types';
import { calculateSystemLayout, getNoteWidth } from '@/engines/layout';

/**
 * Calculates the complete layout for the score.
 * This is the SINGLE SOURCE OF TRUTH for where everything is on the canvas.
 *
 * @param score - The score data
 * @returns ScoreLayout object containing full position maps
 */
export const calculateScoreLayout = (score: Score): ScoreLayout => {
  const layout: ScoreLayout = {
    staves: [],
    notes: {},
    events: {},
  };

  if (!score.staves || score.staves.length === 0) return layout;

  const activeStaff = score.staves[0];
  const keySignature = score.keySignature || activeStaff.keySignature || 'C';
  const headerLayout = calculateHeaderLayout(keySignature);
  const startOfMeasures = headerLayout.startOfMeasures;

  // 1. Calculate Synchronized Measure Widths (Grand Staff Logic)
  // We need to know how wide each measure is across ALL staves before we position them.
  const maxMeasures = Math.max(...score.staves.map((s) => s.measures.length));
  const synchronizedWidths: number[] = [];
  const synchronizedForcedPositions: Record<number, number>[] = []; // measureIdx -> { quant -> x }

  for (let i = 0; i < maxMeasures; i++) {
    const measuresAtIndices = score.staves.map((s) => s.measures[i]).filter(Boolean);

    if (measuresAtIndices.length > 0) {
      const forcedPositions = calculateSystemLayout(measuresAtIndices);
      const maxX = Math.max(...Object.values(forcedPositions));

      const isPickup = measuresAtIndices[0]?.isPickup;
      const minDuration = isPickup ? 'quarter' : 'whole';
      const minWidth =
        getNoteWidth(minDuration, false) + CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight;

      const width = Math.max(maxX + CONFIG.measurePaddingRight, minWidth);

      synchronizedWidths[i] = width;
      synchronizedForcedPositions[i] = forcedPositions;
    } else {
      const minWidth =
        getNoteWidth('whole', false) + CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight;
      synchronizedWidths[i] = minWidth;
      synchronizedForcedPositions[i] = {};
    }
  }

  // 2. Build Layout Tree
  score.staves.forEach((staff: Staff, staffIdx: number) => {
    const staffY = CONFIG.baseY + staffIdx * CONFIG.staffSpacing;
    const staffLayout: StaffLayout = {
      y: staffY,
      index: staffIdx,
      measures: [],
    };

    let currentMeasureX = startOfMeasures;
    const staffClef = staff.clef || (staffIdx === 0 ? 'treble' : 'bass');

    staff.measures.forEach((measure: Measure, measureIdx: number) => {
      const width = synchronizedWidths[measureIdx] || 0;
      const forcedPositions = synchronizedForcedPositions[measureIdx];

      // Use existing measure engine logic to get relative positions
      // We pass the forcedPositions to ensure it aligns with the system layout
      const relativeLayout = calculateMeasureLayout(
        measure.events,
        undefined,
        staffClef,
        measure.isPickup || false,
        forcedPositions
      );

      const measureLayout: MeasureLayoutV2 = {
        x: currentMeasureX,
        y: staffY,
        width,
        events: {},
        legacyLayout: relativeLayout,
      };

      // Transform relative positions to absolute positions
      measure.events.forEach((event: ScoreEvent) => {
        // Find x from relative layout (or fallback to measure start)
        // relativeLayout.eventPositions key is eventID
        const relativeX = relativeLayout.eventPositions[event.id] || CONFIG.measurePaddingLeft;
        const absoluteX = currentMeasureX + relativeX;

        // Create Event Layout
        const processedEvent = relativeLayout.processedEvents.find((e) => e.id === event.id);

        // Calculate actual event width from chord layout
        let eventWidth = 20; // Default for single notes
        if (processedEvent?.chordLayout) {
          // For chords: base width + max shift + some padding for accidentals/dots
          eventWidth = 30 + (processedEvent.chordLayout.maxNoteShift || 0);
        }

        const eventLayout: EventLayout = {
          x: absoluteX,
          y: staffY,
          width: eventWidth,
          notes: {},
          hitZones: [], // TODO: Transfer corrected hit zones
        };

        // Calculate Notes
        if (event.notes) {
          event.notes.forEach((note) => {
            if (!note.pitch) return; // Skip rests for note map (handled as events)

            const yOffset = getOffsetForPitch(note.pitch, staffClef);
            const absoluteY = staffY + yOffset;
            const noteIdKey = `${staffIdx}-${measureIdx}-${event.id}-${note.id}`;

            // Create Note Layout
            const halfWidth = eventWidth / 2;
            const noteLayout: NoteLayout = {
              x: absoluteX, // Will be adjusted for chord shifts below
              y: absoluteY,
              noteId: note.id,
              eventId: event.id,
              measureIndex: measureIdx,
              staffIndex: staffIdx,
              pitch: note.pitch,
              hitZone: {
                startX: absoluteX - halfWidth,
                endX: absoluteX + halfWidth,
                index: 0, // TODO: Use actual hit zone index from relativeLayout
                type: 'EVENT',
                eventId: event.id,
              },
            };

            // Handling Chord Shifts
            // The measure layout engine calculates chordLayout but returns processedEvents.
            if (processedEvent && processedEvent.chordLayout) {
              const xShift = processedEvent.chordLayout.noteOffsets[note.id] || 0;
              noteLayout.x += xShift;
              // Also update hit zone to match shifted position
              noteLayout.hitZone.startX += xShift;
              noteLayout.hitZone.endX += xShift;
            }

            eventLayout.notes[note.id] = noteLayout;
            layout.notes[noteIdKey] = noteLayout;
          });
        }

        measureLayout.events[event.id] = eventLayout;
        layout.events[`${staffIdx}-${measureIdx}-${event.id}`] = eventLayout;
      });

      staffLayout.measures.push(measureLayout);
      currentMeasureX += width;
    });

    layout.staves.push(staffLayout);
  });

  return layout;
};
