/**
 * useCursorLayout.test.ts
 *
 * Tests for the playback cursor layout hook.
 * @tested src/hooks/layout/useCursorLayout.ts
 */
import { renderHook } from '@testing-library/react';
import { useCursorLayout } from '@/hooks/layout/useCursorLayout';
import { ScoreLayout, StaffLayout } from '@/engines/layout/types';

describe('useCursorLayout', () => {
  const createEmptyLayout = (): ScoreLayout => ({
    staves: [],
    notes: {},
    events: {},
  });

  const createSingleStaffLayout = (): ScoreLayout => ({
    staves: [
      {
        y: 100,
        index: 0,
        measures: [
          {
            x: 80,
            y: 100,
            width: 120,
            events: {},
            beamGroups: [],
            tupletGroups: [],
            legacyLayout: {
              hitZones: [],
              eventPositions: { e1: 20 },
              totalWidth: 120,
              processedEvents: [
                { id: 'e1', duration: 'quarter', dotted: false, notes: [], quant: 0 },
              ],
            },
          },
        ],
      } as StaffLayout,
    ],
    notes: {},
    events: {},
  });

  const createGrandStaffLayout = (): ScoreLayout => ({
    staves: [
      {
        y: 100,
        index: 0,
        measures: [
          {
            x: 80,
            y: 100,
            width: 120,
            events: {},
            beamGroups: [],
            tupletGroups: [],
            legacyLayout: {
              hitZones: [],
              eventPositions: { e1: 20, e2: 60 },
              totalWidth: 120,
              processedEvents: [
                { id: 'e1', duration: 'quarter', dotted: false, notes: [], quant: 0 },
                { id: 'e2', duration: 'quarter', dotted: false, notes: [], quant: 24 },
              ],
            },
          },
          {
            x: 200,
            y: 100,
            width: 120,
            events: {},
            beamGroups: [],
            tupletGroups: [],
            legacyLayout: {
              hitZones: [],
              eventPositions: { e3: 20 },
              totalWidth: 120,
              processedEvents: [
                { id: 'e3', duration: 'quarter', dotted: false, notes: [], quant: 0 },
              ],
            },
          },
        ],
      } as StaffLayout,
      {
        y: 200,
        index: 1,
        measures: [
          {
            x: 80,
            y: 200,
            width: 120,
            events: {},
            beamGroups: [],
            tupletGroups: [],
          },
        ],
      } as StaffLayout,
    ],
    notes: {},
    events: {},
  });

  describe('basic behavior', () => {
    it('should return null cursor for empty layout', () => {
      const layout = createEmptyLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      expect(result.current.x).toBeNull();
      expect(result.current.isGrandStaff).toBe(false);
      expect(result.current.numStaves).toBe(0);
    });

    it('should return null cursor for single staff layout', () => {
      const layout = createSingleStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // Single staff doesn't need unified cursor
      expect(result.current.x).toBeNull();
      expect(result.current.isGrandStaff).toBe(false);
      expect(result.current.numStaves).toBe(1);
    });

    it('should return null when playback position is null', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: null, quant: null, duration: 0 })
      );

      expect(result.current.x).toBeNull();
    });
  });

  describe('grand staff cursor positioning', () => {
    it('should detect grand staff layout', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      expect(result.current.isGrandStaff).toBe(true);
      expect(result.current.numStaves).toBe(2);
    });

    it('should calculate cursor x position at first event', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // x should be measureX + eventPosition
      expect(result.current.x).toBe(80 + 20); // 100
    });

    it('should calculate cursor position at second event', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 24, duration: 0.1 })
      );

      expect(result.current.x).toBe(80 + 60); // 140
    });

    it('should calculate cursor width based on next event', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // Width should be gap between events (60 - 20 = 40)
      expect(result.current.width).toBe(40);
    });

    it('should handle cursor at second measure', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 1, quant: 0, duration: 0.1 })
      );

      // Second measure starts at x: 200, first event at +20
      expect(result.current.x).toBe(200 + 20); // 220
    });
  });

  describe('edge cases', () => {
    it('should provide minimum cursor width for last event', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 24, duration: 0.1 })
      );

      // Last event should have at least 20px width
      expect(result.current.width).toBeGreaterThanOrEqual(20);
    });

    it('should handle measure with no legacyLayout gracefully', () => {
      const layout: ScoreLayout = {
        staves: [
          {
            y: 100,
            index: 0,
            measures: [{ x: 80, y: 100, width: 120, events: {}, beamGroups: [], tupletGroups: [] }],
          } as StaffLayout,
          {
            y: 200,
            index: 1,
            measures: [{ x: 80, y: 200, width: 120, events: {}, beamGroups: [], tupletGroups: [] }],
          } as StaffLayout,
        ],
        notes: {},
        events: {},
      };

      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // Should fall back gracefully
      expect(result.current.x).toBe(80); // Just measure x
      expect(result.current.width).toBe(20); // Default width
    });
  });
});
