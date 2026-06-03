/**
 * Tests for measure index conversion utilities.
 *
 * @see src/utils/measureIndex.ts
 */

import {
  toDisplayMeasureNumber,
  toInternalMeasureIndex,
  isValidMeasureIndex,
  clampMeasureIndex,
} from '@/utils/measureIndex';

describe('Measure Index Utilities', () => {
  describe('toDisplayMeasureNumber', () => {
    it('converts 0 to 1 (first measure)', () => {
      expect(toDisplayMeasureNumber(0)).toBe(1);
    });

    it('converts 5 to 6', () => {
      expect(toDisplayMeasureNumber(5)).toBe(6);
    });

    it('converts large indices correctly', () => {
      expect(toDisplayMeasureNumber(99)).toBe(100);
    });
  });

  describe('toInternalMeasureIndex', () => {
    it('converts 1 to 0 (first measure)', () => {
      expect(toInternalMeasureIndex(1)).toBe(0);
    });

    it('converts 6 to 5', () => {
      expect(toInternalMeasureIndex(6)).toBe(5);
    });

    it('converts large numbers correctly', () => {
      expect(toInternalMeasureIndex(100)).toBe(99);
    });
  });

  describe('round-trip conversion', () => {
    it('toDisplay(toInternal(n)) equals n', () => {
      for (let n = 1; n <= 10; n++) {
        expect(toDisplayMeasureNumber(toInternalMeasureIndex(n))).toBe(n);
      }
    });

    it('toInternal(toDisplay(n)) equals n', () => {
      for (let n = 0; n < 10; n++) {
        expect(toInternalMeasureIndex(toDisplayMeasureNumber(n))).toBe(n);
      }
    });
  });

  describe('isValidMeasureIndex', () => {
    const measureCount = 4;

    it('returns true for valid indices within bounds', () => {
      expect(isValidMeasureIndex(0, measureCount)).toBe(true);
      expect(isValidMeasureIndex(1, measureCount)).toBe(true);
      expect(isValidMeasureIndex(2, measureCount)).toBe(true);
      expect(isValidMeasureIndex(3, measureCount)).toBe(true);
    });

    it('returns false for negative index', () => {
      expect(isValidMeasureIndex(-1, measureCount)).toBe(false);
      expect(isValidMeasureIndex(-100, measureCount)).toBe(false);
    });

    it('returns false for index >= count', () => {
      expect(isValidMeasureIndex(4, measureCount)).toBe(false);
      expect(isValidMeasureIndex(5, measureCount)).toBe(false);
      expect(isValidMeasureIndex(100, measureCount)).toBe(false);
    });

    it('returns false for non-integer values', () => {
      expect(isValidMeasureIndex(0.5, measureCount)).toBe(false);
      expect(isValidMeasureIndex(1.5, measureCount)).toBe(false);
      expect(isValidMeasureIndex(2.999, measureCount)).toBe(false);
    });

    it('returns true for integer 0 even with measureCount 1', () => {
      expect(isValidMeasureIndex(0, 1)).toBe(true);
    });

    it('returns false when measureCount is 0', () => {
      expect(isValidMeasureIndex(0, 0)).toBe(false);
    });
  });

  describe('clampMeasureIndex', () => {
    const measureCount = 4;

    it('returns 0 for negative indices', () => {
      expect(clampMeasureIndex(-1, measureCount)).toBe(0);
      expect(clampMeasureIndex(-100, measureCount)).toBe(0);
    });

    it('returns measureCount-1 for indices exceeding bounds', () => {
      expect(clampMeasureIndex(4, measureCount)).toBe(3);
      expect(clampMeasureIndex(5, measureCount)).toBe(3);
      expect(clampMeasureIndex(100, measureCount)).toBe(3);
    });

    it('returns the index unchanged when within bounds', () => {
      expect(clampMeasureIndex(0, measureCount)).toBe(0);
      expect(clampMeasureIndex(1, measureCount)).toBe(1);
      expect(clampMeasureIndex(2, measureCount)).toBe(2);
      expect(clampMeasureIndex(3, measureCount)).toBe(3);
    });

    it('handles single-measure scores', () => {
      expect(clampMeasureIndex(-1, 1)).toBe(0);
      expect(clampMeasureIndex(0, 1)).toBe(0);
      expect(clampMeasureIndex(1, 1)).toBe(0);
    });
  });
});
