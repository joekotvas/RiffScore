/**
 * ScoreAPI.feedback.test.tsx
 *
 * Tests for API feedback mechanisms: Result object, sticky errors, and batch collection.
 * Verified against RFC requirements.
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';

// Helper to get typed API
const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

describe('ScoreAPI Feedback & Error Handling', () => {
  beforeEach(() => {
    // Mock scrollTo for jsdom
    Element.prototype.scrollTo = jest.fn();
    // Use fake timers for precise control
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Result State', () => {
    test('initially reports success', () => {
      render(<RiffScore id="feedback-init" />);
      const api = getAPI('feedback-init');

      expect(api.result).toEqual(
        expect.objectContaining({
          ok: true,
          status: 'info',
          method: 'init',
        })
      );
      expect(api.ok).toBe(true);
      expect(api.hasError).toBe(false);
    });

    test('addNote reports success via result', () => {
      render(<RiffScore id="feedback-success" />);
      const api = getAPI('feedback-success');

      act(() => {
        api.select(1).addNote('C4', 'quarter');
      });

      expect(api.result).toEqual(
        expect.objectContaining({
          ok: true,
          status: 'info',
          method: 'addNote',
          message: expect.stringContaining('Added note C4'),
        })
      );
      expect(api.result.details).toEqual(expect.objectContaining({ pitch: 'C4' }));
    });

    test('addNote reports error for invalid pitch', () => {
      render(<RiffScore id="feedback-error" />);
      const api = getAPI('feedback-error');

      act(() => {
        api.select(1).addNote('InvalidPitch');
      });

      expect(api.result).toEqual(
        expect.objectContaining({
          ok: false,
          status: 'error',
          method: 'addNote',
          code: 'INVALID_PITCH',
        })
      );
      expect(api.ok).toBe(false);
    });
  });

  describe('Sticky Error State (hasError)', () => {
    test('persists hasError flag until cleared', () => {
      render(<RiffScore id="sticky-error" />);
      const api = getAPI('sticky-error');

      // 1. Initial State
      expect(api.hasError).toBe(false);

      // 2. Cause Error
      act(() => {
        api.select(1).addNote('InvalidPitch');
      });
      expect(api.result.ok).toBe(false);
      expect(api.hasError).toBe(true);

      // 3. Perform Successful Operation
      // hasError should remain true even if latest result is success
      act(() => {
        api.addNote('C4', 'quarter');
      });
      expect(api.result.ok).toBe(true); // Latest op succeeded...
      expect(api.hasError).toBe(true); // ...but sticky error remains

      // 4. Clear Status
      act(() => {
        api.clearStatus();
      });
      expect(api.hasError).toBe(false);
      expect(api.result.method).toBe('clearStatus');
    });
  });

  describe('Batch Collection (collect)', () => {
    test('collects results from multiple operations', () => {
      render(<RiffScore id="collect-batch" />);
      const api = getAPI('collect-batch');

      let batchResult: ReturnType<MusicEditorAPI['collect']> | undefined;
      act(() => {
        batchResult = api.collect((a) => {
          a.select(1).addNote('C4').addNote('D4').addNote('InvalidPitch');
        });
      });

      expect(batchResult).toBeDefined();
      expect(batchResult?.results.length).toBeGreaterThanOrEqual(3); // select + 3 addNotes

      const addNoteResults = batchResult?.results.filter((r) => r.method === 'addNote');
      expect(addNoteResults).toHaveLength(3);

      expect(addNoteResults?.[0].ok).toBe(true);
      expect(addNoteResults?.[1].ok).toBe(true);

      expect(addNoteResults?.[2].ok).toBe(false); // InvalidPitch

      expect(batchResult?.ok).toBe(false); // Because one failed
      expect(batchResult?.errors).toHaveLength(1);
    });

    test('nested collection works', () => {
      render(<RiffScore id="collect-nested" />);
      const api = getAPI('collect-nested');

      let outerResult: ReturnType<MusicEditorAPI['collect']> | undefined;
      act(() => {
        outerResult = api.collect((a) => {
          a.addNote('C4');
          a.collect((inner) => {
            inner.addNote('D4');
          });
          a.addNote('E4');
        });
      });

      // Both inner and outer ops should be captured in outer result?
      // Implementation uses a Ref, which is swapped. So inner collect should capture inner ops,
      // and outer collect should capture outer ops + maybe inner ones if they propagate?
      // Based on implementation:
      // collectorRef is swapped. Inner collect takes over.
      // Inner ops go to inner collector.
      // Outer collector does NOT see inner ops while swapped out.

      const addNoteResults = outerResult?.results.filter(
        (r: import('../api.types').Result) => r.method === 'addNote'
      );
      expect(addNoteResults).toHaveLength(2); // C4 and E4. D4 is "hidden" inside inner collect.
    });
  });

  describe('Event Emission', () => {
    test('emits operation and error events', () => {
      render(<RiffScore id="events-test" />);
      const api = getAPI('events-test');

      const opSpy = jest.fn();
      const errSpy = jest.fn();

      api.on('operation', opSpy);
      api.on('error', errSpy);

      // Success Op
      act(() => {
        api.select(1).addNote('C4');
      });

      expect(opSpy).toHaveBeenCalledWith(expect.objectContaining({ method: 'addNote', ok: true }));
      expect(errSpy).not.toHaveBeenCalled();

      opSpy.mockClear();

      // Error Op
      act(() => {
        api.addNote('InvalidPitch');
      });

      expect(opSpy).toHaveBeenCalledWith(expect.objectContaining({ method: 'addNote', ok: false }));
      expect(errSpy).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'addNote', ok: false })
      );
    });
  });

  describe('Debug Mode', () => {
    test('toggles debug mode', () => {
      render(<RiffScore id="debug-test" />);
      const api = getAPI('debug-test');

      act(() => {
        // eslint-disable-next-line testing-library/no-debugging-utils
        api.debug(true);
      });
      expect(api.result.ok).toBe(true);
      expect(api.result.message).toContain('enabled');

      act(() => {
        // eslint-disable-next-line testing-library/no-debugging-utils
        api.debug(false);
      });
      expect(api.result.ok).toBe(true);
      expect(api.result.message).toContain('disabled');
    });
  });
});
