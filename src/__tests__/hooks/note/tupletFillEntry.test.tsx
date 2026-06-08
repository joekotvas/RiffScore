/**
 * Regression (user bug): interactive note entry onto a tuplet member fills/replaces it instead of
 * destructively overwriting or chord-stacking onto blank reserved space.
 *
 * The real UI is preview-driven: hovering an EVENT hit zone yields a CHORD-mode preview (no stem —
 * "only the notehead"), and a reserved slot IS an EVENT hit zone. Committing that CHORD preview used
 * to chord-stack a hidden note onto the still-`reserved` (blank) slot → invisible. Entry onto a
 * reserved slot must ALWAYS fill it (any mode); entry onto a real member replaces its pitch on
 * overwrite/append (CHORD still stacks, INSERT still pushes the group).
 *
 * @see src/hooks/note/useNoteEntry.ts, src/commands/FillReservedSlotCommand.ts, src/hooks/note/useHoverPreview.ts
 */
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { renderHook, act } from '@testing-library/react';
import { RefObject } from 'react';
import { useNoteEntry } from '@/hooks/note/useNoteEntry';
import { FillReservedSlotCommand } from '@/commands/FillReservedSlotCommand';
import { InsertTupletMemberCommand } from '@/commands/InsertTupletMemberCommand';
import { createDefaultScore, createDefaultSelection, Score, Selection, ScoreEvent } from '@/types';

const trip = (id: string, pitch: string | null, position: number, extra: Partial<ScoreEvent> = {}): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: pitch === null ? [{ id: `${id}n`, pitch: null, isRest: true }] : [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
  ...extra,
});

// Post-delete state: [C4, G4, reserved] (deleting the middle of a C-E-G triplet).
const reservedTripletScore = (): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [
    {
      ...s.staves[0],
      measures: [{ id: 'm0', events: [trip('t0', 'C4', 0), trip('t1', 'G4', 1), trip('res', null, 2, { reserved: true, isRest: true })] }],
    },
  ];
  return s;
};

const props = (
  score: Score,
  dispatch: jest.Mock,
  selectionOver: Partial<Selection> = {},
  setFeedback: jest.Mock = jest.fn()
) => ({
  scoreRef: { current: score } as RefObject<Score>,
  selection: { ...createDefaultSelection(), measureIndex: 0, staffIndex: 0, ...selectionOver } as Selection,
  select: jest.fn(),
  setPreviewNote: jest.fn(),
  activeDuration: 'eighth',
  isDotted: false,
  activeAccidental: null,
  activeTie: false,
  currentQuantsPerMeasure: 64,
  dispatch,
  inputMode: 'NOTE' as const,
  setFeedback,
});

// A FULL triplet [C, E, G] (no free space).
const fullTripletScore = (): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [
    {
      ...s.staves[0],
      measures: [{ id: 'm0', events: [trip('t0', 'C4', 0), trip('t1', 'E4', 1), trip('t2', 'G4', 2)] }],
    },
  ];
  return s;
};

