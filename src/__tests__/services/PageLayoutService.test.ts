/**
 * PageLayoutService Tests
 *
 * Tests for page layout calculation, system breaks, measure positioning,
 * and justification algorithms.
 */

import {
  calculateSingleMeasureWidth,
  calculateAllMeasureWidths,
  calculateSystemBreaks,
  calculateJustification,
  calculatePageLayout,
  getSystemForMeasure,
  getMeasureOriginInSystem,
  getPageForMeasure,
  calculateAvailableContentHeight,
  distributeSystemsToPages,
} from '@/services/PageLayoutService';
import { calculateStretchFactor } from '@/engines/layout';
import { DEFAULT_LAYOUT_CONFIG, FIRST_SYSTEM_INDENT, PAGE_GAP, FOOTER_HEIGHT } from '@/config';
import type { Score, LayoutConfig } from '@/types';

// ============================================================================
// TEST FIXTURES
// ============================================================================

/**
 * Creates an empty score with no measures.
 */
const createEmptyScore = (): Score => ({
  title: 'Empty Score',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [],
});

/**
 * Creates a score with empty staves (no measures).
 */
const createScoreWithEmptyStaves = (): Score => ({
  title: 'Empty Staves',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [],
    },
  ],
});

/**
 * Creates a score with a single measure.
 */
const createSingleMeasureScore = (): Score => ({
  title: 'Single Measure',
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
          id: 'm0',
          events: [
            {
              id: 'e0',
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 'n0', pitch: 'C4' }],
            },
            {
              id: 'e1',
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 'n1', pitch: 'D4' }],
            },
          ],
        },
      ],
    },
  ],
});

/**
 * Creates a score with multiple measures.
 */
const createMultiMeasureScore = (measureCount: number = 4): Score => {
  const measures = Array.from({ length: measureCount }, (_, i) => ({
    id: `m${i}`,
    events: [
      {
        id: `e${i}`,
        duration: 'quarter',
        dotted: false,
        notes: [{ id: `n${i}`, pitch: 'C4' }],
      },
    ],
  }));

  return {
    title: 'Multi Measure',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'C',
        measures,
      },
    ],
  };
};

/**
 * Creates a grand staff score (treble + bass).
 */
const createGrandStaffScore = (): Score => ({
  title: 'Grand Staff',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'treble',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 't-m0',
          events: [
            {
              id: 't-e0',
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 't-n0', pitch: 'C5' }],
            },
          ],
        },
        {
          id: 't-m1',
          events: [
            {
              id: 't-e1',
              duration: 'half',
              dotted: false,
              notes: [{ id: 't-n1', pitch: 'D5' }],
            },
          ],
        },
      ],
    },
    {
      id: 'bass',
      clef: 'bass',
      keySignature: 'C',
      measures: [
        {
          id: 'b-m0',
          events: [
            {
              id: 'b-e0',
              duration: 'half',
              dotted: false,
              notes: [{ id: 'b-n0', pitch: 'C3' }],
            },
          ],
        },
        {
          id: 'b-m1',
          events: [
            {
              id: 'b-e1',
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 'b-n1', pitch: 'D3' }],
            },
          ],
        },
      ],
    },
  ],
});

/**
 * Creates a score with metadata.
 */
const createScoreWithMetadata = (): Score => ({
  title: 'Score With Metadata',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  metadata: {
    title: 'My Composition',
    composer: 'Test Composer',
  },
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'm0',
          events: [
            {
              id: 'e0',
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 'n0', pitch: 'C4' }],
            },
          ],
        },
      ],
    },
  ],
});

// ============================================================================
// MEASURE WIDTH CALCULATION TESTS
// ============================================================================

