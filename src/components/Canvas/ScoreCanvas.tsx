import { getMeasureTiming } from '@/services/MeasureTiming';
/**
 * ScoreCanvas.tsx
 *
 * The primary rendering surface for the musical score.
 * Handles the SVG canvas, grand/single staff layout, user interactions (click/drag),
 * and playback cursor synchronization.
 *
 * @see Issue #109
 */
import React, { useState, useEffect, useRef, useMemo, useCallback, useId } from 'react';
import { Note } from 'tonal';
import { CONFIG, THEMES } from '@/config';
import { useTheme } from '@/context/ThemeContext';
import Staff from './Staff';
import { PageBoundary } from './PageBoundary';
import { PageContainer } from './PageContainer';
import { MeasureNumber } from './MeasureNumber';
import { MetadataTrack } from './MetadataTrack';
import { PageFooter } from './PageFooter';
import { useMetadataTrack } from '@/hooks/layout/useMetadataTrack';
import {
  getActiveStaff,
  createDefaultSelection,
  Staff as StaffType,
  DEFAULT_CHORD_DISPLAY,
} from '@/types';
import type {
  SystemLayout,
  ScoreViewConfig,
  ScoreBounds,
  EngravingConfig,
  ChordDisplayConfig,
  TupletConfig,
} from '@/types';
import { HitZone } from '@/engines/layout/types';
import { useScoreContext } from '@/context/ScoreContext';
import { ThemeOverride, themeCSSVariables } from '@/context/ThemeContext';
import { useScoreInteraction } from '@/hooks/interaction';
import { useAutoScroll, useCursorLayout, usePageLayout } from '@/hooks/layout';
import { useScoreLayout } from '@/hooks/layout';
import { useDragToSelect } from '@/hooks/interaction';
import GrandStaffBracket from '../Assets/GrandStaffBracket';
import { calculateChordTrackY } from '@/engines/layout/vertical';
import { CLAMP_LIMITS, STAFF_HEIGHT, getMeasureCapacity } from '@/constants';
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
import type { RenderScoreOverlay, ScoreAnchor } from './ScoreOverlay';

import {
  normalizeScoreBounds,
  type ResolveScoreViewport,
  type ScoreViewGeometry,
} from './ScoreGeometry';

