import { MusicGlyph } from './MusicGlyph';
import React from 'react';
import { REST_GLYPHS } from '@/constants/SMuFL';
import { CONFIG } from '@/config';

const ICON_SIZE = CONFIG.toolbar.iconSize;

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
            <MusicGlyph x={cx} y={8} fontSize={20} {...commonProps}>
              {REST_GLYPHS.whole}
            </MusicGlyph>
          </>
        );

      case 'half':
        return (
          <>
            {/* Staff line visual aid (below) */}
            <line x1={5} y1={12} x2={15} y2={12} stroke={color} strokeWidth={1} />
            <MusicGlyph x={cx} y={12} fontSize={20} {...commonProps}>
              {REST_GLYPHS.half}
            </MusicGlyph>
          </>
        );

      case 'quarter':
        return (
          <MusicGlyph x={cx} y={12} fontSize={20} {...commonProps}>
            {REST_GLYPHS.quarter}
          </MusicGlyph>
        );

      case 'eighth':
        return (
          <MusicGlyph x={cx} y={10} fontSize={22} {...commonProps}>
            {REST_GLYPHS.eighth}
          </MusicGlyph>
        );

      case 'sixteenth':
        return (
          <MusicGlyph x={cx} y={8} fontSize={20} {...commonProps}>
            {REST_GLYPHS.sixteenth}
          </MusicGlyph>
        );

      case 'thirtysecond':
        return (
          <MusicGlyph x={cx} y={10} fontSize={20} {...commonProps}>
            {REST_GLYPHS.thirtysecond}
          </MusicGlyph>
        );

      case 'sixtyfourth':
        return (
          <MusicGlyph x={cx} y={8} fontSize={17} {...commonProps}>
            {REST_GLYPHS.sixtyfourth}
          </MusicGlyph>
        );

      default:
        // Default to quarter if unknown
        return (
          <MusicGlyph x={cx} y={12} fontSize={20} {...commonProps}>
            {REST_GLYPHS.quarter}
          </MusicGlyph>
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