describe('PageLayoutService - Measure Width Calculation', () => {
  describe('calculateSingleMeasureWidth', () => {
    it('returns 0 for empty score', () => {
      const score = createEmptyScore();
      expect(calculateSingleMeasureWidth(score, 0)).toBe(0);
    });

    it('returns 0 for out-of-bounds measure index', () => {
      const score = createSingleMeasureScore();
      expect(calculateSingleMeasureWidth(score, 5)).toBe(0);
    });

    it('calculates positive width for measure with events', () => {
      const score = createSingleMeasureScore();
      const width = calculateSingleMeasureWidth(score, 0);
      expect(width).toBeGreaterThan(0);
    });

    it('applies staff scale factor', () => {
      const score = createSingleMeasureScore();
      const width100 = calculateSingleMeasureWidth(score, 0, 1.0);
      const width50 = calculateSingleMeasureWidth(score, 0, 0.5);
      expect(width50).toBeCloseTo(width100 * 0.5, 1);
    });

    it('takes maximum width across staves for grand staff', () => {
      const score = createGrandStaffScore();
      // First measure: treble has quarter, bass has half
      // Bass half note should be wider
      const width = calculateSingleMeasureWidth(score, 0);
      expect(width).toBeGreaterThan(0);
    });
  });

  describe('calculateAllMeasureWidths', () => {
    it('returns empty array for empty score', () => {
      const score = createEmptyScore();
      expect(calculateAllMeasureWidths(score)).toEqual([]);
    });

    it('returns empty array for score with empty staves', () => {
      const score = createScoreWithEmptyStaves();
      expect(calculateAllMeasureWidths(score)).toEqual([]);
    });

    it('returns array of widths for each measure', () => {
      const score = createMultiMeasureScore(3);
      const widths = calculateAllMeasureWidths(score);
      expect(widths).toHaveLength(3);
      widths.forEach((width) => {
        expect(width).toBeGreaterThan(0);
      });
    });

    it('applies staff scale factor to all measures', () => {
      const score = createMultiMeasureScore(2);
      const widths100 = calculateAllMeasureWidths(score, 1.0);
      const widths50 = calculateAllMeasureWidths(score, 0.5);
      expect(widths50[0]).toBeCloseTo(widths100[0] * 0.5, 1);
      expect(widths50[1]).toBeCloseTo(widths100[1] * 0.5, 1);
    });
  });
});

// ============================================================================
// SYSTEM BREAK CALCULATION TESTS
// ============================================================================

describe('PageLayoutService - System Breaks', () => {
  // Helper to create config with same width for first and subsequent systems (legacy behavior)
  const uniformConfig = (width: number, indent: number = 0.15) => ({
    firstSystemWidth: width,
    subsequentSystemWidth: width,
    firstSystemIndent: indent,
  });

  describe('calculateSystemBreaks', () => {
    it('returns empty array for no measures', () => {
      const result = calculateSystemBreaks([], uniformConfig(800));
      expect(result).toEqual([]);
    });

    it('puts single measure in one system', () => {
      const result = calculateSystemBreaks([100], uniformConfig(800));
      expect(result).toEqual([[0]]);
    });

    it('fits multiple measures in one system if they fit', () => {
      const result = calculateSystemBreaks([100, 100, 100], uniformConfig(800));
      expect(result).toEqual([[0, 1, 2]]);
    });

    it('breaks to new system when measures overflow', () => {
      // First system has reduced width due to indent (15%)
      // Available: 800 * 0.85 = 680
      const result = calculateSystemBreaks([300, 300, 300, 300], uniformConfig(800));
      // First system: 300 + 300 = 600 < 680, so measures 0,1 fit
      // Second system: 300 + 300 = 600 < 800, so measures 2,3 fit
      expect(result).toHaveLength(2);
      expect(result[0]).toContain(0);
      expect(result[0]).toContain(1);
      expect(result[1]).toContain(2);
      expect(result[1]).toContain(3);
    });

    it('always accepts first measure in system even if wider than available', () => {
      // Edge case: single measure wider than content width
      const result = calculateSystemBreaks([1000], uniformConfig(800));
      expect(result).toEqual([[0]]);
    });

    it('applies first system indent correctly', () => {
      // First system: 800 * (1 - 0.15) = 680
      // Measures: 350 + 350 = 700 > 680, so only first measure fits
      const result = calculateSystemBreaks([350, 350], uniformConfig(800, 0.15));
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([0]);
      expect(result[1]).toEqual([1]);
    });

    it('does not apply indent to subsequent systems', () => {
      // First system (with indent): 800 * 0.85 = 680
      // Second system (no indent): 800
      const result = calculateSystemBreaks([350, 400, 400], uniformConfig(800, 0.15));
      // First system: 350 fits in 680
      // 350 + 400 = 750 > 680, so break
      // Second system: 400 + 400 = 800 <= 800, fits
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual([0]);
      expect(result[1]).toEqual([1, 2]);
    });

    it('handles zero indent', () => {
      // With zero indent, all 800px is available for first system
      // 200 + 200 + 200 = 600 < 800, so all fit
      const result = calculateSystemBreaks([200, 200, 200], uniformConfig(800, 0));
      expect(result).toEqual([[0, 1, 2]]);
    });

    it('handles different widths for first vs subsequent systems', () => {
      // First system: 600px (wider preamble), after indent (15%): 510px
      // Subsequent systems: 700px (narrower preamble, no time sig)
      const config = {
        firstSystemWidth: 600,
        subsequentSystemWidth: 700,
        firstSystemIndent: 0.15,
      };
      // Measures: 300, 300, 350, 350
      // First system: 300 fits in 510, 300+300=600 > 510, so only [0]
      // Second system: 300+350=650 < 700, so [1,2]
      // Third system: 350 < 700, so [3]
      const result = calculateSystemBreaks([300, 300, 350, 350], config);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual([0]);
      expect(result[1]).toEqual([1, 2]);
      expect(result[2]).toEqual([3]);
    });
  });
});

