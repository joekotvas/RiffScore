import React, { createContext, useContext, useEffect, useState } from 'react';
import metrics from '@/fonts/bravuraMetrics.json';

export type MusicGlyphProps = Omit<React.SVGProps<SVGTextElement>, 'children'> & {
  children: React.ReactNode;
};
/** SMuFL staff-space metrics: four spaces per em, bounds [left, bottom, right, top], Y up. */
export interface MusicGlyphMetrics {
  advance: number;
  bounds: readonly number[];
  anchors?: Readonly<Record<string, readonly number[]>>;
}
export function getDefaultGlyphMetrics(glyph: string): MusicGlyphMetrics | undefined {
  return (metrics as Record<string, MusicGlyphMetrics>)[glyph];
}

/** An adapter must preserve Bravura's layout envelope, baseline and advance. Core does
 * not fit arbitrary fonts. Return null for unsupported runs to use the default renderer. */
export interface MusicGlyphAdapter {
  id: string;
  load?: () => Promise<boolean>;
  renderGlyph: (props: MusicGlyphProps, metrics: readonly MusicGlyphMetrics[]) => React.ReactNode;
}
const GlyphContext = createContext<MusicGlyphAdapter | null>(null);
export const useMusicGlyphAdapter = (): MusicGlyphAdapter | null => useContext(GlyphContext);

/** Fallback is deterministic during SSR, loading, failure and adapter replacement. */
export function MusicGlyphProvider({
  adapter,
  children,
}: {
  adapter?: MusicGlyphAdapter;
  children: React.ReactNode;
}): React.ReactElement {
  const [loaded, setLoaded] = useState<MusicGlyphAdapter | null>(null);
  useEffect(() => {
    let active = true;
    if (adapter) {
      Promise.resolve()
        .then(() => adapter.load?.() ?? true)
        .then((ready) => {
          if (active) setLoaded(ready ? adapter : null);
        })
        .catch(() => {
          if (active) setLoaded(null);
        });
    }
    return () => {
      active = false;
    };
  }, [adapter]);
  return (
    <GlyphContext.Provider value={loaded === adapter ? loaded : null}>
      {children}
    </GlyphContext.Provider>
  );
}
