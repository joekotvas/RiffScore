/**
 * Tuplet quant integrality — the #237 guard scope, a foundation for #242.
 *
 * On the current `sixtyfourth = 1` grid a tuplet MEMBER is generally non-integer: an eighth
 * in a 3:2 triplet is `8 × 2/3 = 5.333…` quants. Summing members with `+` then drifts under
 * IEEE-754 — a complete eighth septuplet (7:4) reduce-sums to `31.999999999999993`, not 32 —
 * which silently breaks any `sum === capacity` invariant or exact-quant map key (#242 capacity
 * validation, delete backfill, chordTrack re-anchoring).
 *
 * A complete tuplet GROUP of UNIFORM members spans an exact integer (`inSpaceOf × baseDuration`
 * = 16 for a triplet of eighths). These helpers account a complete group by its members'
 * footprint, rounding away the IEEE-754 drift so the result is exact — which also stays correct
 * when members are dotted or mixed (where the footprint differs from the nominal span). A group
 * whose footprint isn't an integer (an incoherent tuplet) is flagged, not silently trusted. The
 * full ×LCM grid migration (which would make members integers too) stays deferred — see #237.
 */
import { NOTE_TYPES } from '@/constants';
import { ScoreEvent } from '@/types';
import { getNoteDuration } from '@/utils/core';

/** Tolerance for comparing a drift-prone member sum against an integer quant target. */
export const QUANT_EPSILON = 1e-6;

/** Notated quant span of a COMPLETE group of UNIFORM `baseDuration` members = `inSpaceOf ×
 *  baseDuration`. Used for ratio validation; the actual footprint (which differs when members
 *  are dotted/mixed) is computed from the members in {@link sumQuants}. */
export const tupletGroupSpan = (baseDuration: string, ratio: [number, number]): number =>
  (NOTE_TYPES[baseDuration]?.duration ?? 0) * ratio[1];

/**
 * A tuplet ratio `[actual, inSpaceOf]` over `baseDuration` is valid when it tiles a positive
 * integer number of quants: both halves are integers, `actual ≥ 2`, `inSpaceOf ≥ 1`, the two
 * differ (an `n:n` ratio is a no-op), and the base resolves to a real duration. Guards
 * API/command callers from minting zero-length, identity, or non-tiling tuplets.
 */
export const isValidTupletRatio = (baseDuration: string, ratio: [number, number]): boolean => {
  const [actual, inSpaceOf] = ratio;
  if (!Number.isInteger(actual) || !Number.isInteger(inSpaceOf)) return false;
  if (actual < 2 || inSpaceOf < 1 || actual === inSpaceOf) return false;
  const span = tupletGroupSpan(baseDuration, ratio);
  return span > 0 && Number.isInteger(span);
};

/** True when two quant counts are equal within `QUANT_EPSILON` (member sums drift under FP). */
export const quantsEqual = (a: number, b: number): boolean => Math.abs(a - b) <= QUANT_EPSILON;

/**
 * Total quant length of an event list. A COMPLETE tuplet group is accounted by its members'
 * footprint rounded to the nearest integer (eliminating IEEE-754 drift; correct for uniform
 * and for dotted/mixed members alike). Consecutive events sharing a `tuplet.id` form a group;
 * groups built without an id fall back to chunking the contiguous tuplet run by `groupSize`.
 *
 * Returns the total and whether a not-safely-tileable tuplet is present: an INCOMPLETE group
 * (fewer members than `groupSize`, or a corrupt `groupSize`) or an INCOHERENT one (a complete
 * group whose footprint isn't an integer). Capacity/validation should treat such a measure as
 * not-yet-valid rather than trust the (fractional) running sum.
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
    // Gather this group's members: consecutive tuplet events sharing the group id (when
    // present), bounded by `groupSize`. Tuplets built outside ApplyTupletCommand may omit the
    // id, so fall back to chunking the contiguous tuplet run by groupSize.
    const groupId = tuplet.id;
    let take = 0;
    while (
      tuplet.groupSize >= 1 &&
      i + take < events.length &&
      take < tuplet.groupSize &&
      events[i + take].tuplet != null &&
      (groupId == null || events[i + take].tuplet!.id === groupId)
    ) {
      take += 1;
    }
    // Always advance ≥ 1 so a corrupt groupSize (≤ 0, → take 0) can't stall the loop.
    const memberCount = Math.max(take, 1);
    let footprint = 0;
    for (let k = i; k < i + memberCount; k++) {
      footprint += getNoteDuration(events[k].duration, events[k].dotted, events[k].tuplet);
    }
    const rounded = Math.round(footprint);
    if (take === tuplet.groupSize && tuplet.groupSize >= 1 && quantsEqual(footprint, rounded)) {
      // Complete group with an integer footprint — exact for uniform AND dotted/mixed members.
      quants += rounded;
    } else {
      // Incomplete (mid-edit) or incoherent (non-integer footprint) group: not safely tileable.
      quants += footprint;
      partialTuplet = true;
    }
    i += memberCount;
  }
  return { quants, partialTuplet };
};

