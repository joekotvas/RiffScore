/**
 * ChordSymbol.tsx
 *
 * Renders an individual chord symbol as SVG text.
 * Handles display notation conversion and accessibility.
 *
 * @see SDD.md Section 6.2
 */
import React, { memo } from 'react';
import { ChordSymbol as ChordSymbolType, ChordDisplayConfig } from '@/types';
import { convertNotation, getAccessibleChordName } from '@/services/ChordService';

// ============================================================================
// TYPES
// ============================================================================

interface ChordSymbolProps {
  /** The chord data to display */
  chord: ChordSymbolType;

  /** Display configuration (notation style, symbols) */
  displayConfig: ChordDisplayConfig;

  /** Current key signature for notation conversion */
  keySignature: string;

  /** X coordinate for positioning */
  x: number;

  /** Beat position string for accessibility (e.g., "measure 1, beat 1") */
  beatPosition: string;

  /** Whether this chord is currently selected */
  isSelected: boolean;

  /** Whether this chord is currently hovered (via target area) */
  isHovered: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ChordSymbol = memo(function ChordSymbol({
  chord,
  displayConfig,
  keySignature,
  x,
  beatPosition,
  isSelected,
  isHovered,
}: ChordSymbolProps) {
  // Convert the canonical symbol to the display notation
  const displayText = convertNotation(
    chord.symbol,
    displayConfig.notation,
    keySignature,
    displayConfig.useSymbols
  );

  // Generate accessible name for screen readers
  const accessibleName = getAccessibleChordName(chord.symbol);
  const ariaLabel = `${accessibleName} at ${beatPosition}${isSelected ? ' (selected)' : ''}`;

  // Build class name based on state
  const className = [
    'riff-ChordSymbol',
    isSelected && 'riff-ChordSymbol--selected',
    isHovered && 'riff-ChordSymbol--hovered',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <text
      className={className}
      x={x}
      y={0}
      textAnchor="middle"
      dominantBaseline="central"
      aria-label={ariaLabel}
      data-chord-id={chord.id}
      pointerEvents="none"
    >
      {displayText}
    </text>
  );
});

export default ChordSymbol;
