/**
 * ScoreCanvas.tsx
 *
 * The primary rendering surface for the musical score.
 * Handles the SVG canvas, grand/single staff layout, user interactions (click/drag),
 * and playback cursor synchronization.
 *
 * @see Issue #109
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Note } from 'tonal';
import { CONFIG } from '@/config';
import { useTheme } from '@/context/ThemeContext';
import Staff from './Staff';
import { getActiveStaff, Staff as StaffType, DEFAULT_CHORD_DISPLAY } from '@/types';
import { HitZone } from '@/engines/layout/types';
import { useScoreContext } from '@/context/ScoreContext';
import { useScoreInteraction } from '@/hooks/interaction';
import { useAutoScroll, useCursorLayout } from '@/hooks/layout';
import { useScoreLayout } from '@/hooks/layout';
import { useDragToSelect } from '@/hooks/interaction';
import GrandStaffBracket from '../Assets/GrandStaffBracket';
import { CLAMP_LIMITS, STAFF_HEIGHT, TIME_SIGNATURES } from '@/constants';
import { getNoteDuration } from '@/utils/core';
import { findEventAtQuantPosition } from '@/utils/navigation/crossStaff';
import { LassoSelectCommand } from '@/commands/selection';
import { ChordTrack } from './ChordTrack';
import { useChordTrack } from '@/hooks/chord/useChordTrack';
import { playNote } from '@/engines/toneEngine';
import { getChordVoicing } from '@/services/ChordService';

import './styles/ScoreCanvas.css';
import type { UseChordTrackReturn } from '@/hooks/chord/useChordTrack';

interface ScoreCanvasProps {
  scale: number;
  playbackPosition?: { measureIndex: number | null; quant: number | null; duration: number };
  onKeySigClick?: () => void;
  onTimeSigClick?: () => void;
  onClefClick?: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onHoverChange: (isHovering: boolean) => void;
  onBackgroundClick?: () => void;
  isPlaying?: boolean;
  isPlaybackVisible?: boolean;
  /** External chord track hook (if provided, ScoreCanvas won't create its own) */
  chordTrack?: UseChordTrackReturn;
}

/**
 * Renders the main score canvas, composing Staff components.
 * Consumes ScoreContext for data and handles interactions.
 */