// ============================================================================
// JUSTIFICATION CALCULATION TESTS
// ============================================================================

describe('PageLayoutService - Justification', () => {
  describe('calculateJustification', () => {
    it('returns 1.0 for empty system', () => {
      expect(calculateJustification([], [], 800, true)).toBe(1.0);
    });

    it('returns 1.0 for non-last system', () => {
      const result = calculateJustification([0, 1], [100, 100], 800, false);
      expect(result).toBe(1.0);
    });

    it('returns 1.0 for last system >= 60% full', () => {
      // 500/800 = 62.5% >= 60%
      const result = calculateJustification([0, 1], [250, 250], 800, true);
      expect(result).toBe(1.0);
    });

    it('returns fill ratio for last system < 60% full', () => {
      // 400/800 = 50% < 60%
      const result = calculateJustification([0, 1], [200, 200], 800, true);
      expect(result).toBe(0.5);
    });

    it('handles exactly 60% threshold', () => {
      // 480/800 = 60% - should be justified
      const result = calculateJustification([0, 1], [240, 240], 800, true);
      expect(result).toBe(1.0);
    });

    it('handles just under 60% threshold', () => {
      // 479/800 = 59.875% < 60% - should be ragged
      const result = calculateJustification([0, 1], [240, 239], 800, true);
      expect(result).toBeLessThan(1.0);
    });
  });

  describe('System Right Edge Alignment', () => {
    it('justified systems have measures that fill contentWidth', () => {
      // Create a score with enough measures to span multiple systems
      const score = createMultiMeasureScore(12);
      const layout = calculatePageLayout(score);

      // Get measure widths from the page layout
      const measureWidths = calculateAllMeasureWidths(score, 100);

      // Check each justified system
      for (const system of layout.systems) {
        if (system.justification !== 1.0) {
          // Ragged system - skip
          continue;
        }

        // Calculate natural width of measures (preamble is separate, stored on system)
        const measuresNaturalWidth = system.measures.reduce(
          (sum, measureIndex) => sum + measureWidths[measureIndex],
          0
        );

        // preambleWidth is in staff coords, contentWidth is for measures only (page coords)
        // So we just compare measures natural width to contentWidth
        const stretchFactor = calculateStretchFactor(
          measuresNaturalWidth,
          system.contentWidth,
          system.justification
        );

        // Calculate stretched width
        const stretchedWidth = measuresNaturalWidth * stretchFactor;

        // Verify stretched width matches contentWidth (within tolerance)
        expect(stretchedWidth).toBeCloseTo(system.contentWidth, 1);
      }
    });

    it('non-first justified systems have consistent right edge', () => {
      const score = createMultiMeasureScore(16);
      const layout = calculatePageLayout(score);

      // Non-first justified systems should have the same contentWidth
      // (first system is narrower due to indent)
      const justifiedNonFirstSystems = layout.systems.filter(
        (s) => s.justification === 1.0 && !s.isFirst
      );

      if (justifiedNonFirstSystems.length > 1) {
        const expectedContentWidth = justifiedNonFirstSystems[0].contentWidth;
        for (const system of justifiedNonFirstSystems) {
          expect(system.contentWidth).toBe(expectedContentWidth);
        }
      }
    });

    it('first system contentWidth accounts for indent', () => {
      const score = createMultiMeasureScore(16);
      const layout = calculatePageLayout(score);

      const firstSystem = layout.systems.find((s) => s.isFirst);
      const secondSystem = layout.systems.find((s) => !s.isFirst);

      if (firstSystem && secondSystem) {
        // First system should be narrower due to indent
        expect(firstSystem.contentWidth).toBeLessThan(secondSystem.contentWidth);
      }
    });
  });
});