interface ScoreCanvasProps {
  resolveViewport?: ResolveScoreViewport;
  renderOverlay?: RenderScoreOverlay;
  interactive?: boolean;
  scale: number;
  view?: ScoreViewConfig;
  bounds?: ScoreBounds;
  engraving?: EngravingConfig;
  tuplet?: TupletConfig;
  showScoreTitle?: boolean;
  showGhostNotes?: boolean;
  /** Show unavailable-entry previews (grey notes with a cross). */
  showBlockedGhostNotes?: boolean;
  overflow?: 'auto' | 'hidden' | 'visible';
  scoreTitleOffset?: { x?: number; y?: number };
  /** Scroll-view outer padding in staff units; defaults to 0 above and 50 below. Ignored in page view. */
  scrollPadding?: { top?: number; bottom?: number };
  showBackground?: boolean;
  chordDisplay?: ChordDisplayConfig;
  chordEditable?: boolean;
  /**
   * Viewport zoom factor the editor shell applies as a CSS transform around the canvas
   * (1 = 100%). Rendering ignores it; pointer-to-score mapping must divide by it.
   */
  zoom?: number;
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

// Vertical extent of a note's lasso hit box (staff units), centred on the notehead.
const LASSO_NOTE_HIT_HEIGHT = 20;

// Page view is WYSIWYG paper: notation, chords and metadata always use the light palette on the
// white page regardless of the UI theme (this is also what prints).
const PAPER_THEME = THEMES.LIGHT;
const PAPER_CSS_VARIABLES = themeCSSVariables(PAPER_THEME) as React.CSSProperties;

/**
 * Renders the main score canvas, composing Staff components.
 * Consumes ScoreContext for data and handles interactions.
 */
const ScoreCanvas: React.FC<ScoreCanvasProps> = ({
  renderOverlay,
  resolveViewport,
  interactive = true,
  scale: requestedScale,
  engraving,
  view,
  bounds,
  tuplet,
  showScoreTitle = true,
  showGhostNotes = true,
  showBlockedGhostNotes = true,
  overflow,
  scoreTitleOffset,
  scrollPadding,
  showBackground = true,
  chordDisplay = DEFAULT_CHORD_DISPLAY,
  chordEditable = true,
  zoom = 1,
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
  const instructionsId = useId();

  // Consume Score Context (Grouped API)
  const ctx = useScoreContext();
  const {
    score: sourceScore,
    selection: sessionSelection,
    previewNote: sessionPreview,
  } = ctx.state;
  const selection = useMemo(
    () => (interactive ? sessionSelection : createDefaultSelection()),
    [interactive, sessionSelection]
  );
  const previewNote = interactive ? sessionPreview : null;
  const score = useMemo(
    () =>
      view?.clefs
        ? {
            ...sourceScore,
            staves: sourceScore.staves.map((staff, index) => ({
              ...staff,
              clef: view.clefs?.[index] ?? staff.clef,
            })),
          }
        : sourceScore,
    [sourceScore, view]
  );
  const scoreRef = useMemo(() => ({ current: score }), [score]);
  const { selectionEngine, dispatch } = ctx.engines;
  const { activeDuration, isDotted } = ctx.tools;
  const { select: handleNoteSelection } = ctx.navigation;
  const { addNote: addNoteToMeasure, handleMeasureHover, updatePitch: updateNotePitch } = ctx.entry;
  const { clearSelection, setPreviewNote } = ctx;

  const { pageLayout, isPageView: configuredPageView } = usePageLayout(score);
  const isPageView = !view?.measures && configuredPageView;
  const measureIndices = useMemo(
    () =>
      view?.measures
        ? Array.from(
            { length: Math.max(0, ...score.staves.map((staff) => staff.measures.length)) },
            (_, index) => index
          ).filter(
            (index) =>
              index >= (view.measures!.start ?? 0) && index < (view.measures!.end ?? Infinity)
          )
        : undefined,
    [score.staves, view]
  );
  const firstVisibleMeasure = measureIndices?.[0] ?? 0;
  const display = isPageView ? undefined : engraving;
  const { layout } = useScoreLayout({
    score,
    visibleMeasures: measureIndices,
    stemDirection: display?.stemDirection,
    spacing: display?.spacing,
    measureWidth:
      Number.isFinite(display?.contentWidth) && display!.contentWidth! > 0
        ? display!.contentWidth
        : undefined,
  });
  const viewOriginX = measureIndices
    ? (layout.getX.measureOrigin({ measure: firstVisibleMeasure }) ?? 0) -
      (layout.getX.measureOrigin({ measure: 0 }) ?? 0)
    : 0;
  const totalWidth = useMemo(() => {
    // In page view, use page dimensions
    if (isPageView) {
      return pageLayout.dimensions.width;
    }
    // In scroll view, calculate from measure positions
    if (layout.staves.length > 0) {
      const firstStaff = layout.staves[0];
      const lastMeasure =
        firstStaff.measures[measureIndices?.at(-1) ?? firstStaff.measures.length - 1];
      return lastMeasure ? lastMeasure.x + lastMeasure.width + 50 : 800;
    }
    return 800;
  }, [layout, isPageView, pageLayout.dimensions.width, measureIndices]);

  const chordFont = chordDisplay.font;
  const chordFontSize =
    Number.isFinite(chordFont?.size) && chordFont!.size! > 0 ? chordFont!.size : undefined;
  const notationTop = CONFIG.baseY + (layout.vertical?.top ?? 0);
  const visibleChords =
    chordDisplay.visible !== false &&
    (score.chordTrack ?? []).some(
      (chord) => !measureIndices || measureIndices.includes(chord.measure)
    );
  const chordTop = visibleChords
    ? calculateChordTrackY(layout.getY.staff(0)?.top ?? CONFIG.baseY, notationTop, chordFontSize) -
      (chordFontSize ?? 20)
    : notationTop;
  const titleY = Math.min(40, Math.min(notationTop, chordTop) - 16) + (scoreTitleOffset?.y ?? 0);
  const contentTop =
    showScoreTitle && score.title
      ? Math.min(notationTop, chordTop, titleY - 30)
      : Math.min(notationTop, chordTop);
  const scrollTop = !isPageView
    ? Math.max(0, -contentTop + 4) +
      (Number.isFinite(scrollPadding?.top) ? Math.max(0, scrollPadding!.top!) : 0)
    : 0;
  const scrollBottom = Number.isFinite(scrollPadding?.bottom)
    ? Math.max(0, scrollPadding!.bottom!)
    : 50;

  // SVG height derived from layout (forward-flow pattern)
  const svgHeight = useMemo(() => {
    // In page view, use total height (all pages + gaps)
    if (isPageView) {
      return pageLayout.totalHeight;
    }
    // In scroll view, derive from content: the staff block plus padding, extended only when
    // the lowest ink or lyric band below the last staff would otherwise run off the edge
    // (deep ledger notes, wide beamed groups, several lyric lines).
    const contentBottom = layout.getY.content.bottom;
    const inkBottom = CONFIG.baseY + (layout.vertical?.bottom ?? 0);
    return contentBottom > 0 ? Math.max(contentBottom + scrollBottom, inkBottom + 4) : 200;
  }, [layout, isPageView, pageLayout.totalHeight, scrollBottom]);

  const defaultBounds = useMemo(
    () => ({
      x: viewOriginX,
      y: -scrollTop,
      width: Math.max(1, totalWidth - viewOriginX),
      height: svgHeight + scrollTop,
    }),
    [viewOriginX, scrollTop, totalWidth, svgHeight]
  );
  const geometry: ScoreViewGeometry = useMemo(() => {
    const staves = layout.staves.flatMap((staff, index) => {
      const first = staff.measures[firstVisibleMeasure];
      const last = staff.measures[measureIndices?.at(-1) ?? staff.measures.length - 1];
      if (!first || !last || (measureIndices && !measureIndices.length)) return [];
      const vertical = layout.getY.staff(index)!;
      return [
        Object.freeze({
          id: score.staves[index].id,
          index,
          clef: score.staves[index].clef,
          top: vertical.top,
          bottom: vertical.bottom,
          left: display?.showPreamble === false ? first.x : viewOriginX,
          right: last.x + last.width,
          firstEventX: score.staves[index].measures[firstVisibleMeasure]?.events.length
            ? first.x + (layout.getX({ measure: firstVisibleMeasure, quant: 0 }) ?? 0)
            : null,
        }),
      ];
    });
    const left = Math.min(
      ...staves.map((staff) => staff.left),
      showScoreTitle && score.title ? (scoreTitleOffset?.x ?? 0) : Infinity
    );
    const right = Math.max(...staves.map((staff) => staff.right));
    const bottom = Math.max(layout.getY.content.bottom, CONFIG.baseY + layout.vertical.bottom);
    return Object.freeze({
      staffSpace: CONFIG.lineHeight,
      staves: Object.freeze(staves),
      defaultBounds: Object.freeze({ ...defaultBounds }),
      contentBounds: Object.freeze({
        x: Number.isFinite(left) ? left : viewOriginX,
        y: contentTop,
        width: Number.isFinite(right - left) ? Math.max(1, right - left) : 200,
        height: Math.max(1, bottom - contentTop),
      }),
    });
  }, [
    layout,
    score.staves,
    score.title,
    showScoreTitle,
    scoreTitleOffset?.x,
    firstVisibleMeasure,
    measureIndices,
    display?.showPreamble,
    viewOriginX,
    contentTop,
    defaultBounds,
  ]);
  const resolvedViewport = isPageView ? undefined : resolveViewport?.(geometry);
  const validBounds = isPageView
    ? undefined
    : (normalizeScoreBounds(bounds) ?? normalizeScoreBounds(resolvedViewport?.bounds));
  const scale =
    !isPageView && Number.isFinite(resolvedViewport?.scale) && resolvedViewport!.scale! > 0
      ? resolvedViewport!.scale!
      : requestedScale;
  const pointerScale = scale * zoom;

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
    scale: pointerScale * (isPageView ? pageLayout.staffScale : 1),
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
      // Typing in a text field (a dialog's textarea, a metadata input) is never a chord command.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        !interactive ||
        chordDisplay.visible === false ||
        e.defaultPrevented
      )
        return;
      if (!containerRef.current?.contains(document.activeElement)) return;
      // Only handle when chord is selected but not already editing
      if (
        chordEditable &&
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
  }, [
    selection.chordTrackFocused,
    selection.chordId,
    chordTrackHook,
    chordEditable,
    chordDisplay.visible,
    interactive,
    containerRef,
  ]);

