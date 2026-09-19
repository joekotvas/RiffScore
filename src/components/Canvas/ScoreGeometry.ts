import type { ScoreBounds } from '@/types';

export interface ScoreStaffGeometry {
  readonly id: string;
  readonly index: number;
  readonly clef: string;
  readonly top: number;
  readonly bottom: number;
  /** Staff endpoints, including the preamble when it is visible. */
  readonly left: number;
  readonly right: number;
  /** First visible event position, null when this staff window is empty. */
  readonly firstEventX: number | null;
}

/** Detached, frozen scroll-view geometry in unscaled score units. Never an engine handle. */
export interface ScoreViewGeometry {
  readonly contentBounds: Readonly<Required<ScoreBounds>>;
  readonly defaultBounds: Readonly<Required<ScoreBounds>>;
  readonly staffSpace: number;
  readonly staves: readonly ScoreStaffGeometry[];
}

/** Pure render-time policy. Must not update state or alter the score. Page view ignores it.
 * Explicit ui.viewport.bounds wins over returned bounds. Invalid values use core defaults. */
export type ResolveScoreViewport = (geometry: ScoreViewGeometry) =>
  | {
      bounds?: ScoreBounds;
      scale?: number;
      /** Opt into following selection, keyboard entry and playback in a scrollable frame. */
      autoScroll?: boolean;
    }
  | undefined;

export function normalizeScoreBounds(bounds?: ScoreBounds): Required<ScoreBounds> | undefined {
  return bounds &&
    [bounds.x ?? 0, bounds.y ?? 0, bounds.width, bounds.height].every(Number.isFinite) &&
    bounds.width > 0 &&
    bounds.height > 0
    ? { ...bounds, x: bounds.x ?? 0, y: bounds.y ?? 0 }
    : undefined;
}
