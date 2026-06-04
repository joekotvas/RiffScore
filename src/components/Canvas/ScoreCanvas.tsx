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
import { PageBoundary } from './PageBoundary';
import { PageContainer } from './PageContainer';
import { MeasureNumber } from './MeasureNumber';
import { MetadataTrack } from './MetadataTrack';
import { PageFooter } from './PageFooter';
import { useMetadataTrack } from '@/hooks/layout/useMetadataTrack';
import { getActiveStaff, Staff as StaffType, DEFAULT_CHORD_DISPLAY } from '@/types';
import { HitZone } from '@/engines/layout/types';
import { useScoreContext } from '@/context/ScoreContext';
import { useScoreInteraction } from '@/hooks/interaction';
import { useAutoScroll, useCursorLayout, usePageLayout } from '@/hooks/layout';
import { useScoreLayout } from '@/hooks/layout';
import { useDragToSelect } from '@/hooks/interaction';
import GrandStaffBracket from '../Assets/GrandStaffBracket';
import { CLAMP_LIMITS, STAFF_HEIGHT, STAFF_GEOMETRY, TIME_SIGNATURES } from '@/constants';
import { getNoteDuration } from '@/utils/core';
import { findEventAtQuantPosition } from '@/utils/navigation/crossStaff';
import { LassoSelectCommand } from '@/commands/selection';
import { ChordTrack } from './ChordTrack';
import { useChordTrack } from '@/hooks/chord/useChordTrack';
import { playNote } from '@/engines/toneEngine';
import { getChordVoicing } from '@/services/ChordService';

