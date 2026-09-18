import type { Score } from '@/types';
import { getMeasureCapacity } from '@/constants';
import { getNoteDuration } from '@/utils/core';

/** Finite timeline grid, separate from the unlimited entry capacity of meter-free music. */
export interface MeasureTiming {
  spans: number[];
  starts: number[];
  total: number;
}

/** Unmetered bars last as long as their longest staff; explicit barlines still synchronize staves. */
export const getMeasureTiming = (score: Score, includePickups = false): MeasureTiming => {
  const capacity = getMeasureCapacity(score.timeSignature);
  const count = Math.max(0, ...score.staves.map((staff) => staff.measures.length));
  const spans: number[] = [];
  const starts: number[] = [];
  let total = 0;
  for (let index = 0; index < count; index++) {
    starts.push(total);
    const pickup = includePickups && score.staves[0]?.measures[index]?.isPickup;
    const span =
      Number.isFinite(capacity) && !pickup
        ? capacity
        : Math.max(
            0,
            ...score.staves.map((staff) =>
              (staff.measures[index]?.events ?? []).reduce(
                (sum, event) => sum + getNoteDuration(event.duration, event.dotted, event.tuplet),
                0
              )
            )
          );
    spans.push(span);
    total += span;
  }
  return { spans, starts, total };
};

/** Resolve the requested musical position, including rests and chord-only passages.
 * Shared by UI and API playback so neither silently seeks ahead to the next melody note. */
export const getPlaybackOffset = (
  score: Score,
  bpm: number,
  measureIndex = 0,
  quant = 0
): number => {
  const timing = getMeasureTiming(score, true);
  const index = Number.isFinite(measureIndex) ? Math.max(0, Math.floor(measureIndex)) : 0;
  const local = Number.isFinite(quant) ? Math.max(0, quant) : 0;
  const position = Math.min(timing.total, (timing.starts[index] ?? timing.total) + local);
  return position * (60 / (Number.isFinite(bpm) && bpm > 0 ? bpm : 120) / 16);
};
