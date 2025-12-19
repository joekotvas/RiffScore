/**
 * SelectionEngine Tests
 *
 * Comprehensive unit tests for the SelectionEngine and selection commands.
 * Covers: happy paths, edge cases, exception handling, single/multi selection.
 */

import { SelectionEngine } from '../engines/SelectionEngine';
import { SelectEventCommand } from '../commands/selection/SelectEventCommand';
import { NavigateCommand } from '../commands/selection/NavigateCommand';
import { createDefaultSelection, Selection, Score } from '../types';

// Helper to create a test score with multiple staves
const createTestScore = (): Score => ({
  title: 'Test Score',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'measure-1',
          events: [
            {
              id: 'event-1',
              isRest: false,
              duration: 'quarter',
              dotted: false,
              notes: [
                { id: 'note-1a', pitch: 'C4', accidental: null, tied: false },
                { id: 'note-1b', pitch: 'E4', accidental: null, tied: false },
              ],
            },
            {
              id: 'event-2',
              isRest: false,
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 'note-2', pitch: 'D4', accidental: null, tied: false }],
            },
          ],
        },
        {
          id: 'measure-2',
          events: [
            {
              id: 'event-3',
              isRest: false,
              duration: 'half',
              dotted: false,
              notes: [{ id: 'note-3', pitch: 'E4', accidental: null, tied: false }],
            },
          ],
        },
      ],
    },
  ],
});

// Helper to create an empty score
const createEmptyScore = (): Score => ({
  title: 'Empty Score',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [],
});

// Helper to create a score with empty measure
const createScoreWithEmptyMeasure = (): Score => ({
  title: 'Score with Empty Measure',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'measure-1',
          events: [], // Empty measure
        },
      ],
    },
  ],
});

