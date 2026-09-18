import { MusicGlyph } from '@/components/Assets/MusicGlyph';
// @ts-nocheck
import React, { useState } from 'react';
import { CONFIG } from '@/config';
import { useTheme } from '@/context/ThemeContext';
import { getScoreHighlightColor } from '@/themes';
import { REST_GLYPHS, getFontSize, DOTS } from '@/constants/SMuFL';

interface RestProps {
  duration: string;
  dotted?: boolean;
  x?: number;
  quant?: number;
  baseY?: number;
  noteX?: number;
  /** Whether the rest is currently selected */
  isSelected?: boolean;
  /** Whether this is a ghost/preview rest */
  isGhost?: boolean;
  /** Click handler for selection */
  onClick?: (e: React.MouseEvent) => void;
  /** Event ID for testing */
  eventId?: string;
}

/**
 * Y-offset for each rest type, relative to baseY (top of staff).
 */
export const getRestY = (duration: string, baseY: number): number => {
  const lineHeight = CONFIG.lineHeight;
  const staffMiddle = baseY + lineHeight * 2;

  switch (duration) {
    case 'whole':
      return baseY + lineHeight;
    case 'half':
      return baseY + lineHeight * 2;
    default:
      return staffMiddle;
  }
};

/**
 * Renders a rest symbol using Bravura font glyphs.
 * Supports selection highlighting, hover effect, and click interaction.
 */
export const Rest: React.FC<RestProps> = ({
  duration,
  dotted = false,
  x = 0,
  baseY = CONFIG.baseY,
  isSelected = false,
  isGhost = false,
  onClick,
  eventId,
}) => {
  const { theme } = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  const glyph = REST_GLYPHS[duration];
  if (!glyph) {
    console.warn(`Unknown rest duration: ${duration}`);
    return null;
  }

  // Color: highlight for ghost/selected/hovered, normal otherwise
  const showHighlight = isGhost || isSelected || (isHovered && onClick);
  const color = showHighlight ? getScoreHighlightColor(theme) : theme.score.note;
  const finalX = x > 0 ? x : CONFIG.measurePaddingLeft;
  const restY = getRestY(duration, baseY);
  const fontSize = getFontSize(CONFIG.lineHeight);

  // Hit area dimensions - span full staff height for easier clicking
  const hitAreaWidth = 30; // Wide enough to cover rest glyph
  const staffHeight = CONFIG.lineHeight * 4; // 5 lines = 4 gaps
  const hitAreaTop = baseY; // Start at first staff line
  const hitAreaHeight = staffHeight;

  const renderDot = () => {
    if (!dotted) return null;
    const dotX = finalX + fontSize * 0.4;
    const dotY = restY - CONFIG.lineHeight / 2;
    return (
      <MusicGlyph
        x={dotX}
        y={dotY}
        fontSize={fontSize}
        textAnchor="start"
        fill={color}
        style={{ userSelect: 'none' }}
      >
        {DOTS.augmentationDot}
      </MusicGlyph>
    );
  };

  return (
    <g
      className="Rest rest-group"
      data-selected={isSelected}
      data-testid={eventId ? `rest-${eventId}` : undefined}
      style={{ opacity: isGhost ? 0.5 : 1 }}
    >
      {/* Invisible hit area for click detection and hover */}
      {onClick && (
        <rect
          x={finalX - hitAreaWidth / 2}
          y={hitAreaTop}
          width={hitAreaWidth}
          height={hitAreaHeight}
          fill="white"
          fillOpacity={0.01}
          style={{ cursor: 'pointer' }}
          onClick={onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        />
      )}

      {/* Rest glyph */}
      <MusicGlyph
        x={finalX}
        y={restY}
        fontSize={fontSize}
        textAnchor="middle"
        fill={color}
        style={{ userSelect: 'none', pointerEvents: 'none' }}
      >
        {glyph}
      </MusicGlyph>
      {renderDot()}
    </g>
  );
};
