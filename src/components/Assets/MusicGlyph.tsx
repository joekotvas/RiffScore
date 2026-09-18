import React from 'react';
import { BRAVURA_FONT } from '@/constants/SMuFL';
import {
  getDefaultGlyphMetrics,
  useMusicGlyphAdapter,
  type MusicGlyphProps,
  type MusicGlyphMetrics,
} from '@/context/MusicGlyphContext';

/** Common music-glyph seam. Text and geometry are unchanged without a ready adapter. */
export function MusicGlyph(props: MusicGlyphProps): React.ReactElement {
  const adapter = useMusicGlyphAdapter();
  const metrics =
    typeof props.children === 'string' ? [...props.children].map(getDefaultGlyphMetrics) : [];
  if (adapter && metrics.length > 0 && metrics.every(Boolean)) {
    const rendered = adapter.renderGlyph(props, metrics as MusicGlyphMetrics[]);
    if (rendered != null) return <g aria-hidden="true">{rendered}</g>;
  }
  return (
    <text aria-hidden="true" {...props} fontFamily={BRAVURA_FONT}>
      {props.children}
    </text>
  );
}
