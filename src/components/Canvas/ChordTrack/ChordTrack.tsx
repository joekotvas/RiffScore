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
import { CONFIG } from '@/config';
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
function getAbsoluteX(position: ChordPosition, layout: ScoreLayout): number {
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
  snapDistance = 24
): ChordPosition | null {
  let nearest: ChordPosition | null = null;
  let nearestDist = Infinity;

  for (const [measure, quants] of validPositions) {
    for (const quant of quants) {
      const position = { measure, quant };
      const qx = getAbsoluteX(position, layout);

      const dist = Math.abs(x - qx);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = position;
      }
    }
  }

  return nearestDist <= snapDistance ? nearest : null;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChordTrack = memo(function ChordTrack({
  chords,
  displayConfig,
  keySignature,
  validPositions,
  measurePositions,
  layout,
  quantsPerMeasure,
  editingChordId,
  selectedChordId,
  creatingAt,
  initialValue,
  onChordClick,
  onChordSelect,
  onEmptyClick,
  onEditComplete,
  onEditCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}: ChordTrackProps) {
  const [cursorStyle, setCursorStyle] = useState<'default' | 'text' | 'pointer'>('default');
  const [hoveredChordId, setHoveredChordId] = useState<string | null>(null);
  const [previewPosition, setPreviewPosition] = useState<ChordPosition | null>(null);

  // Track CMD/CTRL key state for selection mode
  const isMetaKeyHeld = useModifierKeys();

  // --- Y Positioning (via layout.getY) ---

  // System-level chord track Y position (baseline for all chords)
  // Positioned to clear the highest note in the system
  const trackY = useMemo(() => {
    const { minDistanceFromStaff, paddingAboveNotes, minY } = CONFIG.chordTrack;

    const staffTop = layout.getY.staff(0)?.top ?? CONFIG.baseY;
    const defaultY = staffTop - minDistanceFromStaff;

    const highestNoteY = layout.getY.notes().top;
    const collisionY = highestNoteY - paddingAboveNotes;

    // Use the higher position (lower Y value) between collision-based and default
    // Clamp to minY (can go all the way to 0 for extreme cases)
    return Math.max(minY, Math.min(collisionY, defaultY));
  }, [layout]);

  // Compute cursor style based on hover state and meta key
  // Using useMemo instead of useEffect to avoid synchronous setState in effect
  const computedCursorStyle = useMemo(() => {
    if (hoveredChordId) {
      return isMetaKeyHeld ? 'pointer' : 'text';
    }
    return cursorStyle;
  }, [isMetaKeyHeld, hoveredChordId, cursorStyle]);

  /**
   * Calculate per-chord Y offset for collision avoidance.
   * Returns a negative offset (move up) if the note at this position is higher
   * than what the system baseline accounts for.
   */
  const getChordYOffset = useCallback(
    (position: ChordPosition): number => {
      const { paddingAboveNotes, minY } = CONFIG.chordTrack;
      // Note: getY.notes still uses global quant for now
      const globalQuant = position.measure * quantsPerMeasure + position.quant;

      const noteY = layout.getY.notes(globalQuant).top;
      const systemNoteY = layout.getY.notes().top;

      // If this position has no specific notes (fell back to system-wide), no offset needed
      if (noteY === systemNoteY) return 0;

      // The chord should be paddingAboveNotes pixels above the note
      const idealChordY = noteY - paddingAboveNotes;

      // If the ideal position is above the track baseline, return the offset
      // (negative = move up in SVG coordinates)
      if (idealChordY < trackY) {
        // Clamp to minY (can go all the way to 0 for extreme cases)
        const clampedY = Math.max(minY, idealChordY);
        return clampedY - trackY;
      }

      return 0;
    },
    [layout, trackY, quantsPerMeasure]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation();
      e.preventDefault();

      const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);
      const position = xToNearestPosition(x, validPositions, layout);

      if (position !== null) {
        const existingChord = chords.find(
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
    [validPositions, layout, chords, onChordClick, onChordSelect, onEmptyClick]
  );

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);
      const position = xToNearestPosition(x, validPositions, layout);

      if (position !== null) {
        const existingChord = chords.find(
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
    [validPositions, layout, chords]
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
      ? measurePositions[measurePositions.length - 1].x +
        measurePositions[measurePositions.length - 1].width
      : 800;

  // Pre-compute chord positions to avoid recalculating on every render
  const chordPositions = useMemo(() => {
    return chords.map((chord) => {
      const position = { measure: chord.measure, quant: chord.quant };
      return {
        chord,
        x: getAbsoluteX(position, layout),
        beatPosition: getBeatPosition(chord.measure, chord.quant),
        yOffset: getChordYOffset(position),
      };
    });
  }, [chords, layout, getChordYOffset]);

  return (
    <g
      className="riff-ChordTrack"
      data-testid="chord-track"
      transform={`translate(0, ${trackY})`}
      role="region"
      aria-label="Chord symbols"
      style={{ cursor: computedCursorStyle }}
    >
      {/* Hit area for clicks */}
      <rect
        className="riff-ChordTrack__hitArea"
        data-testid="chord-track-hit-area"
        x={0}
        y={-20}
        width={trackWidth}
        height={40}
        fill="transparent"
        style={{ cursor: computedCursorStyle }}
        onMouseDown={handleMouseDown}
        onClick={handleTrackClick}
        onMouseMove={handleTrackMouseMove}
        onMouseLeave={handleTrackMouseLeave}
      />

      {/* Render chord symbols - using memoized positions */}
      {chordPositions.map(({ chord, x, beatPosition, yOffset }) => {
        return editingChordId === chord.id ? (
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
      {editingChordId === 'new' && creatingAt !== null && (
        <g transform={`translate(0, ${getChordYOffset(creatingAt)})`}>
          <ChordInput
            x={getAbsoluteX(creatingAt, layout)}
            initialValue=""
            onComplete={(value) => onEditComplete(null, value)}
            onCancel={onEditCancel}
            onNavigateNext={(value) => onNavigateNext(null, value)}
            onNavigatePrevious={(value) => onNavigatePrevious(null, value)}
          />
        </g>
      )}

      {/* Preview ghost chord on hover */}
      {previewPosition !== null && editingChordId !== 'new' && (
        <g transform={`translate(0, ${getChordYOffset(previewPosition)})`}>
          <text
            className="riff-ChordSymbol riff-ChordSymbol--preview"
            data-testid="chord-preview-ghost"
            x={getAbsoluteX(previewPosition, layout)}
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
