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
import { ChordSymbol } from './ChordSymbol';
import { ChordInput } from './ChordInput';
import './ChordTrack.css';

// ============================================================================
// TYPES
// ============================================================================

interface MeasurePosition {
  x: number;
  width: number;
  quant: number; // Global quant at start of measure
}

interface CollisionConfig {
  MIN_DISTANCE_FROM_STAFF: number;
  PADDING_ABOVE_NOTES: number;
  MIN_Y: number;
  PER_CHORD_MIN_Y: number;
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

  /** Set of valid quant positions where chords can be placed */
  validQuants: Set<number>;

  /** Measure layout information for hit detection */
  measurePositions: MeasurePosition[];

  /** Convert global quant to X coordinate */
  quantToX: (quant: number) => number;

  /** Y position of the track (system-level baseline) */
  trackY: number;

  /** Quants per measure (e.g., 96 for 4/4) */
  quantsPerMeasure: number;

  /** Map of quant -> highest note Y at that position (for per-chord collision) */
  noteYByQuant: Map<number, number>;

  /** Collision avoidance configuration */
  collisionConfig: CollisionConfig;

  // Interaction state
  /** ID of chord currently being edited (or 'new' for creating) */
  editingChordId: string | null;

  /** ID of currently selected chord */
  selectedChordId: string | null;

  /** Quant position for new chord creation */
  creatingAtQuant: number | null;

  /** Override initial value for input (for "type to replace" behavior) */
  initialValue: string | null;

  // Event handlers
  /** Called when a chord is clicked (enters edit mode) */
  onChordClick: (chordId: string) => void;

  /** Called when a chord is CMD/CTRL+clicked (selects without editing) */
  onChordSelect: (chordId: string) => void;

  /** Called when clicking empty space at a valid quant */
  onEmptyClick: (quant: number) => void;

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
 * Convert pixel X position to nearest valid quant.
 * Uses actual note X positions (via quantToX) for accurate hit detection.
 * Returns null if no valid quant is within snapping distance.
 */
function xToNearestQuant(
  clickX: number,
  validQuants: Set<number>,
  quantToX: (quant: number) => number,
  snapDistance: number = 24 // pixels
): number | null {
  if (validQuants.size === 0) return null;

  let nearestQuant: number | null = null;
  let nearestDistance = Infinity;

  for (const quant of validQuants) {
    const quantX = quantToX(quant);
    const distance = Math.abs(clickX - quantX);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestQuant = quant;
    }
  }

  // Only return if within snapping distance
  return nearestDistance <= snapDistance ? nearestQuant : null;
}

/**
 * Get beat position string for accessibility.
 */
