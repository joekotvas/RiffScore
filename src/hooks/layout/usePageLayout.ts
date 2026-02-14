/**
 * usePageLayout - Hook for page view layout calculations
 *
 * Provides access to page layout data for multi-system rendering.
 * Consumes PageLayoutService for calculations.
 */

import { useMemo, useCallback } from 'react';
import { useScoreContext } from '@/context/ScoreContext';
import {
  calculatePageLayout,
  getSystemForMeasure,
  getMeasureOriginInSystem,
  calculateAllMeasureWidths,
} from '@/services/PageLayoutService';
import type { PageLayout, SystemLayout, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

/**
 * Result type for usePageLayout hook.
 */
export interface UsePageLayoutResult {
  /** Complete page layout with all systems */
  pageLayout: PageLayout;
  /** Current view mode */
  viewMode: LayoutConfig['viewMode'];
  /** Whether currently in page view mode */
  isPageView: boolean;
  /** Get the system layout for a given measure index */
  getSystem: (measureIndex: number) => SystemLayout | null;
  /** Get the X position of a measure within its system */
  getMeasureX: (measureIndex: number) => number | null;
  /** Array of measure widths for positioning calculations */
  measureWidths: number[];
}

/**
 * Empty page layout for scroll view mode.
 */
const createEmptyPageLayout = (config: LayoutConfig): PageLayout => ({
  systems: [],
  pageSize: config.pageSize,
  dimensions: { width: 0, height: 0 },
  margins: config.margins,
  contentWidth: Infinity,
  firstSystemIndent: 0,
  staffScale: config.staffSize / 100,
  contentArea: { x: 0, y: 0, width: 0, height: 0 },
  marginsPx: { top: 0, right: 0, bottom: 0, left: 0 },
  metadata: { title: null, composer: null, bottom: 0 },
  footer: { y: 0, pageNumber: { text: '1', x: 0, y: 0 } },
});

/**
 * Hook providing page layout data for multi-system rendering.
 *
 * In scroll view mode, returns empty layout data.
 * In page view mode, calculates system breaks, justification, and positioning.
 *
 * @returns Page layout data and helper functions
 */
export const usePageLayout = (): UsePageLayoutResult => {
  const { state } = useScoreContext();
  const { score } = state;

  const config = score.layout ?? DEFAULT_LAYOUT_CONFIG;
  const viewMode = config.viewMode;
  const isPageView = viewMode === 'page';

  // Calculate measure widths (needed for positioning even in scroll view)
  const measureWidths = useMemo(() => {
    const staffScale = config.staffSize / 100;
    return calculateAllMeasureWidths(score, staffScale);
  }, [score, config.staffSize]);

  // Calculate page layout only when in page view
  const pageLayout = useMemo(() => {
    if (!isPageView) {
      return createEmptyPageLayout(config);
    }
    return calculatePageLayout(score, config);
  }, [score, config, isPageView]);

  // Get system layout for a measure
  const getSystem = useCallback(
    (measureIndex: number): SystemLayout | null => {
      if (!isPageView) return null;

      const systemIndex = getSystemForMeasure(measureIndex, pageLayout);
      if (systemIndex === -1) return null;

      return pageLayout.systems[systemIndex] ?? null;
    },
    [isPageView, pageLayout]
  );

  // Get X position of measure within its system
  const getMeasureX = useCallback(
    (measureIndex: number): number | null => {
      if (!isPageView) return null;

      const result = getMeasureOriginInSystem(measureIndex, pageLayout, measureWidths);
      return result?.x ?? null;
    },
    [isPageView, pageLayout, measureWidths]
  );

  return {
    pageLayout,
    viewMode,
    isPageView,
    getSystem,
    getMeasureX,
    measureWidths,
  };
};
