import { renderHook, act } from '@testing-library/react';
import { RefObject } from 'react';
import { useNoteDelete } from '@/hooks/note/useNoteDelete';
import { Selection, Score, ScoreEvent, createDefaultSelection, createDefaultScore } from '@/types';
import { DeleteNoteCommand } from '@/commands/DeleteNoteCommand';
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';

// Mock the command classes
jest.mock('@/commands/DeleteNoteCommand');
jest.mock('@/commands/DeleteEventCommand');

const refTo = (score: Score): RefObject<Score> => ({ current: score });

// An empty default score: the selected ids don't resolve, so re-anchor finds no neighbor and the
// selection is cleared — preserving the original wiring assertions for these tests.
const emptyRef = (): RefObject<Score> => refTo(createDefaultScore());

const scoreWith = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};
const ev = (id: string, pitches: string[]): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: pitches.map((p, i) => ({ id: `${id}n${i}`, pitch: p })),
});

describe('useNoteDelete', () => {
  let mockDispatch: jest.Mock;
  let mockSelect: jest.Mock;

  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelect = jest.fn();
    jest.clearAllMocks();
  });

  describe('multi-selection deletion', () => {
    it('deletes all notes in selectedNotes array', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: 'n1' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: 'n2' },
          { staffIndex: 0, measureIndex: 1, eventId: 'e2', noteId: 'n3' },
        ],
      };

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef: emptyRef() })
      );

      act(() => {
        result.current.deleteSelected();
      });

      expect(mockDispatch).toHaveBeenCalledTimes(3);
      expect(DeleteNoteCommand).toHaveBeenCalledTimes(3);
      expect(mockSelect).toHaveBeenCalledWith(null, null, null, 0);
    });

    it('deletes events when noteId is missing in selectedNotes', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: null }],
      };

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef: emptyRef() })
      );

      act(() => {
        result.current.deleteSelected();
      });

      expect(DeleteEventCommand).toHaveBeenCalledTimes(1);
      expect(DeleteNoteCommand).not.toHaveBeenCalled();
    });
  });

  describe('single selection deletion', () => {
    it('deletes single selected note', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        staffIndex: 0,
        selectedNotes: [], // Empty - not multi-select
      };

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef: emptyRef() })
      );

      act(() => {
        result.current.deleteSelected();
      });

      expect(DeleteNoteCommand).toHaveBeenCalledWith(0, 'e1', 'n1', 0);
      expect(mockSelect).toHaveBeenCalledWith(null, null, null, 0);
    });

    it('deletes event when noteId is null', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: 'e1',
        noteId: null,
        staffIndex: 0,
        selectedNotes: [],
      };

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef: emptyRef() })
      );

      act(() => {
        result.current.deleteSelected();
      });

      expect(DeleteEventCommand).toHaveBeenCalledWith(0, 'e1', 0);
      expect(DeleteNoteCommand).not.toHaveBeenCalled();
    });
  });

  describe('re-anchor after delete (#242 Lane G)', () => {
    it('selects the next event (which shifts into place) when deleting a whole event', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'e1n0',
        staffIndex: 0,
        selectedNotes: [],
      };
      const scoreRef = refTo(scoreWith([ev('e1', ['C4']), ev('e2', ['D4'])]));

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef })
      );
      act(() => result.current.deleteSelected());

      expect(mockSelect).toHaveBeenCalledWith(0, 'e2', 'e2n0', 0);
    });

    it('selects the previous event when deleting the last event', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: 'e2',
        noteId: 'e2n0',
        staffIndex: 0,
        selectedNotes: [],
      };
      const scoreRef = refTo(scoreWith([ev('e1', ['C4']), ev('e2', ['D4'])]));

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef })
      );
      act(() => result.current.deleteSelected());

      expect(mockSelect).toHaveBeenCalledWith(0, 'e1', 'e1n0', 0);
    });

    it('keeps the event selected (on a remaining note) when deleting one note of a chord', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'e1n0',
        staffIndex: 0,
        selectedNotes: [],
      };
      const scoreRef = refTo(scoreWith([ev('e1', ['C4', 'E4', 'G4'])]));

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef })
      );
      act(() => result.current.deleteSelected());

      expect(mockSelect).toHaveBeenCalledWith(0, 'e1', 'e1n1', 0);
    });

    it('clears the selection when deleting the only event in the measure', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'e1n0',
        staffIndex: 0,
        selectedNotes: [],
      };
      const scoreRef = refTo(scoreWith([ev('e1', ['C4'])]));

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef })
      );
      act(() => result.current.deleteSelected());

      expect(mockSelect).toHaveBeenCalledWith(null, null, null, 0);
    });
  });

  describe('early returns', () => {
    it('does nothing when measureIndex is null', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: null,
        eventId: null,
        selectedNotes: [],
      };

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef: emptyRef() })
      );

      act(() => {
        result.current.deleteSelected();
      });

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('does nothing when eventId is null', () => {
      const selection: Selection = {
        ...createDefaultSelection(),
        measureIndex: 0,
        eventId: null,
        selectedNotes: [],
      };

      const { result } = renderHook(() =>
        useNoteDelete({ selection, select: mockSelect, dispatch: mockDispatch, scoreRef: emptyRef() })
      );

      act(() => {
        result.current.deleteSelected();
      });

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });
});
