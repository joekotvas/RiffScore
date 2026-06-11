/**
 * Selection resolution + repair (#242 Lane G).
 *
 * resolveTarget is the single staff→measure→event→note resolver; repairSelection prunes a stale
 * selection against a new score after a structural edit, returning the SAME reference when clean.
 *
 * @see src/utils/selectionRepair.ts
 */
import { resolveTarget, repairSelection } from '@/utils/selectionRepair';
import { createDefaultScore, Score, Selection, ScoreEvent } from '@/types';

const ev = (id: string, pitch = 'C4'): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const scoreWith = (measures: ScoreEvent[][]): Score => {
  const s = createDefaultScore();
  s.staves = [{ ...s.staves[0], measures: measures.map((events, i) => ({ id: `m${i}`, events })) }];
  return s;
};

const baseSel = (over: Partial<Selection> = {}): Selection => ({
  staffIndex: 0,
  measureIndex: null,
  eventId: null,
  noteId: null,
  selectedNotes: [],
  ...over,
});

describe('resolveTarget', () => {
  const score = scoreWith([[ev('a'), ev('b')]]);

  it('resolves a valid coordinate to live objects + indices', () => {
    const r = resolveTarget(score, { staffIndex: 0, measureIndex: 0, eventId: 'a', noteId: 'an' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.eventIndex).toBe(0);
      expect(r.noteIndex).toBe(0);
      expect(r.note?.pitch).toBe('C4');
    }
  });

  it('reports each level that fails', () => {
    expect(resolveTarget(score, { staffIndex: 5, measureIndex: 0, eventId: 'a', noteId: null })).toEqual({ ok: false, reason: 'staff' });
    expect(resolveTarget(score, { staffIndex: 0, measureIndex: 9, eventId: 'a', noteId: null })).toEqual({ ok: false, reason: 'measure' });
    expect(resolveTarget(score, { staffIndex: 0, measureIndex: 0, eventId: 'zzz', noteId: null })).toEqual({ ok: false, reason: 'event' });
    expect(resolveTarget(score, { staffIndex: 0, measureIndex: 0, eventId: 'a', noteId: 'zzz' })).toEqual({ ok: false, reason: 'note' });
  });

  it('resolves an event-level coordinate (noteId null)', () => {
    const r = resolveTarget(score, { staffIndex: 0, measureIndex: 0, eventId: 'b', noteId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.note).toBeNull();
  });
});

describe('repairSelection', () => {
  it('returns the SAME reference when nothing is stale', () => {
    const score = scoreWith([[ev('a'), ev('b')]]);
    const sel = baseSel({
      measureIndex: 0,
      eventId: 'a',
      noteId: 'an',
      selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'a', noteId: 'an' }],
    });
    expect(repairSelection(sel, score)).toBe(sel);
  });

  it('clears a stale primary selection', () => {
    const score = scoreWith([[ev('b')]]); // 'a' was deleted
    const r = repairSelection(baseSel({ measureIndex: 0, eventId: 'a', noteId: 'an' }), score);
    expect(r.measureIndex).toBeNull();
    expect(r.eventId).toBeNull();
    expect(r.noteId).toBeNull();
  });

  it('prunes stale selectedNotes but keeps the ones that still resolve', () => {
    const score = scoreWith([[ev('b')]]);
    const r = repairSelection(
      baseSel({
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'a', noteId: 'an' }, // gone
          { staffIndex: 0, measureIndex: 0, eventId: 'b', noteId: 'bn' }, // ok
        ],
      }),
      score
    );
    expect(r.selectedNotes.map((n) => n.eventId)).toEqual(['b']);
  });

  it('clears a stale anchor', () => {
    const score = scoreWith([[ev('b')]]);
    const sel = baseSel({ anchor: { staffIndex: 0, measureIndex: 0, eventId: 'a', noteId: 'an' } });
    expect(repairSelection(sel, score).anchor).toBeNull();
  });

  it('drops vertical-anchor slices whose note no longer resolves', () => {
    const score = scoreWith([[ev('b')]]);
    const sel = baseSel({
      verticalAnchors: {
        direction: 'up',
        originSelection: [],
        sliceAnchors: { 0: { staffIndex: 0, measureIndex: 0, eventId: 'a', noteId: 'an' } },
      },
    });
    expect(repairSelection(sel, score).verticalAnchors).toBeNull();
  });

  it('clears a stale chordId but keeps a live one', () => {
    const score = scoreWith([[ev('a')]]);
    score.chordTrack = [{ id: 'c1', measure: 0, quant: 0, symbol: 'C' }];
    expect(repairSelection(baseSel({ chordId: 'gone' }), score).chordId).toBeNull();
    const live = baseSel({ chordId: 'c1' });
    expect(repairSelection(live, score)).toBe(live);
  });
});
