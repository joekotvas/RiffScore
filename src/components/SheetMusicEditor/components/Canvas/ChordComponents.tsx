import React from 'react';

/**
 * Renders the stem line for a chord.
 */
export const ChordStem = ({ x, startY, endY, color }: { x: number, startY: number, endY: number, color: string }) => (
  <line x1={x} y1={startY} x2={x} y2={endY} stroke={color} strokeWidth="1.5" />
);

/**
 * Renders an accidental symbol.
 */
export const ChordAccidental = ({ x, y, symbol, color }: { x: number, y: number, symbol: string | null, color: string }) => {
  if (!symbol) return null;
  return (
    <text
      x={x}
      y={y}
      fontSize="22"
      fontFamily="serif"
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {symbol}
    </text>
  );
};

/**
 * Invisible hit area for easier clicking on notes.
 * Placed on top of other elements to capture events.
 */
export const NoteHitArea = ({ x, y, onClick, onMouseDown, cursor }: { 
    x: number, 
    y: number, 
    onClick: (e: React.MouseEvent) => void, 
    onMouseDown: (e: React.MouseEvent) => void, 
    cursor: string 
}) => (
  <rect
    x={x}
    y={y}
    width={20}
    height={16}
    fill="white"
    fillOpacity={0.01}
    style={{ cursor }}
    onClick={onClick}
    onMouseDown={onMouseDown}
  />
);
