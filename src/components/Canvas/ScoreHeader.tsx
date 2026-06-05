import React from 'react';
import { KEY_SIGNATURES, KEY_SIGNATURE_OFFSETS, KeySignatureOffsets } from '@/constants';
import { CONFIG } from '@/config';
import { useTheme } from '@/context/ThemeContext';
import { calculateSystemPreamble } from '@/engines/layout';
import { ACCIDENTALS, CLEFS, TIME_SIG_DIGITS, BRAVURA_FONT, getFontSize } from '@/constants/SMuFL';
import { getClefReference } from '@/utils/clef';

interface ScoreHeaderProps {
  clef: string;
  keySignature: string;
  timeSignature: string;
  baseY?: number; // Y position for this staff
  /** Whether to show the time signature. Default: true. Set to false on non-first systems. */
  showTimeSignature?: boolean;
  onClefClick: (e: React.MouseEvent) => void;
  onKeySigClick: (e: React.MouseEvent) => void;
  onTimeSigClick: (e: React.MouseEvent) => void;
}

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

const ScoreHeader: React.FC<ScoreHeaderProps> = ({
  clef,
  keySignature,
  timeSignature,
  baseY = CONFIG.baseY,
  showTimeSignature = true,
  onClefClick,
  onKeySigClick,
  onTimeSigClick,
}) => {
  const { theme } = useTheme();

  // Use centralized preamble layout calculation (SSOT)
  // showTimeSignature indicates first system (wider preamble)
  const preamble = calculateSystemPreamble(keySignature, { isFirstSystem: showTimeSignature });
  const { keySigStartX, keySigVisualWidth, timeSigStartX, measuresX } = preamble;
  const { keySigAccidentalWidth, timeSigWidth, clefWidth } = CONFIG.preamble;

  // Map a time-signature part to its SMuFL glyphs PER DIGIT, so multi-digit numerators
  // like the "12" of 12/8 render (a whole-string lookup would miss "12" entirely).
  const timeSigGlyphs = (part: string): string =>
    [...part].map((d) => TIME_SIG_DIGITS[d as unknown as keyof typeof TIME_SIG_DIGITS] ?? '').join('');

  return (
    <g className="ScoreHeader">
      {/* Staff Lines for Preamble Area - Extended to start of measures */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line
          key={`staff-head-${i}`}
          x1={0}
          y1={baseY + i * CONFIG.lineHeight}
          x2={measuresX}
          y2={baseY + i * CONFIG.lineHeight}
          stroke={theme.score.line}
          strokeWidth="1"
        />
      ))}
      <line
        x1={0}
        y1={baseY}
        x2={0}
        y2={baseY + CONFIG.lineHeight * 4}
        stroke={theme.secondaryText}
        strokeWidth="1"
      />

      {/* Clef - clickable */}
      <g onClick={onClefClick} style={{ cursor: 'pointer' }} data-testid={`clef-${clef}`}>
        <rect x="-5" y={baseY - 25} width={clefWidth} height="100" fill="transparent" />
        <text
          x={12}
          y={getClefY(clef, baseY)}
          fontFamily={BRAVURA_FONT}
          fontSize={getFontSize(CONFIG.lineHeight)}
          fill={theme.score.fill}
          textAnchor="start"
        >
          {getClefGlyph(clef)}
        </text>
      </g>

      {/* Key Signature */}
      <g
        onClick={onKeySigClick}
        style={{ cursor: 'pointer', userSelect: 'none' }}
        data-testid={`keysig-${keySignature}`}
      >
        <rect
          x={keySigStartX}
          y={baseY - 20}
          width={Math.max(20, keySigVisualWidth)}
          height="80"
          fill="transparent"
        />
        {KEY_SIGNATURES[keySignature]?.accidentals.map((acc, i) => {
          const type = KEY_SIGNATURES[keySignature].type;
          // Cast clef to ensure it matches KeySignatureOffsets keys
          const validClef =
            clef in KEY_SIGNATURE_OFFSETS ? (clef as keyof KeySignatureOffsets) : 'treble';
          const offset = KEY_SIGNATURE_OFFSETS[validClef][type][acc];
          const x = keySigStartX + 5 + i * keySigAccidentalWidth;
          const y = baseY + offset;

          return (
            <text
              key={i}
              x={x}
              y={y}
              fontSize={getFontSize(CONFIG.lineHeight)}
              fontFamily={BRAVURA_FONT}
              fill={theme.score.fill}
            >
              {type === 'sharp' ? ACCIDENTALS.sharp : ACCIDENTALS.flat}
            </text>
          );
        })}
      </g>

      {/* Time Signature - only shown on first system */}
      {showTimeSignature && (
        <g onClick={onTimeSigClick} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <rect x={timeSigStartX} y={baseY} width={timeSigWidth} height="48" fill="transparent" />
          <text
            x={timeSigStartX + 15}
            y={baseY + CONFIG.lineHeight}
            fontSize={getFontSize(CONFIG.lineHeight)}
            fontFamily={BRAVURA_FONT}
            textAnchor="middle"
            fill={theme.text}
          >
            {timeSigGlyphs(timeSignature.split('/')[0])}
          </text>
          <text
            x={timeSigStartX + 15}
            y={baseY + CONFIG.lineHeight * 3}
            fontSize={getFontSize(CONFIG.lineHeight)}
            fontFamily={BRAVURA_FONT}
            textAnchor="middle"
            fill={theme.text}
          >
            {timeSigGlyphs(timeSignature.split('/')[1])}
          </text>
        </g>
      )}
    </g>
  );
};

export default ScoreHeader;