// ============================================================================
// PAGE LAYOUT CALCULATION TESTS
// ============================================================================

describe('PageLayoutService - Page Layout', () => {
  describe('calculatePageLayout', () => {
    it('returns empty systems for empty score', () => {
      const score = createEmptyScore();
      const layout = calculatePageLayout(score);
      expect(layout.systems).toEqual([]);
    });

    it('returns empty systems for score with empty staves', () => {
      const score = createScoreWithEmptyStaves();
      const layout = calculatePageLayout(score);
      expect(layout.systems).toEqual([]);
    });

    it('creates system for single measure', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(layout.systems).toHaveLength(1);
      expect(layout.systems[0].measures).toEqual([0]);
    });

    it('sets correct page dimensions for letter size', () => {
      const score = createSingleMeasureScore();
      const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, pageSize: 'letter' };
      const layout = calculatePageLayout(score, config);
      // Letter: 215.9mm x 279.4mm at 96 DPI
      expect(layout.dimensions.width).toBeCloseTo(215.9 * (96 / 25.4), 0);
      expect(layout.dimensions.height).toBeCloseTo(279.4 * (96 / 25.4), 0);
    });

    it('sets correct page dimensions for A4 size', () => {
      const score = createSingleMeasureScore();
      const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, pageSize: 'a4' };
      const layout = calculatePageLayout(score, config);
      // A4: 210mm x 297mm at 96 DPI
      expect(layout.dimensions.width).toBeCloseTo(210 * (96 / 25.4), 0);
      expect(layout.dimensions.height).toBeCloseTo(297 * (96 / 25.4), 0);
    });

    it('applies staff scale factor', () => {
      const score = createSingleMeasureScore();
      const config: LayoutConfig = { ...DEFAULT_LAYOUT_CONFIG, staffSize: 80 };
      const layout = calculatePageLayout(score, config);
      expect(layout.staffScale).toBe(0.8);
    });

    it('marks first system correctly', () => {
      const score = createMultiMeasureScore(8);
      const layout = calculatePageLayout(score);
      expect(layout.systems[0].isFirst).toBe(true);
      if (layout.systems.length > 1) {
        expect(layout.systems[1].isFirst).toBe(false);
      }
    });

    it('marks last system correctly', () => {
      const score = createMultiMeasureScore(8);
      const layout = calculatePageLayout(score);
      const lastIndex = layout.systems.length - 1;
      expect(layout.systems[lastIndex].isLast).toBe(true);
      if (layout.systems.length > 1) {
        expect(layout.systems[0].isLast).toBe(false);
      }
    });

    it('calculates Y positions using forward-flow', () => {
      const score = createMultiMeasureScore(8);
      const layout = calculatePageLayout(score);
      // Each system should have Y > previous system
      for (let i = 1; i < layout.systems.length; i++) {
        expect(layout.systems[i].y).toBeGreaterThan(layout.systems[i - 1].y);
      }
    });

    it('applies first system indent', () => {
      const score = createMultiMeasureScore(8);
      const layout = calculatePageLayout(score);
      expect(layout.firstSystemIndent).toBe(FIRST_SYSTEM_INDENT);
      // First system should have larger xOffset than subsequent systems
      if (layout.systems.length > 1) {
        expect(layout.systems[0].xOffset).toBeGreaterThan(layout.systems[1].xOffset);
      }
    });

    it('calculates content width correctly', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(layout.contentWidth).toBeGreaterThan(0);
      expect(layout.contentWidth).toBeLessThan(layout.dimensions.width);
    });

    it('handles score with metadata', () => {
      const score = createScoreWithMetadata();
      const layout = calculatePageLayout(score);
      // With metadata, first system should start lower
      expect(layout.systems[0].y).toBeGreaterThan(0);
    });

    it('uses default config when not provided', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(layout.pageSize).toBe(DEFAULT_LAYOUT_CONFIG.pageSize);
      expect(layout.margins).toBe(DEFAULT_LAYOUT_CONFIG.margins);
    });
  });
});

