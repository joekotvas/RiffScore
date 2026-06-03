/**
 * useCursorLayout.test.ts
 *
 * Tests for the playback cursor layout hook.
 * @tested src/hooks/layout/useCursorLayout.ts
 */
import { renderHook } from '@testing-library/react';
import { useCursorLayout } from '@/hooks/layout/useCursorLayout';
import { ScoreLayout, StaffLayout, YBounds } from '@/engines/layout/types';
import { CONFIG } from '@/config';

// Helper to create mock getX function matching the new API
const createMockGetX = (measureOrigins: number[] = []) => {
  const getX = (_params: { measure: number; quant: number }): number | null => null;
  getX.measureOrigin = (params: { measure: number }): number | null =>
    measureOrigins[params.measure] ?? null;
  return getX;
};

// Helper to create mock getY function
const createMockGetY = (): ScoreLayout['getY'] => {
  const staffHeight = CONFIG.lineHeight * 4;
  const bounds: YBounds = { top: CONFIG.baseY, bottom: CONFIG.baseY + staffHeight };
  return {
    content: bounds,
    system: (index: number) => (index === 0 ? bounds : null),
    staff: (index: number) => (index === 0 ? bounds : null),
    notes: () => bounds,
    pitch: () => null,
  };
};

describe('useCursorLayout', () => {
  const createEmptyLayout = (): ScoreLayout => ({
    staves: [],
    notes: {},
    events: {},
    getX: createMockGetX(),
    getY: createMockGetY(),
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
    getX: createMockGetX([80]),
    getY: createMockGetY(),
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
    getX: createMockGetX([80, 200]),
    getY: createMockGetY(),
  });

  describe('basic behavior', () => {
    it('should return null cursor for empty layout', () => {
      const layout = createEmptyLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      expect(result.current.measure).toBeNull();
      expect(result.current.x).toBeNull();
      expect(result.current.isGrandStaff).toBe(false);
      expect(result.current.numStaves).toBe(0);
    });

    it('should return valid cursor even for single staff layout (unified logic)', () => {
      const singleLayout = createSingleStaffLayout();

      const { result } = renderHook(() =>
        useCursorLayout(singleLayout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // Single staff SHOULD use unified cursor now
      // NOTE: First event (quant 0) now force-starts at 0 relative to measure to cover header
      // X is now measure-relative, so 0 instead of 80 (measureOrigin)
      expect(result.current.measure).toBe(0);
      expect(result.current.x).toBe(0);
      expect(result.current.isGrandStaff).toBe(false);
      expect(result.current.numStaves).toBe(1);
    });

    it('should return null when playback position is null', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: null, quant: null, duration: 0 })
      );

      expect(result.current.measure).toBeNull();
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

      // x is now measure-relative (0 for first event due to header sweep fix)
      // measureOrigin would be 80, but x itself is 0
      expect(result.current.measure).toBe(0);
      expect(result.current.x).toBe(0);
    });

    it('should calculate cursor position at second event', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 24, duration: 0.1 })
      );

      // x is now measure-relative: 60 (not 80 + 60)
      expect(result.current.measure).toBe(0);
      expect(result.current.x).toBe(60);
    });

    it('should calculate cursor width based on next event', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // Width should be gap between start (0) and next event (60)
      // 60 - 0 = 60
      expect(result.current.width).toBe(60);
    });

    it('should handle cursor at second measure', () => {
      const layout = createGrandStaffLayout();
      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 1, quant: 0, duration: 0.1 })
      );

      // x is now measure-relative (0 for first event due to header sweep fix)
      // measureOrigin would be 200, but x itself is 0
      expect(result.current.measure).toBe(1);
      expect(result.current.x).toBe(0);
    });
    it('should calculate cursor position for interleaved events across staves', () => {
      // Setup: Staff 0 has event at 0 and 48. Staff 1 has event at 24.
      // Quant 24 should map to Staff 1's event position.
      const mixedLayout: ScoreLayout = {
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
                  eventPositions: { s0e1: 20, s0e2: 80 },
                  processedEvents: [
                    { id: 's0e1', duration: 'half', quant: 0 },
                    { id: 's0e2', duration: 'half', quant: 48 },
                  ],
                },
              },
            ],
          } as any,
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
                legacyLayout: {
                  eventPositions: { s1e1: 50 },
                  processedEvents: [{ id: 's1e1', duration: 'quarter', quant: 24 }],
                },
              },
            ],
          } as any,
        ],
        notes: {},
        events: {},
        getX: createMockGetX([80]),
        getY: createMockGetY(),
      };

      const { result } = renderHook(() =>
        useCursorLayout(mixedLayout, { measureIndex: 0, quant: 24, duration: 0.1 })
      );

      // x is now measure-relative: 50 (the event position from Staff 1)
      // measureOrigin would be 80, but x itself is just the relative position
      expect(result.current.measure).toBe(0);
      expect(result.current.x).toBe(50);
    });

    it('should target NEXT event when playing to drive smooth animation', () => {
      // Logic: If at Quant 0 (Start of Event 1), and playing...
      // Cursor should target End of Event 1 (Start of Event 2)
      // So CSS transition animates 0 -> End during the note duration.

      const layout = createGrandStaffLayout();
      // Layout has event 1 at +20 (Quant 0), event 2 at +60 (Quant 24).

      // Test Paused (Default) - Should target Current Event
      // x is now measure-relative: 0 (force start for first event)
      const { result: pausedResult } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.5 }, false)
      );
      expect(pausedResult.current.measure).toBe(0);
      expect(pausedResult.current.x).toBe(0);

      // Test Playing - Should target Next Event
      // x is now measure-relative: 60 (the next event position)
      const { result: playingResult } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.5 }, true)
      );
      expect(playingResult.current.measure).toBe(0);
      expect(playingResult.current.x).toBe(60);
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
        getX: createMockGetX([80]),
        getY: createMockGetY(),
      };

      const { result } = renderHook(() =>
        useCursorLayout(layout, { measureIndex: 0, quant: 0, duration: 0.1 })
      );

      // Should fall back gracefully - x is now measure-relative (0)
      expect(result.current.measure).toBe(0);
      expect(result.current.x).toBe(0);
      expect(result.current.width).toBe(120); // Full measure width
    });
  });
});
