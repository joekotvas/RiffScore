/**
 * ChordTrack.tsx
 *
 * Container component for the chord symbol track.
 * Renders above the score staves and manages chord display and interaction.
 *
 * @see SDD.md Section 6.1
 */
import React, { memo, useState, useCallback, useMemo } from 'react';
import { ChordSymbol as ChordSymbolType, ChordDisplayConfig } from '@/types';
import { useModifierKeys } from '@hooks/editor';
import { clientToSvg } from '@/engines/layout/coordinateUtils';
import { ScoreLayout } from '@/engines/layout/types';
import { calculateChordTrackY } from '@/engines/layout/vertical';
import { CONFIG } from '@/config';
import { LAYOUT } from '@/constants';
import { ChordSymbol } from './ChordSymbol';
import { ChordInput } from './ChordInput';
import './ChordTrack.css';

// ============================================================================
// TYPES
// ============================================================================

/** Measure-local position for chord placement */
interface ChordPosition {
  measure: number;
  quant: number;
}

interface MeasurePosition {
  x: number;
  width: number;
}

interface ChordTrackProps {
  /** Automatically recognized symbols are display-only. */
  editable?: boolean;
  fontSize?: number;
  /** Array of chord symbols to render */
  chords: ChordSymbolType[];

  /** Display configuration (notation style, symbols) */
  displayConfig: ChordDisplayConfig;

  /** Current key signature for notation conversion */
  keySignature: string;

  /** Time signature for quant calculations */
  timeSignature: string;

  /** Valid positions where chords can be placed (Map<measure, Set<quant>>) */
  validPositions: Map<number, Set<number>>;

  /** Measure layout information for hit detection */
  measurePositions: MeasurePosition[];

  /** Layout object with getX and getY accessors */
  layout: ScoreLayout;

  /** Quants per measure (e.g., 64 for 4/4) */
  quantsPerMeasure: number;

  // Interaction state
  /** ID of chord currently being edited (or 'new' for creating) */
  editingChordId: string | null;

  /** ID of currently selected chord */
  selectedChordId: string | null;

  /** Position for new chord creation */
  creatingAt: ChordPosition | null;

  /** Override initial value for input (for "type to replace" behavior) */
  initialValue: string | null;

  // Page view filtering (optional)
  /** Measure indices on this page (for filtering in page view) */
  pageMeasureIndices?: number[];

  /** Override Y position for chord track (used in page view) */
  pageTrackY?: number;

  /**
   * Y of every notehead on this track's system, in the track's own units (used in page view,
   * where the notes of other systems are irrelevant). The hit band is kept clear of them.
   */
  pageNoteYs?: number[];

  /** Optional coordinate resolver for page/system layouts */
  resolveX?: (position: ChordPosition) => number | null;

  // Event handlers
  /** Called when a chord is clicked (enters edit mode) */
  onChordClick: (chordId: string) => void;

  /** Called when a chord is CMD/CTRL+clicked (selects without editing) */
  onChordSelect: (chordId: string) => void;

  /** Called when clicking empty space at a valid position */
  onEmptyClick: (position: ChordPosition) => void;

  /** Called when editing is complete */
  onEditComplete: (chordId: string | null, value: string) => void;

  /** Called when editing is cancelled */
  onEditCancel: () => void;

  /** Called when a chord should be deleted */
  onDelete: (chordId: string) => void;

  /** Called when Tab pressed during edit - save and move to next chord */
  onNavigateNext: (chordId: string | null, value: string) => void;