  // Quants per measure for chord positioning
  const quantsPerMeasure = getMeasureCapacity(timeSignature);

  // --- AUTO-SCROLL LOGIC ---
  useAutoScroll({
    containerRef,
    layout,
    chordTrack: chordDisplay.visible === false ? undefined : score.chordTrack,
    selection,
    playbackPosition,
    previewNote,
    // scrollLeft/clientWidth are local CSS pixels; outer viewport zoom is already applied.
    scale,
    originX: validBounds?.x ?? defaultBounds.x,
    enabled:
      !isPageView &&
      !view?.measures &&
      (resolveViewport ? resolvedViewport?.autoScroll === true : !bounds),
  });

  const unscaledMeasureWidths = useMemo(() => calculateAllMeasureWidths(score, 1.0), [score]);

  const pageSystemByMeasure = useMemo(() => {
    const map = new Map<number, { pageIndex: number; system: SystemLayout }>();

    pageLayout.pages.forEach((page) => {
      page.systems.forEach((system) => {
        system.measures.forEach((measureIndex) => {
          map.set(measureIndex, { pageIndex: page.index, system });
        });
      });
    });

    return map;
  }, [pageLayout.pages]);

  const getMeasureStretchFactor = useCallback(
    (measureIndex: number, system: SystemLayout): number => {
      const measurePosition = system.measurePositions.find(
        (position) => position.measureIndex === measureIndex
      );
      const naturalWidth = unscaledMeasureWidths[measureIndex] ?? 0;

      if (!measurePosition || naturalWidth <= 0 || pageLayout.staffScale <= 0) {
        return 1;
      }

      return measurePosition.width / (naturalWidth * pageLayout.staffScale);
    },
    [pageLayout.staffScale, unscaledMeasureWidths]
  );