describe('SelectionEngine', () => {
  let engine: SelectionEngine;
  let testScore: Score;

  beforeEach(() => {
    testScore = createTestScore();
    engine = new SelectionEngine(undefined, () => testScore);
  });

  describe('constructor', () => {
    test('initializes with default selection when no initial state provided', () => {
      const state = engine.getState();
      expect(state).toBeDefined();
      expect(state.staffIndex).toBe(0);
      expect(state.measureIndex).toBeNull();
      expect(state.eventId).toBeNull();
      expect(state.selectedNotes).toEqual([]);
    });

    test('initializes with provided selection', () => {
      const initial: Selection = {
        staffIndex: 1,
        measureIndex: 0,
        eventId: 'test',
        noteId: 'note-test',
        selectedNotes: [],
        anchor: null,
      };
      engine = new SelectionEngine(initial, () => testScore);

      expect(engine.getState()).toBe(initial);
      expect(engine.getState().staffIndex).toBe(1);
    });

    test('uses empty score getter when none provided', () => {
      engine = new SelectionEngine();
      // Should not throw
      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0 }));
    });
  });

  describe('getState', () => {
    test('returns current selection synchronously', () => {
      const initial = createDefaultSelection();
      engine = new SelectionEngine(initial, () => testScore);

      const result = engine.getState();
      expect(result).toBe(initial);
    });

    test('returns updated state after dispatch', () => {
      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0, eventIndex: 1 }));
      const state = engine.getState();
      expect(state.eventId).toBe('event-2');
    });
  });

  describe('setState', () => {
    test('updates state directly', () => {
      const newState: Selection = {
        staffIndex: 0,
        measureIndex: 1,
        eventId: 'event-3',
        noteId: 'note-3',
        selectedNotes: [{ staffIndex: 0, measureIndex: 1, eventId: 'event-3', noteId: 'note-3' }],
        anchor: null,
      };

      engine.setState(newState);

      expect(engine.getState()).toEqual(newState);
    });

    test('notifies all listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      engine.subscribe(listener1);
      engine.subscribe(listener2);

      const newState = createDefaultSelection();
      engine.setState(newState);

      expect(listener1).toHaveBeenCalledWith(newState);
      expect(listener2).toHaveBeenCalledWith(newState);
    });
  });

  describe('dispatch', () => {
    test('updates state synchronously', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 1,
      });

      engine.dispatch(command);

      const state = engine.getState();
      expect(state.measureIndex).toBe(0);
      expect(state.eventId).toBe('event-2');
      expect(state.noteId).toBe('note-2');
    });

    test('notifies listeners after dispatch', () => {
      const listener = jest.fn();
      engine.subscribe(listener);

      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0, eventIndex: 0 }));

      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(engine.getState());
    });

    test('uses current score getter for command execution', () => {
      let scoreVersion = 0;
      const dynamicScore = () => (scoreVersion === 0 ? testScore : createEmptyScore());
      engine = new SelectionEngine(undefined, dynamicScore);

      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0, eventIndex: 0 }));
      expect(engine.getState().eventId).toBe('event-1');

      scoreVersion = 1;
      // With empty score, command should not change selection
      const stateBefore = engine.getState();
      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0, eventIndex: 0 }));
      expect(engine.getState()).toBe(stateBefore); // Unchanged (no staves)
    });
  });

  describe('subscribe', () => {
    test('adds listener that receives updates', () => {
      const listener = jest.fn();
      engine.subscribe(listener);

      engine.setState(createDefaultSelection());

      expect(listener).toHaveBeenCalled();
    });

    test('returns unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = engine.subscribe(listener);

      unsubscribe();
      engine.setState(createDefaultSelection());

      expect(listener).not.toHaveBeenCalled();
    });

    test('supports multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      const listener3 = jest.fn();

      engine.subscribe(listener1);
      engine.subscribe(listener2);
      engine.subscribe(listener3);

      engine.setState(createDefaultSelection());

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      expect(listener3).toHaveBeenCalled();
    });

    test('unsubscribe only removes specific listener', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      engine.subscribe(listener1);
      const unsub2 = engine.subscribe(listener2);

      unsub2();
      engine.setState(createDefaultSelection());

      expect(listener1).toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });
  });

  describe('setScoreGetter', () => {
    test('updates the score reference for commands', () => {
      engine = new SelectionEngine(undefined, createEmptyScore);
      
      // With empty score, command fails
      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0 }));
      expect(engine.getState().eventId).toBeNull();

      // Update score getter
      engine.setScoreGetter(() => testScore);

      // Now command succeeds
      engine.dispatch(new SelectEventCommand({ staffIndex: 0, measureIndex: 0 }));
      expect(engine.getState().eventId).toBe('event-1');
    });
  });
});