describe('interactive tuplet entry (#242 user bug)', () => {
  it('CHORD-mode commit onto a reserved slot FILLS it via the unified container insert', () => {
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(reservedTripletScore(), dispatch, { eventId: 'res', noteId: 'resn' }))
    );
    // Mirrors a hover-over-freed-space (CHORD preview) committed by click. Reserved-slot fill is an
    // end-fill INSERT (subsumes the old in-place FillReservedSlot).
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'A4', mode: 'CHORD', eventId: 'res' }, true);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBeInstanceOf(InsertTupletMemberCommand);
  });

  it('fills the reserved slot with NO active selection (real hover-to-place flow)', () => {
    // The hover-to-place flow clears the selection so the ghost can render; the preview carries the
    // target eventId. The fill must still fire (this is the regression: it used to fall through to a
    // chord-stack onto the blank reserved slot → invisible note).
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(reservedTripletScore(), dispatch, { measureIndex: null, eventId: null, noteId: null }))
    );
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'A4', mode: 'CHORD', eventId: 'res' }, true);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBeInstanceOf(InsertTupletMemberCommand);
  });

  it('overwrite-mode commit onto a real member REPLACES its pitch (fills, keeps the group)', () => {
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(reservedTripletScore(), dispatch, { eventId: 't1', noteId: 't1n' }))
    );
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'A4', mode: 'APPEND', eventId: 't1' }, true);
    });
    expect(dispatch.mock.calls[0][0]).toBeInstanceOf(FillReservedSlotCommand);
  });

  it('INSERT strictly BETWEEN two members (incomplete group) inserts into the fixed span', () => {
    // [C, G, reserved]; insert between C (idx 0) and G (idx 1) → index 1, both tuplet members.
    const dispatch = jest.fn();
    const { result } = renderHook(() => useNoteEntry(props(reservedTripletScore(), dispatch)));
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'D4', mode: 'INSERT', index: 1 }, true, {
        mode: 'INSERT',
        index: 1,
      });
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBeInstanceOf(InsertTupletMemberCommand);
  });

  it('INSERT between members of a FULL tuplet is rejected with feedback (no dispatch)', () => {
    const dispatch = jest.fn();
    const setFeedback = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(fullTripletScore(), dispatch, {}, setFeedback))
    );
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'D4', mode: 'INSERT', index: 1 }, true, {
        mode: 'INSERT',
        index: 1,
      });
    });
    expect(dispatch).not.toHaveBeenCalled();
    expect(setFeedback).toHaveBeenCalledWith(expect.stringContaining('full'));
  });

  it('does NOT merge two adjacent id-less (legacy) tuplets: INSERT at the seam falls through', () => {
    // Two back-to-back triplets with NO tuplet.id (legacy/imported). Inserting at the seam (index 3,
    // between the last member of group 1 and the first of group 2) must NOT be treated as a mid-insert
    // into a single group (the old `undefined === undefined` id check did exactly that and rejected).
    const idless = (id: string, pitch: string, position: number): ScoreEvent => ({
      id,
      duration: 'eighth',
      dotted: false,
      notes: [{ id: `${id}n`, pitch }],
      tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth' },
    });
    const s = createDefaultScore();
    s.timeSignature = '4/4';
    s.staves = [
      {
        ...s.staves[0],
        measures: [
          {
            id: 'm0',
            events: [
              idless('g1a', 'C4', 0),
              idless('g1b', 'D4', 1),
              idless('g1c', 'E4', 2),
              idless('g2a', 'F4', 0),
              idless('g2b', 'G4', 1),
              idless('g2c', 'A4', 2),
            ],
          },
        ],
      },
    ];
    const dispatch = jest.fn();
    const setFeedback = jest.fn();
    const { result } = renderHook(() => useNoteEntry(props(s, dispatch, {}, setFeedback)));
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'B4', mode: 'INSERT', index: 3 }, true, {
        mode: 'INSERT',
        index: 3,
      });
    });
    // Not intercepted as a tuplet mid-insert, and not spuriously rejected.
    const dispatched = dispatch.mock.calls.map((c) => c[0]);
    expect(dispatched.some((c) => c instanceof InsertTupletMemberCommand)).toBe(false);
    expect(setFeedback).not.toHaveBeenCalled();
  });

  it('INSERT mode onto a real member is NOT intercepted (group-overflow insert still works)', () => {
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(reservedTripletScore(), dispatch, { eventId: 't0', noteId: 't0n' }))
    );
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'A4', mode: 'INSERT', eventId: 't0' }, true, { mode: 'INSERT', index: 0, eventId: 't0' });
    });
    // Not a fill — falls through to the normal inserter.
    const dispatched = dispatch.mock.calls.map((c) => c[0]);
    expect(dispatched.some((c) => c instanceof FillReservedSlotCommand)).toBe(false);
  });
});
