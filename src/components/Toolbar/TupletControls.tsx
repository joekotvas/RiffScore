/**
 * TupletControls
 *
 * Toolbar tools for applying and removing tuplet groupings (triplets, quintuplets).
 */
import React from 'react';
import ToolbarButton from './ToolbarButton';
import { TUPLETS, BRAVURA_FONT } from '@/constants/SMuFL';
import { CONFIG } from '@/config';

import './styles/TupletControls.css';

const ICON_SIZE = CONFIG.toolbar.iconSize;

/**
 * SMuFL-based tuplet number icon with noteheads representing the group
 */
const TupletIcon: React.FC<{ digit: 3 | 5 }> = ({ digit }) => {
  const glyph = digit === 3 ? TUPLETS.tuplet3 : TUPLETS.tuplet5;
  const dotCount = digit;
  const dotSpacing = digit === 3 ? 5 : 3.5;
  const startX = digit === 3 ? 5 : 3;

  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
      {/* Tuplet number */}
      <text
        x={ICON_SIZE / 2}
        y={11}
        fontFamily={BRAVURA_FONT}
        fontSize={20}
        fill="currentColor"
        textAnchor="middle"
        style={{ userSelect: 'none' }}
      >
        {glyph}
      </text>
      {/* Noteheads as dots */}
      {Array.from({ length: dotCount }).map((_, i) => (
        <circle key={i} cx={startX + i * dotSpacing} cy={17} r={1.5} fill="currentColor" />
      ))}
    </svg>
  );
};

interface TupletControlsProps {
  onApplyTuplet: (ratio: [number, number], groupSize: number) => void;
  onRemoveTuplet: () => void;
  canApplyTriplet: boolean;
  canApplyQuintuplet: boolean;
  activeTupletRatio: [number, number] | null;
  variant?: 'default' | 'ghost';
}

/**
 * Tuplet controls for the toolbar.
 * Allows users to apply common tuplets (triplet, quintuplet) to selected notes.
 */
const TupletControls: React.FC<TupletControlsProps> = ({
  onApplyTuplet,
  onRemoveTuplet,
  canApplyTriplet,
  canApplyQuintuplet,
  activeTupletRatio,
  variant = 'default',
}) => {
  const isTripletActive = activeTupletRatio?.[0] === 3 && activeTupletRatio?.[1] === 2;
  const isQuintupletActive = activeTupletRatio?.[0] === 5 && activeTupletRatio?.[1] === 4;

  const handleTriplet = () => {
    if (isTripletActive) {
      onRemoveTuplet();
    } else {
      onApplyTuplet([3, 2], 3);
    }
  };

  const handleQuintuplet = () => {
    if (isQuintupletActive) {
      onRemoveTuplet();
    } else {
      onApplyTuplet([5, 4], 5);
    }
  };

  return (
    <div className="riff-ControlGroup">
      {/* Triplet Button */}
      <ToolbarButton
        onClick={handleTriplet}
        label="Triplet (3)"
        isActive={isTripletActive}
        disabled={!canApplyTriplet && !isTripletActive}
        preventFocus={true}
        icon={<TupletIcon digit={3} />}
        variant={variant}
      />

      {/* Quintuplet Button */}
      <ToolbarButton
        onClick={handleQuintuplet}
        label="Quintuplet (5)"
        isActive={isQuintupletActive}
        disabled={!canApplyQuintuplet && !isQuintupletActive}
        preventFocus={true}
        icon={<TupletIcon digit={5} />}
        variant={variant}
      />
    </div>
  );
};

export default TupletControls;
