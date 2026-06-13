/**
 * #263 — Keyboard Enter must not lose the note when appending past the end of a FULL last bar.
 *
 * A hover/keyboard APPEND ghost past the end of a full last bar targets `measureIndex + 1` — a bar
 * that does not exist yet. Committing (Enter passes shouldAutoAdvance=true) used to dispatch a plain
 * AddEventCommand against that non-existent measure, which silently no-ops in the engine → the note
 * was lost (mouse click worked, because its capacity-fail path auto-creates the bar — an
 * Enter-vs-click divergence). The fix gives `addNoteToMeasure` a phantom-target guard that creates
 * the bar first, then places into it — and is gated on shouldAutoAdvance so the existing
 * auto-advance RECURSION (which re-enters with an out-of-range index and shouldAutoAdvance=false) is
 * untouched and cannot double-create or loop.
 *
 * @see src/hooks/note/useNoteEntry.ts
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
import { AddMeasureCommand } from '@/commands/MeasureCommands';
import { AddEventCommand } from '@/commands/AddEventCommand';
import { createDefaultScore, createDefaultSelection, Score, Selection } from '@/types';

// One full 4/4 bar (a whole note = 64 quants), so an append ghost past it targets phantom index 1.
const fullBarScore = (): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [
    {
      ...s.staves[0],
      measures: [
        { id: 'm0', events: [{ id: 'w', duration: 'whole', dotted: false, notes: [{ id: 'wn', pitch: 'C4' }] }] },
      ],
    },
  ];
  return s;
};

const props = (score: Score, dispatch: jest.Mock, selectionOver: Partial<Selection> = {}) => ({
  scoreRef: { current: score } as RefObject<Score>,
  selection: { ...createDefaultSelection(), measureIndex: 0, staffIndex: 0, ...selectionOver } as Selection,
  select: jest.fn(),
  setPreviewNote: jest.fn(),
  activeDuration: 'quarter',
  isDotted: false,
  activeAccidental: null,
  activeTie: false,
  currentQuantsPerMeasure: 64,
  dispatch,
  inputMode: 'NOTE' as const,
});

describe('#263 append past a full last bar', () => {
  it('Enter on the phantom append ghost creates the bar AND places the note', () => {
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(fullBarScore(), dispatch, { eventId: 'w', noteId: 'wn' }))
    );

    // The append ghost past the full last bar targets measureIndex 1 (phantom); Enter commits with
    // shouldAutoAdvance=true. Before the fix: only AddEventCommand(1) → no-op against a missing bar.
    act(() => {
      result.current.addNoteToMeasure(1, { pitch: 'D4', mode: 'APPEND', index: 0 }, true);
    });

    const dispatched = dispatch.mock.calls.map((c) => c[0]);
    // The bar is created first, then the note is placed into it.
    expect(dispatched[0]).toBeInstanceOf(AddMeasureCommand);
    expect(dispatched.some((c) => c instanceof AddEventCommand)).toBe(true);
  });

  it('does NOT auto-create for a phantom index when shouldAutoAdvance is false (recursion-safe gating)', () => {
    // The auto-advance recursion re-enters with an out-of-range index and shouldAutoAdvance=false,
    // relying on the freshly-dispatched engine measure. That path must fall through to a normal
    // dispatch — never re-trigger the create guard (which would double-create / loop).
    const dispatch = jest.fn();
    const { result } = renderHook(() =>
      useNoteEntry(props(fullBarScore(), dispatch, { eventId: 'w', noteId: 'wn' }))
    );

    act(() => {
      result.current.addNoteToMeasure(1, { pitch: 'D4', mode: 'APPEND', index: 0 }, false);
    });

    const dispatched = dispatch.mock.calls.map((c) => c[0]);
    expect(dispatched.some((c) => c instanceof AddMeasureCommand)).toBe(false);
    // It still attempts the (engine-resolved) event dispatch, exactly as the recursion does today.
    expect(dispatched.some((c) => c instanceof AddEventCommand)).toBe(true);
  });
});
