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

const props = (score: Score, dispatch: jest.Mock, selectionOver: Partial<Selection> = {}) => ({
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
});

describe('interactive tuplet entry (#242 user bug)', () => {
  it('CHORD-mode commit onto a reserved slot FILLS it (not a hidden chord-stack)', () => {
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(reservedTripletScore(), dispatch, { eventId: 'res', noteId: 'resn' }))
    );
    // Mirrors a hover-over-freed-space (CHORD preview) committed by click.
    act(() => {
      result.current.addNoteToMeasure(0, { pitch: 'A4', mode: 'CHORD', eventId: 'res' }, true);
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0][0]).toBeInstanceOf(FillReservedSlotCommand);
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
    expect(dispatch.mock.calls[0][0]).toBeInstanceOf(FillReservedSlotCommand);
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