import './styles/ScoreCanvas.css';
import type { UseChordTrackReturn } from '@/hooks/chord/useChordTrack';
import { calculateStretchFactor } from '@/engines/layout';
import { calculateAllMeasureWidths } from '@/services/PageLayoutService';

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

  // --- PAGE LAYOUT ---
  // Use page layout hook for multi-system rendering in page view
  const { pageLayout, isPageView } = usePageLayout();

  // --- METADATA TRACK HOOK ---
  // For inline editing of title, composer, lyricist, copyright in page view
  const metadataTrack = useMetadataTrack({
    scoreRef,
    score,
    dispatch,
    selectFirstElement: () => {
      // Select first note in score when Tab exits metadata
      if (score.staves.length > 0) {
        const staff = score.staves[0];
        for (let mIdx = 0; mIdx < staff.measures.length; mIdx++) {
          const measure = staff.measures[mIdx];
          if (measure.events.length > 0) {
            const firstEvent = measure.events[0];
            if (firstEvent.notes.length > 0) {
              handleNoteSelection(mIdx, firstEvent.id, firstEvent.notes[0]?.id ?? null, 0);
              return;
            }
          }
        }
      }
    },
    selectLastElement: () => {
      // Select last note in score when Shift+Tab exits metadata
      if (score.staves.length > 0) {
        const staff = score.staves[0];
        for (let mIdx = staff.measures.length - 1; mIdx >= 0; mIdx--) {
          const measure = staff.measures[mIdx];
          if (measure.events.length > 0) {
            const lastEvent = measure.events[measure.events.length - 1];
            if (lastEvent.notes.length > 0) {
              const lastNote = lastEvent.notes[lastEvent.notes.length - 1];
              handleNoteSelection(mIdx, lastEvent.id, lastNote?.id ?? null, 0);
              return;
            }
          }
        }
      }
    },
  });

  // Flatten layout for hit detection (interaction layer)
  // This replaces the old notePositions calculation
  const notePositions = useMemo(() => {
    return Object.values(layout.notes).map((noteLayout) => {
      // Calculate absolute X from measureOrigin + localX
      const measureOrigin = layout.getX.measureOrigin({ measure: noteLayout.measureIndex }) ?? 0;
      return {
        x: measureOrigin + noteLayout.localX,
        y: noteLayout.y,
        // Use hit zone dimensions from layout engine
        width: noteLayout.hitZone.endX - noteLayout.hitZone.startX,
        height: 20, // Standard vertical hit box height
        // Metadata
        staffIndex: noteLayout.staffIndex,
        measureIndex: noteLayout.measureIndex,
        eventId: noteLayout.eventId,
        noteId: noteLayout.noteId,
      };
    });
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

  // Helper to compute page-relative measure positions for chord track
  const getPageMeasurePositions = useCallback(
    (page: (typeof pageLayout.pages)[0]) => {
      const measureWidths = calculateAllMeasureWidths(score, 1.0);
      const staffScale = pageLayout.staffScale;
      const positions: Array<{ x: number; width: number; quant: number }> = [];

      for (const system of page.systems) {
        let x = system.xOffset;
        const naturalWidth = system.measures.reduce((sum, i) => sum + (measureWidths[i] ?? 0), 0);
        const stretchFactor =
          system.justification === 1.0 && naturalWidth > 0
            ? system.contentWidth / staffScale / naturalWidth
            : 1.0;

        for (const measureIndex of system.measures) {
          const naturalMeasureWidth = measureWidths[measureIndex] ?? 0;
          const scaledWidth = naturalMeasureWidth * stretchFactor * staffScale;

          positions.push({
            x,
            width: scaledWidth,
            quant: measureIndex * quantsPerMeasure,
          });

          x += scaledWidth;
        }
      }

      return positions;
    },
    [score, pageLayout.staffScale, quantsPerMeasure]
  );

  // --- DIMENSIONS & REF ---
  const cursorRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // Map of page index to SVG element ref (for page view)
  const pageRefsMap = useRef<Map<number, SVGSVGElement>>(new Map());

  // Callback to register page SVG refs
  const setPageRef = useCallback((pageIndex: number, element: SVGSVGElement | null) => {
    if (element) {
      pageRefsMap.current.set(pageIndex, element);
    } else {
      pageRefsMap.current.delete(pageIndex);
    }
  }, []);

  const totalWidth = useMemo(() => {
    // In page view, use page dimensions
    if (isPageView) {
      return pageLayout.dimensions.width;
    }
    // In scroll view, calculate from measure positions
    if (layout.staves.length > 0) {
      const firstStaff = layout.staves[0];
      const lastMeasure = firstStaff.measures[firstStaff.measures.length - 1];
      return lastMeasure ? lastMeasure.x + lastMeasure.width + 50 : 800;
    }
    return 800;
  }, [layout, isPageView, pageLayout.dimensions.width]);

  // SVG height derived from layout (forward-flow pattern)
  const svgHeight = useMemo(() => {
    // In page view, use total height (all pages + gaps)
    if (isPageView) {
      return pageLayout.totalHeight;
    }
    // In scroll view, derive from content
    const contentBottom = layout.getY.content.bottom;
    // Add padding below content
    return contentBottom > 0 ? contentBottom + 50 : 200;
  }, [layout, isPageView, pageLayout.totalHeight]);

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

  const { measure: cursorMeasure, x: cursorLocalX } = useCursorLayout(
    layout,
    effectivePlaybackPos,
    isPlaying
  );

  // Calculate absolute cursor X by combining measureOrigin + localX
  const unifiedCursorX =
    cursorMeasure !== null && cursorLocalX !== null
      ? (layout.getX.measureOrigin({ measure: cursorMeasure }) ?? 0) + cursorLocalX
      : null;

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
   * Select the topmost note at a given position.
   * Falls back to nearest note to the left if no note at the position.
   * Used for focus restoration when leaving chord track.
   */
  const selectTopmostNoteAtPosition = useCallback(
    (position: { measure: number; quant: number }) => {
      const measureIndex = position.measure;
      const localQuant = position.quant;

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

  // Calculate which page contains the playback cursor
  const cursorPageIndex = useMemo(() => {
    if (!isPageView || cursorMeasure === null) return null;
    return pageLayout.pages.findIndex((page) =>
      page.systems.some((sys) => sys.measures.includes(cursorMeasure))
    );
  }, [isPageView, cursorMeasure, pageLayout.pages]);

  // Track which page drag-to-select started on
  const [dragPageIndex, setDragPageIndex] = useState<number | null>(null);

  // Page-aware mouse handlers for drag-to-select
  const handlePageMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>, pageIndex: number) => {
      setDragPageIndex(pageIndex);
      // Convert to SVG coordinates using the page's SVG
      const svgElement = pageRefsMap.current.get(pageIndex);
      if (svgElement) {
        // Temporarily set svgRef.current to this page's SVG for coordinate conversion
        // This is a workaround - ideally useDragToSelect would be page-aware
        handleDragSelectMouseDown(e);
      }
    },
    [handleDragSelectMouseDown]
  );

  // Helper to render a system group (used in page view)
  const renderSystem = useCallback(
    (system: (typeof pageLayout.pages)[0]['systems'][0], _pageIndex: number) => {
      const firstMeasureIndex = system.measures[0];
      const contentX = pageLayout.contentArea.x;
      const staffScale = pageLayout.staffScale;
      const translateY = system.y - CONFIG.baseY * staffScale;

      const fullEffectiveWidth = system.isFirst
        ? system.contentWidth / (1 - pageLayout.firstSystemIndent)
        : system.contentWidth;
      const firstSystemIndent = system.isFirst
        ? pageLayout.firstSystemIndent * fullEffectiveWidth
        : 0;

      const measureWidths = calculateAllMeasureWidths(score, 1.0);
      const systemMeasureWidths = system.measures.map((idx) => measureWidths[idx] || 0);
      const naturalMeasuresWidth = systemMeasureWidths.reduce((a, b) => a + b, 0);
      const availableForMeasures = system.contentWidth / staffScale;
      const systemStretchFactor = calculateStretchFactor(
        naturalMeasuresWidth,
        availableForMeasures,
        system.justification
      );

      const singleStaffHeight = STAFF_GEOMETRY.height * staffScale;
      const totalStaffHeight =
        score.staves.length > 1
          ? singleStaffHeight + STAFF_GEOMETRY.spacing * staffScale * (score.staves.length - 1)
          : singleStaffHeight;

      return (
        <g key={`system-${system.index}`} className="riff-system">
          <MeasureNumber
            measureIndex={firstMeasureIndex}
            x={contentX + firstSystemIndent}
            y={system.y}
            staffScale={staffScale}
          />

          {score.staves?.length > 1 && (
            <GrandStaffBracket
              topY={system.y}
              bottomY={system.y + totalStaffHeight}
              x={contentX + firstSystemIndent - 20}
            />
          )}

          {score.staves?.map((staff: StaffType, staffIndex: number) => {
            const staffYOffset = staffIndex * CONFIG.staffSpacing * staffScale;

            const interaction = {
              selection,
              previewNote,
              activeDuration,
              isDotted,
              modifierHeld,
              isDragging: dragState.active,
              lassoPreviewIds: previewNoteIds,
              onAddNote: addNoteToMeasure,
              onSelectNote: memoizedOnSelectNote,
              onDragStart: memoizedOnDragStart,
              onHover: getHoverHandler(staffIndex),
            };

            const isTop = staffIndex === 0;
            const isBottom = staffIndex === score.staves.length - 1;
            const mouseLimits = {
              min: isTop ? CLAMP_LIMITS.OUTER_TOP : -CLAMP_LIMITS.INNER_OFFSET,
              max: isBottom ? CLAMP_LIMITS.OUTER_BOTTOM : STAFF_HEIGHT + CLAMP_LIMITS.INNER_OFFSET,
            };

            const systemMeasures = system.measures.map((idx) => staff.measures[idx]);

            return (
              <g
                key={`${staff.id || staffIndex}-system-${system.index}`}
                transform={`translate(${contentX + firstSystemIndent}, ${translateY + staffYOffset}) scale(${staffScale})`}
              >
                <Staff
                  staffIndex={staffIndex}
                  clef={staff.clef || (staffIndex === 0 ? 'treble' : 'bass')}
                  keySignature={keySignature}
                  timeSignature={timeSignature}
                  measures={systemMeasures}
                  measureIndices={system.measures}
                  staffLayout={layout.staves[staffIndex]}
                  baseY={CONFIG.baseY}
                  scale={scale}
                  isSystemStart={true}
                  systemIndex={system.index}
                  isLastSystem={system.isLast}
                  stretchFactor={systemStretchFactor}
                  interaction={interaction}
                  onClefClick={onClefClick}
                  onKeySigClick={onKeySigClick}
                  onTimeSigClick={onTimeSigClick}
                  mouseLimits={mouseLimits}
                />
              </g>
            );
          })}
        </g>
      );
    },
    [
      pageLayout,
      score,
      selection,
      previewNote,
      activeDuration,
      isDotted,
      modifierHeld,
      dragState.active,
      previewNoteIds,
      addNoteToMeasure,
      memoizedOnSelectNote,
      memoizedOnDragStart,
      getHoverHandler,
      layout,
      scale,
      keySignature,
      timeSignature,
      onClefClick,
      onKeySigClick,
      onTimeSigClick,
    ]
  );

  return (
    <div
      ref={containerRef}
      data-testid="score-canvas-container"
      className={`riff-ScoreCanvas ${isPageView ? 'riff-ScoreCanvas--page-view' : ''}`}
      style={{ backgroundColor: isPageView ? undefined : theme.background }}
      onClick={handleBackgroundClick}
      tabIndex={0}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {/* Page View Rendering - Separate SVG per page */}
      {isPageView && (
        <div className="riff-pages">
          {pageLayout.pages.map((page) => (
            <PageContainer
              key={`page-${page.index}`}
              ref={(el) => setPageRef(page.index, el)}
              page={page}
              pageLayout={pageLayout}
              scale={scale}
              onMouseDown={handlePageMouseDown}
            >
              {/* Page boundary (white background, border) */}
              <PageBoundary pageLayout={pageLayout} />

              {/* Systems on this page */}
              {page.systems.map((system) => renderSystem(system, page.index))}

              {/* Chord Track for this page */}
              <ChordTrack
                chords={chordTrackHook.chords}
                displayConfig={DEFAULT_CHORD_DISPLAY}
                keySignature={keySignature}
                timeSignature={timeSignature}
                validPositions={chordTrackHook.validPositions}
                measurePositions={getPageMeasurePositions(page)}
                layout={layout}
                quantsPerMeasure={quantsPerMeasure}
                editingChordId={chordTrackHook.editingChordId}
                selectedChordId={chordTrackHook.selectedChordId}
                creatingAt={chordTrackHook.creatingAt}
                initialValue={chordTrackHook.initialValue}
                pageMeasureIndices={page.systems.flatMap((s) => s.measures)}
                pageTrackY={page.systems[0]?.y !== undefined ? page.systems[0].y - CONFIG.chordTrack.minDistanceFromStaff : undefined}
                onChordClick={(chordId) => chordTrackHook.startEditing(chordId)}
                onChordSelect={(chordId) => {
                  selectionEngine.selectChord(chordId);
                  const chord = chordTrackHook.chords.find((c) => c.id === chordId);
                  if (chord) {
                    const voicing = getChordVoicing(chord.symbol);
                    voicing.forEach((note) => playNote(note, '8n'));
                  }
                }}
                onEmptyClick={(position) => chordTrackHook.startCreating(position)}
                onEditComplete={(chordId, value) => chordTrackHook.completeEdit(chordId, value)}
                onEditCancel={() => {
                  const editingId = chordTrackHook.editingChordId;
                  const isExistingChord = editingId && editingId !== 'new';
                  if (isExistingChord) {
                    chordTrackHook.cancelEdit();
                    selectionEngine.selectChord(editingId);
                  } else {
                    const position = chordTrackHook.creatingAt;
                    chordTrackHook.cancelEdit();
                    if (position) selectTopmostNoteAtPosition(position);
                  }
                }}
                onNavigateNext={(chordId, value) => {
                  const currentChord = chordId
                    ? chordTrackHook.chords.find((c) => c.id === chordId)
                    : null;
                  const currentPosition = currentChord
                    ? { measure: currentChord.measure, quant: currentChord.quant }
                    : chordTrackHook.creatingAt;
                  if (!currentPosition) return;

                  const sortedPositions: Array<{ measure: number; quant: number }> = [];
                  for (const [measure, quants] of chordTrackHook.validPositions) {
                    for (const quant of quants) {
                      sortedPositions.push({ measure, quant });
                    }
                  }
                  sortedPositions.sort((a, b) => a.measure - b.measure || a.quant - b.quant);

                  const currentIdx = sortedPositions.findIndex(
                    (p) => p.measure === currentPosition.measure && p.quant === currentPosition.quant
                  );
                  if (currentIdx === -1 || currentIdx >= sortedPositions.length - 1) return;

                  const nextPosition = sortedPositions[currentIdx + 1];
                  chordTrackHook.completeEdit(chordId, value);

                  setTimeout(() => {
                    const updatedChords = chordTrackHook.chords;
                    const chordAtPosition = updatedChords.find(
                      (c) => c.measure === nextPosition.measure && c.quant === nextPosition.quant
                    );
                    if (chordAtPosition) {
                      chordTrackHook.startEditing(chordAtPosition.id);
                    } else {
                      chordTrackHook.startCreating(nextPosition);
                    }
                  }, 0);
                }}
                onNavigatePrevious={(chordId, value) => {
                  const currentChord = chordId
                    ? chordTrackHook.chords.find((c) => c.id === chordId)
                    : null;
                  const currentPosition = currentChord
                    ? { measure: currentChord.measure, quant: currentChord.quant }
                    : chordTrackHook.creatingAt;
                  if (!currentPosition) return;

                  const sortedPositions: Array<{ measure: number; quant: number }> = [];
                  for (const [measure, quants] of chordTrackHook.validPositions) {
                    for (const quant of quants) {
                      sortedPositions.push({ measure, quant });
                    }
                  }
                  sortedPositions.sort((a, b) => a.measure - b.measure || a.quant - b.quant);

                  const currentIdx = sortedPositions.findIndex(
                    (p) => p.measure === currentPosition.measure && p.quant === currentPosition.quant
                  );
                  if (currentIdx <= 0) return;

                  const previousPosition = sortedPositions[currentIdx - 1];
                  chordTrackHook.completeEdit(chordId, value);

                  setTimeout(() => {
                    const updatedChords = chordTrackHook.chords;
                    const chordAtPosition = updatedChords.find(
                      (c) =>
                        c.measure === previousPosition.measure && c.quant === previousPosition.quant
                    );
                    if (chordAtPosition) {
                      chordTrackHook.startEditing(chordAtPosition.id);
                    } else {
                      chordTrackHook.startCreating(previousPosition);
                    }
                  }, 0);
                }}
                onDelete={(chordId) => {
                  const chord = chordTrackHook.chords.find((c) => c.id === chordId);
                  const chordPosition = chord
                    ? { measure: chord.measure, quant: chord.quant }
                    : null;
                  chordTrackHook.deleteChord(chordId);
                  if (chordPosition) selectTopmostNoteAtPosition(chordPosition);
                }}
              />

              {/* Playback cursor - only on page containing current position */}
              {cursorPageIndex === page.index && unifiedCursorX !== null && (
                <g
                  data-testid="playback-cursor"
                  style={{
                    transform: `translateX(${unifiedCursorX}px)`,
                    transition: `transform ${playbackPosition.duration || 0.1}s linear`,
                    pointerEvents: 'none',
                    opacity: isPlaybackVisible ? 1 : 0,
                  }}
                >
                  {(() => {
                    // Find the system containing the cursor on this page
                    const cursorSystem = page.systems.find((sys) =>
                      sys.measures.includes(cursorMeasure!)
                    );
                    if (!cursorSystem) return null;
                    const staffScale = pageLayout.staffScale;
                    const cursorTop = cursorSystem.y - 20;
                    const cursorBottom =
                      cursorSystem.y + STAFF_GEOMETRY.height * staffScale * score.staves.length + 20;
                    return (
                      <>
                        <line
                          x1={0}
                          y1={cursorTop}
                          x2={0}
                          y2={cursorBottom}
                          stroke={theme.accent}
                          strokeWidth="3"
                          opacity="0.8"
                        />
                        <circle cx={0} cy={cursorTop} r="4" fill={theme.accent} opacity="0.9" />
                        <circle cx={0} cy={cursorBottom} r="4" fill={theme.accent} opacity="0.9" />
                      </>
                    );
                  })()}
                </g>
              )}

              {/* Selection rectangle - only on page where drag started */}
              {isDragging && selectionRect && dragPageIndex === page.index && (
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

              {/* Metadata (Title, Composer, Lyricist) - rendered last for click priority */}
              {page.isFirst && (
                <MetadataTrack
                  metadata={metadataTrack.metadata}
                  layout={pageLayout.metadata}
                  editingField={metadataTrack.editingField}
                  selectedField={metadataTrack.selectedField}
                  initialValue={metadataTrack.initialValue}
                  onFieldClick={metadataTrack.startEditing}
                  onFieldSelect={metadataTrack.selectField}
                  onEditComplete={metadataTrack.completeEdit}
                  onEditCancel={metadataTrack.cancelEdit}
                  onDelete={metadataTrack.deleteField}
                  onNavigateNext={metadataTrack.navigateToNext}
                  onNavigatePrevious={metadataTrack.navigateToPrevious}
                />
              )}

              {/* Footer: copyright on page 1, page number on pages 2+ */}
              <PageFooter
                footer={page.footer}
                showPageNumber={!page.isFirst}
                isFirstPage={page.isFirst}
                editingCopyright={page.isFirst && metadataTrack.editingField === 'copyright'}
                selectedCopyright={page.isFirst && metadataTrack.selectedField === 'copyright'}
                copyrightInitialValue={metadataTrack.initialValue}
                onCopyrightClick={() => metadataTrack.startEditing('copyright')}
                onCopyrightSelect={() => metadataTrack.selectField('copyright')}
                onCopyrightEditComplete={(value) => metadataTrack.completeEdit('copyright', value)}
                onCopyrightEditCancel={() => metadataTrack.cancelEdit()}
                onCopyrightDelete={() => metadataTrack.deleteField('copyright')}
              />
            </PageContainer>
          ))}
        </div>
      )}

      {/* Scroll View Rendering - Single SVG */}
      {!isPageView && (
        <svg
          ref={svgRef}
          width={totalWidth * scale}
          height={svgHeight * scale}
          className="riff-ScoreCanvas__svg"
          onMouseDown={handleDragSelectMouseDown}
        >
          <g transform={`scale(${scale})`}>
            {/* Title left-aligned with score start */}
            {score.title && (
              <text x={0} y={40} textAnchor="start" className="riff-metadata__title">
                {score.title}
              </text>
            )}

            {score.staves?.length > 1 && (
              <>
                {(() => {
                  const systemBounds = layout.getY.system(0);
                  if (!systemBounds) return null;
                  return (
                    <GrandStaffBracket
                      topY={systemBounds.top}
                      bottomY={systemBounds.bottom}
                      x={-20}
                    />
                  );
                })()}
              </>
            )}

            {score.staves?.map((staff: StaffType, staffIndex: number) => {
              const staffBounds = layout.getY.staff(staffIndex);
              const staffBaseY =
                staffBounds?.top ?? CONFIG.baseY + staffIndex * CONFIG.staffSpacing;

              const interaction = {
                selection,
                previewNote,
                activeDuration,
                isDotted,
                modifierHeld,
                isDragging: dragState.active,
                lassoPreviewIds: previewNoteIds,
                onAddNote: addNoteToMeasure,
                onSelectNote: memoizedOnSelectNote,
                onDragStart: memoizedOnDragStart,
                onHover: getHoverHandler(staffIndex),
              };

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
                  keySignature={keySignature}
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

            {/* Chord Track */}
            <ChordTrack
              chords={chordTrackHook.chords}
              displayConfig={DEFAULT_CHORD_DISPLAY}
              keySignature={keySignature}
              timeSignature={timeSignature}
              validPositions={chordTrackHook.validPositions}
              measurePositions={measurePositions}
              layout={layout}
              quantsPerMeasure={quantsPerMeasure}
              editingChordId={chordTrackHook.editingChordId}
              selectedChordId={chordTrackHook.selectedChordId}
              creatingAt={chordTrackHook.creatingAt}
              initialValue={chordTrackHook.initialValue}
              onChordClick={(chordId) => chordTrackHook.startEditing(chordId)}
              onChordSelect={(chordId) => {
                selectionEngine.selectChord(chordId);
                const chord = chordTrackHook.chords.find((c) => c.id === chordId);
                if (chord) {
                  const voicing = getChordVoicing(chord.symbol);
                  voicing.forEach((note) => playNote(note, '8n'));
                }
              }}
              onEmptyClick={(position) => chordTrackHook.startCreating(position)}
              onEditComplete={(chordId, value) => chordTrackHook.completeEdit(chordId, value)}
              onEditCancel={() => {
                const editingId = chordTrackHook.editingChordId;
                const isExistingChord = editingId && editingId !== 'new';
                if (isExistingChord) {
                  chordTrackHook.cancelEdit();
                  selectionEngine.selectChord(editingId);
                } else {
                  const position = chordTrackHook.creatingAt;
                  chordTrackHook.cancelEdit();
                  if (position) selectTopmostNoteAtPosition(position);
                }
              }}
              onNavigateNext={(chordId, value) => {
                const currentChord = chordId
                  ? chordTrackHook.chords.find((c) => c.id === chordId)
                  : null;
                const currentPosition = currentChord
                  ? { measure: currentChord.measure, quant: currentChord.quant }
                  : chordTrackHook.creatingAt;
                if (!currentPosition) return;

                const sortedPositions: Array<{ measure: number; quant: number }> = [];
                for (const [measure, quants] of chordTrackHook.validPositions) {
                  for (const quant of quants) {
                    sortedPositions.push({ measure, quant });
                  }
                }
                sortedPositions.sort((a, b) => a.measure - b.measure || a.quant - b.quant);

                const currentIdx = sortedPositions.findIndex(
                  (p) => p.measure === currentPosition.measure && p.quant === currentPosition.quant
                );
                if (currentIdx === -1 || currentIdx >= sortedPositions.length - 1) return;

                const nextPosition = sortedPositions[currentIdx + 1];
                chordTrackHook.completeEdit(chordId, value);

                setTimeout(() => {
                  const updatedChords = chordTrackHook.chords;
                  const chordAtPosition = updatedChords.find(
                    (c) => c.measure === nextPosition.measure && c.quant === nextPosition.quant
                  );
                  if (chordAtPosition) {
                    chordTrackHook.startEditing(chordAtPosition.id);
                  } else {
                    chordTrackHook.startCreating(nextPosition);
                  }
                }, 0);
              }}
              onNavigatePrevious={(chordId, value) => {
                const currentChord = chordId
                  ? chordTrackHook.chords.find((c) => c.id === chordId)
                  : null;
                const currentPosition = currentChord
                  ? { measure: currentChord.measure, quant: currentChord.quant }
                  : chordTrackHook.creatingAt;
                if (!currentPosition) return;

                const sortedPositions: Array<{ measure: number; quant: number }> = [];
                for (const [measure, quants] of chordTrackHook.validPositions) {
                  for (const quant of quants) {
                    sortedPositions.push({ measure, quant });
                  }
                }
                sortedPositions.sort((a, b) => a.measure - b.measure || a.quant - b.quant);

                const currentIdx = sortedPositions.findIndex(
                  (p) => p.measure === currentPosition.measure && p.quant === currentPosition.quant
                );
                if (currentIdx <= 0) return;

                const previousPosition = sortedPositions[currentIdx - 1];
                chordTrackHook.completeEdit(chordId, value);

                setTimeout(() => {
                  const updatedChords = chordTrackHook.chords;
                  const chordAtPosition = updatedChords.find(
                    (c) =>
                      c.measure === previousPosition.measure && c.quant === previousPosition.quant
                  );
                  if (chordAtPosition) {
                    chordTrackHook.startEditing(chordAtPosition.id);
                  } else {
                    chordTrackHook.startCreating(previousPosition);
                  }
                }, 0);
              }}
              onDelete={(chordId) => {
                const chord = chordTrackHook.chords.find((c) => c.id === chordId);
                const chordPosition = chord
                  ? { measure: chord.measure, quant: chord.quant }
                  : null;
                chordTrackHook.deleteChord(chordId);
                if (chordPosition) selectTopmostNoteAtPosition(chordPosition);
              }}
            />

            {/* Playback cursor */}
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
                {(() => {
                  const systemBounds = layout.getY.system(0);
                  const cursorTop = (systemBounds?.top ?? CONFIG.baseY) - 20;
                  const cursorBottom =
                    (systemBounds?.bottom ?? CONFIG.baseY + CONFIG.lineHeight * 4) + 20;
                  return (
                    <>
                      <line
                        x1={0}
                        y1={cursorTop}
                        x2={0}
                        y2={cursorBottom}
                        stroke={theme.accent}
                        strokeWidth="3"
                        opacity="0.8"
                      />
                      <circle cx={0} cy={cursorTop} r="4" fill={theme.accent} opacity="0.9" />
                      <circle cx={0} cy={cursorBottom} r="4" fill={theme.accent} opacity="0.9" />
                    </>
                  );
                })()}
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

            {/* DEBUG: Lasso hit zone positions */}
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
      )}
    </div>
  );
};

export default ScoreCanvas;
