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
import { clientToSvg, xToNearestQuant } from '@/engines/layout/coordinateUtils';
import { ScoreLayout } from '@/engines/layout/types';
import { CONFIG } from '@/config';
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

  /** Layout object with getX and getY accessors */
  layout: ScoreLayout;

  /** Quants per measure (e.g., 96 for 4/4) */
  quantsPerMeasure: number;

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
  layout,
  quantsPerMeasure,
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
   * Returns a negative offset (move up) if the note at this quant is higher
   * than what the system baseline accounts for.
   *
   * Note: In most cases, system-level collision handles all notes uniformly.
   * Per-chord collision is a safety net for edge cases.
   */
  const getChordYOffset = useCallback(
    (quant: number): number => {
      const { paddingAboveNotes, minY } = CONFIG.chordTrack;

      const noteY = layout.getY.notes(quant).top;
      const systemNoteY = layout.getY.notes().top;

      // If this quant has no specific notes (fell back to system-wide), no offset needed
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
    [layout, trackY]
  );

  const handleTrackClick = useCallback(
    (e: React.MouseEvent<SVGRectElement>) => {
      e.stopPropagation();
      e.preventDefault();

      const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);
      const quant = xToNearestQuant(x, validQuants, layout.getX);

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
    },
    [validQuants, layout.getX, chords, onChordClick, onChordSelect, onEmptyClick]
  );

  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent<SVGGElement>) => {
      const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);
      const quant = xToNearestQuant(x, validQuants, layout.getX);

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
    },
    [validQuants, layout.getX, chords]
  );

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
  const trackWidth =
    measurePositions.length > 0
      ? measurePositions[measurePositions.length - 1].x +
        measurePositions[measurePositions.length - 1].width
      : 800;

  // Pre-compute chord positions to avoid recalculating on every render
  const chordPositions = useMemo(() => {
    return chords.map((chord) => ({
      chord,
      x: layout.getX(chord.quant),
      beatPosition: getBeatPosition(chord.quant, quantsPerMeasure),
      yOffset: getChordYOffset(chord.quant),
    }));
  }, [chords, layout.getX, quantsPerMeasure, getChordYOffset]);

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
            x={layout.getX(creatingAtQuant)}
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
            x={layout.getX(previewQuant)}
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
