import type { InteractionPolicy, PreviewNote, Score, ScoreEvent } from '@/types';

const eventsById = (score: Score): Map<string, ScoreEvent> =>
  new Map(
    score.staves.flatMap((staff) =>
      staff.measures.flatMap((measure) => measure.events.map((event) => [event.id, event] as const))
    )
  );
const hasNotes = (event: ScoreEvent): boolean =>
  !event.isRest && !event.reserved && event.notes.some((note) => note.pitch !== null);
const sameRhythm = (first: ScoreEvent, second: ScoreEvent): boolean =>
  first.duration === second.duration &&
  !!first.dotted === !!second.dotted &&
  first.tuplet?.ratio[0] === second.tuplet?.ratio[0] &&
  first.tuplet?.ratio[1] === second.tuplet?.ratio[1] &&
  first.tuplet?.groupSize === second.tuplet?.groupSize &&
  first.tuplet?.position === second.tuplet?.position;

/** Compare musical entities, independent of command names or input devices. */
export function allowsInteraction(before: Score, after: Score, policy: InteractionPolicy): boolean {
  const previous = eventsById(before);
  const next = eventsById(after);
  if (policy.allowEventInsertion === false) {
    if (
      after.staves.some(
        (staff, index) => staff.measures.length > (before.staves[index]?.measures.length ?? 0)
      )
    )
      return false;
    for (const [id, event] of next) {
      if (!previous.has(id) || (previous.get(id)?.reserved && !event.reserved)) return false;
    }
  }
  if (policy.allowEventDeletion === false) {
    if (
      before.staves.some(
        (staff, index) => staff.measures.length > (after.staves[index]?.measures.length ?? 0)
      )
    )
      return false;
    for (const [id, event] of previous) {
      const remaining = next.get(id);
      if (!remaining || (hasNotes(event) && !hasNotes(remaining))) return false;
    }
  }
  if (policy.allowDurationChanges === false) {
    if (before.timeSignature !== after.timeSignature) return false;
    for (const [id, event] of previous) {
      const remaining = next.get(id);
      if (remaining && !sameRhythm(event, remaining)) return false;
    }
  }
  return true;
}

/** An existing pitched event can accept another chord tone; a gap/rest/slot cannot. */
export function allowsPreview(
  score: Score,
  preview: PreviewNote | null,
  policy: InteractionPolicy
): boolean {
  if (!preview || policy.allowEventInsertion !== false) return true;
  if (preview.mode !== 'CHORD' || preview.isRest || preview.blocked) return false;
  const events = score.staves[preview.staffIndex ?? 0]?.measures[preview.measureIndex]?.events;
  const event = preview.eventId
    ? events?.find((event) => event.id === preview.eventId)
    : events?.[preview.index];
  return !!event && hasNotes(event);
}
