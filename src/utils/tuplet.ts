/**
 * Tuplet quant integrality — the #237 guard scope, a foundation for #242.
 *
 * On the current `sixtyfourth = 1` grid a tuplet MEMBER is generally non-integer: an eighth
 * in a 3:2 triplet is `8 × 2/3 = 5.333…` quants. Summing members with `+` then drifts under
 * IEEE-754 — a complete eighth septuplet (7:4) reduce-sums to `31.999999999999993`, not 32 —
 * which silently breaks any `sum === capacity` invariant or exact-quant map key (#242 capacity
 * validation, delete backfill, chordTrack re-anchoring).
 *
 * But a complete tuplet GROUP is always integral: its span is `inSpaceOf × baseDuration`
 * quants (16 for a triplet of eighths), independent of how the members are spelled. These
 * helpers account groups ATOMICALLY by that span so downstream quant math stays exact, and
 * reject ratios that could not tile an integer number of quants. The full ×LCM grid migration
 * (which would make members integers too) stays deferred — see #237.
 */
import { NOTE_TYPES } from '@/constants';
import { ScoreEvent } from '@/types';
import { getNoteDuration } from '@/utils/core';

/** Tolerance for comparing a drift-prone member sum against an integer quant target. */
export const QUANT_EPSILON = 1e-6;

/** Exact integer quant span of one COMPLETE tuplet group = `inSpaceOf × baseDuration` quants. */
export const tupletGroupSpan = (baseDuration: string, ratio: [number, number]): number =>
  (NOTE_TYPES[baseDuration]?.duration ?? 0) * ratio[1];

/**
 * A tuplet ratio `[actual, inSpaceOf]` over `baseDuration` is valid when it tiles a positive
 * integer number of quants: both halves are integers (`actual ≥ 2`, `inSpaceOf ≥ 1`) and the
 * base resolves to a real duration. Guards API/command callers from minting zero-length or
 * non-tiling tuplets (e.g. `inSpaceOf = 0`, a `1:1` "tuplet", or an unknown base duration).
 */
export const isValidTupletRatio = (baseDuration: string, ratio: [number, number]): boolean => {
  const [actual, inSpaceOf] = ratio;
  if (!Number.isInteger(actual) || !Number.isInteger(inSpaceOf)) return false;
  if (actual < 2 || inSpaceOf < 1) return false;
  const span = tupletGroupSpan(baseDuration, ratio);
  return span > 0 && Number.isInteger(span);
};

/** True when two quant counts are equal within `QUANT_EPSILON` (member sums drift under FP). */
export const quantsEqual = (a: number, b: number): boolean => Math.abs(a - b) <= QUANT_EPSILON;

/**
 * Total quant length of an event list, accounting each COMPLETE tuplet group by its exact
 * integer span instead of summing fractional members (which drifts). Consecutive events that
 * share a `tuplet.id` form a group.
 *
 * Returns the total and whether an incomplete tuplet is present — fewer members than
 * `groupSize`, or a tuplet event with no group id. A partial tuplet means the measure is
 * mid-edit and not safely tileable, so capacity/validation should treat it as not-yet-valid
 * rather than trust the (fractional) running sum.
 */
export const sumQuants = (events: ScoreEvent[]): { quants: number; partialTuplet: boolean } => {
  let quants = 0;
  let partialTuplet = false;
  let i = 0;
  while (i < events.length) {
    const tuplet = events[i].tuplet;
    if (!tuplet) {
      quants += getNoteDuration(events[i].duration, events[i].dotted);
      i += 1;
      continue;
    }
    // Gather this tuplet group's members: consecutive tuplet events sharing the group id (when
    // present), bounded by `groupSize`. Tuplets built outside ApplyTupletCommand may omit the
    // id, so fall back to chunking the contiguous tuplet run by groupSize.
    const groupId = tuplet.id;
    let take = 0;
    while (
      i + take < events.length &&
      take < tuplet.groupSize &&
      events[i + take].tuplet != null &&
      (groupId == null || events[i + take].tuplet!.id === groupId)
    ) {
      take += 1;
    }
    if (take === tuplet.groupSize) {
      quants += tupletGroupSpan(tuplet.baseDuration ?? events[i].duration, tuplet.ratio);
    } else {
      // Incomplete group (mid-edit): sum the present members (fractional) and flag.
      for (let k = i; k < i + take; k++) {
        quants += getNoteDuration(events[k].duration, events[k].dotted, events[k].tuplet);
      }
      partialTuplet = true;
    }
    i += take;
  }
  return { quants, partialTuplet };
};

