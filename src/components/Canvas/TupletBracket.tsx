import React from 'react';
import { useTheme } from '@/context/ThemeContext';
import { TUPLET } from '@/constants';

interface TupletBracketProps {
  startX: number;
  endX: number;
  startY: number; // Y position at start
  endY: number; // Y position at end
  number: number; // e.g., 3, 5, 7
  direction: 'up' | 'down';
  beamCenter?: { x: number; y: number };
  hideBracketWhenBeamed?: boolean;
}

/**
 * Renders a tuplet bracket with number above or below a group of notes.
 * Shows visual grouping for triplets, quintuplets, etc.
 * Supports slanted brackets to follow musical contour.
 */
const TupletBracket: React.FC<TupletBracketProps> = ({
  startX,
  endX,
  startY,
  endY,
  number,
  direction,
  beamCenter,
  hideBracketWhenBeamed = false,
}) => {
  const { theme } = useTheme();

  const bracketHeight = TUPLET.HOOK_HEIGHT;
  const numberFontSize = TUPLET.NUMBER_FONT_SIZE;

  // Draw bracket as a path
  //  Up:    |---|
  //           3
  //  Down:    3
  //         |---|

  const hookLength = direction === 'up' ? bracketHeight : -bracketHeight;

  // Calculate path with slope
  const path = `
    M ${startX} ${startY + hookLength}
    L ${startX} ${startY}
    L ${endX} ${endY}
    L ${endX} ${endY + hookLength}
  `;

  const numberOnly = hideBracketWhenBeamed && beamCenter !== undefined;
  const centerX = numberOnly ? beamCenter.x : (startX + endX) / 2;
  const centerY = numberOnly
    ? beamCenter.y + (direction === 'up' ? -TUPLET.NUMBER_BEAM_PADDING : TUPLET.NUMBER_BEAM_PADDING)
    : (startY + endY) / 2;

  // Position text relative to the center of the bracket line
  const textY =
    direction === 'up' ? centerY + TUPLET.NUMBER_OFFSET_UP : centerY + TUPLET.NUMBER_OFFSET_DOWN;

  return (
    <g className="tuplet-bracket">
      {/* Bracket line */}
      {!numberOnly && <path d={path} stroke={theme.score.note} strokeWidth="1" fill="none" />}

      {/* Number label */}
      <text
        x={centerX}
        y={textY}
        textAnchor="middle"
        fontSize={numberFontSize}
        fontWeight="bold"
        fontStyle="italic"
        fill={theme.score.note}
      >
        {number}
      </text>
    </g>
  );
};

export default TupletBracket;