function getBeatPosition(quant: number, quantsPerMeasure: number): string {
  const measureIndex = Math.floor(quant / quantsPerMeasure);
  const localQuant = quant % quantsPerMeasure;
  const beat = Math.floor(localQuant / 24) + 1; // 24 quants per quarter note

  return `measure ${measureIndex + 1}, beat ${beat}`;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChordTrack = memo(function ChordTrack({
  chords,
  displayConfig,
  keySignature,
  validQuants,
  measurePositions,
  quantToX,
  trackY,
  quantsPerMeasure,
  noteYByQuant,
  collisionConfig,
  editingChordId,
  selectedChordId,
  creatingAtQuant,
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
  const [previewQuant, setPreviewQuant] = useState<number | null>(null);

  // Track CMD/CTRL key state for selection mode
  const isMetaKeyHeld = useModifierKeys();

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
   * Returns a negative offset (move up) if the note at this quant is higher
   * than what the system baseline accounts for.
   *
   * Note: In most cases, system-level collision handles all notes uniformly.
   * Per-chord collision is a safety net for edge cases.
   */
  const getChordYOffset = useCallback((quant: number): number => {
    const noteY = noteYByQuant.get(quant);
    if (noteY === undefined) return 0;

    // The chord should be PADDING_ABOVE_NOTES pixels above the note
    const idealChordY = noteY - collisionConfig.PADDING_ABOVE_NOTES;

    // If the ideal position is above the track baseline, return the offset
    // (negative = move up in SVG coordinates)
    if (idealChordY < trackY) {
      // Clamp to PER_CHORD_MIN_Y (can go all the way to 0 for extreme cases)
      const clampedY = Math.max(collisionConfig.PER_CHORD_MIN_Y, idealChordY);
      return clampedY - trackY;
    }

    return 0;
  }, [noteYByQuant, collisionConfig, trackY]);

  const handleTrackClick = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    e.stopPropagation();
    e.preventDefault();

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    // Use the parent group's CTM to account for transforms (e.g., leftMargin translate)
    const parentGroup = e.currentTarget.parentElement as SVGGraphicsElement | null;
    const ctm = parentGroup?.getScreenCTM() ?? svg.getScreenCTM();

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;

    const svgP = pt.matrixTransform(ctm?.inverse());
    const x = svgP.x;

    const quant = xToNearestQuant(x, validQuants, quantToX);

    if (quant !== null) {
      const existingChord = chords.find((c) => c.quant === quant);
      if (existingChord) {
        // CMD/CTRL+click selects without editing
        if (e.metaKey || e.ctrlKey) {
          onChordSelect(existingChord.id);
        } else {
          onChordClick(existingChord.id);
        }
      } else {
        onEmptyClick(quant);
      }
    }
  }, [validQuants, quantToX, chords, onChordClick, onChordSelect, onEmptyClick]);

  const handleTrackMouseMove = useCallback((e: React.MouseEvent<SVGGElement>) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    // Use the element's CTM to account for transforms (e.g., leftMargin translate)
    const ctm = (e.currentTarget as SVGGraphicsElement).getScreenCTM() ?? svg.getScreenCTM();

    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;

    const svgP = pt.matrixTransform(ctm?.inverse());
    const x = svgP.x;

    const quant = xToNearestQuant(x, validQuants, quantToX);

    if (quant !== null) {
      const existingChord = chords.find((c) => c.quant === quant);
      setHoveredChordId(existingChord?.id ?? null);
      // Show preview at empty valid positions (not over existing chords)
      setPreviewQuant(existingChord ? null : quant);
      // Show pointer when CMD/CTRL is held over a chord (selection mode)
      // Show text cursor otherwise (edit mode)
      const hasMetaKey = e.metaKey || e.ctrlKey;
      setCursorStyle(existingChord && hasMetaKey ? 'pointer' : 'text');
    } else {
      setHoveredChordId(null);
      setPreviewQuant(null);
      setCursorStyle('default');
    }
  }, [validQuants, quantToX, chords]);

  const handleTrackMouseLeave = useCallback(() => {
    setHoveredChordId(null);
    setPreviewQuant(null);
    setCursorStyle('default');
  }, []);

  // Stop mousedown propagation to prevent drag-to-select from intercepting
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Calculate track width based on measure positions
  const trackWidth = measurePositions.length > 0
    ? measurePositions[measurePositions.length - 1].x + measurePositions[measurePositions.length - 1].width
    : 800;

  // Pre-compute chord positions to avoid recalculating on every render
  const chordPositions = useMemo(() => {
    return chords.map((chord) => ({
      chord,
      x: quantToX(chord.quant),
      beatPosition: getBeatPosition(chord.quant, quantsPerMeasure),
      yOffset: getChordYOffset(chord.quant),
    }));
  }, [chords, quantToX, quantsPerMeasure, getChordYOffset]);

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
      {editingChordId === 'new' && creatingAtQuant !== null && (
        <g transform={`translate(0, ${getChordYOffset(creatingAtQuant)})`}>
          <ChordInput
            x={quantToX(creatingAtQuant)}
            initialValue=""
            onComplete={(value) => onEditComplete(null, value)}
            onCancel={onEditCancel}
            onNavigateNext={(value) => onNavigateNext(null, value)}
            onNavigatePrevious={(value) => onNavigatePrevious(null, value)}
          />
        </g>
      )}

      {/* Preview ghost chord on hover */}
      {previewQuant !== null && editingChordId !== 'new' && (
        <g transform={`translate(0, ${getChordYOffset(previewQuant)})`}>
          <text
            className="riff-ChordSymbol riff-ChordSymbol--preview"
            data-testid="chord-preview-ghost"
            x={quantToX(previewQuant)}
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
