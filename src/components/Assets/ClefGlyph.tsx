import React from 'react';
import { CONFIG } from '@/config';
import { CLEFS, BRAVURA_FONT, getFontSize } from '@/constants/SMuFL';
import { getClefReference } from '@/utils/clef';

/**
 * Get the appropriate clef glyph for rendering
 */
const getClefGlyph = (clef: string): string => {
  switch (clef) {
    case 'treble':
      return CLEFS.gClef;
    case 'bass':
      return CLEFS.fClef;
    case 'alto':
    case 'tenor':
      return CLEFS.cClef;
    default:
      return CLEFS.gClef;
  }
};

/**
 * Get the Y baseline for the clef glyph, derived from the SAME authoritative
 * clef-reference model that positions the notes (src/utils/clef.ts).
 *
 * Each Bravura clef glyph is designed so its baseline sits on the clef's
 * reference staff line (G clef curl on G4, F clef dots on F3, C clef center on
 * its line). Staff lines are drawn at baseY + i*lineHeight for i=0..4, where
 * i=0 is the TOP line (line 5) and i=4 is the BOTTOM line (line 1); so the
 * 1-indexed line N is at baseY + (5 - N) * lineHeight. Deriving from the
 * reference guarantees the glyph and the engraved notes agree (e.g. tenor C4
 * lands on line 4 for both).
 */
const getClefY = (clef: string, baseY: number): number => {
  const { referenceLine } = getClefReference(clef);
  return baseY + (5 - referenceLine) * CONFIG.lineHeight;
};

/** Staff-sized engraving glyph shared by standard headers and compact flourishes. */
export default function ClefGlyph({
  clef,
  x,
  baseY,
  fill,
  className,
}: {
  clef: string;
  x: number;
  baseY: number;
  fill: string;
  className?: string;
}) {
  return (
    <text
      className={className}
      x={x}
      y={getClefY(clef, baseY)}
      fontFamily={BRAVURA_FONT}
      fontSize={getFontSize(CONFIG.lineHeight)}
      fill={fill}
      textAnchor="start"
    >
      {getClefGlyph(clef)}
    </text>
  );
}
