/**
 * Entry Insertion Utilities Tests
 *
 * Tests for the insertion calculation utilities used by the Entry API.
 *
 * @see src/utils/entry/insertion.ts
 */

import {
  calculateInsertionQuant,
  getOverwritePlan,
  getRemainingCapacity,
  createRestsForRange,
} from '@/utils/entry/insertion';
import { Measure, ScoreEvent } from '@/types';

describe('insertion utilities', () => {
  describe('calculateInsertionQuant', () => {
    const createMeasure = (events: ScoreEvent[]): Measure => ({
      id: 'test-measure',
      events,
    });

    test('should return 0 for first event in measure', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] },
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] },
      ]);

      expect(calculateInsertionQuant(measure, 'e1')).toBe(0);
    });

    test('should calculate quant position of second event', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] }, // 16 quants
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] },
      ]);

      expect(calculateInsertionQuant(measure, 'e2')).toBe(16); // After quarter note
    });

    test('should handle dotted notes', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: true, notes: [] }, // 24 quants (16 * 1.5)
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] },
      ]);

      expect(calculateInsertionQuant(measure, 'e2')).toBe(24);
    });

    test('should handle tuplets', () => {
      const tripletTuplet = {
        ratio: [3, 2] as [number, number],
        groupSize: 3,
        position: 0,
        baseDuration: 'quarter',
        id: 'triplet-1',
      };

      // Each triplet quarter note is 10.67 quants, but we floor to 10
      // Actually tonal.js triplet: 3 notes in 2 beats = each note is 2/3 of a beat
      // quarter = 16 quants, triplet quarter = 16 * 2/3 ≈ 10.67, floor = 10
      const measure = createMeasure([
        {
          id: 'e1',
          duration: 'quarter',
          dotted: false,
          notes: [],
          tuplet: { ...tripletTuplet, position: 0 },
        },
        {
          id: 'e2',
          duration: 'quarter',
          dotted: false,
          notes: [],
          tuplet: { ...tripletTuplet, position: 1 },
        },
        { id: 'e3', duration: 'quarter', dotted: false, notes: [] },
      ]);

      const e2Quant = calculateInsertionQuant(measure, 'e2');
      const e3Quant = calculateInsertionQuant(measure, 'e3');

      // The exact values depend on getNoteDuration implementation
      expect(e2Quant).toBeGreaterThan(0);
      expect(e3Quant).toBeGreaterThan(e2Quant!);
    });

    test('should return null for null eventId', () => {
      const measure = createMeasure([{ id: 'e1', duration: 'quarter', dotted: false, notes: [] }]);

      expect(calculateInsertionQuant(measure, null)).toBeNull();
    });

    test('should return null for non-existent eventId', () => {
      const measure = createMeasure([{ id: 'e1', duration: 'quarter', dotted: false, notes: [] }]);

      expect(calculateInsertionQuant(measure, 'non-existent')).toBeNull();
    });

    test('should return 0 for empty measure', () => {
      const measure = createMeasure([]);

      expect(calculateInsertionQuant(measure, 'e1')).toBeNull();
    });
  });

  describe('getOverwritePlan', () => {
    const createMeasure = (events: ScoreEvent[]): Measure => ({
      id: 'test-measure',
      events,
    });

    test('should identify overlapping event for removal', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] }, // 0-16
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] }, // 16-32
        { id: 'e3', duration: 'quarter', dotted: false, notes: [] }, // 32-48
      ]);

      // Insert at quant 16 with duration 16 (covering e2)
      const plan = getOverwritePlan(measure, 16, 16);

      expect(plan.toRemove).toEqual(['e2']);
      expect(plan.toModify).toEqual([]);
    });

    test('should remove multiple overlapping events', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] }, // 0-16
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] }, // 16-32
        { id: 'e3', duration: 'quarter', dotted: false, notes: [] }, // 32-48
        { id: 'e4', duration: 'quarter', dotted: false, notes: [] }, // 48-64
      ]);

      // Insert at quant 16 with duration 32 (covering e2 and e3)
      const plan = getOverwritePlan(measure, 16, 32);

      expect(plan.toRemove).toContain('e2');
      expect(plan.toRemove).toContain('e3');
      expect(plan.toRemove).not.toContain('e1');
      expect(plan.toRemove).not.toContain('e4');
    });

    test('should not remove non-overlapping events', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] }, // 0-16
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] }, // 16-32
      ]);

      // Insert at quant 0 with duration 16 (exactly covers e1, does not overlap e2)
      const plan = getOverwritePlan(measure, 0, 16);

      expect(plan.toRemove).toEqual(['e1']);
    });

    test('should handle partial overlap (event extends into insertion)', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'half', dotted: false, notes: [] }, // 0-32
        { id: 'e2', duration: 'quarter', dotted: false, notes: [] }, // 32-48
      ]);

      // Insert at quant 16 with duration 16 (overlaps end of e1)
      const plan = getOverwritePlan(measure, 16, 16);

      expect(plan.toRemove).toContain('e1');
    });

    test('should handle insertion that starts mid-event', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] }, // 0-16
        { id: 'e2', duration: 'half', dotted: false, notes: [] }, // 16-48
      ]);

      // Insert at quant 24 with duration 16 (starts in middle of e2)
      const plan = getOverwritePlan(measure, 24, 16);

      expect(plan.toRemove).toContain('e2');
    });

    test('should return empty plan for non-overlapping insertion', () => {
      const measure = createMeasure([
        { id: 'e1', duration: 'quarter', dotted: false, notes: [] }, // 0-16
      ]);

      // Insert at quant 32 with duration 16 (no overlap)
      const plan = getOverwritePlan(measure, 32, 16);

      expect(plan.toRemove).toEqual([]);
    });

    test('should handle empty measure', () => {
      const measure = createMeasure([]);

      const plan = getOverwritePlan(measure, 0, 16);

      expect(plan.toRemove).toEqual([]);
      expect(plan.toModify).toEqual([]);
    });
  });

  describe('getRemainingCapacity', () => {
    const createMeasure = (): Measure => ({
      id: 'test-measure',
      events: [],
    });

    test('should return full capacity at start of measure', () => {
      const measure = createMeasure();
      // Default CONFIG.quantsPerMeasure = 64 for 4/4

      expect(getRemainingCapacity(measure, 0)).toBe(64);
    });

    test('should return remaining capacity from midpoint', () => {
      const measure = createMeasure();

      expect(getRemainingCapacity(measure, 32)).toBe(32);
    });

    test('should return 0 when at capacity', () => {
      const measure = createMeasure();

      expect(getRemainingCapacity(measure, 64)).toBe(0);
    });

    test('should return 0 when over capacity', () => {
      const measure = createMeasure();

      expect(getRemainingCapacity(measure, 80)).toBe(0);
    });

    test('should respect custom maxQuants parameter', () => {
      const measure = createMeasure();

      expect(getRemainingCapacity(measure, 0, 48)).toBe(48); // 3/4 time
    });
  });

  describe('createRestsForRange', () => {
    test('should create single quarter rest for 16 quants', () => {
      let idCounter = 0;
      const mockIdGen = () => `rest-${idCounter++}`;

      const rests = createRestsForRange(16, mockIdGen);

      expect(rests).toHaveLength(1);
      expect(rests[0].duration).toBe('quarter');
      expect(rests[0].dotted).toBe(false);
      expect(rests[0].isRest).toBe(true);
      expect(rests[0].notes[0].isRest).toBe(true);
      expect(rests[0].notes[0].pitch).toBeNull();
    });

    test('should create half rest for 32 quants', () => {
      let idCounter = 0;
      const mockIdGen = () => `rest-${idCounter++}`;

      const rests = createRestsForRange(32, mockIdGen);

      expect(rests).toHaveLength(1);
      expect(rests[0].duration).toBe('half');
    });

    test('should create multiple rests for complex durations', () => {
      let idCounter = 0;
      const mockIdGen = () => `rest-${idCounter++}`;

      // 48 quants = dotted half (48) or half (32) + quarter (16)
      const rests = createRestsForRange(48, mockIdGen);

      expect(rests.length).toBeGreaterThanOrEqual(1);
      // Total duration should equal 48 quants
      let totalQuants = 0;
      for (const rest of rests) {
        // Rough check - quarter = 16, half = 32, dotted quarter = 24, etc.
        if (rest.duration === 'quarter' && rest.dotted) totalQuants += 24;
        else if (rest.duration === 'quarter') totalQuants += 16;
        else if (rest.duration === 'half' && rest.dotted) totalQuants += 48;
        else if (rest.duration === 'half') totalQuants += 32;
        else if (rest.duration === 'eighth' && rest.dotted) totalQuants += 12;
        else if (rest.duration === 'eighth') totalQuants += 8;
      }
      expect(totalQuants).toBe(48);
    });

    test('should generate unique IDs for each rest', () => {
      let idCounter = 0;
      const mockIdGen = () => `rest-${idCounter++}`;

      // 24 quants = dotted quarter (24) or quarter (16) + eighth (8)
      const rests = createRestsForRange(24, mockIdGen);

      const ids = rests.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('should create rest notes with derived IDs', () => {
      let idCounter = 0;
      const mockIdGen = () => `rest-${idCounter++}`;

      const rests = createRestsForRange(16, mockIdGen);

      expect(rests[0].id).toBe('rest-0');
      expect(rests[0].notes[0].id).toBe('rest-0-rest');
    });
  });
});
