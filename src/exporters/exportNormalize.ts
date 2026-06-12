/**
 * Export-time normalization (#242).
 *
 * The editor leaves a shift-left-deleted measure UNDER-FULL (its trailing space is implicit),
 * but MusicXML/ABC want a complete bar. This materializes the implicit trailing space as rests
 * FOR EXPORT ONLY — it returns a new event array and never mutates the stored model. Pickup and
 * empty (whole-rest) measures, and full/partial-tuplet bars, are left untouched.
 *
 * Reserved tuplet slots need no handling here: they're already materialized `isRest` events that
 * count toward the measure's quants and export as rests, so a tuplet bar reads as full.
 */
import { Measure, ScoreEvent } from '@/types';
import { sumQuants } from '@/utils/tuplet';
import { createRestsForRange } from '@/utils/entry/insertion';

export const padMeasureForExport = (measure: Measure, capacity: number): ScoreEvent[] => {
  const events = measure.events;
  if (measure.isPickup) return events; // genuinely short — leave as-is
  // An empty (non-pickup) bar — e.g. one the grand-staff parity padding adds after a reflow — must
  // export as a full-bar rest, not a content-free measure (which is invalid MusicXML/ABC). The
  // renderer materializes its own whole-bar rest, but exporters go through here, so do it here too.
  if (events.length === 0) return createRestsForRange(capacity);

  const { quants, partialTuplet } = sumQuants(events);
  if (partialTuplet) return events; // mid-edit / broken bar — don't fabricate rests

  const deficit = capacity - quants;
  if (deficit <= 0) return events; // full (or over) — nothing to pad

  return [...events, ...createRestsForRange(deficit)];
};
