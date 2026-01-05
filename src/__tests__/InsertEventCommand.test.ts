/**
 * InsertEventCommand Tests
 *
 * Tests for the InsertEventCommand which inserts complete ScoreEvent objects
 * into measures, preserving all properties including tuplet metadata.
 *
 * @see InsertEventCommand
 * @see ADR-014: Complete Event Objects
 */

import { InsertEventCommand } from '@/commands/InsertEventCommand';
import { Score, ScoreEvent, createDefaultScore } from '@/types';

describe('InsertEventCommand', () => {
  let baseScore: Score;

  beforeEach(() => {
    baseScore = createDefaultScore();
    // Start with 2 events in the first measure
    baseScore.staves[0].measures[0].events = [
      { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
      { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
    ];
  });

  describe('execute', () => {
    test('should append event when insertIndex is undefined', () => {
      const newEvent: ScoreEvent = {
        id: 'e3',
        duration: 'half',
        dotted: false,
        notes: [{ id: 'n3', pitch: 'E4' }],
      };

      const command = new InsertEventCommand(0, newEvent);
      const newScore = command.execute(baseScore);

      const events = newScore.staves[0].measures[0].events;
      expect(events).toHaveLength(3);
      expect(events[2].id).toBe('e3');
      expect(events[2].duration).toBe('half');
    });

    test('should insert event at specific index', () => {
      const newEvent: ScoreEvent = {
        id: 'e3',
        duration: 'eighth',
        dotted: true,
        notes: [{ id: 'n3', pitch: 'F4' }],
      };

      const command = new InsertEventCommand(0, newEvent, 1);
      const newScore = command.execute(baseScore);

      const events = newScore.staves[0].measures[0].events;
      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('e1');
      expect(events[1].id).toBe('e3'); // Inserted at index 1
      expect(events[2].id).toBe('e2'); // Pushed to index 2
    });

    test('should insert at beginning (index 0)', () => {
      const newEvent: ScoreEvent = {
        id: 'e0',
        duration: 'whole',
        dotted: false,
        notes: [{ id: 'n0', pitch: 'B3' }],
      };

      const command = new InsertEventCommand(0, newEvent, 0);
      const newScore = command.execute(baseScore);

      const events = newScore.staves[0].measures[0].events;
      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('e0');
      expect(events[1].id).toBe('e1');
      expect(events[2].id).toBe('e2');
    });

    test('should preserve tuplet metadata on inserted event', () => {
      const tupletEvent: ScoreEvent = {
        id: 'tuplet-1',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'tn1', pitch: 'G4' }],
        tuplet: {
          id: 'tuplet-group-1',
          ratio: [3, 2] as [number, number],
          groupSize: 3,
          position: 0,
          baseDuration: 'quarter',
        },
      };

      const command = new InsertEventCommand(0, tupletEvent, 0);
      const newScore = command.execute(baseScore);

      const insertedEvent = newScore.staves[0].measures[0].events[0];
      expect(insertedEvent.tuplet).toBeDefined();
      expect(insertedEvent.tuplet?.id).toBe('tuplet-group-1');
      expect(insertedEvent.tuplet?.ratio).toEqual([3, 2]);
      expect(insertedEvent.tuplet?.groupSize).toBe(3);
      expect(insertedEvent.tuplet?.position).toBe(0);
    });

    test('should preserve tied property on inserted event', () => {
      const tiedEvent: ScoreEvent = {
        id: 'tied-1',
        duration: 'half',
        dotted: false,
        notes: [{ id: 'tn1', pitch: 'A4', tied: true }],
      };

      const command = new InsertEventCommand(0, tiedEvent, 0);
      const newScore = command.execute(baseScore);

      const insertedEvent = newScore.staves[0].measures[0].events[0];
      expect(insertedEvent.notes[0].tied).toBe(true);
    });

    test('should deep clone event to prevent mutation', () => {
      const originalEvent: ScoreEvent = {
        id: 'mutable',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'mn1', pitch: 'C5' }],
      };

      const command = new InsertEventCommand(0, originalEvent, 0);
      const newScore = command.execute(baseScore);

      // Mutate original
      originalEvent.duration = 'whole';
      originalEvent.notes[0].pitch = 'D5';

      // Inserted event should be unaffected
      const insertedEvent = newScore.staves[0].measures[0].events[0];
      expect(insertedEvent.duration).toBe('quarter');
      expect(insertedEvent.notes[0].pitch).toBe('C5');
    });

    test('should handle insertion into empty measure', () => {
      baseScore.staves[0].measures[0].events = [];

      const newEvent: ScoreEvent = {
        id: 'first',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'fn1', pitch: 'C4' }],
      };

      const command = new InsertEventCommand(0, newEvent, 0);
      const newScore = command.execute(baseScore);

      const events = newScore.staves[0].measures[0].events;
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('first');
    });

    test('should handle insertIndex beyond array length (append behavior)', () => {
      const newEvent: ScoreEvent = {
        id: 'appended',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'an1', pitch: 'E4' }],
      };

      const command = new InsertEventCommand(0, newEvent, 999);
      const newScore = command.execute(baseScore);

      const events = newScore.staves[0].measures[0].events;
      expect(events).toHaveLength(3);
      expect(events[2].id).toBe('appended');
    });

    test('should work with different staff index', () => {
      // The default score already has a bass staff at index 1
      // Just verify we can insert into it
      const newEvent: ScoreEvent = {
        id: 'bass-event',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'bn1', pitch: 'E2' }],
      };

      const command = new InsertEventCommand(0, newEvent, 0, 1);
      const newScore = command.execute(baseScore);

      // Staff 0 should be unchanged
      expect(newScore.staves[0].measures[0].events).toHaveLength(2);
      // Staff 1 should have the new event
      expect(newScore.staves[1].measures[0].events).toHaveLength(1);
      expect(newScore.staves[1].measures[0].events[0].id).toBe('bass-event');
    });

    test('should preserve isRest property', () => {
      const restEvent: ScoreEvent = {
        id: 'rest-1',
        duration: 'quarter',
        dotted: false,
        isRest: true,
        notes: [{ id: 'rn1', pitch: null, isRest: true }],
      };

      const command = new InsertEventCommand(0, restEvent, 0);
      const newScore = command.execute(baseScore);

      const insertedEvent = newScore.staves[0].measures[0].events[0];
      expect(insertedEvent.isRest).toBe(true);
      expect(insertedEvent.notes[0].isRest).toBe(true);
    });

    test('should preserve dotted property', () => {
      const dottedEvent: ScoreEvent = {
        id: 'dotted-1',
        duration: 'half',
        dotted: true,
        notes: [{ id: 'dn1', pitch: 'F4' }],
      };

      const command = new InsertEventCommand(0, dottedEvent, 0);
      const newScore = command.execute(baseScore);

      const insertedEvent = newScore.staves[0].measures[0].events[0];
      expect(insertedEvent.dotted).toBe(true);
    });

    test('should preserve chord (multiple notes)', () => {
      const chordEvent: ScoreEvent = {
        id: 'chord-1',
        duration: 'quarter',
        dotted: false,
        notes: [
          { id: 'cn1', pitch: 'C4' },
          { id: 'cn2', pitch: 'E4' },
          { id: 'cn3', pitch: 'G4' },
        ],
      };

      const command = new InsertEventCommand(0, chordEvent, 0);
      const newScore = command.execute(baseScore);

      const insertedEvent = newScore.staves[0].measures[0].events[0];
      expect(insertedEvent.notes).toHaveLength(3);
      expect(insertedEvent.notes.map((n) => n.pitch)).toEqual(['C4', 'E4', 'G4']);
    });
  });

  describe('undo', () => {
    test('should remove inserted event by id', () => {
      const newEvent: ScoreEvent = {
        id: 'to-remove',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'rn1', pitch: 'G4' }],
      };

      const command = new InsertEventCommand(0, newEvent, 1);
      const afterInsert = command.execute(baseScore);

      expect(afterInsert.staves[0].measures[0].events).toHaveLength(3);

      const afterUndo = command.undo(afterInsert);

      expect(afterUndo.staves[0].measures[0].events).toHaveLength(2);
      expect(
        afterUndo.staves[0].measures[0].events.find((e) => e.id === 'to-remove')
      ).toBeUndefined();
    });

    test('should restore original order after undo', () => {
      const newEvent: ScoreEvent = {
        id: 'middle-insert',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'mn1', pitch: 'A4' }],
      };

      const command = new InsertEventCommand(0, newEvent, 1);
      const afterInsert = command.execute(baseScore);
      const afterUndo = command.undo(afterInsert);

      const events = afterUndo.staves[0].measures[0].events;
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('e1');
      expect(events[1].id).toBe('e2');
    });

    test('should handle undo on different staff', () => {
      // Pre-populate the bass staff with an event
      baseScore.staves[1].measures[0].events = [
        { id: 'bass-1', duration: 'quarter', dotted: false, notes: [] },
      ];

      const newEvent: ScoreEvent = {
        id: 'bass-new',
        duration: 'half',
        dotted: false,
        notes: [{ id: 'bn1', pitch: 'G2' }],
      };

      const command = new InsertEventCommand(0, newEvent, 0, 1);
      const afterInsert = command.execute(baseScore);

      // After insert: ['bass-new', 'bass-1']
      expect(afterInsert.staves[1].measures[0].events).toHaveLength(2);

      const afterUndo = command.undo(afterInsert);

      // After undo: ['bass-1' only]
      expect(afterUndo.staves[1].measures[0].events).toHaveLength(1);
      expect(afterUndo.staves[1].measures[0].events[0].id).toBe('bass-1');
    });
  });

  describe('edge cases', () => {
    test('should handle negative insertIndex by appending', () => {
      const newEvent: ScoreEvent = {
        id: 'negative-index',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'nn1', pitch: 'B4' }],
      };

      // Negative index should trigger append behavior
      const command = new InsertEventCommand(0, newEvent, -1);
      const newScore = command.execute(baseScore);

      const events = newScore.staves[0].measures[0].events;
      expect(events).toHaveLength(3);
      // Should be appended (same as undefined insertIndex)
      expect(events[2].id).toBe('negative-index');
    });

    test('should return unchanged score if measure does not exist', () => {
      const newEvent: ScoreEvent = {
        id: 'orphan',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'on1', pitch: 'C4' }],
      };

      const command = new InsertEventCommand(99, newEvent, 0);
      const newScore = command.execute(baseScore);

      // updateMeasure should handle this gracefully
      expect(newScore.staves[0].measures[0].events).toHaveLength(2);
    });

    test('should return unchanged score if staff does not exist', () => {
      const newEvent: ScoreEvent = {
        id: 'orphan',
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'on1', pitch: 'C4' }],
      };

      const command = new InsertEventCommand(0, newEvent, 0, 99);
      const newScore = command.execute(baseScore);

      expect(newScore.staves[0].measures[0].events).toHaveLength(2);
    });
  });
});
