import type { Score } from '@/types';
import { getNoteDuration } from '@/utils/core';

/** Detached musical facts. Resolvers must be pure and may run during server rendering. */
export interface AnnotationEventContext {
  readonly staffId: string;
  readonly staffIndex: number;
  readonly measureId: string;
  readonly measureIndex: number;
  readonly eventId: string;
  readonly quant: number;
  readonly duration: string;
  readonly dotted: boolean;
  readonly isRest: boolean;
  readonly keySignature: string;
  readonly timeSignature: string;
  readonly notes: readonly Readonly<{ id: string; pitch: string | null; tied: boolean }>[];
}
export interface AnnotationNoteContext extends AnnotationEventContext {
  readonly note: AnnotationEventContext['notes'][number];
}
export interface NoteheadAnnotation {
  /** Short text inside the existing head; full text remains available to assistive technology. */
  readonly label?: string;
}
export interface ScoreAnnotationRow {
  readonly id: string;
  /** Human-readable row name for assistive technology. */
  readonly label: string;
  /** All staves by default; IDs remain stable when staves are reordered. */
  readonly staffIds?: readonly string[];
  /** Array values stack vertically, e.g. the individual notes of a chord. Null leaves a blank. */
  readonly text: (event: AnnotationEventContext) => string | readonly string[] | null;
}
export interface ScoreAnnotations {
  readonly notehead?: (note: AnnotationNoteContext) => NoteheadAnnotation | null;
  /** Rendered in this order below each staff, after reserved lyric lines. */
  readonly rows?: readonly ScoreAnnotationRow[];
}
export interface PreparedAnnotationRow {
  readonly id: string;
  readonly label: string;
  readonly staffIndex: number;
  readonly line: number;
  readonly entries: readonly {
    measureIndex: number;
    eventId: string;
    quant: number;
    text: readonly string[];
  }[];
}
export interface PreparedAnnotations {
  score: Score;
  noteheads: ReadonlyMap<string, NoteheadAnnotation>;
  eventWidths: ReadonlyMap<string, number>;
  rows: readonly PreparedAnnotationRow[];
}
/** Matches the fixed-width renderer; generous enough for accidentals and fallback fonts. */
export const annotationTextWidth = (text: string): number => Array.from(text).length * 8;

/** Prepare one immutable view without writing labels or spacing into the canonical document. */
export function prepareAnnotations(
  score: Score,
  annotations?: ScoreAnnotations
): PreparedAnnotations {
  const noteheads = new Map<string, NoteheadAnnotation>();
  const eventWidths = new Map<string, number>();
  const rows: PreparedAnnotationRow[] = [];
  if (!annotations) return { score, noteheads, eventWidths, rows };
  const ids = new Set<string>();
  for (const row of annotations.rows ?? []) {
    if (!row.id || ids.has(row.id))
      throw new Error('Score annotation row IDs must be nonempty and unique');
    ids.add(row.id);
  }
  const staves = score.staves.map((staff, staffIndex) => {
    const events: AnnotationEventContext[] = [];
    staff.measures.forEach((measure, measureIndex) => {
      let quant = 0;
      measure.events.forEach((event) => {
        const context: AnnotationEventContext = Object.freeze({
          staffId: staff.id,
          staffIndex,
          measureId: measure.id,
          measureIndex,
          eventId: event.id,
          quant,
          duration: event.duration,
          dotted: !!event.dotted,
          isRest: !!event.isRest,
          keySignature: score.keySignature || staff.keySignature || 'C',
          timeSignature: score.timeSignature || '4/4',
          notes: Object.freeze(
            event.notes.map((note) =>
              Object.freeze({ id: note.id, pitch: note.pitch, tied: !!note.tied })
            )
          ),
        });
        events.push(context);
        if (!event.isRest && annotations.notehead)
          for (const note of context.notes) {
            const result = annotations.notehead(Object.freeze({ ...context, note }));
            if (result?.label) noteheads.set(note.id, Object.freeze({ label: result.label }));
          }
        quant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      });
    });
    let line = staff.lyricLines ?? 0;
    for (const row of annotations.rows ?? []) {
      if (row.staffIds && !row.staffIds.includes(staff.id)) continue;
      let height = 1;
      const entries = events.map((event) => {
        const value = row.text(event);
        const text = typeof value === 'string' ? [value] : [...(value ?? [])];
        height = Math.max(height, text.length);
        const width = Math.max(0, ...text.map(annotationTextWidth));
        if (width)
          eventWidths.set(event.eventId, Math.max(eventWidths.get(event.eventId) ?? 0, width));
        return {
          measureIndex: event.measureIndex,
          eventId: event.eventId,
          quant: event.quant,
          text,
        };
      });
      rows.push({ id: row.id, label: row.label, staffIndex, line, entries });
      line += height;
    }
    return line === (staff.lyricLines ?? 0) ? staff : { ...staff, lyricLines: line };
  });
  return { score: { ...score, staves }, noteheads, eventWidths, rows };
}