// ============================================================================
// LOOKUP FUNCTION TESTS
// ============================================================================

describe('PageLayoutService - Lookup Functions', () => {
  describe('getSystemForMeasure', () => {
    it('returns -1 for empty layout', () => {
      const score = createEmptyScore();
      const layout = calculatePageLayout(score);
      expect(getSystemForMeasure(0, layout)).toBe(-1);
    });

    it('returns correct system index', () => {
      const score = createMultiMeasureScore(8);
      const layout = calculatePageLayout(score);

      // First measure should be in system 0
      expect(getSystemForMeasure(0, layout)).toBe(0);

      // Find a measure in the second system (if exists)
      if (layout.systems.length > 1) {
        const secondSystemMeasure = layout.systems[1].measures[0];
        expect(getSystemForMeasure(secondSystemMeasure, layout)).toBe(1);
      }
    });

    it('returns -1 for measure index not in layout', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(getSystemForMeasure(999, layout)).toBe(-1);
    });
  });

  describe('getMeasureOriginInSystem', () => {
    it('returns null for measure not in layout', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      const widths = calculateAllMeasureWidths(score);
      expect(getMeasureOriginInSystem(999, layout, widths)).toBeNull();
    });

    it('returns correct position for first measure in system', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      const widths = calculateAllMeasureWidths(score);

      const result = getMeasureOriginInSystem(0, layout, widths);
      expect(result).not.toBeNull();
      expect(result!.systemIndex).toBe(0);
      expect(result!.x).toBe(layout.systems[0].xOffset);
    });

    it('returns correct position for subsequent measures', () => {
      const score = createMultiMeasureScore(4);
      const layout = calculatePageLayout(score);
      const widths = calculateAllMeasureWidths(score);

      // If all measures are in one system, second measure should be offset
      if (layout.systems[0].measures.length >= 2) {
        const result = getMeasureOriginInSystem(1, layout, widths);
        expect(result).not.toBeNull();
        expect(result!.x).toBeGreaterThan(layout.systems[0].xOffset);
      }
    });

    it('returns null for empty layout', () => {
      const score = createEmptyScore();
      const layout = calculatePageLayout(score);
      expect(getMeasureOriginInSystem(0, layout, [])).toBeNull();
    });
  });
});

// ============================================================================
// EDGE CASES AND INTEGRATION TESTS
// ============================================================================

