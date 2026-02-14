/**
 * MeasureNumber - Renders measure number at the start of each system
 *
 * Positioned above the top staff, left-aligned with the first barline.
 * Shows the 1-based display measure number (internal indices are 0-based).
 */

import React from 'react';
import { toDisplayMeasureNumber } from '@/utils/measureIndex';

export interface MeasureNumberProps {
  /** 0-based measure index (internal) */
  measureIndex: number;
  /** X position (left edge of measure) */
  x: number;
  /** Y position (top of staff) */
  y: number;
  /** Staff scale factor (1.0 = 100%) */
  staffScale: number;
}

/**
 * Renders a measure number above the staff.
 * Converts 0-based internal index to 1-based display number.
 */
export const MeasureNumber: React.FC<MeasureNumberProps> = ({ measureIndex, x, y, staffScale }) => {
  const fontSize = 10 * staffScale;
  const displayNumber = toDisplayMeasureNumber(measureIndex);

  return (
    <text
      x={x}
      y={y - 8 * staffScale}
      fontSize={fontSize}
      className="riff-MeasureNumber"
      textAnchor="start"
    >
      {displayNumber}
    </text>
  );
};

export default MeasureNumber;