  const getPageXFromLocalX = useCallback(
    (measureIndex: number, localX: number, system: SystemLayout): number | null => {
      const measurePosition = system.measurePositions.find(
        (position) => position.measureIndex === measureIndex
      );

      if (!measurePosition) return null;

      const stretchFactor = getMeasureStretchFactor(measureIndex, system);
      return measurePosition.x + localX * stretchFactor * pageLayout.staffScale;
    },
    [getMeasureStretchFactor, pageLayout.staffScale]
  );

  const getPageXForPosition = useCallback(
    (position: { measure: number; quant: number }): number | null => {
      const located = pageSystemByMeasure.get(position.measure);
      if (!located) return null;

      const localX = layout.getX({ measure: position.measure, quant: position.quant });
      if (localX === null) return null;

      return getPageXFromLocalX(position.measure, localX, located.system);
    },
    [getPageXFromLocalX, layout, pageSystemByMeasure]
  );

  const getPageNoteY = useCallback(
    (noteLayout: (typeof layout.notes)[string], system: SystemLayout): number => {
      // Staff top lines come from the layouts (content-aware in both views); the note's offset
      // within its staff is the same in either.
      const staffTopInScroll = layout.staves[noteLayout.staffIndex]?.y ?? CONFIG.baseY;
      const staffTopOnPage = system.y + (system.staffOffsets[noteLayout.staffIndex] ?? 0);
      return staffTopOnPage + (noteLayout.y - staffTopInScroll) * pageLayout.staffScale;
    },
    [layout, pageLayout.staffScale]
  );

  // Page Y of every notehead centre on a system (all staves).
  const getSystemNoteYs = useCallback(
    (system: SystemLayout): number[] =>
      Object.values(layout.notes)
        .filter((noteLayout) => system.measures.includes(noteLayout.measureIndex))
        .map((noteLayout) => getPageNoteY(noteLayout, system)),
    [getPageNoteY, layout.notes]
  );

  const getSystemChordTrackY = useCallback(
    (system: SystemLayout): number => {
      const staffScale = pageLayout.staffScale;
      return (
        calculateChordTrackY(
          system.y / staffScale,
          (system.y + (system.inkTop ?? 0)) / staffScale
        ) * staffScale
      );
    },
    [pageLayout.staffScale]
  );

  // Page X of a chord position expressed in the staff-scaled chord-track space.
  const getSystemChordX = useCallback(
    (position: { measure: number; quant: number }): number | null => {
      const pageX = getPageXForPosition(position);
      return pageX === null ? null : pageX / pageLayout.staffScale;
    },
    [getPageXForPosition, pageLayout.staffScale]
  );

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

  // Flatten layout for hit detection (interaction layer). Each box is the TOP-LEFT corner plus
  // size, as useDragToSelect's intersection test expects.
  const notePositions = useMemo(() => {
    if (isPageView) {
      return Object.values(layout.notes).flatMap((noteLayout) => {
        const located = pageSystemByMeasure.get(noteLayout.measureIndex);
        if (!located) return [];

        const x = getPageXFromLocalX(noteLayout.measureIndex, noteLayout.localX, located.system);
        if (x === null) return [];

        const hitWidth =
          (noteLayout.hitZone.endX - noteLayout.hitZone.startX) * pageLayout.staffScale;
        const hitHeight = LASSO_NOTE_HIT_HEIGHT * pageLayout.staffScale;
        const noteY = getPageNoteY(noteLayout, located.system);

        return [
          {
            x: x - hitWidth / 2,
            y: noteY - hitHeight / 2,
            width: hitWidth,
            height: hitHeight,
            pageIndex: located.pageIndex,
            staffIndex: noteLayout.staffIndex,
            measureIndex: noteLayout.measureIndex,
            eventId: noteLayout.eventId,
            noteId: noteLayout.noteId,
          },
        ];
      });
    }

    return Object.values(layout.notes).map((noteLayout) => {
      // Calculate absolute X from measureOrigin + localX
      const measureOrigin = layout.getX.measureOrigin({ measure: noteLayout.measureIndex }) ?? 0;
      // Use hit zone dimensions from layout engine
      const hitWidth = noteLayout.hitZone.endX - noteLayout.hitZone.startX;
      return {
        x: measureOrigin + noteLayout.localX - hitWidth / 2,
        y: noteLayout.y - LASSO_NOTE_HIT_HEIGHT / 2,
        width: hitWidth,
        height: LASSO_NOTE_HIT_HEIGHT,
        pageIndex: null,
        // Metadata
        staffIndex: noteLayout.staffIndex,
        measureIndex: noteLayout.measureIndex,
        eventId: noteLayout.eventId,
        noteId: noteLayout.noteId,
      };
    });
  }, [
    getPageNoteY,
    getPageXFromLocalX,
    isPageView,
    layout,
    pageLayout.staffScale,
    pageSystemByMeasure,
  ]);