const ScoreCanvas: React.FC<ScoreCanvasProps> = ({
  scale,
  playbackPosition = { measureIndex: null, quant: null, duration: 0 },
  onKeySigClick,
  onTimeSigClick,
  onClefClick,
  containerRef,
  onHoverChange,
  onBackgroundClick,
  isPlaying = false,
  isPlaybackVisible = true,
  chordTrack: externalChordTrack,
}) => {
  const { theme } = useTheme();

  // Consume Score Context (Grouped API)
  const ctx = useScoreContext();
  const { score, selection, previewNote } = ctx.state;
  const { selectionEngine, scoreRef, dispatch } = ctx.engines;
  const { activeDuration, isDotted } = ctx.tools;
  const { select: handleNoteSelection } = ctx.navigation;
  const { addNote: addNoteToMeasure, handleMeasureHover, updatePitch: updateNotePitch } = ctx.entry;
  const { clearSelection, setPreviewNote } = ctx;

  // --- INTERACTION LOGIC MOVED FROM SCORE EDITOR ---

  // Track modifier key state for cursor changes
  const [modifierHeld, setModifierHeld] = useState(false);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setModifierHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setModifierHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const { dragState, handleDragStart } = useScoreInteraction({
    scoreRef,
    selection,
    onUpdatePitch: (m: number, e: string, n: string, p: string) => updateNotePitch(m, e, n, p),
    onSelectNote: (
      measureIndex: number | null,
      eventId: string | null,
      noteId: string | null,
      staffIndexParam?: number,
      isMulti?: boolean,
      selectAllInEvent?: boolean,
      isShift?: boolean
    ) => {
      if (measureIndex !== null && eventId !== null) {
        const targetStaff = staffIndexParam !== undefined ? staffIndexParam : 0;
        handleNoteSelection(
          measureIndex,
          eventId,
          noteId,
          targetStaff,
          isMulti,
          selectAllInEvent,
          isShift
        );
      }
      setPreviewNote(null);
    },
  });

  const activeStaff = getActiveStaff(score);
  const keySignature = score.keySignature || activeStaff.keySignature || 'C';
  const timeSignature = score.timeSignature || '4/4';
  const _clef = score.staves.length >= 2 ? 'grand' : activeStaff.clef || 'treble';

  // --- CHORD TRACK HOOK ---
  // Use external hook if provided, otherwise create our own
  const internalChordTrackHook = useChordTrack({
    scoreRef,
    score,
    selectionEngine,
    dispatch,
  });
  const chordTrackHook = externalChordTrack ?? internalChordTrackHook;

  // Handle Enter key to start editing selected chord
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when chord is selected but not already editing
      if (
        selection.chordTrackFocused &&
        selection.chordId &&
        !chordTrackHook.editingChordId &&
        e.key === 'Enter'
      ) {
        e.preventDefault();
        chordTrackHook.startEditing(selection.chordId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selection.chordTrackFocused, selection.chordId, chordTrackHook]);

  // Quants per measure for chord positioning
  const quantsPerMeasure = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

  // --- AUTO-SCROLL LOGIC ---
  useAutoScroll({
    containerRef,
    score,
    selection,
    playbackPosition,
    previewNote,
    scale,
  });

  // --- LAYOUT ENGINE (SSOT) ---
  // Use the centralized layout hook for both rendering and hit detection
  const { layout } = useScoreLayout({ score });

  // Flatten layout for hit detection (interaction layer)
  // This replaces the old notePositions calculation
  const notePositions = useMemo(() => {
    return Object.values(layout.notes).map((noteLayout) => ({
      x: noteLayout.x,
      y: noteLayout.y,
      // Use hit zone dimensions from layout engine
      width: noteLayout.hitZone.endX - noteLayout.hitZone.startX,
      height: 20, // Standard vertical hit box height
      // Metadata
      staffIndex: noteLayout.staffIndex,
      measureIndex: noteLayout.measureIndex,
      eventId: noteLayout.eventId,
      noteId: noteLayout.noteId,
    }));
  }, [layout]);

  // --- CHORD TRACK LAYOUT ---
  const measurePositions = useMemo(() => {
    if (layout.staves.length === 0) return [];
    const firstStaff = layout.staves[0];
    return firstStaff.measures.map((measure, index) => ({
      x: measure.x,
      width: measure.width,
      quant: index * quantsPerMeasure,
    }));
  }, [layout.staves, quantsPerMeasure]);

  // Build quant→X map from actual note positions in layout
  const quantToXMap = useMemo(() => {
    const map = new Map<number, number>();
    // Group notes by quant and use the first note's X position
    Object.values(layout.notes).forEach((noteLayout) => {
      // Calculate global quant from measureIndex and event position
      const measure = score.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
      if (!measure) return;

      let localQuant = 0;
      for (const event of measure.events) {
        if (event.id === noteLayout.eventId) {
          const globalQuant = noteLayout.measureIndex * quantsPerMeasure + localQuant;
          // Only set if not already set (use first note's X)
          if (!map.has(globalQuant)) {
            map.set(globalQuant, noteLayout.x);
          }
          break;
        }
        // Accumulate quant for each event using the standard duration calculation
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      }
    });
    return map;
  }, [layout.notes, score.staves, quantsPerMeasure]);

  const quantToX = useCallback(
    (quant: number): number => {
      // Use actual note position if available
      const mappedX = quantToXMap.get(quant);
      if (mappedX !== undefined) return mappedX;

      // Fallback to proportion-based calculation
      if (measurePositions.length === 0) return 0;
      const measureIndex = Math.floor(quant / quantsPerMeasure);
      const localQuant = quant % quantsPerMeasure;
      const measure = measurePositions[measureIndex];
      if (!measure) return 0;
      const proportion = localQuant / quantsPerMeasure;
      return measure.x + proportion * measure.width;
    },
    [quantToXMap, measurePositions, quantsPerMeasure]
  );

  // Chord track collision avoidance constants
  const CHORD_COLLISION = useMemo(
    () => ({
      MIN_DISTANCE_FROM_STAFF: 28, // Minimum gap above staff top line
      PADDING_ABOVE_NOTES: 20, // Gap between highest note and chord track
      MIN_Y: 30, // System baseline won't go higher than this
      PER_CHORD_MIN_Y: 0, // Individual chords can go all the way to top
    }),
    []
  );

  // Build a map of quant -> highest note Y at that quant position
  // Used for per-chord collision avoidance
  const noteYByQuant = useMemo(() => {
    const map = new Map<number, number>();

    Object.values(layout.notes).forEach((noteLayout) => {
      const measure = score.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
      if (!measure) return;

      let localQuant = 0;
      for (const event of measure.events) {
        if (event.id === noteLayout.eventId) {
          const globalQuant = noteLayout.measureIndex * quantsPerMeasure + localQuant;
          // Keep the minimum (highest on screen) Y for each quant
          const existing = map.get(globalQuant);
          if (existing === undefined || noteLayout.y < existing) {
            map.set(globalQuant, noteLayout.y);
          }
          break;
        }
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      }
    });

    return map;
  }, [layout.notes, score.staves, quantsPerMeasure]);

  // System-level chord track Y position (baseline for all chords)
  // All chords move together based on the highest note in the entire score
  const chordTrackY = useMemo(() => {
    // Default position when no notes or all notes are below the threshold
    const defaultY = CONFIG.baseY - CHORD_COLLISION.MIN_DISTANCE_FROM_STAFF;

    const noteYValues = Object.values(layout.notes).map((n) => n.y);
    if (noteYValues.length === 0) return defaultY;

    const highestNoteY = Math.min(...noteYValues);

    // Calculate where the chord track should be to clear the highest note
    const collisionY = highestNoteY - CHORD_COLLISION.PADDING_ABOVE_NOTES;

    // Use the higher position (lower Y value) between collision-based and default
    // Clamp to MIN_Y (can go all the way to 0 for extreme cases)
    return Math.max(CHORD_COLLISION.MIN_Y, Math.min(collisionY, defaultY));
  }, [layout.notes, CHORD_COLLISION]);

  // --- DIMENSIONS & REF ---
  const cursorRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const totalWidth = useMemo(() => {
    if (layout.staves.length > 0) {
      const firstStaff = layout.staves[0];
      const lastMeasure = firstStaff.measures[firstStaff.measures.length - 1];
      return lastMeasure ? lastMeasure.x + lastMeasure.width + 50 : 800;
    }
    return 800;
  }, [layout]);

  const svgHeight = useMemo(() => {
    return (
      CONFIG.baseY + (score.staves.length - 1) * CONFIG.staffSpacing + CONFIG.lineHeight * 4 + 50
    );
  }, [score.staves.length]);

  // Cursor layout (consumes centralized layout - no duplicate calculations)
  // Calculate cursor layout
  // We pass isPlaying=true to animate cursor to the NEXT event (smooth sweep)
  // When paused, it snaps to the current event start
  // We default to 0/0 position if null so cursor is visible at start when stopped (allowing transition to work)
  const effectivePlaybackPos = {
    measureIndex: playbackPosition.measureIndex ?? 0,
    quant: playbackPosition.quant ?? 0,
    duration: playbackPosition.duration,
  };

  const { x: unifiedCursorX, numStaves } = useCursorLayout(layout, effectivePlaybackPos, isPlaying);

  // Drag to select hook
  const {
    isDragging,
    justFinishedDrag,
    selectionRect,
    previewNoteIds,
    handleMouseDown: handleDragSelectMouseDown,
  } = useDragToSelect({
    svgRef,
    notePositions,
    onSelectionComplete: (notes, isAdditive) => {
      if (notes.length === 0) return;

      // Use dispatch for lasso selection
      selectionEngine.dispatch(
        new LassoSelectCommand({
          notes,
          addToSelection: isAdditive,
        })
      );
    },
    scale,
  });

  /**
   * Select the topmost note at a given quant position.
   * Falls back to nearest note to the left if no note at the quant.
   * Used for focus restoration when leaving chord track.
   */
  const selectTopmostNoteAtQuant = useCallback(
    (quant: number) => {
      const measureIndex = Math.floor(quant / quantsPerMeasure);
      const localQuant = quant % quantsPerMeasure;

      // Try to find a note at this quant in the topmost staff first
      for (let staffIdx = 0; staffIdx < score.staves.length; staffIdx++) {
        const staff = score.staves[staffIdx];
        const measure = staff?.measures[measureIndex];
        const event = findEventAtQuantPosition(measure, localQuant);

        if (event && !event.isRest && event.notes?.length) {
          // Found a note - select the highest note in the event
          const sortedNotes = [...event.notes].sort((a, b) => {
            const midiA = a.pitch ? (Note.midi(a.pitch) ?? 0) : 0;
            const midiB = b.pitch ? (Note.midi(b.pitch) ?? 0) : 0;
            return midiB - midiA; // Descending (highest first)
          });
          handleNoteSelection(measureIndex, event.id, sortedNotes[0]?.id || null, staffIdx);
          return true;
        }
      }

      // No note at this quant - find nearest note to the left
      for (let mIdx = measureIndex; mIdx >= 0; mIdx--) {
        for (let staffIdx = 0; staffIdx < score.staves.length; staffIdx++) {
          const staff = score.staves[staffIdx];
          const measure = staff?.measures[mIdx];
          if (!measure?.events?.length) continue;

          const maxQuant = mIdx === measureIndex ? localQuant : quantsPerMeasure;
          let currentQuant = 0;
          let lastValidEvent: { event: (typeof measure.events)[0]; quant: number } | null = null;

          for (const event of measure.events) {
            if (currentQuant < maxQuant && !event.isRest && event.notes?.length) {
              lastValidEvent = { event, quant: currentQuant };
            }
            currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
          }

          if (lastValidEvent) {
            const sortedNotes = [...lastValidEvent.event.notes!].sort((a, b) => {
              const midiA = a.pitch ? (Note.midi(a.pitch) ?? 0) : 0;
              const midiB = b.pitch ? (Note.midi(b.pitch) ?? 0) : 0;
              return midiB - midiA;
            });
            handleNoteSelection(
              mIdx,
              lastValidEvent.event.id,
              sortedNotes[0]?.id || null,
              staffIdx
            );
            return true;
          }
        }
      }

      return false;
    },
    [score.staves, quantsPerMeasure, handleNoteSelection]
  );

  const handleBackgroundClick = (_e: React.MouseEvent) => {
    // Don't deselect if we were dragging or just finished dragging
    if (isDragging || justFinishedDrag) return;

    onBackgroundClick?.();
    // Default: deselect via dispatch
    clearSelection();
    containerRef.current?.focus();
  };

  // --- MEMOIZED CALLBACKS FOR INTERACTION OBJECT ---
  // These prevent unnecessary re-renders of child components

  const memoizedOnSelectNote = useCallback(
    (
      measureIndex: number | null,
      eventId: string | null,
      noteId: string | null,
      staffIndexParam?: number,
      isMulti?: boolean
    ) => {
      if (eventId !== null && measureIndex !== null) {
        const targetStaff = staffIndexParam !== undefined ? staffIndexParam : 0;
        handleNoteSelection(measureIndex, eventId, noteId, targetStaff, isMulti);
      }
    },
    [handleNoteSelection]
  );

  const memoizedOnDragStart = useCallback(
    (args: {
      measureIndex: number;
      eventId: string;
      noteId: string;
      startPitch: string;
      startY: number;
      isMulti?: boolean;
      isShift?: boolean;
      selectAllInEvent?: boolean;
      staffIndex?: number;
    }) => {
      handleDragStart(args);
    },
    [handleDragStart]
  );

  // Create stable onHover handlers for each staff index
  const staffHoverHandlers = useMemo(() => {
    const handlers = new Map<
      number,
      (measureIndex: number | null, hit: HitZone | null, pitch: string | null) => void
    >();

    const createHandler =
      (sIdx: number) =>
      (measureIndex: number | null, hit: HitZone | null, pitch: string | null) => {
        if (!dragState.active) {
          handleMeasureHover(measureIndex, hit, pitch || '', sIdx);
        }
      };

    score.staves.forEach((_, index) => {
      handlers.set(index, createHandler(index));
    });

    return handlers;
  }, [dragState.active, score.staves, handleMeasureHover]);

  const getHoverHandler = useCallback(
    (staffIndex: number) => {
      const handler = staffHoverHandlers.get(staffIndex);
      if (!handler) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `ScoreCanvas: hover handler requested for non-existent staff index ${staffIndex}.`
          );
        }
        return (() => {}) as (
          measureIndex: number | null,
          hit: HitZone | null,
          pitch: string | null
        ) => void;
      }
      return handler;
    },
    [staffHoverHandlers]
  );

  return (
    <div
      ref={containerRef}
      data-testid="score-canvas-container"
      className="riff-ScoreCanvas"
      style={{ marginTop: '-30px', backgroundColor: theme.background }}
      onClick={handleBackgroundClick}
      tabIndex={0}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <svg
        ref={svgRef}
        width={totalWidth * scale}
        height={svgHeight * scale}
        className="riff-ScoreCanvas__svg"
        onMouseDown={handleDragSelectMouseDown}
      >
        <g transform={`scale(${scale})`}>
          {score.staves?.length > 1 && (
            <>
              {(() => {
                const topY = CONFIG.baseY;
                const bottomY =
                  CONFIG.baseY +
                  (score.staves.length - 1) * CONFIG.staffSpacing +
                  CONFIG.lineHeight * 4;
                return <GrandStaffBracket topY={topY} bottomY={bottomY} x={-20} />;
              })()}
            </>
          )}

          {score.staves?.map((staff: StaffType, staffIndex: number) => {
            const staffBaseY = CONFIG.baseY + staffIndex * CONFIG.staffSpacing;

            // Construct Interaction State - using memoized callbacks for stable references
            const interaction = {
              selection, // Always pass the real selection - isNoteSelected checks staffIndex per-note
              previewNote, // Global preview note (Staff filters it)
              activeDuration,
              isDotted,
              modifierHeld,
              isDragging: dragState.active,
              lassoPreviewIds: previewNoteIds, // Set<string> for O(1) lasso preview lookup
              onAddNote: addNoteToMeasure,
              onSelectNote: memoizedOnSelectNote,
              onDragStart: memoizedOnDragStart,
              onHover: getHoverHandler(staffIndex),
            };

            // Calculate clamping limits for Grand Staff
            // Outer limits: 4 ledger lines (-48, 90)
            // Inner limits: 2 ledger lines (24, -24) to avoid overlap
            const isTop = staffIndex === 0;
            const isBottom = staffIndex === score.staves.length - 1;

            const mouseLimits = {
              min: isTop ? CLAMP_LIMITS.OUTER_TOP : -CLAMP_LIMITS.INNER_OFFSET,
              max: isBottom ? CLAMP_LIMITS.OUTER_BOTTOM : STAFF_HEIGHT + CLAMP_LIMITS.INNER_OFFSET,
            };

            return (
              <Staff
                key={staff.id || staffIndex}
                staffIndex={staffIndex}
                clef={staff.clef || (staffIndex === 0 ? 'treble' : 'bass')}
                keySignature={staff.keySignature || keySignature}
                timeSignature={timeSignature}
                measures={staff.measures}
                staffLayout={layout.staves[staffIndex]}
                baseY={staffBaseY}
                scale={scale}
                interaction={interaction}
                onClefClick={onClefClick}
                onKeySigClick={onKeySigClick}
                onTimeSigClick={onTimeSigClick}
                mouseLimits={mouseLimits}
              />
            );
          })}

          {/* Chord Track - rendered AFTER staves so it's on top for event capture */}
          <ChordTrack
            chords={chordTrackHook.chords}
            displayConfig={DEFAULT_CHORD_DISPLAY}
            keySignature={keySignature}
            timeSignature={timeSignature}
            validQuants={chordTrackHook.validQuants}
            measurePositions={measurePositions}
            quantToX={quantToX}
            trackY={chordTrackY}
            quantsPerMeasure={quantsPerMeasure}
            noteYByQuant={noteYByQuant}
            collisionConfig={CHORD_COLLISION}
            editingChordId={chordTrackHook.editingChordId}
            selectedChordId={chordTrackHook.selectedChordId}
            creatingAtQuant={chordTrackHook.creatingAtQuant}
            initialValue={chordTrackHook.initialValue}
            onChordClick={(chordId) => {
              // Click goes directly to edit mode
              chordTrackHook.startEditing(chordId);
            }}
            onChordSelect={(chordId) => {
              // CMD/CTRL+click selects without editing
              selectionEngine.selectChord(chordId);

              // Play chord audio
              const chord = chordTrackHook.chords.find((c) => c.id === chordId);
              if (chord) {
                const voicing = getChordVoicing(chord.symbol);
                voicing.forEach((note) => playNote(note, '8n'));
              }
            }}
            onEmptyClick={(quant) => {
              chordTrackHook.startCreating(quant);
            }}
            onEditComplete={(chordId, value) => {
              chordTrackHook.completeEdit(chordId, value);
            }}
            onEditCancel={() => {
              const editingId = chordTrackHook.editingChordId;
              const isExistingChord = editingId && editingId !== 'new';

              if (isExistingChord) {
                // ESC from editing an existing chord -> select that chord
                chordTrackHook.cancelEdit();
                selectionEngine.selectChord(editingId);
              } else {
                // ESC from creating a new chord -> return focus to topmost note
                const quant = chordTrackHook.creatingAtQuant;
                chordTrackHook.cancelEdit();

                if (quant !== undefined && quant !== null) {
                  selectTopmostNoteAtQuant(quant);
                }
              }
            }}
            onNavigateNext={(chordId, value) => {
              // Save the current edit
              chordTrackHook.completeEdit(chordId, value);

              // Find current quant position
              const currentQuant = chordId
                ? chordTrackHook.chords.find((c) => c.id === chordId)?.quant
                : chordTrackHook.creatingAtQuant;

              if (currentQuant !== undefined && currentQuant !== null) {
                // Get sorted valid quants and find next position
                const sortedQuants = Array.from(chordTrackHook.validQuants).sort((a, b) => a - b);
                const nextQuant = sortedQuants.find((q) => q > currentQuant);

                if (nextQuant !== undefined) {
                  // Use setTimeout to ensure state is updated after completeEdit
                  setTimeout(() => {
                    const updatedChords = chordTrackHook.chords;
                    const chordAtQuant = updatedChords.find((c) => c.quant === nextQuant);

                    if (chordAtQuant) {
                      // Edit existing chord
                      chordTrackHook.startEditing(chordAtQuant.id);
                    } else {
                      // Create new chord at this position
                      chordTrackHook.startCreating(nextQuant);
                    }
                  }, 0);
                }
              }
            }}
            onNavigatePrevious={(chordId, value) => {
              // Save the current edit
              chordTrackHook.completeEdit(chordId, value);

              // Find current quant position
              const currentQuant = chordId
                ? chordTrackHook.chords.find((c) => c.id === chordId)?.quant
                : chordTrackHook.creatingAtQuant;

              if (currentQuant !== undefined && currentQuant !== null) {
                // Get sorted valid quants and find previous position
                const sortedQuants = Array.from(chordTrackHook.validQuants).sort((a, b) => a - b);
                const previousQuants = sortedQuants.filter((q) => q < currentQuant);
                const previousQuant = previousQuants[previousQuants.length - 1];

                if (previousQuant !== undefined) {
                  // Use setTimeout to ensure state is updated after completeEdit
                  setTimeout(() => {
                    const updatedChords = chordTrackHook.chords;
                    const chordAtQuant = updatedChords.find((c) => c.quant === previousQuant);

                    if (chordAtQuant) {
                      // Edit existing chord
                      chordTrackHook.startEditing(chordAtQuant.id);
                    } else {
                      // Create new chord at this position
                      chordTrackHook.startCreating(previousQuant);
                    }
                  }, 0);
                }
              }
            }}
            onDelete={(chordId) => {
              // Get the chord's quant before deletion for focus restoration
              const chord = chordTrackHook.chords.find((c) => c.id === chordId);
              const chordQuant = chord?.quant;

              // Delete the chord
              chordTrackHook.deleteChord(chordId);

              // Restore focus to topmost note at the chord's quant
              if (chordQuant !== undefined) {
                selectTopmostNoteAtQuant(chordQuant);
              }
            }}
          />

          {unifiedCursorX !== null && (
            <g
              ref={cursorRef}
              data-testid="playback-cursor"
              style={{
                transform: `translateX(${unifiedCursorX}px)`,
                transition: `transform ${playbackPosition.duration || 0.1}s linear`,
                pointerEvents: 'none',
                opacity: isPlaybackVisible ? 1 : 0,
              }}
            >
              <line
                x1={0}
                y1={CONFIG.baseY - 20}
                x2={0}
                y2={
                  CONFIG.baseY + (numStaves - 1) * CONFIG.staffSpacing + CONFIG.lineHeight * 4 + 20
                }
                stroke={theme.accent}
                strokeWidth="3"
                opacity="0.8"
              />
              <circle cx={0} cy={CONFIG.baseY - 20} r="4" fill={theme.accent} opacity="0.9" />
              <circle
                cx={0}
                cy={
                  CONFIG.baseY + (numStaves - 1) * CONFIG.staffSpacing + CONFIG.lineHeight * 4 + 20
                }
                r="4"
                fill={theme.accent}
                opacity="0.9"
              />
            </g>
          )}

          {/* Drag-to-Select Rectangle */}
          {isDragging && selectionRect && (
            <rect
              x={selectionRect.x}
              y={selectionRect.y}
              width={selectionRect.width}
              height={selectionRect.height}
              fill="rgba(59, 130, 246, 0.2)"
              stroke="rgba(59, 130, 246, 0.8)"
              strokeWidth="1"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* DEBUG: Lasso hit zone positions (cyan) - compare to red Note hit zones */}
          {CONFIG.debug?.showHitZones &&
            notePositions.map((pos) => (
              <rect
                key={`${pos.staffIndex}-${pos.measureIndex}-${pos.eventId}-${pos.noteId}`}
                x={pos.x - pos.width / 2}
                y={pos.y - pos.height / 2}
                width={pos.width}
                height={pos.height}
                fill="cyan"
                opacity={0.3}
                pointerEvents="none"
              />
            ))}
        </g>
      </svg>
    </div>
  );
};

export default ScoreCanvas;
