import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface TupletBracketProps {
  startX: number;
  endX: number;
  startY: number;         // Y position at start
  endY: number;           // Y position at end
  number: number;         // e.g., 3, 5, 7
  direction: 'up' | 'down';
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
  direction
}) => {
  const { theme } = useTheme();

  const bracketHeight = 8; // Height of bracket hooks
  const numberFontSize = 11;
  
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

  const centerX = (startX + endX) / 2;
  const centerY = (startY + endY) / 2;
  
  // Position text relative to the center of the bracket line
  const textY = direction === 'up' ? centerY - 4 : centerY + 12;

  return (
    <g className="tuplet-bracket">
      {/* Bracket line */}
      <path
        d={path}
        stroke={theme.score.note}
        strokeWidth="1"
        fill="none"
      />
      
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
