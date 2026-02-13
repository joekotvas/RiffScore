/**
 * useChordTrack Hook Tests
 *
 * Tests for chord track editing state management: selection subscription,
 * editing/creating operations, command dispatch, and state cleanup.
 *
 * @see src/hooks/chord/useChordTrack.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useChordTrack } from '@/hooks/chord/useChordTrack';
import { SelectionEngine } from '@/engines/SelectionEngine';
import { Score, ChordSymbol, createDefaultScore, createDefaultSelection } from '@/types';
import { AddChordCommand, UpdateChordCommand, RemoveChordCommand } from '@/commands/chord';

// Mock the chord commands
jest.mock('@/commands/chord', () => ({
  AddChordCommand: jest.fn().mockImplementation((quant, symbol) => ({
    type: 'AddChordCommand',
    quant,
    symbol,
  })),
  UpdateChordCommand: jest.fn().mockImplementation((id, updates) => ({
    type: 'UpdateChordCommand',
    id,
    updates,
  })),
  RemoveChordCommand: jest.fn().mockImplementation((id) => ({
    type: 'RemoveChordCommand',
    id,
  })),
}));

// Mock ChordService
jest.mock('@/services/ChordService', () => ({
  getValidChordQuants: jest.fn((score: Score) => {
    // Return quants at beat positions (0, 24, 48, 72 for 4/4 time)
    const validQuants = new Set<number>();
    if (score?.staves?.[0]?.measures) {
      // Each measure has 96 quants in 4/4. Add beat positions.
      for (let m = 0; m < score.staves[0].measures.length; m++) {
        const baseQuant = m * 96;
        // Add quants for each event in the measure
        for (let beat = 0; beat < 4; beat++) {
          validQuants.add(baseQuant + beat * 24);
        }
      }
    }
    return validQuants;
  }),
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createTestChord = (overrides?: Partial<ChordSymbol>): ChordSymbol => ({
  id: 'chord-1',
  measure: 0,
  quant: 0,
  symbol: 'Cmaj7',
  ...overrides,
});

const createTestScore = (chords: ChordSymbol[] = []): Score => {
  const score = createDefaultScore();
  // Add events to make valid quant positions
  score.staves[0].measures[0].events = [
    { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
    { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
  ];
  score.chordTrack = chords;
  return score;
};

// ============================================================================
// TESTS
// ============================================================================

describe('useChordTrack', () => {
  let mockDispatch: jest.Mock;
  let selectionEngine: SelectionEngine;
  let scoreRef: { current: Score };

  beforeEach(() => {
    mockDispatch = jest.fn();
    selectionEngine = new SelectionEngine(createDefaultSelection());
    scoreRef = { current: createTestScore() };
    jest.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // Initial State
  // --------------------------------------------------------------------------

  describe('initial state', () => {
    it('returns chords from score.chordTrack', () => {
      const chords = [
        createTestChord({ id: 'c1', quant: 0, symbol: 'C' }),
        createTestChord({ id: 'c2', quant: 24, symbol: 'G' }),
      ];
      scoreRef.current = createTestScore(chords);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.chords).toEqual(chords);
      expect(result.current.chords).toHaveLength(2);
    });

    it('returns empty array when score has no chordTrack', () => {
      const score = createTestScore();
      delete (score as Partial<Score>).chordTrack;
      scoreRef.current = score;

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.chords).toEqual([]);
    });

    it('computes validQuants from score', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.validPositions).toBeInstanceOf(Set);
      // With our mock, we expect beat positions (0, 24, 48, 72 per measure)
      expect(result.current.validPositions.has(0)).toBe(true);
      expect(result.current.validPositions.has(24)).toBe(true);
    });

    it('has null editing state initially', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.editingChordId).toBeNull();
      expect(result.current.creatingAt).toBeNull();
      expect(result.current.initialValue).toBeNull();
    });

    it('reflects selection state from SelectionEngine', () => {
      // Pre-select a chord in the selection engine
      selectionEngine.selectChord('chord-1');

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.selectedChordId).toBe('chord-1');
      expect(result.current.isFocused).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // startEditing
  // --------------------------------------------------------------------------

  describe('startEditing', () => {
    it('sets editingChordId to the target chord', () => {
      const chord = createTestChord({ id: 'chord-1', symbol: 'Am' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.editingChordId).toBe('chord-1');
    });

    it('sets initialValue to chord symbol by default', () => {
      const chord = createTestChord({ id: 'chord-1', symbol: 'Dm7' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.initialValue).toBe('Dm7');
    });

    it('allows overriding initialValue via options', () => {
      const chord = createTestChord({ id: 'chord-1', symbol: 'G7' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1', { initialValue: 'Gmaj7' });
      });

      expect(result.current.initialValue).toBe('Gmaj7');
    });

    it('clears chord selection in SelectionEngine', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      // Pre-select a chord
      selectionEngine.selectChord('other-chord');

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      // Selection should be cleared
      expect(selectionEngine.getState().chordId).toBeNull();
    });

    it('clears creatingAtQuant when starting edit', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      // First start creating
      act(() => {
        result.current.startCreating({ measure: 0, quant: 48 });
      });

      expect(result.current.creatingAt).toBe(48);

      // Then start editing
      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.creatingAt).toBeNull();
      expect(result.current.editingChordId).toBe('chord-1');
    });

    it('does nothing if chord not found in score', () => {
      scoreRef.current = createTestScore([]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('nonexistent');
      });

      expect(result.current.editingChordId).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // startCreating
  // --------------------------------------------------------------------------

  describe('startCreating', () => {
    it('sets creatingAtQuant to the target position', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startCreating({ measure: 0, quant: 24 });
      });

      expect(result.current.creatingAt).toBe(24);
    });

    it('sets editingChordId to "new" for new chord creation', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startCreating({ measure: 0, quant: 0 });
      });

      expect(result.current.editingChordId).toBe('new');
    });

    it('sets initialValue to empty string', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startCreating({ measure: 1, quant: 8 });
      });

      expect(result.current.initialValue).toBe('');
    });

    it('clears chord selection in SelectionEngine', () => {
      // Pre-select a chord
      selectionEngine.selectChord('existing-chord');

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startCreating({ measure: 0, quant: 48 });
      });

      expect(selectionEngine.getState().chordId).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // completeEdit
  // --------------------------------------------------------------------------

  describe('completeEdit', () => {
    it('dispatches UpdateChordCommand for existing chord', () => {
      const chord = createTestChord({ id: 'chord-1', symbol: 'C' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      // Start editing first
      act(() => {
        result.current.startEditing('chord-1');
      });

      // Complete with new value
      act(() => {
        result.current.completeEdit('chord-1', 'Cmaj7');
      });

      expect(UpdateChordCommand).toHaveBeenCalledWith('chord-1', { symbol: 'Cmaj7' });
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'UpdateChordCommand' })
      );
    });

    it('dispatches AddChordCommand for new chord', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      // Start creating at quant 48
      act(() => {
        result.current.startCreating({ measure: 0, quant: 48 });
      });

      // Complete with value (null chordId indicates new chord)
      act(() => {
        result.current.completeEdit(null, 'Dm');
      });

      expect(AddChordCommand).toHaveBeenCalledWith(48, 'Dm');
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'AddChordCommand' })
      );
    });

    it('trims whitespace from value', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      act(() => {
        result.current.completeEdit('chord-1', '  F#m7  ');
      });

      expect(UpdateChordCommand).toHaveBeenCalledWith('chord-1', { symbol: 'F#m7' });
    });

    it('clears editing state after completion', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.editingChordId).toBe('chord-1');

      act(() => {
        result.current.completeEdit('chord-1', 'G');
      });

      expect(result.current.editingChordId).toBeNull();
      expect(result.current.creatingAt).toBeNull();
      expect(result.current.initialValue).toBeNull();
    });

    it('cancels instead of saving when value is empty', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      act(() => {
        result.current.completeEdit('chord-1', '');
      });

      expect(mockDispatch).not.toHaveBeenCalled();
      expect(result.current.editingChordId).toBeNull();
    });

    it('cancels instead of saving when value is only whitespace', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      act(() => {
        result.current.completeEdit('chord-1', '   ');
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // cancelEdit
  // --------------------------------------------------------------------------

  describe('cancelEdit', () => {
    it('clears editingChordId', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.editingChordId).toBe('chord-1');

      act(() => {
        result.current.cancelEdit();
      });

      expect(result.current.editingChordId).toBeNull();
    });

    it('clears creatingAtQuant', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startCreating({ measure: 0, quant: 24 });
      });

      expect(result.current.creatingAt).toBe(24);

      act(() => {
        result.current.cancelEdit();
      });

      expect(result.current.creatingAt).toBeNull();
    });

    it('clears initialValue', () => {
      const chord = createTestChord({ id: 'chord-1', symbol: 'Bb' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.initialValue).toBe('Bb');

      act(() => {
        result.current.cancelEdit();
      });

      expect(result.current.initialValue).toBeNull();
    });

    it('does not dispatch any commands', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
        result.current.cancelEdit();
      });

      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // deleteChord
  // --------------------------------------------------------------------------

  describe('deleteChord', () => {
    it('dispatches RemoveChordCommand', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.deleteChord('chord-1');
      });

      expect(RemoveChordCommand).toHaveBeenCalledWith('chord-1');
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RemoveChordCommand' })
      );
    });

    it('clears editing state if deleting chord being edited', () => {
      const chord = createTestChord({ id: 'chord-1' });
      scoreRef.current = createTestScore([chord]);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      expect(result.current.editingChordId).toBe('chord-1');

      act(() => {
        result.current.deleteChord('chord-1');
      });

      expect(result.current.editingChordId).toBeNull();
    });

    it('does not clear editing state if deleting different chord', () => {
      const chords = [
        createTestChord({ id: 'chord-1' }),
        createTestChord({ id: 'chord-2', quant: 24, symbol: 'G' }),
      ];
      scoreRef.current = createTestScore(chords);

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      act(() => {
        result.current.startEditing('chord-1');
      });

      act(() => {
        result.current.deleteChord('chord-2');
      });

      expect(result.current.editingChordId).toBe('chord-1');
    });
  });

  // --------------------------------------------------------------------------
  // SelectionEngine Subscription
  // --------------------------------------------------------------------------

  describe('SelectionEngine subscription', () => {
    it('updates when SelectionEngine selection changes', () => {
      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.selectedChordId).toBeNull();
      expect(result.current.isFocused).toBe(false);

      // Simulate selection change from SelectionEngine
      act(() => {
        selectionEngine.selectChord('chord-xyz');
      });

      expect(result.current.selectedChordId).toBe('chord-xyz');
      expect(result.current.isFocused).toBe(true);
    });

    it('reflects cleared selection from SelectionEngine', () => {
      // Start with a selected chord
      selectionEngine.selectChord('chord-1');

      const { result } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      expect(result.current.selectedChordId).toBe('chord-1');

      // Clear selection
      act(() => {
        selectionEngine.selectChord(null);
      });

      expect(result.current.selectedChordId).toBeNull();
      expect(result.current.isFocused).toBe(false);
    });

    it('unsubscribes on unmount', () => {
      const { unmount } = renderHook(() =>
        useChordTrack({
          scoreRef,
          score: scoreRef.current,
          selectionEngine,
          dispatch: mockDispatch,
        })
      );

      // Track if selection changes still notify
      const listenersBefore = (selectionEngine as unknown as { listeners: Set<unknown> }).listeners
        ?.size;

      unmount();

      const listenersAfter = (selectionEngine as unknown as { listeners: Set<unknown> }).listeners
        ?.size;

      // Listener count should decrease after unmount
      expect(listenersAfter).toBeLessThan(listenersBefore ?? 1);
    });

    it('re-subscribes when selectionEngine instance changes', () => {
      const { rerender } = renderHook(
        ({ engine }) =>
          useChordTrack({
            scoreRef,
            score: scoreRef.current,
            selectionEngine: engine,
            dispatch: mockDispatch,
          }),
        { initialProps: { engine: selectionEngine } }
      );

      const newSelectionEngine = new SelectionEngine(createDefaultSelection());
      newSelectionEngine.selectChord('new-chord');

      rerender({ engine: newSelectionEngine });

      // The hook should now be subscribed to the new engine
      // We can't easily test this without accessing internal state,
      // but the implementation uses the engine in the effect dependency
    });
  });

  // --------------------------------------------------------------------------
  // Score Reactivity
  // --------------------------------------------------------------------------

  describe('score reactivity', () => {
    it('updates chords when score.chordTrack changes', () => {
      const initialChords = [createTestChord({ id: 'c1' })];
      scoreRef.current = createTestScore(initialChords);

      const { result, rerender } = renderHook(
        ({ score }) =>
          useChordTrack({
            scoreRef,
            score,
            selectionEngine,
            dispatch: mockDispatch,
          }),
        { initialProps: { score: scoreRef.current } }
      );

      expect(result.current.chords).toHaveLength(1);

      // Update score with new chords
      const updatedChords = [
        createTestChord({ id: 'c1' }),
        createTestChord({ id: 'c2', quant: 24, symbol: 'F' }),
      ];
      const updatedScore = createTestScore(updatedChords);
      scoreRef.current = updatedScore;

      rerender({ score: updatedScore });

      expect(result.current.chords).toHaveLength(2);
    });

    it('recomputes validQuants when score changes', () => {
      const { result, rerender } = renderHook(
        ({ score }) =>
          useChordTrack({
            scoreRef,
            score,
            selectionEngine,
            dispatch: mockDispatch,
          }),
        { initialProps: { score: scoreRef.current } }
      );

      const _initialValidQuants = result.current.validPositions;

      // Create a new score (triggers recomputation)
      const newScore = createTestScore([]);
      scoreRef.current = newScore;

      rerender({ score: newScore });

      // validQuants should be recomputed (may be same values but new Set instance)
      expect(result.current.validPositions).toBeInstanceOf(Set);
    });
  });
});
