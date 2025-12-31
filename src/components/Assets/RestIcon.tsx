// @ts-nocheck
import React from 'react';
import { REST_GLYPHS, BRAVURA_FONT } from '@/constants/SMuFL';

// Icon viewport size (scaled down from 24 to 20)
const ICON_SIZE = 20;

/**
 * Renders rest glyphs for toolbar display using Bravura font.
 * Each glyph is handled in its own case for easy individual tuning.
 * Scaled down by ~0.83x from original sizes.
 *
 * @param props.type - Duration type (whole, half, quarter, etc.)
 * @param props.color - Fill color for the glyph
 */
const RestIcon = ({ type, color = 'currentColor' }: { type: string; color?: string }) => {
  const commonProps = {
    fontFamily: BRAVURA_FONT,
    fill: color,
    textAnchor: 'middle' as const,
    style: { userSelect: 'none' as const },
  };

  const cx = ICON_SIZE / 2; // Center x

  const renderGlyph = () => {
    switch (type) {
      case 'whole':
        return (
          <>
            {/* Staff line visual aid (above) */}
            <line x1={5} y1={8} x2={15} y2={8} stroke={color} strokeWidth={1} />
            <text x={cx} y={8} fontSize={20} {...commonProps}>
              {REST_GLYPHS.whole}
            </text>
          </>
        );

      case 'half':
        return (
          <>
            {/* Staff line visual aid (below) */}
            <line x1={5} y1={12} x2={15} y2={12} stroke={color} strokeWidth={1} />
            <text x={cx} y={12} fontSize={20} {...commonProps}>
              {REST_GLYPHS.half}
            </text>
          </>
        );

      case 'quarter':
        return (
          <text x={cx} y={12} fontSize={20} {...commonProps}>
            {REST_GLYPHS.quarter}
          </text>
        );

      case 'eighth':
        return (
          <text x={cx} y={10} fontSize={22} {...commonProps}>
            {REST_GLYPHS.eighth}
          </text>
        );

      case 'sixteenth':
        return (
          <text x={cx} y={8} fontSize={20} {...commonProps}>
            {REST_GLYPHS.sixteenth}
          </text>
        );

      case 'thirtysecond':
        return (
          <text x={cx} y={10} fontSize={20} {...commonProps}>
            {REST_GLYPHS.thirtysecond}
          </text>
        );

      case 'sixtyfourth':
        return (
          <text x={cx} y={8} fontSize={17} {...commonProps}>
            {REST_GLYPHS.sixtyfourth}
          </text>
        );

      default:
        // Default to quarter if unknown
        return (
          <text x={cx} y={12} fontSize={20} {...commonProps}>
            {REST_GLYPHS.quarter}
          </text>
        );
    }
  };

  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
      {renderGlyph()}
    </svg>
  );
};

export default RestIcon;