describe('PageLayoutService - Edge Cases', () => {
  it('handles grand staff layout', () => {
    const score = createGrandStaffScore();
    const layout = calculatePageLayout(score);
    expect(layout.systems).toHaveLength(1);
    // Grand staff system should be taller than single staff
    expect(layout.systems[0].height).toBeGreaterThan(48); // 48 = single staff height
  });

  it('handles different margin presets', () => {
    const score = createSingleMeasureScore();

    const narrowLayout = calculatePageLayout(score, {
      ...DEFAULT_LAYOUT_CONFIG,
      margins: 'narrow',
    });
    const wideLayout = calculatePageLayout(score, { ...DEFAULT_LAYOUT_CONFIG, margins: 'wide' });

    // Narrow margins = more content width
    expect(narrowLayout.contentWidth).toBeGreaterThan(wideLayout.contentWidth);
  });

  it('ignores systemSpacing preset in page view (uses vertical justification)', () => {
    // Page view uses vertical justification instead of fixed spacing presets
    // All preset values should produce the same layout
    const score = createMultiMeasureScore(8);

    const compactLayout = calculatePageLayout(score, {
      ...DEFAULT_LAYOUT_CONFIG,
      systemSpacing: 'compact',
    });
    const relaxedLayout = calculatePageLayout(score, {
      ...DEFAULT_LAYOUT_CONFIG,
      systemSpacing: 'relaxed',
    });

    // Both should have the same system positions (vertical justification)
    if (compactLayout.systems.length > 1 && relaxedLayout.systems.length > 1) {
      const compactGap = compactLayout.systems[1].y - compactLayout.systems[0].y;
      const relaxedGap = relaxedLayout.systems[1].y - relaxedLayout.systems[0].y;
      expect(relaxedGap).toBe(compactGap);
    }
  });

  it('correctly numbers system indices', () => {
    const score = createMultiMeasureScore(16);
    const layout = calculatePageLayout(score);

    layout.systems.forEach((system, i) => {
      expect(system.index).toBe(i);
    });
  });

  it('all measures are accounted for in systems', () => {
    const measureCount = 8;
    const score = createMultiMeasureScore(measureCount);
    const layout = calculatePageLayout(score);

    const allMeasures = layout.systems.flatMap((s) => s.measures);
    expect(allMeasures).toHaveLength(measureCount);

    // All indices from 0 to measureCount-1 should be present
    for (let i = 0; i < measureCount; i++) {
      expect(allMeasures).toContain(i);
    }
  });
});

// ============================================================================
// MULTI-PAGE PAGINATION TESTS
// ============================================================================

