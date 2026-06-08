/**
 * Tuplet structural edits (#242 Lane C) — treat a tuplet as a fixed-span container.
 *
 * Deleting a note inside a tuplet shifts the remaining content to the front and leaves a
 * RESERVED placeholder slot at the end, so the group's span (and member count) is conserved.
 * Reserved slots are pitch-less `isRest` events flagged `reserved` — they render blank, play /
 * export as rests, and are overwritten by input. Deleting the last real note removes the whole
 * group (the caller then collapses the freed measure space).
 */
import { ScoreEvent } from '@/types';
import { eventId as makeEventId } from '@/utils/id';

/** Deep-clone an event (incl. notes + tuplet) so a snapshot can't be aliased by later edits. */
export const cloneEvent = (e: ScoreEvent): ScoreEvent => ({
  ...e,
  notes: e.notes.map((n) => ({ ...n })),
  tuplet: e.tuplet ? { ...e.tuplet } : undefined,
});

/** A "real" member is a sounding note or an explicitly-entered rest — NOT a reserved slot. */
const isRealMember = (e: ScoreEvent): boolean => !e.reserved;

/**
 * The contiguous index span [start, end] of the tuplet group containing `eventIndex`. Members
 * are grouped by `tuplet.id` when present (the norm — ApplyTupletCommand always stamps one),
 * else by the contiguous run of tuplet events. Returns null if the event isn't a tuplet member.
 */
export const getTupletRun = (
  events: ScoreEvent[],
  eventIndex: number
): { start: number; end: number } | null => {
  const tuplet = events[eventIndex]?.tuplet;
  if (!tuplet) return null;

  const groupId = tuplet.id;
  if (groupId != null) {
    let start = eventIndex;
    while (start - 1 >= 0 && events[start - 1].tuplet?.id === groupId) start--;
    let end = eventIndex;
    while (end + 1 < events.length && events[end + 1].tuplet?.id === groupId) end++;
    return { start, end };
  }

  // No group id (legacy/imported data): bound the run by groupSize anchored on this member's
  // position — mirrors sumQuants / layout chunking — so two adjacent id-less groups don't merge.
  const start = Math.max(0, eventIndex - (tuplet.position ?? 0));
  let end = Math.min(events.length - 1, start + tuplet.groupSize - 1);
  for (let i = start; i <= end; i++) {
    if (!events[i].tuplet) {
      end = i - 1;
      break;
    }
  }
  return { start, end };
};

/**
 * A reserved placeholder slot carrying `template`'s duration/dotted/tuplet (so it occupies the
 * deleted member's footprint and keeps the group's span exact). `reservedId` is supplied by the
 * caller so it stays stable across undo→redo (redo re-runs execute).
 */
export const makeReservedSlot = (template: ScoreEvent, reservedId: string): ScoreEvent => ({
  id: reservedId,
  duration: template.duration,
  dotted: template.dotted,
  tuplet: template.tuplet ? { ...template.tuplet } : undefined,
  reserved: true,
  isRest: true,
  // Derive the note id from the (stable-across-redo) reservedId so execute→undo→redo is
  // byte-identical, not just the event id.
  notes: [{ id: `${reservedId}-rest`, pitch: null, isRest: true, reserved: true }],
});

export type RepackResult =
  | { removeGroup: true }
  | { removeGroup: false; members: ScoreEvent[] };

/**
 * Re-pack a tuplet group's members after deleting the one at `removedLocalIndex`:
 * - if no real (non-reserved) member remains → signal the whole group should be removed;
 * - else pack real content to the front, collect reserved slots after it, and append a fresh
 *   reserved slot for the deleted member's footprint (conserving span + member count). Positions
 *   are renumbered 0..n-1.
 */
export const repackTupletRun = (
  members: ScoreEvent[],
  removedLocalIndex: number,
  reservedId: string
): RepackResult => {
  const deleted = members[removedLocalIndex];
  const remaining = members.filter((_, i) => i !== removedLocalIndex);

  if (!remaining.some(isRealMember)) return { removeGroup: true };

  const nonReserved = remaining.filter((e) => !e.reserved);
  const reserved = remaining.filter((e) => e.reserved);
  const packed = [...nonReserved, ...reserved, makeReservedSlot(deleted, reservedId)];

  // Renumber positions so they stay contiguous 0..n-1 (bracket anchor + export gating rely on it).
  const renumbered = packed.map((e, i) =>
    e.tuplet ? { ...e, tuplet: { ...e.tuplet, position: i } } : e
  );
  return { removeGroup: false, members: renumbered };
};

/** Mint a reserved-slot id (stable across redo via the command that owns it). */
export const reservedSlotId = (): string => makeEventId();

export type InsertResult = { full: true } | { full: false; members: ScoreEvent[] };

/**
 * Insert `newMember` into a tuplet group at real-member local index `localIndex` (0..realCount),
 * consuming one reserved slot so the group's span AND member count stay constant. The inverse of
 * {@link repackTupletRun}: delete frees a slot, insert consumes one. Returns `{ full: true }`
 * (caller rejects with feedback) when the group has no reserved slot — a full tuplet's span is
 * fixed, so a 4th member can't be added to a triplet.
 *
 * `newMember` supplies identity + content (id, notes, isRest); this stamps the group's fixed rhythm
 * (baseDuration, dotted:false) and tuplet metadata onto it. Reserved slots always pack to the end,
 * so `localIndex === realCount` is the end-fill case (equivalent to filling the next free slot).
 * Positions are renumbered 0..n-1.
 */
export const insertTupletMember = (
  members: ScoreEvent[],
  localIndex: number,
  newMember: ScoreEvent
): InsertResult => {
  const reserved = members.filter((e) => e.reserved);
  if (reserved.length === 0) return { full: true };

  const reals = members.filter((e) => !e.reserved);
  const groupTuplet = members.find((e) => e.tuplet)?.tuplet;

  // Insert positions are meaningful only among real members (0..realCount); a hover index landing
  // on the trailing reserved space clamps to the end (end-fill).
  const at = Math.max(0, Math.min(localIndex, reals.length));

  const stamped: ScoreEvent = {
    ...newMember,
    duration: groupTuplet?.baseDuration ?? newMember.duration,
    dotted: false,
    tuplet: groupTuplet ? { ...groupTuplet } : newMember.tuplet,
  };

  // Place the new real member, drop ONE reserved slot (free space consumed), keep the rest.
  const packed = [...reals.slice(0, at), stamped, ...reals.slice(at), ...reserved.slice(1)];

  const renumbered = packed.map((e, i) =>
    e.tuplet ? { ...e, tuplet: { ...e.tuplet, position: i } } : e
  );
  return { full: false, members: renumbered };
};