  /** Called when Shift+Tab pressed during edit - save and move to previous chord */
  onNavigatePrevious: (chordId: string | null, value: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get beat position string for accessibility.
 */
function getBeatPosition(measure: number, quant: number): string {
  const beat = Math.floor(quant / 16) + 1; // 16 quants per quarter note
  return `measure ${measure + 1}, beat ${beat}`;
}

/**
 * Get X position for a chord position using measure-relative layout.
 * Returns absolute X by combining measureOrigin and local X.
 */
function getAbsoluteX(
  position: ChordPosition,
  layout: ScoreLayout,
  resolveX?: (position: ChordPosition) => number | null
): number {
  const resolvedX = resolveX?.(position);
  if (resolvedX !== undefined && resolvedX !== null) {
    return resolvedX;
  }

  const measureOrigin = layout.getX.measureOrigin({ measure: position.measure }) ?? 0;
  const localX = layout.getX({ measure: position.measure, quant: position.quant }) ?? 0;
  return measureOrigin + localX;
}

/**
 * Find the nearest valid position from an X coordinate.
 * Returns null if no valid position is within snap distance.
 */
function xToNearestPosition(
  x: number,
  validPositions: Map<number, Set<number>>,
  layout: ScoreLayout,
  resolveX?: (position: ChordPosition) => number | null,
  snapDistance = 24
): ChordPosition | null {
  let nearest: ChordPosition | null = null;
  let nearestDist = Infinity;

  for (const [measure, quants] of validPositions) {
    for (const quant of quants) {
      const position = { measure, quant };
      const qx = getAbsoluteX(position, layout, resolveX);

      const dist = Math.abs(x - qx);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = position;
      }
    }
  }

  return nearestDist <= snapDistance ? nearest : null;
}

/**
 * Vertical extent of the hit band (top edge `y` and `height`, relative to the track baseline).
 *
 * The band is painted after the staves, so wherever it overlapped a note's hit area the note
 * could not be clicked: the click opened a chord input instead. Collision avoidance only keeps
 * the baseline paddingAboveNotes above the highest note (less than the band's half-height), and
 * in page view the band is pinned inside the system's reserved headroom, so the band yields to
 * the notes instead: a note intruding from below clips the bottom edge, one intruding from above
 * clips the top edge, and notes clear of the band leave it untouched. `noteYs` are notehead
 * centres in the track's coordinate space.
 */
export function clipHitBand(noteYs: number[], trackY: number): { y: number; height: number } {
  const { hitBandHalfHeight, noteHitGap } = CONFIG.chordTrack;
  const clearance = LAYOUT.HIT_AREA.HEIGHT / 2 + noteHitGap;
  let top = trackY - hitBandHalfHeight;
  let bottom = trackY + hitBandHalfHeight;

  for (const noteY of noteYs) {
    const noteTop = noteY - clearance;
    const noteBottom = noteY + clearance;
    if (noteBottom <= top || noteTop >= bottom) continue;
    if (noteY < trackY) {
      top = Math.max(top, noteBottom);
    } else {
      bottom = Math.min(bottom, noteTop);
    }
  }

  return { y: top - trackY, height: Math.max(0, bottom - top) };
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChordTrack = memo(function ChordTrack({
  chords,
  fontSize = 20,
  editable = true,
  displayConfig,
  keySignature,
  validPositions,
  measurePositions,
  layout,
  editingChordId,
  selectedChordId,
  creatingAt,
  initialValue,
  pageMeasureIndices,
  pageTrackY,
  pageNoteYs,
  resolveX,
  onChordClick,
  onChordSelect,
  onEmptyClick,
  onEditComplete,
  onEditCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}: ChordTrackProps) {
  // Filter chords and valid positions to this page (if pageMeasureIndices provided)
  const measureSet = useMemo(
    () => (pageMeasureIndices ? new Set(pageMeasureIndices) : null),
    [pageMeasureIndices]
  );

  const filteredChords = useMemo(
    () => (measureSet ? chords.filter((c) => measureSet.has(c.measure)) : chords),
    [chords, measureSet]
  );

  const filteredValidPositions = useMemo(() => {
    if (!measureSet) return validPositions;
    const filtered = new Map<number, Set<number>>();
    for (const [measure, quants] of validPositions) {
      if (measureSet.has(measure)) {
        filtered.set(measure, quants);
      }
    }
    return filtered;
  }, [validPositions, measureSet]);

  const isCreatingOnThisTrack =
    creatingAt !== null && (!measureSet || measureSet.has(creatingAt.measure));

  const [cursorStyle, setCursorStyle] = useState<'default' | 'text' | 'pointer'>('default');
  const [hoveredChordId, setHoveredChordId] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<ChordPosition | null>(null);

  // Track CMD/CTRL key state for selection mode
  const isMetaKeyHeld = useModifierKeys();

  // --- Y Positioning (via layout.getY) ---

  // System-level chord track Y position (baseline for all chords)
  // Positioned to clear the highest note in the system
  // In page view, use pageTrackY override if provided
  const trackY = useMemo(() => {
    if (pageTrackY !== undefined) {
      return pageTrackY;
    }

    return calculateChordTrackY(
      layout.getY.staff(0)?.top ?? CONFIG.baseY,
      CONFIG.baseY + layout.vertical.top,
      fontSize
    );
  }, [layout, pageTrackY, fontSize]);

  // Notehead centres the hit band must stay clear of: this system's notes in page view, every
  // note of the (single-system) layout in scroll view.
  const noteYs = useMemo(
    () => pageNoteYs ?? Object.values(layout.notes).map((noteLayout) => noteLayout.y),
    [layout, pageNoteYs]
  );

  const hitBand = useMemo(() => clipHitBand(noteYs, trackY), [noteYs, trackY]);

  // Compute cursor style based on hover state and meta key
  // Using useMemo instead of useEffect to avoid synchronous setState in effect
  const computedCursorStyle = useMemo(() => {
    if (hoveredChordId) {
      return isMetaKeyHeld ? 'pointer' : 'text';
    }
    return cursorStyle;
  }, [isMetaKeyHeld, hoveredChordId, cursorStyle]);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation();
      e.preventDefault();

      const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);
      const position = xToNearestPosition(x, filteredValidPositions, layout, resolveX);

      if (position !== null) {
        const existingChord = filteredChords.find(
          (c) => c.measure === position.measure && c.quant === position.quant
        );
        if (existingChord) {
          // CMD/CTRL+click selects without editing
          if (e.metaKey || e.ctrlKey) {
            onChordSelect(existingChord.id);
          } else {
            onChordClick(existingChord.id);
          }
        } else {
          onEmptyClick(position);
        }
      }
    },
    [
      filteredValidPositions,
      layout,
      resolveX,
      filteredChords,
      onChordClick,
      onChordSelect,
      onEmptyClick,
    ]
  );

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);
      const position = xToNearestPosition(x, filteredValidPositions, layout, resolveX);

      if (position !== null) {
        const existingChord = filteredChords.find(
          (c) => c.measure === position.measure && c.quant === position.quant
        );
        setHoveredChordId(existingChord?.id ?? null);
        // Show preview at empty valid positions (not over existing chords)
        setPreviewPosition(existingChord ? null : position);
        // Show pointer when CMD/CTRL is held over a chord (selection mode)
        // Show text cursor otherwise (edit mode)
        const hasMetaKey = e.metaKey || e.ctrlKey;
        setCursorStyle(existingChord && hasMetaKey ? 'pointer' : 'text');
      } else {
        setHoveredChordId(null);
        setPreviewPosition(null);
        setCursorStyle('default');
      }
    },
    [filteredValidPositions, layout, resolveX, filteredChords]
  );

  const handleTrackMouseLeave = useCallback(() => {
    setHoveredChordId(null);
    setPreviewPosition(null);
    setCursorStyle('default');
  }, []);

  // Stop mousedown propagation to prevent drag-to-select from intercepting
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Calculate track width based on measure positions
  const trackWidth =
    measurePositions.length > 0
      ? Math.max(...measurePositions.map((position) => position.x + position.width))
      : 800;

  // Pre-compute chord positions to avoid recalculating on every render
  const chordPositions = useMemo(() => {
    return filteredChords.map((chord) => {
      const position = { measure: chord.measure, quant: chord.quant };
      return {
        chord,
        x: getAbsoluteX(position, layout, resolveX),
        beatPosition: getBeatPosition(chord.measure, chord.quant),
        yOffset: 0,
      };
    });
  }, [filteredChords, layout, resolveX]);

  if (displayConfig?.visible === false) return null;

  return (
    <g
      className="riff-ChordTrack"
      data-testid="chord-track"
      transform={`translate(0, ${trackY})`}
      role="region"
      aria-label="Chord symbols"
      style={{
        cursor: editable ? computedCursorStyle : 'default',
        pointerEvents: editable ? undefined : 'none',
      }}
    >
      {/* Hit area for clicks (clipped so it never covers a note's hit area) */}
      <rect
        className="riff-ChordTrack__hitArea"
        data-testid="chord-track-hit-area"
        data-interactive="true"
        x={0}
        y={hitBand.y}
        width={trackWidth}
        height={hitBand.height}
        fill="transparent"
        style={{ cursor: computedCursorStyle }}
        onMouseDown={handleMouseDown}
        onClick={handleTrackClick}
        onMouseMove={handleTrackMouseMove}
        onMouseLeave={handleTrackMouseLeave}
      />

      {/* Render chord symbols - using memoized positions */}
      {chordPositions.map(({ chord, x, beatPosition, yOffset }) => {
        return editable && editingChordId === chord.id ? (
          <g key={chord.id} transform={`translate(0, ${yOffset})`}>
            <ChordInput
              x={x}
              initialValue={initialValue ?? chord.symbol}
              onComplete={(value) => onEditComplete(chord.id, value)}
              onCancel={onEditCancel}
              onDelete={() => onDelete(chord.id)}
              onNavigateNext={(value) => onNavigateNext(chord.id, value)}
              onNavigatePrevious={(value) => onNavigatePrevious(chord.id, value)}
            />
          </g>
        ) : (
          <g key={chord.id} transform={`translate(0, ${yOffset})`}>
            <ChordSymbol
              chord={chord}
              displayConfig={displayConfig}
              keySignature={keySignature}
              x={x}
              beatPosition={beatPosition}
              isSelected={selectedChordId === chord.id}
              isHovered={hoveredChordId === chord.id}
            />
          </g>
        );
      })}

      {/* Creating new chord */}
      {editable && editingChordId === 'new' && creatingAt !== null && isCreatingOnThisTrack && (
        <g transform="translate(0, 0)">
          <ChordInput
            x={getAbsoluteX(creatingAt, layout, resolveX)}
            initialValue=""
            onComplete={(value) => onEditComplete(null, value)}
            onCancel={onEditCancel}
            onNavigateNext={(value) => onNavigateNext(null, value)}
            onNavigatePrevious={(value) => onNavigatePrevious(null, value)}
          />
        </g>
      )}

      {/* Preview ghost chord on hover */}
      {editable && previewPosition !== null && editingChordId !== 'new' && (
        <g transform="translate(0, 0)">
          <text
            className="riff-ChordSymbol riff-ChordSymbol--preview"
            data-testid="chord-preview-ghost"
            x={getAbsoluteX(previewPosition, layout, resolveX)}
            y={0}
            textAnchor="middle"
            dominantBaseline="central"
            aria-hidden="true"
          >
            Cm7
          </text>
        </g>
      )}
    </g>
  );
});

export default ChordTrack;
