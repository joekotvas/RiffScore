import React from 'react';
import { TIE } from '@/constants';

export interface TieProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: 'up' | 'down';
  color?: string; // Optional color override
  /** Whether this tie crosses a system break */
  crossesSystemBreak?: boolean;
  /** True if this is the first part of a split tie (extends to right edge) */
  isStartOfTie?: boolean;
  /** True if this is the second part of a split tie (extends from left edge) */
  isEndOfTie?: boolean;
}

const Tie: React.FC<TieProps> = ({
  startX,
  startY,
  endX,
  endY,
  direction,
  color = 'black',
  crossesSystemBreak = false,
  isStartOfTie = false,
  isEndOfTie = false,
}) => {
  const dirMult = direction === 'up' ? -1 : 1;

  // 1. Add Gaps (Padding)
  // For split ties at system breaks, we don't add gaps at the edge
  const sX = isEndOfTie ? startX : startX + TIE.START_GAP;
  const eX = isStartOfTie ? endX : endX - TIE.END_GAP;

  // 2. Add Vertical Offset
  const sY = startY + TIE.VERTICAL_OFFSET * dirMult;
  const eY = endY + TIE.VERTICAL_OFFSET * dirMult;

  const width = eX - sX;
  if (width <= 0) return null; // Too short

  // 3. Calculate Height and Thickness
  // For split ties, use a shorter arc height
  const baseHeight = Math.min(25, Math.max(12, width * 0.2));
  const height = crossesSystemBreak ? baseHeight * 0.7 : baseHeight;
  const midThickness = TIE.MID_THICKNESS;
  const tipThickness = TIE.TIP_THICKNESS;

  // 4. Control Points
  // For split ties, position control point closer to the tied note
  let cpX: number;
  if (isStartOfTie) {
    // First part: control point closer to start (the note)
    cpX = sX + width * 0.35;
  } else if (isEndOfTie) {
    // Second part: control point closer to end (the note)
    cpX = sX + width * 0.65;
  } else {
    // Normal tie: control point in center
    cpX = sX + width / 2;
  }

  const cpY_Outer = sY + height * dirMult;
  const cpY_Inner = sY + (height - midThickness) * dirMult;

  // 5. Construct Path with Blunt Ends
  // For split ties at edges, we taper to a point instead of blunt ends
  const P1_Inner_Y = sY;
  const P1_Outer_Y = sY + tipThickness * dirMult;

  const P2_Inner_Y = eY;
  const P2_Outer_Y = eY + tipThickness * dirMult;

  let path: string;

  if (isEndOfTie) {
    // Split tie continuation: start from a point at the left edge, curve to full note
    // Taper in from edge
    path = `
      M ${sX} ${sY}
      Q ${cpX} ${cpY_Outer} ${eX} ${P2_Outer_Y}
      L ${eX} ${P2_Inner_Y}
      Q ${cpX} ${cpY_Inner} ${sX} ${sY}
      Z
    `;
  } else if (isStartOfTie) {
    // Split tie start: start from full note, taper to a point at the right edge
    path = `
      M ${sX} ${P1_Inner_Y}
      L ${sX} ${P1_Outer_Y}
      Q ${cpX} ${cpY_Outer} ${eX} ${eY}
      Q ${cpX} ${cpY_Inner} ${sX} ${P1_Inner_Y}
      Z
    `;
  } else {
    // Normal tie: blunt ends on both sides
    path = `
      M ${sX} ${P1_Inner_Y}
      L ${sX} ${P1_Outer_Y}
      Q ${cpX} ${cpY_Outer} ${eX} ${P2_Outer_Y}
      L ${eX} ${P2_Inner_Y}
      Q ${cpX} ${cpY_Inner} ${sX} ${P1_Inner_Y}
      Z
    `;
  }

  return <path d={path} fill={color} stroke="none" className="riff-Tie" />;
};

export default Tie;
