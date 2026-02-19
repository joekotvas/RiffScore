/**
 * useZoomDrag.test.ts
 *
 * Tests for the useZoomDrag hook that provides Figma-style drag-to-zoom.
 */

import { renderHook, act } from '@testing-library/react';
import { useZoomDrag } from '@hooks/interaction/useZoomDrag';

describe('useZoomDrag', () => {
  const createMockMouseEvent = (clientX: number): React.MouseEvent => ({
    clientX,
    preventDefault: jest.fn(),
  } as unknown as React.MouseEvent);

  describe('initial state', () => {
    it('returns isDragging false initially', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      expect(result.current.isDragging).toBe(false);
    });

    it('returns default cursor initially', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      expect(result.current.cursor).toBe('default');
    });
  });

  describe('drag initiation', () => {
    it('sets isDragging to true on mouseDown', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      expect(result.current.isDragging).toBe(true);
    });

    it('sets cursor to ew-resize on mouseDown', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      expect(result.current.cursor).toBe('ew-resize');
    });

    it('prevents default on mouseDown', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      const mockEvent = createMockMouseEvent(100);
      act(() => {
        result.current.handleMouseDown(mockEvent);
      });

      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });
  });

  describe('drag behavior', () => {
    it('calls onChange when mouse moves right (increase)', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange, step: 1 })
      );

      // Start drag at x=100
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      // Move right to x=110 (delta = +10)
      act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 110 });
        document.dispatchEvent(moveEvent);
      });

      expect(onChange).toHaveBeenCalledWith(110);
    });

    it('calls onChange when mouse moves left (decrease)', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange, step: 1 })
      );

      // Start drag at x=100
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      // Move left to x=90 (delta = -10)
      act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 90 });
        document.dispatchEvent(moveEvent);
      });

      expect(onChange).toHaveBeenCalledWith(90);
    });

    it('clamps value to min', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 50, onChange, min: 25, step: 1 })
      );

      // Start drag at x=100
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      // Move far left (would be negative)
      act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 0 });
        document.dispatchEvent(moveEvent);
      });

      // Should clamp to min of 25
      expect(onChange).toHaveBeenCalledWith(25);
    });

    it('clamps value to max', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 350, onChange, max: 400, step: 1 })
      );

      // Start drag at x=100
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      // Move far right (would exceed max)
      act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 200 });
        document.dispatchEvent(moveEvent);
      });

      // Should clamp to max of 400
      expect(onChange).toHaveBeenCalledWith(400);
    });
  });

  describe('drag end', () => {
    it('sets isDragging to false on mouseUp', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      // Start drag
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      expect(result.current.isDragging).toBe(true);

      // End drag
      act(() => {
        const upEvent = new MouseEvent('mouseup');
        document.dispatchEvent(upEvent);
      });

      expect(result.current.isDragging).toBe(false);
    });

    it('returns cursor to default on mouseUp', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange })
      );

      // Start drag
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      expect(result.current.cursor).toBe('ew-resize');

      // End drag
      act(() => {
        const upEvent = new MouseEvent('mouseup');
        document.dispatchEvent(upEvent);
      });

      expect(result.current.cursor).toBe('default');
    });
  });

  describe('step configuration', () => {
    it('respects custom step value', () => {
      const onChange = jest.fn();
      const { result } = renderHook(() =>
        useZoomDrag({ value: 100, onChange, step: 2 })
      );

      // Start drag at x=100
      act(() => {
        result.current.handleMouseDown(createMockMouseEvent(100));
      });

      // Move right by 10px with step=2 should result in +20
      act(() => {
        const moveEvent = new MouseEvent('mousemove', { clientX: 110 });
        document.dispatchEvent(moveEvent);
      });

      expect(onChange).toHaveBeenCalledWith(120);
    });
  });
});
