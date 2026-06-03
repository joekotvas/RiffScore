/**
 * useSelectionStatus.test.ts
 *
 * Tests for the useSelectionStatus hook that derives selection status text.
 */

import { renderHook } from '@testing-library/react';
import { useSelectionStatus } from '@hooks/editor/useSelectionStatus';
import { createDefaultScore, createDefaultSelection } from '@/types';
import type { Selection, PreviewNote, Score } from '@/types';

// Helper to create a score with notes
const createScoreWithNote = (): Score => {
  const score = createDefaultScore();
  score.staves[0].measures[0].events = [
    {
      id: 'e1',
      duration: 'quarter',
      dotted: false,
      notes: [{ id: 'n1', pitch: 'C4' }],
    },
  ];
  return score;
};

// Helper to create a score with a chord
const createScoreWithChord = (): Score => {
  const score = createDefaultScore();
  score.staves[0].measures[0].events = [
    {
      id: 'e1',
      duration: 'quarter',
      dotted: false,
      notes: [
        { id: 'n1', pitch: 'C4' },
        { id: 'n2', pitch: 'E4' },
        { id: 'n3', pitch: 'G4' },
      ],
    },
  ];
  return score;
};

// Helper to create a score with a rest
const createScoreWithRest = (): Score => {
  const score = createDefaultScore();
  score.staves[0].measures[0].events = [
    {
      id: 'e1',
      duration: 'quarter',
      dotted: false,
      notes: [],
      isRest: true,
    },
  ];
  return score;
};

describe('useSelectionStatus', () => {
  describe('inactive state', () => {
    it('returns inactive when no notes are selected', () => {
      const selection = createDefaultSelection();
      const score = createDefaultScore();

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote: null, score })
      );

      expect(result.current.type).toBe('inactive');
      expect(result.current.text).toBe('No selection');
    });
  });

  describe('ready state (ghost cursor)', () => {
    it('returns ready when preview note is active', () => {
      const selection = createDefaultSelection();
      const score = createDefaultScore();
      const previewNote: PreviewNote = {
        measureIndex: 0,
        staffIndex: 0,
        quant: 0,
        visualQuant: 0,
        pitch: 'C4',
        duration: 'quarter',
        dotted: false,
        mode: 'APPEND',
        index: 0,
        isRest: false,
      };

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote, score })
      );

      expect(result.current.type).toBe('ready');
      expect(result.current.text).toBe('Ready to insert');
    });
  });

  describe('single note selected', () => {
    it('returns note when single note is selected', () => {
      const score = createScoreWithNote();
      const selection: Selection = {
        ...createDefaultSelection(),
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: 'n1' },
        ],
      };

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote: null, score })
      );

      expect(result.current.type).toBe('note');
      expect(result.current.text).toBe('Note selected');
    });
  });

  describe('rest selected', () => {
    it('returns rest when rest is selected', () => {
      const score = createScoreWithRest();
      const selection: Selection = {
        ...createDefaultSelection(),
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: null,
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: null },
        ],
      };

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote: null, score })
      );

      expect(result.current.type).toBe('rest');
      expect(result.current.text).toBe('Rest selected');
    });
  });

  describe('chord selected', () => {
    it('returns chord when full chord is selected (noteId is null)', () => {
      const score = createScoreWithChord();
      const selection: Selection = {
        ...createDefaultSelection(),
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: null,
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: null },
        ],
      };

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote: null, score })
      );

      expect(result.current.type).toBe('chord');
      expect(result.current.text).toBe('Chord selected');
      expect(result.current.count).toBe(3);
    });
  });

  describe('multiple notes selected', () => {
    it('returns notes count when multiple notes are selected', () => {
      const score = createScoreWithNote();
      const selection: Selection = {
        ...createDefaultSelection(),
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'e1', noteId: 'n1' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e2', noteId: 'n2' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e3', noteId: 'n3' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e4', noteId: 'n4' },
          { staffIndex: 0, measureIndex: 0, eventId: 'e5', noteId: 'n5' },
        ],
      };

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote: null, score })
      );

      expect(result.current.type).toBe('notes');
      expect(result.current.text).toBe('5 notes selected');
      expect(result.current.count).toBe(5);
    });
  });

  describe('chord symbol selected', () => {
    it('returns chord-symbol when chord ID is selected', () => {
      const score = createDefaultScore();
      const selection: Selection = {
        ...createDefaultSelection(),
        chordId: 'chord-1',
      };

      const { result } = renderHook(() =>
        useSelectionStatus({ selection, previewNote: null, score })
      );

      expect(result.current.type).toBe('chord-symbol');
      expect(result.current.text).toBe('Chord symbol selected');
    });
  });
});