describe('SelectEventCommand', () => {
  let testScore: Score;
  let initialState: Selection;

  beforeEach(() => {
    testScore = createTestScore();
    initialState = createDefaultSelection();
  });

  describe('happy paths', () => {
    test('selects first event by default', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
      });

      const newState = command.execute(initialState, testScore);

      expect(newState.measureIndex).toBe(0);
      expect(newState.eventId).toBe('event-1');
      expect(newState.noteId).toBe('note-1a'); // First note
      expect(newState.selectedNotes).toHaveLength(1);
    });

    test('selects event by index', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 1,
      });

      const newState = command.execute(initialState, testScore);

      expect(newState.eventId).toBe('event-2');
      expect(newState.noteId).toBe('note-2');
    });

    test('selects specific note in chord', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 0,
        noteIndex: 1, // Second note in chord
      });

      const newState = command.execute(initialState, testScore);

      expect(newState.eventId).toBe('event-1');
      expect(newState.noteId).toBe('note-1b');
    });

    test('selects event in different measure', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 1,
        eventIndex: 0,
      });

      const newState = command.execute(initialState, testScore);

      expect(newState.measureIndex).toBe(1);
      expect(newState.eventId).toBe('event-3');
    });
  });

  describe('multi-selection', () => {
    test('addToSelection adds to existing selection', () => {
      // Start with one note selected
      const existingState: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-1',
        noteId: 'note-1a',
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1a' }],
        anchor: null,
      };

      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 1,
        addToSelection: true,
      });

      const newState = command.execute(existingState, testScore);

      expect(newState.selectedNotes).toHaveLength(2);
      expect(newState.selectedNotes[0].noteId).toBe('note-1a');
      expect(newState.selectedNotes[1].noteId).toBe('note-2');
    });

    test('addToSelection sets anchor if not already set', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 0,
        addToSelection: true,
      });

      const newState = command.execute(initialState, testScore);

      expect(newState.anchor).not.toBeNull();
      expect(newState.anchor?.eventId).toBe('event-1');
    });

    test('addToSelection preserves existing anchor', () => {
      const existingAnchor = { staffIndex: 0, measureIndex: 0, eventId: 'anchor-event', noteId: 'anchor-note' };
      const existingState: Selection = {
        ...initialState,
        anchor: existingAnchor,
      };

      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 0,
        addToSelection: true,
      });

      const newState = command.execute(existingState, testScore);

      expect(newState.anchor).toBe(existingAnchor);
    });
  });

  describe('edge cases', () => {
    test('returns unchanged state for invalid staff index', () => {
      const command = new SelectEventCommand({
        staffIndex: 99,
        measureIndex: 0,
      });

      const newState = command.execute(initialState, testScore);

      expect(newState).toBe(initialState);
    });

    test('returns unchanged state for invalid measure index', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 99,
      });

      const newState = command.execute(initialState, testScore);

      expect(newState).toBe(initialState);
    });

    test('clamps noteIndex to last note in chord', () => {
      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 0,
        noteIndex: 99, // Way beyond chord size
      });

      const newState = command.execute(initialState, testScore);

      expect(newState.noteId).toBe('note-1b'); // Last note in 2-note chord
    });

    test('handles empty event (no notes)', () => {
      const scoreWithEmptyEvent: Score = {
        ...testScore,
        staves: [
          {
            ...testScore.staves[0],
            measures: [
              {
                id: 'measure-1',
                events: [
                  { id: 'empty-event', isRest: false, duration: 'quarter', dotted: false, notes: [] },
                ],
              },
            ],
          },
        ],
      };

      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 0,
      });

      const newState = command.execute(initialState, scoreWithEmptyEvent);

      expect(newState.eventId).toBe('empty-event');
      expect(newState.noteId).toBeNull();
      // Event is selected even without notes - selectedNotes contains entry with noteId: null
      expect(newState.selectedNotes).toHaveLength(1);
      expect(newState.selectedNotes[0].noteId).toBeNull();
    });

    test('handles empty measure (no events)', () => {
      const emptyMeasureScore = createScoreWithEmptyMeasure();

      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 0,
      });

      const newState = command.execute(initialState, emptyMeasureScore);

      expect(newState.eventId).toBeNull();
      expect(newState.selectedNotes).toHaveLength(0);
    });

    test('replaces selection when addToSelection is false', () => {
      const existingState: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-1',
        noteId: 'note-1a',
        selectedNotes: [
          { staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1a' },
          { staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1b' },
        ],
        anchor: { staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1a' },
      };

      const command = new SelectEventCommand({
        staffIndex: 0,
        measureIndex: 0,
        eventIndex: 1,
        addToSelection: false,
      });

      const newState = command.execute(existingState, testScore);

      expect(newState.selectedNotes).toHaveLength(1);
      expect(newState.selectedNotes[0].noteId).toBe('note-2');
      expect(newState.anchor).toBeNull();
    });
  });
});

