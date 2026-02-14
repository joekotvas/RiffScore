/**
 * usePageLayout.test.ts
 *
 * Tests for the page layout hook.
 * @tested src/hooks/layout/usePageLayout.ts
 */
import { renderHook } from '@testing-library/react';
import React from 'react';
import { usePageLayout } from '@/hooks/layout/usePageLayout';
import { ScoreContext, ScoreContextType } from '@/context/ScoreContext';
import { Score, createDefaultScore } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

// Helper to create a minimal mock context
const createMockContext = (score: Score): Partial<ScoreContextType> => ({
  state: {
    score,
    selection: {
      staffIndex: 0,
      measureIndex: null,
      eventId: null,
      noteId: null,
      selectedNotes: [],
      anchor: null,
      verticalAnchors: null,
      chordId: null,
      chordTrackFocused: false,
    },
    previewNote: null,
  },
  engines: {} as ScoreContextType['engines'],
  tools: {} as ScoreContextType['tools'],
  navigation: {} as ScoreContextType['navigation'],
  entry: {} as ScoreContextType['entry'],
  measures: {} as ScoreContextType['measures'],
  clearSelection: () => {},
  setPreviewNote: () => {},
  pendingClefChange: null,
  setPendingClefChange: () => {},
  handleClefChange: () => {},
});

// Wrapper component for testing
const createWrapper = (score: Score) => {
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const mockContext = createMockContext(score) as ScoreContextType;
    return React.createElement(ScoreContext.Provider, { value: mockContext }, children);
  };
  return Wrapper;
};

describe('usePageLayout', () => {
  describe('scroll view mode', () => {
    it('returns isPageView as false when in scroll mode', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.isPageView).toBe(false);
      expect(result.current.viewMode).toBe('scroll');
    });

    it('returns empty systems array in scroll view', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.pageLayout.systems).toEqual([]);
    });

    it('getSystem returns null in scroll view', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.getSystem(0)).toBeNull();
      expect(result.current.getSystem(1)).toBeNull();
    });

    it('getMeasureX returns null in scroll view', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'scroll' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.getMeasureX(0)).toBeNull();
    });
  });

  describe('page view mode', () => {
    it('returns isPageView as true when in page mode', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.isPageView).toBe(true);
      expect(result.current.viewMode).toBe('page');
    });

    it('calculates page dimensions based on page size', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', pageSize: 'letter' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      // Letter size: 8.5" x 11" = 215.9mm x 279.4mm
      // At 96 DPI: ~816px x ~1056px
      expect(result.current.pageLayout.dimensions.width).toBeGreaterThan(800);
      expect(result.current.pageLayout.dimensions.height).toBeGreaterThan(1000);
    });

    it('creates systems for measures in page view', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      // Should have at least one system
      expect(result.current.pageLayout.systems.length).toBeGreaterThan(0);
    });

    it('getSystem returns system layout for valid measure', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      const system = result.current.getSystem(0);
      expect(system).not.toBeNull();
      expect(system?.index).toBe(0);
      expect(system?.measures).toContain(0);
    });

    it('getSystem returns null for invalid measure index', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.getSystem(999)).toBeNull();
    });

    it('calculates measure widths', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page' };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      // Should have measure widths for each measure
      expect(result.current.measureWidths.length).toBe(score.staves[0].measures.length);
    });
  });

  describe('default config', () => {
    it('uses default layout config when score has no layout', () => {
      const score = createDefaultScore();
      delete score.layout; // No layout config

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      // Default is scroll view
      expect(result.current.isPageView).toBe(false);
      expect(result.current.viewMode).toBe('scroll');
    });
  });

  describe('staff scale', () => {
    it('calculates staff scale from staffSize', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 80 };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.pageLayout.staffScale).toBe(0.8);
    });

    it('uses default staff scale of 1.0 when staffSize is 100', () => {
      const score = createDefaultScore();
      score.layout = { ...DEFAULT_LAYOUT_CONFIG, viewMode: 'page', staffSize: 100 };

      const { result } = renderHook(() => usePageLayout(), {
        wrapper: createWrapper(score),
      });

      expect(result.current.pageLayout.staffScale).toBe(1.0);
    });
  });
});