describe('PageLayoutService - Multi-Page Pagination', () => {
  describe('calculateAvailableContentHeight', () => {
    const contentArea = { x: 50, y: 50, width: 600, height: 800 };
    const metadataBottom = 120; // Metadata takes 70px (120 - 50)

    it('returns reduced height for page 0 due to metadata', () => {
      const height = calculateAvailableContentHeight(0, contentArea, metadataBottom);
      // 800 - FOOTER_HEIGHT - (120 - 50) = 800 - 20 - 70 = 710
      expect(height).toBe(800 - FOOTER_HEIGHT - 70);
    });

    it('returns full content height for subsequent pages', () => {
      const height = calculateAvailableContentHeight(1, contentArea, metadataBottom);
      // 800 - FOOTER_HEIGHT = 780
      expect(height).toBe(800 - FOOTER_HEIGHT);
    });

    it('page 0 has less available height than page 1', () => {
      const page0Height = calculateAvailableContentHeight(0, contentArea, metadataBottom);
      const page1Height = calculateAvailableContentHeight(1, contentArea, metadataBottom);
      expect(page0Height).toBeLessThan(page1Height);
    });
  });

  describe('distributeSystemsToPages', () => {
    const contentArea = { x: 50, y: 50, width: 600, height: 400 };
    const metadataBottom = 100;
    const defaultSpacing = 48; // 1 staff height for single-page scores
    const systemHeight = 80;

    const createMockSystems = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        measures: [i],
        y: 0,
        height: systemHeight,
        xOffset: 100,
        contentWidth: 500,
        preambleWidth: 100,
        isFirst: i === 0,
        isLast: i === count - 1,
        justification: 1.0,
        measurePositions: [],
      }));

    it('returns empty array for no systems', () => {
      const result = distributeSystemsToPages(
        [],
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );
      expect(result).toEqual([]);
    });

    it('places single system on single page', () => {
      const systems = createMockSystems(1);
      const result = distributeSystemsToPages(
        systems,
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      expect(result).toHaveLength(1);
      expect(result[0].pageIndex).toBe(0);
      expect(result[0].systems).toHaveLength(1);
    });

    it('distributes systems across multiple pages when needed', () => {
      // With reduced contentArea.height, systems should overflow to multiple pages
      const smallContentArea = { x: 50, y: 50, width: 600, height: 200 };
      const systems = createMockSystems(5);
      const result = distributeSystemsToPages(
        systems,
        smallContentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      expect(result.length).toBeGreaterThan(1);
      // Each page should have at least one system
      result.forEach((page) => {
        expect(page.systems.length).toBeGreaterThan(0);
      });
    });

    it('sets page-relative Y coordinates', () => {
      const systems = createMockSystems(2);
      const result = distributeSystemsToPages(
        systems,
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      // First system on page 0 should start at metadataBottom
      expect(result[0].systems[0].y).toBe(metadataBottom);
    });

    it('uses defaultSpacing for single-page scores', () => {
      const systems = createMockSystems(2);
      const result = distributeSystemsToPages(
        systems,
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      // Single page with 2 systems should use defaultSpacing
      expect(result).toHaveLength(1);
      const gap = result[0].systems[1].y - result[0].systems[0].y;
      expect(gap).toBe(systemHeight + defaultSpacing);
    });

    it('returns justifiedSpacing for each page', () => {
      const systems = createMockSystems(2);
      const result = distributeSystemsToPages(
        systems,
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      expect(result[0]).toHaveProperty('justifiedSpacing');
      expect(typeof result[0].justifiedSpacing).toBe('number');
    });

    it('vertically justifies full pages', () => {
      // Create enough systems to fill multiple pages
      // With contentArea.height=400, metadataBottom=100, systemHeight=80, minSpacing=12
      // Page 0: available = 400 - 40 (footer) - (100-50) = 310
      // Can fit: floor((310 + 12) / (80 + 12)) = 3 systems
      // Page 1+: available = 400 - 40 = 360
      // Can fit: floor((360 + 12) / (80 + 12)) = 4 systems
      const systems = createMockSystems(7); // 3 on page 0, 4 on page 1
      const result = distributeSystemsToPages(
        systems,
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      // Should span 2 pages
      expect(result.length).toBeGreaterThanOrEqual(2);

      // Full pages should have justified spacing
      const fullPageIndex = 0;
      if (result[fullPageIndex].systems.length > 1) {
        const spacing = result[fullPageIndex].justifiedSpacing;
        // Justified spacing should be greater than minimum (12px)
        expect(spacing).toBeGreaterThanOrEqual(12);
      }
    });

    it('justifies single page when at capacity', () => {
      // Create a content area that can fit exactly 3 systems with minimum spacing
      // Available height = 310 (400 - 40 footer - 50 metadata offset)
      // 3 systems with min spacing: 80 + (80+12) + (80+12) = 264 < 310
      // 4 systems with min spacing: 264 + (80+12) = 356 > 310
      // So 3 systems is at capacity
      const systems = createMockSystems(3);
      const result = distributeSystemsToPages(
        systems,
        contentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      // Should be single page
      expect(result).toHaveLength(1);
      // Should be justified (spacing > minimum) because page is at capacity
      const spacing = result[0].justifiedSpacing;
      // Justified spacing = (310 - 3*80) / 2 = 35
      expect(spacing).toBeGreaterThan(12); // MIN_SYSTEM_SPACING = 12
    });

    it('final page uses previous page spacing', () => {
      // Create a multi-page score where final page has fewer systems
      const largeContentArea = { x: 50, y: 50, width: 600, height: 600 };
      const systems = createMockSystems(5);
      const result = distributeSystemsToPages(
        systems,
        largeContentArea,
        metadataBottom,
        defaultSpacing,
        systemHeight
      );

      if (result.length > 1) {
        const previousPageSpacing = result[result.length - 2].justifiedSpacing;
        const finalPageSpacing = result[result.length - 1].justifiedSpacing;
        expect(finalPageSpacing).toBe(previousPageSpacing);
      }
    });
  });

  describe('getPageForMeasure', () => {
    it('returns -1 for empty layout', () => {
      const score = createEmptyScore();
      const layout = calculatePageLayout(score);
      expect(getPageForMeasure(0, layout)).toBe(-1);
    });

    it('returns correct page for single page score', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(getPageForMeasure(0, layout)).toBe(0);
    });

    it('returns -1 for measure not in layout', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(getPageForMeasure(999, layout)).toBe(-1);
    });

    it('finds measures on correct pages in multi-page layout', () => {
      // Create a score with many measures to force multi-page
      const score = createMultiMeasureScore(30);
      const layout = calculatePageLayout(score);

      // Verify all measures can be found on some page
      for (let i = 0; i < 30; i++) {
        const pageIndex = getPageForMeasure(i, layout);
        expect(pageIndex).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('calculatePageLayout - pagination fields', () => {
    it('includes pages array', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(layout.pages).toBeDefined();
      expect(Array.isArray(layout.pages)).toBe(true);
    });

    it('includes pageCount', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(layout.pageCount).toBeGreaterThan(0);
      expect(layout.pageCount).toBe(layout.pages.length);
    });

    it('includes pageGap constant', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      expect(layout.pageGap).toBe(PAGE_GAP);
    });

    it('calculates totalHeight correctly for single page', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);
      // Single page: totalHeight = page height
      expect(layout.totalHeight).toBe(layout.dimensions.height);
    });

    it('calculates totalHeight correctly for multiple pages', () => {
      const score = createMultiMeasureScore(30);
      const layout = calculatePageLayout(score);

      if (layout.pageCount > 1) {
        // Multiple pages: totalHeight = (pageCount * pageHeight) + ((pageCount - 1) * pageGap)
        const expectedHeight =
          layout.pageCount * layout.dimensions.height +
          (layout.pageCount - 1) * PAGE_GAP;
        expect(layout.totalHeight).toBe(expectedHeight);
      }
    });

    it('pages have correct canvasY offsets', () => {
      const score = createMultiMeasureScore(30);
      const layout = calculatePageLayout(score);

      layout.pages.forEach((page, index) => {
        const expectedCanvasY = index * (layout.dimensions.height + PAGE_GAP);
        expect(page.canvasY).toBe(expectedCanvasY);
      });
    });

    it('isFirst flag only true for page 0', () => {
      const score = createMultiMeasureScore(30);
      const layout = calculatePageLayout(score);

      layout.pages.forEach((page, index) => {
        expect(page.isFirst).toBe(index === 0);
      });
    });

    it('isLast flag only true for last page', () => {
      const score = createMultiMeasureScore(30);
      const layout = calculatePageLayout(score);
      const lastIndex = layout.pages.length - 1;

      layout.pages.forEach((page, index) => {
        expect(page.isLast).toBe(index === lastIndex);
      });
    });

    it('page numbers increment from 1', () => {
      const score = createMultiMeasureScore(30);
      const layout = calculatePageLayout(score);

      layout.pages.forEach((page, index) => {
        expect(page.footer.pageNumber.text).toBe(String(index + 1));
      });
    });

    it('copyright only appears on page 1', () => {
      const score: Score = {
        ...createMultiMeasureScore(30),
        metadata: {
          title: 'Test',
          copyright: '2024 Test',
        },
      };
      const layout = calculatePageLayout(score);

      layout.pages.forEach((page, index) => {
        if (index === 0) {
          expect(page.footer.copyright).toBeDefined();
        } else {
          expect(page.footer.copyright).toBeUndefined();
        }
      });
    });

    it('maintains backwards compatibility with systems and footer fields', () => {
      const score = createSingleMeasureScore();
      const layout = calculatePageLayout(score);

      // systems should equal first page systems
      expect(layout.systems).toEqual(layout.pages[0]?.systems ?? []);

      // footer should equal first page footer
      expect(layout.footer).toEqual(layout.pages[0]?.footer);
    });
  });
});
