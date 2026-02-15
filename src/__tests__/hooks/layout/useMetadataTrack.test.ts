/**
 * useMetadataTrack Hook Tests
 *
 * Tests for metadata track editing state management: editing/selecting operations,
 * command dispatch, navigation, and state cleanup.
 *
 * @see src/hooks/layout/useMetadataTrack.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useMetadataTrack, FIELD_ORDER } from '@/hooks/layout/useMetadataTrack';
import { Score, createDefaultScore, ScoreMetadata } from '@/types';
import { SetMetadataCommand } from '@/commands/layout';

// Mock the SetMetadataCommand
jest.mock('@/commands/layout', () => ({
  SetMetadataCommand: jest.fn().mockImplementation((updates) => ({
    type: 'SetMetadataCommand',
    updates,
  })),
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestMetadata = (overrides?: Partial<ScoreMetadata>): ScoreMetadata => ({
  title: 'Test Song',
  composer: 'Test Composer',
  lyricist: 'Test Lyricist',
  copyright: 'Test Copyright',
  ...overrides,
});

const createTestScore = (metadata?: ScoreMetadata): Score => {
  const score = createDefaultScore();
  if (metadata) {
    score.metadata = metadata;
  }
  return score;
};

// ============================================================================
// TESTS
// ============================================================================

describe('useMetadataTrack', () => {
  let mockDispatch: jest.Mock;
  let mockSelectFirstElement: jest.Mock;
  let mockSelectLastElement: jest.Mock;
  let scoreRef: { current: Score };

  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelectFirstElement = jest.fn();
    mockSelectLastElement = jest.fn();
    scoreRef = { current: createTestScore(createTestMetadata()) };
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Initial State
  // --------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns metadata from score', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      expect(result.current.metadata.title).toBe('Test Song');
      expect(result.current.metadata.composer).toBe('Test Composer');
      expect(result.current.metadata.lyricist).toBe('Test Lyricist');
      expect(result.current.metadata.copyright).toBe('Test Copyright');
    });

    it('returns default metadata when score has no metadata', () => {
      const score = createTestScore();
      delete score.metadata;
      scoreRef.current = score;

      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      expect(result.current.metadata.title).toBe('Untitled');
    });

    it('has null editing state initially', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      expect(result.current.editingField).toBeNull();
      expect(result.current.selectedField).toBeNull();
      expect(result.current.initialValue).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // startEditing
  // --------------------------------------------------------------------------

  describe('startEditing', () => {
    it('sets editingField to the target field', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      expect(result.current.editingField).toBe('title');
    });

    it('sets initialValue to field value', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('composer');
      });

      expect(result.current.initialValue).toBe('Test Composer');
    });

    it('clears selectedField when starting edit', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      // First select a field
      act(() => {
        result.current.selectField('composer');
      });
      expect(result.current.selectedField).toBe('composer');

      // Then start editing another field
      act(() => {
        result.current.startEditing('title');
      });

      expect(result.current.selectedField).toBeNull();
      expect(result.current.editingField).toBe('title');
    });
  });

  // --------------------------------------------------------------------------
  // selectField
  // --------------------------------------------------------------------------

  describe('selectField', () => {
    it('sets selectedField to the target field', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.selectField('composer');
      });

      expect(result.current.selectedField).toBe('composer');
    });

    it('clears editingField when selecting', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      // First start editing
      act(() => {
        result.current.startEditing('title');
      });
      expect(result.current.editingField).toBe('title');

      // Then select a field
      act(() => {
        result.current.selectField('composer');
      });

      expect(result.current.editingField).toBeNull();
      expect(result.current.selectedField).toBe('composer');
    });
  });

  // --------------------------------------------------------------------------
  // completeEdit
  // --------------------------------------------------------------------------

  describe('completeEdit', () => {
    it('dispatches SetMetadataCommand with new value', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      act(() => {
        result.current.completeEdit('title', 'New Title');
      });

      expect(SetMetadataCommand).toHaveBeenCalledWith({ title: 'New Title' });
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SetMetadataCommand' })
      );
    });

    it('trims whitespace from value', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      act(() => {
        result.current.completeEdit('title', '  New Title  ');
      });

      expect(SetMetadataCommand).toHaveBeenCalledWith({ title: 'New Title' });
    });

    it('clears editing state after completion', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      expect(result.current.editingField).toBe('title');

      act(() => {
        result.current.completeEdit('title', 'New Title');
      });

      expect(result.current.editingField).toBeNull();
      expect(result.current.initialValue).toBeNull();
    });

    it('does not dispatch for empty required field (title)', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      act(() => {
        result.current.completeEdit('title', '');
      });

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(result.current.editingField).toBeNull();
    });

    it('clears optional field when value is empty', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('composer');
      });

      act(() => {
        result.current.completeEdit('composer', '');
      });

      expect(SetMetadataCommand).toHaveBeenCalledWith({ composer: undefined });
    });
  });

  // --------------------------------------------------------------------------
  // cancelEdit
  // --------------------------------------------------------------------------

  describe('cancelEdit', () => {
    it('clears editingField', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      expect(result.current.editingField).toBe('title');

      act(() => {
        result.current.cancelEdit();
      });

      expect(result.current.editingField).toBeNull();
    });

    it('clears initialValue', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      expect(result.current.initialValue).toBe('Test Song');

      act(() => {
        result.current.cancelEdit();
      });

      expect(result.current.initialValue).toBeNull();
    });

    it('does not dispatch any commands', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
        result.current.cancelEdit();
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // deleteField
  // --------------------------------------------------------------------------

  describe('deleteField', () => {
    it('does not delete required field (title)', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.deleteField('title');
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('dispatches SetMetadataCommand to clear optional field', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.deleteField('composer');
      });

      expect(SetMetadataCommand).toHaveBeenCalledWith({ composer: undefined });
      expect(mockDispatch).toHaveBeenCalled();
    });

    it('clears editing state if deleting field being edited', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('composer');
      });

      expect(result.current.editingField).toBe('composer');

      act(() => {
        result.current.deleteField('composer');
      });

      expect(result.current.editingField).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // navigateToNext
  // --------------------------------------------------------------------------

  describe('navigateToNext', () => {
    it('saves current value and moves to next field', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      act(() => {
        result.current.navigateToNext('title', 'New Title');
      });

      // Should dispatch save command
      expect(SetMetadataCommand).toHaveBeenCalledWith({ title: 'New Title' });

      // Advance timers to trigger the setTimeout
      await act(async () => {
        jest.advanceTimersByTime(10);
      });

      // Should now be editing the next field (composer)
      expect(result.current.editingField).toBe('composer');

      jest.useRealTimers();
    });

    it('calls selectFirstElement when navigating from last field', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      // Start editing the last field in FIELD_ORDER
      const lastField = FIELD_ORDER[FIELD_ORDER.length - 1];
      act(() => {
        result.current.startEditing(lastField);
      });

      act(() => {
        result.current.navigateToNext(lastField, 'Value');
      });

      // Advance timers
      await act(async () => {
        jest.advanceTimersByTime(10);
      });

      expect(mockSelectFirstElement).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // navigateToPrevious
  // --------------------------------------------------------------------------

  describe('navigateToPrevious', () => {
    it('saves current value and moves to previous field', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('composer');
      });

      act(() => {
        result.current.navigateToPrevious('composer', 'Updated Composer');
      });

      // Should dispatch save command
      expect(SetMetadataCommand).toHaveBeenCalledWith({ composer: 'Updated Composer' });

      // Advance timers to trigger the setTimeout
      await act(async () => {
        jest.advanceTimersByTime(10);
      });

      // Should now be editing the previous field (title)
      expect(result.current.editingField).toBe('title');

      jest.useRealTimers();
    });

    it('calls selectLastElement when navigating from first field', async () => {
      jest.useFakeTimers();

      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      // Start editing the first field
      const firstField = FIELD_ORDER[0];
      act(() => {
        result.current.startEditing(firstField);
      });

      act(() => {
        result.current.navigateToPrevious(firstField, 'Value');
      });

      // Advance timers
      await act(async () => {
        jest.advanceTimersByTime(10);
      });

      expect(mockSelectLastElement).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // --------------------------------------------------------------------------
  // exitToScore
  // --------------------------------------------------------------------------

  describe('exitToScore', () => {
    it('clears editing state and calls selectFirstElement', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      act(() => {
        result.current.exitToScore();
      });

      expect(result.current.editingField).toBeNull();
      expect(mockSelectFirstElement).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // trackProps
  // --------------------------------------------------------------------------

  describe('trackProps', () => {
    it('returns props object with all required properties', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      const props = result.current.trackProps;

      expect(props.metadata).toBeDefined();
      expect(props.editingField).toBeNull();
      expect(props.selectedField).toBeNull();
      expect(props.initialValue).toBeNull();
      expect(typeof props.onFieldClick).toBe('function');
      expect(typeof props.onFieldSelect).toBe('function');
      expect(typeof props.onEditComplete).toBe('function');
      expect(typeof props.onEditCancel).toBe('function');
      expect(typeof props.onDelete).toBe('function');
      expect(typeof props.onNavigateNext).toBe('function');
      expect(typeof props.onNavigatePrevious).toBe('function');
    });

    it('updates when editing state changes', () => {
      const { result } = renderHook(() =>
        useMetadataTrack({
          scoreRef,
          score: scoreRef.current,
          dispatch: mockDispatch,
          selectFirstElement: mockSelectFirstElement,
          selectLastElement: mockSelectLastElement,
        })
      );

      act(() => {
        result.current.startEditing('title');
      });

      expect(result.current.trackProps.editingField).toBe('title');
    });
  });

  // --------------------------------------------------------------------------
  // FIELD_ORDER
  // --------------------------------------------------------------------------

  describe('FIELD_ORDER', () => {
    it('contains the expected fields in order', () => {
      expect(FIELD_ORDER).toEqual(['title', 'composer', 'lyricist']);
    });

    it('does not include copyright (handled separately in footer)', () => {
      expect(FIELD_ORDER).not.toContain('copyright');
    });
  });
});
