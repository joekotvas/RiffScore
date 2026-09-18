import { MusicGlyph } from '@/components/Assets/MusicGlyph';
import React from 'react';
import { PRECOMPOSED_NOTES_UP } from '@/constants/SMuFL';
import { CONFIG } from '@/config';

const ICON_SIZE = CONFIG.toolbar.iconSize;

// Custom sizing for notes that need adjustment (scaled by ~0.83)
const NOTE_SIZING: Partial<Record<string, { y: number; fontSize: number }>> = {
  whole: { y: 12, fontSize: 20 }, // Centered (no stem)
  thirtysecond: { y: 17, fontSize: 17 },
  sixtyfourth: { y: 18, fontSize: 15 },
};

const NoteIcon = ({
  type,
  color = 'currentColor',
}: {
  type: string;
  color?: string;
}): React.ReactElement => {
  const glyph =
    PRECOMPOSED_NOTES_UP[type as keyof typeof PRECOMPOSED_NOTES_UP] || PRECOMPOSED_NOTES_UP.quarter;
  const sizing = NOTE_SIZING[type] || { y: 17, fontSize: 20 };

  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`} fill="none">
      <MusicGlyph
        x={ICON_SIZE / 2}
        y={sizing.y}
        fontSize={sizing.fontSize}
        fill={color}
        textAnchor="middle"
        style={{ userSelect: 'none' }}
      >
        {glyph}
      </MusicGlyph>
    </svg>
  );
};

export default NoteIcon;
