import type { ReactNode } from 'react';
import type { ScoreBounds } from '@/types';

/** Identities belong to the source score; unresolved/deleted anchors return null. */
export type ScoreAnchor =
  | { noteId: string }
  | { staffId: string; measureId: string; quant: number };
export interface ScoreOverlayContext {
  /** Null in scroll view; otherwise the zero-based page rendered by this callback. */
  pageIndex: number | null;
  /** Unscaled score units in scroll view, page pixels in page view. */
  bounds: ScoreBounds;
  resolveAnchor: (anchor: ScoreAnchor) => { x: number; y: number } | null;
}
/** Return SVG children (including foreignObject for HTML). The host declares required
 * scroll-view space with ui.viewport.bounds; overlays do not change document layout. */
export type RenderScoreOverlay = (context: ScoreOverlayContext) => ReactNode;
