
// @ts-nocheck
import React from 'react';
import { NOTE_SPACING_BASE_UNIT, WHOLE_REST_WIDTH } from '../../constants';
import { CONFIG } from '../../config';
import { useTheme } from '../../context/ThemeContext';
import { getNoteDuration } from '../../utils/core';

interface RestProps {
  duration: string;
  dotted?: boolean;
  x?: number;
  quant?: number;
  quantWidth?: number;
  baseY?: number;
  noteX?: number; // Pre-calculated x-position if available
}

/**
 * Renders a rest symbol.
 * Handles precise positioning (accepting an override 'x' or calculating based on quant).
 * @param {Object} props
 * @param {string} props.duration - Duration of the rest
 * @param {boolean} props.dotted - Whether the rest is dotted
 * @param {number} props.x - Explicit X position override
 * @param {number} props.quant - Quant position (used if x not provided)
 * @param {number} props.quantWidth - Width per quant
 * @param {number} props.baseY - Y-offset for the staff
 */
export const Rest = ({
  duration,
  dotted = false,
  x = 0,
  quant = 0,
  quantWidth = 0,
  baseY = CONFIG.baseY
}: RestProps) => {
  const { theme } = useTheme();

  // Determine final rendering characteristics
  // Render Whole Rest (Hanging from 2nd line)
  const restY = baseY + CONFIG.lineHeight;
  const restHeight = CONFIG.lineHeight / 2;
  const restWidth = WHOLE_REST_WIDTH;

  // Calculate Center
  let finalX = 0;
  
  // Base X position (normally start of quant, but can be overridden)
  const baseX = x > 0 ? x : (quant * quantWidth) + CONFIG.measurePaddingLeft;
  
  // Check if we have a direct override.
  // When x prop is > 0, we treat it as the precise LEFT edge position.
  if (x > 0) {
       finalX = x;
  } else {
       // Default fallback logic for normal flow (if not explicitly centered by measure)
       const quants = getNoteDuration(duration, dotted, undefined);
       const noteWidth = NOTE_SPACING_BASE_UNIT * Math.sqrt(quants);
       const centerOffset = (CONFIG.measurePaddingLeft - CONFIG.measurePaddingRight) / 2;
       const centerX = baseX + (noteWidth / 2) - centerOffset;
       
       finalX = centerX - (restWidth / 2);
  }
  
  return (
      <g className="rest-placeholder">
          <rect 
              x={finalX} 
              y={restY} 
              width={restWidth} 
              height={restHeight} 
              fill={theme.score.note} 
          />
      </g>
  );
};