  const measureTiming = useMemo(() => getMeasureTiming(score), [score]);

  // --- CHORD TRACK LAYOUT ---
  const measurePositions = useMemo(() => {
    if (layout.staves.length === 0) return [];
    const firstStaff = layout.staves[0];
    return firstStaff.measures.map((measure, index) => ({
      x: measure.x,
      width: measure.width,
      quant: measureTiming.starts[index],
    }));
  }, [layout.staves, measureTiming]);

  // Helper to compute page-relative measure positions for a single system's chord track
  const getSystemMeasurePositions = useCallback(
    (system: SystemLayout) =>
      system.measurePositions.map((position) => ({
        x: position.x / pageLayout.staffScale,
        width: position.width / pageLayout.staffScale,
        quant: measureTiming.starts[position.measureIndex],
      })),
    [pageLayout.staffScale, measureTiming]
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

  const pageCursorX =
    isPageView && cursorMeasure !== null && cursorLocalX !== null
      ? (() => {
          const located = pageSystemByMeasure.get(cursorMeasure);
          if (!located) return null;
          return getPageXFromLocalX(cursorMeasure, cursorLocalX, located.system);
        })()
      : null;

  const playbackCursorX = isPageView ? pageCursorX : unifiedCursorX;

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
    scale: pointerScale,
    originX: validBounds?.x ?? viewOriginX,
    originY: validBounds?.y ?? -scrollTop,
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
        handleDragSelectMouseDown(e, { svgElement, pageIndex });
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

      const systemMeasureWidths = system.measures.map((idx) => unscaledMeasureWidths[idx] || 0);
      const naturalMeasuresWidth = systemMeasureWidths.reduce((a, b) => a + b, 0);
      const availableForMeasures = system.contentWidth / staffScale;
      const systemStretchFactor = calculateStretchFactor(
        naturalMeasuresWidth,
        availableForMeasures,
        system.justification
      );

      // Staff block height (first top line to last bottom line) is content-aware per system.
      const totalStaffHeight = system.height;

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
              x={system.xOffset - system.preambleWidth * staffScale - 20}
            />
          )}

          {score.staves?.map((staff: StaffType, staffIndex: number) => {
            const staffYOffset =
              system.staffOffsets[staffIndex] ?? staffIndex * CONFIG.staffSpacing * staffScale;

            const interaction = {
              selection,
              previewNote,
              showGhostNotes,
              showBlockedGhostNotes,
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
                  tuplet={tuplet}
                  clef={staff.clef || (staffIndex === 0 ? 'treble' : 'bass')}
                  keySignature={keySignature}
                  timeSignature={timeSignature}
                  measures={systemMeasures}
                  measureIndices={system.measures}
                  allMeasures={staff.measures}
                  staffLayout={layout.staves[staffIndex]}
                  baseY={CONFIG.baseY}
                  scale={pointerScale * staffScale}
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
      tuplet,
      pageLayout,
      pointerScale,
      score,
      unscaledMeasureWidths,
      selection,
      previewNote,
      showGhostNotes,
      showBlockedGhostNotes,
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
      keySignature,
      timeSignature,
      onClefClick,
      onKeySigClick,
      onTimeSigClick,
    ]
  );

  const scrollBounds = validBounds ?? defaultBounds;
  const resolveAnchor = (
    anchor: ScoreAnchor,
    pageIndex: number | null
  ): { x: number; y: number } | null => {
    let measure: number;
    let staff: number;
    let localX: number | null;
    let y: number;
    if ('noteId' in anchor) {
      const matches = Object.values(layout.notes).filter((note) => note.noteId === anchor.noteId);
      const note = matches.length === 1 ? matches[0] : undefined;
      if (!note) return null;
      measure = note.measureIndex;
      staff = note.staffIndex;
      localX = note.localX;
      y = note.y;
    } else {
      staff = score.staves.findIndex((item) => item.id === anchor.staffId);
      measure =
        score.staves[staff]?.measures.findIndex((item) => item.id === anchor.measureId) ?? -1;
      if (
        staff < 0 ||
        measure < 0 ||
        !Number.isFinite(anchor.quant) ||
        anchor.quant < 0 ||
        anchor.quant > (measureTiming.spans[measure] ?? 0)
      )
        return null;
      localX = layout.getX({ measure, quant: anchor.quant });
      y = layout.staves[staff]?.y ?? CONFIG.baseY;
    }
    if (localX === null || (measureIndices && !measureIndices.includes(measure))) return null;
    if (pageIndex === null) {
      return { x: (layout.getX.measureOrigin({ measure }) ?? 0) + localX, y };
    }
    const located = pageSystemByMeasure.get(measure);
    if (!located || located.pageIndex !== pageIndex) return null;
    const x = getPageXFromLocalX(measure, localX, located.system);
    if (x === null) return null;
    return {
      x,
      y:
        located.system.y +
        (located.system.staffOffsets[staff] ?? 0) +
        (y - (layout.staves[staff]?.y ?? CONFIG.baseY)) * pageLayout.staffScale,
    };
  };

  return (
    <div
      ref={containerRef}
      data-testid="score-canvas-container"
      className={`riff-ScoreCanvas ${isPageView ? 'riff-ScoreCanvas--page-view' : ''}${!interactive ? ' riff-ScoreCanvas--readonly' : ''}`}
      style={
        {
          ...(!isPageView && overflow ? { overflow } : {}),
          // A viewport policy owns the entire frame, including its outer padding.
          paddingLeft: !isPageView && resolveViewport ? 0 : undefined,
          backgroundColor: isPageView
            ? undefined
            : showBackground
              ? theme.background
              : 'transparent',
          ...(chordFont
            ? {
                '--riff-chord-font': chordFont.family,
                '--riff-chord-size': chordFontSize === undefined ? undefined : `${chordFontSize}px`,
                '--riff-chord-weight': chordFont.weight,
              }
            : {}),
        } as React.CSSProperties
      }
      onClick={interactive ? handleBackgroundClick : undefined}
      onMouseDownCapture={interactive ? undefined : (event) => event.stopPropagation()}
      onMouseMoveCapture={interactive ? undefined : (event) => event.stopPropagation()}
      onClickCapture={interactive ? undefined : (event) => event.stopPropagation()}
      onDoubleClickCapture={interactive ? undefined : (event) => event.stopPropagation()}
      onPointerDownCapture={interactive ? undefined : (event) => event.stopPropagation()}
      role={interactive ? 'application' : 'region'}
      aria-label={`${score.title || 'Untitled'} ${interactive ? 'score editor' : 'score'}`}
      aria-describedby={interactive ? instructionsId : undefined}
      tabIndex={0}
      onMouseEnter={() => interactive && onHoverChange(true)}
      onMouseLeave={() => interactive && onHoverChange(false)}
    >
      {interactive && (
        <>
          <span id={instructionsId} className="riff-sr-only">
            Use arrow keys to navigate notes and change pitch. Tab moves between score sections.
            Press Enter to edit a chord, or Escape to leave it. Toolbar controls provide durations,
            undo and playback.
          </span>
          <span className="riff-sr-only" role="status" aria-live="polite" aria-atomic="true">
            {(() => {
              const staff = sourceScore.staves[selection.staffIndex ?? 0];
              const measure = staff?.measures[selection.measureIndex ?? 0];
              const event = measure?.events.find((event) => event.id === selection.eventId);
              const note = event?.notes.find((note) => note.id === selection.noteId);
              return event
                ? `Measure ${(selection.measureIndex ?? 0) + 1}, staff ${(selection.staffIndex ?? 0) + 1}, ${event.isRest ? 'rest' : (note?.pitch ?? event.notes.map((note) => note.pitch).join(', '))}, ${event.dotted ? 'dotted ' : ''}${event.duration}`
                : 'No note selected';
            })()}
          </span>
        </>
      )}
      {/* Page View Rendering - Separate SVG per page */}
      {isPageView && (
        <div
          className="riff-pages"
          data-page-size={pageLayout.pageSize}
          style={PAPER_CSS_VARIABLES}
        >
          <ThemeOverride theme={PAPER_THEME}>
            {pageLayout.pages.map((page) => (
              <PageContainer
                key={`page-${page.index}`}
                ref={(el) => setPageRef(page.index, el)}
                page={page}
                pageLayout={pageLayout}
                scale={scale}
                onMouseDown={handlePageMouseDown}
                onClick={handleBackgroundClick}
              >
                {/* Page boundary (white background, border) */}
                <PageBoundary pageLayout={pageLayout} />

                {/* Systems on this page */}
                {page.systems.map((system) => renderSystem(system, page.index))}

                {/* Chord tracks are rendered per system so wrapped systems keep local Y positioning. */}
                {page.systems.map((system) => (
                  <g
                    key={`chord-track-system-${system.index}`}
                    transform={`scale(${pageLayout.staffScale})`}
                  >
                    <ChordTrack
                      editable={chordEditable}
                      chords={chordTrackHook.chords}
                      fontSize={chordFontSize}
                      displayConfig={chordDisplay}
                      keySignature={keySignature}
                      timeSignature={timeSignature}
                      validPositions={chordTrackHook.validPositions}
                      measurePositions={getSystemMeasurePositions(system)}
                      layout={layout}
                      quantsPerMeasure={quantsPerMeasure}
                      editingChordId={chordTrackHook.editingChordId}
                      selectedChordId={chordTrackHook.selectedChordId}
                      creatingAt={chordTrackHook.creatingAt}
                      initialValue={chordTrackHook.initialValue}
                      pageMeasureIndices={system.measures}
                      pageTrackY={getSystemChordTrackY(system) / pageLayout.staffScale}
                      pageNoteYs={getSystemNoteYs(system).map((y) => y / pageLayout.staffScale)}
                      resolveX={getSystemChordX}
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
                      onEditComplete={(chordId, value) =>
                        chordTrackHook.completeEdit(chordId, value)
                      }
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
                          (p) =>
                            p.measure === currentPosition.measure &&
                            p.quant === currentPosition.quant
                        );
                        if (currentIdx === -1 || currentIdx >= sortedPositions.length - 1) return;

                        const nextPosition = sortedPositions[currentIdx + 1];
                        chordTrackHook.completeEdit(chordId, value);

                        setTimeout(() => {
                          const updatedChords = chordTrackHook.chords;
                          const chordAtPosition = updatedChords.find(
                            (c) =>
                              c.measure === nextPosition.measure && c.quant === nextPosition.quant
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
                          (p) =>
                            p.measure === currentPosition.measure &&
                            p.quant === currentPosition.quant
                        );
                        if (currentIdx <= 0) return;

                        const previousPosition = sortedPositions[currentIdx - 1];
                        chordTrackHook.completeEdit(chordId, value);

                        setTimeout(() => {
                          const updatedChords = chordTrackHook.chords;
                          const chordAtPosition = updatedChords.find(
                            (c) =>
                              c.measure === previousPosition.measure &&
                              c.quant === previousPosition.quant
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
                  </g>
                ))}

                {/* Playback cursor - only on page containing current position */}
                {cursorPageIndex === page.index && playbackCursorX !== null && (
                  <g
                    className="riff-PlaybackCursor"
                    data-testid="playback-cursor"
                    style={{
                      transform: `translateX(${playbackCursorX}px)`,
                      transition: `transform ${playbackPosition.duration || 0.1}s linear`,
                      pointerEvents: 'none',
                      opacity:
                        isPlaybackVisible &&
                        (!measureIndices ||
                          measureIndices.includes(effectivePlaybackPos.measureIndex))
                          ? 1
                          : 0,
                    }}
                  >
                    {(() => {
                      // Find the system containing the cursor on this page
                      const cursorSystem = page.systems.find((sys) =>
                        sys.measures.includes(cursorMeasure!)
                      );
                      if (!cursorSystem) return null;
                      const cursorTop = cursorSystem.y - 20;
                      const cursorBottom = cursorSystem.y + cursorSystem.height + 20;
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
                          <circle
                            cx={0}
                            cy={cursorBottom}
                            r="4"
                            fill={theme.accent}
                            opacity="0.9"
                          />
                        </>
                      );
                    })()}
                  </g>
                )}

                {/* Selection rectangle - only on page where drag started */}
                {isDragging && selectionRect && dragPageIndex === page.index && (
                  <rect
                    className="riff-LassoRect"
                    data-testid="lasso-selection-rect"
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

                {renderOverlay?.({
                  geometry: null,
                  pageIndex: page.index,
                  bounds: {
                    x: 0,
                    y: 0,
                    width: pageLayout.dimensions.width,
                    height: pageLayout.dimensions.height,
                  },
                  resolveAnchor: (anchor) => resolveAnchor(anchor, page.index),
                })}

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
                  onCopyrightEditComplete={(value) =>
                    metadataTrack.completeEdit('copyright', value)
                  }
                  onCopyrightEditCancel={() => metadataTrack.cancelEdit()}
                  onCopyrightDelete={() => metadataTrack.deleteField('copyright')}
                />
              </PageContainer>
            ))}
          </ThemeOverride>
        </div>
      )}

      {/* Scroll View Rendering - Single SVG */}
      {!isPageView && (
        <svg
          ref={svgRef}
          width={scrollBounds.width * scale}
          height={Math.ceil(scrollBounds.height * scale)}
          viewBox={
            validBounds || measureIndices || scrollTop > 0
              ? `${scrollBounds.x * scale} ${scrollBounds.y * scale} ${scrollBounds.width * scale} ${Math.ceil(scrollBounds.height * scale)}`
              : undefined
          }
          className="riff-ScoreCanvas__svg"
          style={overflow ? { overflow } : undefined}
          onMouseDown={handleDragSelectMouseDown}
        >
          <g data-score-coordinates transform={`scale(${scale})`}>
            {/* Title left-aligned with score start */}
            {showScoreTitle && score.title && (
              <text
                x={viewOriginX + (scoreTitleOffset?.x ?? 0)}
                y={titleY}
                textAnchor="start"
                className="riff-metadata__title"
              >
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
                      x={viewOriginX - 20}
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
                showGhostNotes,
                showBlockedGhostNotes,
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
                max: isBottom
                  ? CLAMP_LIMITS.OUTER_BOTTOM
                  : STAFF_HEIGHT + CLAMP_LIMITS.INNER_OFFSET,
              };

              return (
                <Staff
                  key={staff.id || staffIndex}
                  tuplet={tuplet}
                  staffIndex={staffIndex}
                  clef={staff.clef || (staffIndex === 0 ? 'treble' : 'bass')}
                  keySignature={keySignature}
                  timeSignature={timeSignature}
                  measures={
                    measureIndices
                      ? measureIndices.map((index) => staff.measures[index]).filter(Boolean)
                      : staff.measures
                  }
                  measureIndices={measureIndices}
                  allMeasures={staff.measures}
                  isLastSystem={
                    !measureIndices || measureIndices.at(-1) === staff.measures.length - 1
                  }
                  measureStartX={
                    measureIndices
                      ? (layout.getX.measureOrigin({ measure: firstVisibleMeasure }) ?? undefined)
                      : undefined
                  }
                  staffLayout={layout.staves[staffIndex]}
                  baseY={staffBaseY}
                  scale={pointerScale}
                  interaction={interaction}
                  onClefClick={onClefClick}
                  onKeySigClick={onKeySigClick}
                  onTimeSigClick={onTimeSigClick}
                  mouseLimits={mouseLimits}
                  isSystemStart={display?.showPreamble !== false}
                  showBarlines={display?.showBarlines}
                  showPlaceholderRests={display?.showPlaceholderRests}
                />
              );
            })}

            {/* Chord Track */}
            <ChordTrack
              pageMeasureIndices={measureIndices}
              editable={chordEditable}
              chords={chordTrackHook.chords}
              fontSize={chordFontSize}
              displayConfig={chordDisplay}
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
                const chordPosition = chord ? { measure: chord.measure, quant: chord.quant } : null;
                chordTrackHook.deleteChord(chordId);
                if (chordPosition) selectTopmostNoteAtPosition(chordPosition);
              }}
            />

            {/* Playback cursor */}
            {unifiedCursorX !== null && (
              <g
                ref={cursorRef}
                className="riff-PlaybackCursor"
                data-testid="playback-cursor"
                style={{
                  transform: `translateX(${unifiedCursorX}px)`,
                  transition: `transform ${playbackPosition.duration || 0.1}s linear`,
                  pointerEvents: 'none',
                  opacity:
                    isPlaybackVisible &&
                    (!measureIndices || measureIndices.includes(effectivePlaybackPos.measureIndex))
                      ? 1
                      : 0,
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
                className="riff-LassoRect"
                data-testid="lasso-selection-rect"
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
                  x={pos.x}
                  y={pos.y}
                  width={pos.width}
                  height={pos.height}
                  fill="cyan"
                  opacity={0.3}
                  pointerEvents="none"
                />
              ))}
            {renderOverlay && (
              <g className="riff-ScoreOverlay">
                {renderOverlay({
                  geometry,
                  pageIndex: null,
                  bounds: scrollBounds,
                  resolveAnchor: (anchor) => resolveAnchor(anchor, null),
                })}
              </g>
            )}
          </g>
        </svg>
      )}
    </div>
  );
};

export default ScoreCanvas;