describe('NavigateCommand', () => {
  let testScore: Score;
  let engine: SelectionEngine;

  beforeEach(() => {
    testScore = createTestScore();
    engine = new SelectionEngine(
      {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-1',
        noteId: 'note-1a',
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1a' }],
        anchor: null,
      },
      () => testScore
    );
  });

  describe('horizontal navigation', () => {
    test('moves right within measure', () => {
      engine.dispatch(new NavigateCommand('right'));

      const state = engine.getState();
      expect(state.measureIndex).toBe(0);
      expect(state.eventId).toBe('event-2');
    });

    test('moves left within measure', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-2',
        noteId: 'note-2',
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-2', noteId: 'note-2' }],
        anchor: null,
      });

      engine.dispatch(new NavigateCommand('left'));

      expect(engine.getState().eventId).toBe('event-1');
    });

    test('moves to next measure when at end', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-2',
        noteId: 'note-2',
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-2', noteId: 'note-2' }],
        anchor: null,
      });

      engine.dispatch(new NavigateCommand('right'));

      const state = engine.getState();
      expect(state.measureIndex).toBe(1);
      expect(state.eventId).toBe('event-3');
    });

    test('moves to previous measure when at start', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: 1,
        eventId: 'event-3',
        noteId: 'note-3',
        selectedNotes: [{ staffIndex: 0, measureIndex: 1, eventId: 'event-3', noteId: 'note-3' }],
        anchor: null,
      });

      engine.dispatch(new NavigateCommand('left'));

      const state = engine.getState();
      expect(state.measureIndex).toBe(0);
      expect(state.eventId).toBe('event-2'); // Last event in previous measure
    });

    test('clears anchor on navigation', () => {
      engine.setState({
        ...engine.getState(),
        anchor: { staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1a' },
      });

      engine.dispatch(new NavigateCommand('right'));

      expect(engine.getState().anchor).toBeNull();
    });
  });

  describe('vertical navigation - chord cycling', () => {
    test('moves down cycles through chord notes', () => {
      engine.dispatch(new NavigateCommand('down'));

      const state = engine.getState();
      expect(state.eventId).toBe('event-1');
      expect(state.noteId).toBe('note-1b');
    });

    test('moves up cycles through chord notes', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-1',
        noteId: 'note-1b',
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1b' }],
        anchor: null,
      });

      engine.dispatch(new NavigateCommand('up'));

      expect(engine.getState().noteId).toBe('note-1a');
    });

    test('down wraps from last note to first', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-1',
        noteId: 'note-1b', // Last note
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-1', noteId: 'note-1b' }],
        anchor: null,
      });

      engine.dispatch(new NavigateCommand('down'));

      expect(engine.getState().noteId).toBe('note-1a'); // Wrapped to first
    });

    test('up wraps from first note to last', () => {
      engine.dispatch(new NavigateCommand('up'));

      expect(engine.getState().noteId).toBe('note-1b'); // Wrapped to last
    });
  });

  describe('edge cases', () => {
    test('no change on single-note event for vertical navigation', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'event-2',
        noteId: 'note-2',
        selectedNotes: [{ staffIndex: 0, measureIndex: 0, eventId: 'event-2', noteId: 'note-2' }],
        anchor: null,
      });

      const stateBefore = engine.getState();
      engine.dispatch(new NavigateCommand('down'));

      expect(engine.getState().noteId).toBe(stateBefore.noteId); // Unchanged
    });

    test('no change when staff is invalid', () => {
      const emptyScore = createEmptyScore();
      engine = new SelectionEngine(engine.getState(), () => emptyScore);

      const stateBefore = engine.getState();
      engine.dispatch(new NavigateCommand('right'));

      expect(engine.getState()).toBe(stateBefore);
    });

    test('no change when measureIndex is null', () => {
      engine.setState({
        staffIndex: 0,
        measureIndex: null,
        eventId: null,
        noteId: null,
        selectedNotes: [],
        anchor: null,
      });

      const stateBefore = engine.getState();
      engine.dispatch(new NavigateCommand('up'));

      expect(engine.getState()).toBe(stateBefore);
    });

    test('updates selectedNotes on navigation', () => {
      engine.dispatch(new NavigateCommand('right'));

      const state = engine.getState();
      expect(state.selectedNotes).toHaveLength(1);
      expect(state.selectedNotes[0].eventId).toBe('event-2');
    });
  });
});

