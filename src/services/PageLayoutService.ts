/**
 * PageLayoutService - Page View Layout Calculation
 *
 * Provides functions for calculating system breaks, page layout,
 * and measure positioning for page view rendering.
 *
 * All functions are pure and stateless.
 *
 * ## Coordinate Systems
 *
 * This service uses two coordinate systems:
 *
 * ### Page Coordinates (px)
 * - Origin: Top-left of page
 * - Units: Pixels at final render size (after staffScale applied)
 * - Used for: margins, content area, system positions, measure X positions
 * - Variables: contentArea, xOffset, contentWidth, systemY
 *
 * ### Staff Coordinates (unscaled px)
 * - Origin: Top-left of staff's local space
 * - Units: Pixels at 100% scale (staffScale = 1.0)
 * - Multiply by staffScale to convert to page coordinates
 * - Used for: preamble width, measure widths, note positions
 * - Variables: preambleWidth, measureWidths (when staffScale=1.0)
 *
 * ### Conversion
 * ```
 * pageCoords = staffCoords * staffScale
 * staffCoords = pageCoords / staffScale
 * ```
 */

import type {
  Score,
  LayoutConfig,
  PageLayout,
  SystemLayout,
  ContentArea,
  MetadataLayout,
  FooterLayout,
  MarginsPx,
  MeasurePosition,
  ScoreMetadata,
  Page,
} from '@/types';
import {
  DEFAULT_LAYOUT_CONFIG,
  PAGE_DIMENSIONS,
  MARGIN_PRESETS,
  FIRST_SYSTEM_INDENT,
  METADATA_TYPOGRAPHY,
  PAGE_GAP,
  FOOTER_HEIGHT,
} from '@/config';
import { CONFIG } from '@/config';
import { calculateMeasureWidth, calculateSystemPreamble } from '@/engines/layout';
import { STAFF_GEOMETRY } from '@/constants';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Threshold below which last system remains ragged (not justified) */
const LAST_SYSTEM_JUSTIFY_THRESHOLD = 0.6;

/** MM to pixels conversion factor (96 DPI) */
const MM_TO_PX = 96 / 25.4;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Converts millimeters to pixels at 96 DPI.
 */
const mmToPx = (mm: number): number => mm * MM_TO_PX;

// =============================================================================
// MEASURE WIDTH CALCULATION
// =============================================================================

/**
 * Calculates the width of a single measure in a score.
 *
 * @param score - The score containing the measure
 * @param measureIndex - 0-based measure index
 * @param staffScale - Staff scale factor (1.0 = 100%)
 * @returns Width in pixels
 */
export const calculateSingleMeasureWidth = (
  score: Score,
  measureIndex: number,
  staffScale: number = 1.0
): number => {
  if (!score.staves.length) return 0;

  // For grand staff, take the maximum width across all staves
  let maxWidth = 0;

  for (const staff of score.staves) {
    const measure = staff.measures[measureIndex];
    if (!measure) continue;

    const width = calculateMeasureWidth(measure.events, measure.isPickup);
    maxWidth = Math.max(maxWidth, width);
  }

  return maxWidth * staffScale;
};

/**
 * Calculates the widths of all measures in a score.
 *
 * @param score - The score to analyze
 * @param staffScale - Staff scale factor (1.0 = 100%)
 * @returns Array of measure widths in pixels
 */
export const calculateAllMeasureWidths = (score: Score, staffScale: number = 1.0): number[] => {
  if (!score.staves.length || !score.staves[0].measures.length) {
    return [];
  }

  const measureCount = score.staves[0].measures.length;
  const widths: number[] = [];

  for (let i = 0; i < measureCount; i++) {
    widths.push(calculateSingleMeasureWidth(score, i, staffScale));
  }

  return widths;
};

// =============================================================================
// SYSTEM BREAK CALCULATION
// =============================================================================

interface SystemBreakConfig {
  /** Available width for first system (page coords, indent NOT applied yet) */
  firstSystemWidth: number;
  /** Available width for subsequent systems (page coords) */
  subsequentSystemWidth: number;
  /** First system indent as fraction (0-1) */
  firstSystemIndent: number;
}

/**
 * Calculates system breaks using a greedy fill algorithm.
 *
 * Rules:
 * - Always accept the first measure in each system
 * - Break before a measure that would overflow
 * - First system has reduced width (wider preamble + indent)
 * - Subsequent systems have more width (narrower preamble, no time sig)
 *
 * @param measureWidths - Array of measure widths (page coords)
 * @param config - Width configuration for first vs subsequent systems
 * @returns Array of arrays, each containing measure indices for that system
 */
export const calculateSystemBreaks = (
  measureWidths: number[],
  config: SystemBreakConfig
): number[][] => {
  const { firstSystemWidth, subsequentSystemWidth, firstSystemIndent } = config;

  if (measureWidths.length === 0) {
    return [];
  }

  const systems: number[][] = [];
  let currentSystem: number[] = [];
  let currentWidth = 0;
  let isFirstSystem = true;

  // First system: reduced by indent; subsequent: full width
  const getAvailableWidth = (isFirst: boolean): number =>
    isFirst ? firstSystemWidth * (1 - firstSystemIndent) : subsequentSystemWidth;

  for (let i = 0; i < measureWidths.length; i++) {
    const measureWidth = measureWidths[i];
    const availableWidth = getAvailableWidth(isFirstSystem);

    // Always accept the first measure in a system
    if (currentSystem.length === 0) {
      currentSystem.push(i);
      currentWidth = measureWidth;
      continue;
    }

    // Check if adding this measure would overflow
    if (currentWidth + measureWidth > availableWidth) {
      // Start a new system
      systems.push(currentSystem);
      currentSystem = [i];
      currentWidth = measureWidth;
      isFirstSystem = false;
    } else {
      // Add to current system
      currentSystem.push(i);
      currentWidth += measureWidth;
    }
  }

  // Don't forget the last system
  if (currentSystem.length > 0) {
    systems.push(currentSystem);
  }

  return systems;
};

// =============================================================================
// JUSTIFICATION CALCULATION
// =============================================================================

/**
 * Calculates the justification factor for a system.
 *
 * Rules:
 * - Full systems (>=60% full or not last): justify to 1.0
 * - Last system <60% full: use natural spacing (factor < 1.0)
 *
 * @param systemMeasures - Measure indices in this system
 * @param measureWidths - All measure widths
 * @param availableWidth - Available width for this system
 * @param isLastSystem - Whether this is the final system
 * @returns Justification factor (1.0 = fully justified)
 */
export const calculateJustification = (
  systemMeasures: number[],
  measureWidths: number[],
  availableWidth: number,
  isLastSystem: boolean
): number => {
  if (systemMeasures.length === 0) return 1.0;

  const naturalWidth = systemMeasures.reduce((sum, idx) => sum + (measureWidths[idx] ?? 0), 0);

  const fillRatio = naturalWidth / availableWidth;

  // Non-last systems are always justified
  if (!isLastSystem) {
    return 1.0;
  }

  // Last system: justify if >= 60% full, otherwise ragged
  return fillRatio >= LAST_SYSTEM_JUSTIFY_THRESHOLD ? 1.0 : fillRatio;
};

// =============================================================================
// ANCHOR LAYOUT CALCULATIONS
// =============================================================================

/**
 * Calculates metadata (title, composer, lyricist) layout positions.
 *
 * Standard sheet music layout:
 * - Title: centered at top
 * - Composer: right-aligned below title
 * - Lyricist: left-aligned below title (same line as composer)
 *
 * @param metadata - Score metadata
 * @param contentArea - The content area within margins
 * @returns MetadataLayout with positioned elements
 */
const calculateMetadataLayout = (
  metadata: ScoreMetadata | undefined,
  contentArea: ContentArea
): MetadataLayout => {
  // Default: no metadata, systems start at content top
  if (!metadata?.title) {
    return {
      title: null,
      composer: null,
      lyricist: null,
      bottom: contentArea.y,
    };
  }

  // Title positioned at top of content, centered horizontally
  const titleY = contentArea.y + METADATA_TYPOGRAPHY.titleHeight;
  const titleX = contentArea.x + contentArea.width / 2;

  let currentY = titleY + METADATA_TYPOGRAPHY.titleSpacing;
  let composer: MetadataLayout['composer'] = null;
  let lyricist: MetadataLayout['lyricist'] = null;

  // Composer and lyricist share the same line below title
  const hasComposerOrLyricist = metadata.composer || metadata.lyricist;

  if (hasComposerOrLyricist) {
    const lineY = currentY + METADATA_TYPOGRAPHY.composerHeight / 2;

    if (metadata.composer) {
      composer = {
        text: metadata.composer,
        x: contentArea.x + contentArea.width, // Right-aligned
        y: lineY,
      };
    }

    if (metadata.lyricist) {
      lyricist = {
        text: metadata.lyricist,
        x: contentArea.x, // Left-aligned
        y: lineY,
      };
    }

    currentY += METADATA_TYPOGRAPHY.composerHeight;
  }

  return {
    title: { text: metadata.title, x: titleX, y: titleY },
    composer,
    lyricist,
    bottom: currentY + METADATA_TYPOGRAPHY.blockSpacing,
  };
};

/**
 * Calculates footer layout for page numbers and copyright.
 *
 * @param contentArea - The content area within margins
 * @param marginBottom - Bottom margin in pixels
 * @param pageNumber - Current page number (1-based)
 * @param copyright - Optional copyright text (page 1 only)
 * @returns FooterLayout with positioned page number and copyright
 */
const calculateFooterLayout = (
  contentArea: ContentArea,
  marginBottom: number,
  pageNumber: number = 1,
  copyright?: string
): FooterLayout => {
  // Footer sits at bottom of content area, with space for page number
  const footerHeight = 20; // Space for page number
  const footerY = contentArea.y + contentArea.height - footerHeight;

  const centerX = contentArea.x + contentArea.width / 2;
  const pageNumberY = contentArea.y + contentArea.height + marginBottom / 2;

  const result: FooterLayout = {
    y: footerY,
    pageNumber: {
      text: String(pageNumber),
      x: centerX,
      y: pageNumberY,
    },
  };

  // Add copyright on page 1 only, positioned above page number
  if (pageNumber === 1) {
    result.copyright = {
      text: copyright ?? '',
      x: centerX,
      y: pageNumberY - 16, // Above page number
    };
  }

  return result;
};

// =============================================================================
// MULTI-PAGE PAGINATION
// =============================================================================

/**
 * Calculates available height for systems on a page.
 *
 * @param pageIndex - 0-based page index
 * @param contentArea - The content area dimensions
 * @param metadataBottom - Y position where metadata ends (only affects page 0)
 * @returns Available height for systems in pixels
 */
export const calculateAvailableContentHeight = (
  pageIndex: number,
  contentArea: ContentArea,
  metadataBottom: number
): number => {
  // Reserve space for footer
  const baseHeight = contentArea.height - FOOTER_HEIGHT;

  if (pageIndex === 0) {
    // First page: subtract metadata block height
    const metadataHeight = metadataBottom - contentArea.y;
    return baseHeight - metadataHeight;
  }

  // Subsequent pages: full content area minus footer
  return baseHeight;
};

/** Minimum spacing between systems for packing calculation (page coords) */
const MIN_SYSTEM_SPACING = 12;

/**
 * Distributes systems across pages with vertical justification.
 *
 * Algorithm:
 * 1. Pack as many systems as possible per page using minimum spacing
 * 2. For full pages: distribute systems equidistantly (vertical justification)
 * 3. For final page: use same spacing as previous pages, or 1 staff height if single page
 *
 * @param systems - All systems to distribute (with heights calculated)
 * @param contentArea - Content area dimensions
 * @param metadataBottom - Y position where metadata ends
 * @param defaultSpacing - Default spacing (1 staff height, used for single-page scores)
 * @param systemHeight - Height of each system
 * @returns Array of page assignments with page-relative system Y coordinates
 */
export const distributeSystemsToPages = (
  systems: SystemLayout[],
  contentArea: ContentArea,
  metadataBottom: number,
  defaultSpacing: number,
  systemHeight: number
): { pageIndex: number; systems: SystemLayout[]; justifiedSpacing: number }[] => {
  if (systems.length === 0) {
    return [];
  }

  // ─── PHASE 1: Determine how many systems fit per page ───
  // Use minimum spacing to pack as many as possible
  const pageSystemCounts: number[] = [];
  const pageAvailableHeights: number[] = [];
  let remainingSystems = systems.length;
  let pageIndex = 0;

  while (remainingSystems > 0) {
    const availableHeight = calculateAvailableContentHeight(pageIndex, contentArea, metadataBottom);
    pageAvailableHeights.push(availableHeight);

    // Calculate how many systems fit with minimum spacing
    // First system: just systemHeight
    // Each additional: systemHeight + MIN_SYSTEM_SPACING
    let count = 0;
    let usedHeight = 0;

    while (remainingSystems > 0) {
      const neededHeight = count === 0 ? systemHeight : systemHeight + MIN_SYSTEM_SPACING;
      if (usedHeight + neededHeight > availableHeight && count > 0) {
        break; // Page is full
      }
      usedHeight += neededHeight;
      count++;
      remainingSystems--;
    }

    pageSystemCounts.push(count);
    pageIndex++;
  }

  // ─── PHASE 2: Determine which pages are "full" (at capacity) ───
  // A page is full if no more systems would fit with minimum spacing
  const pageIsFull: boolean[] = [];

  for (let i = 0; i < pageSystemCounts.length; i++) {
    const count = pageSystemCounts[i];
    const availableHeight = pageAvailableHeights[i];

    // Calculate space used with minimum spacing
    const usedHeight = count * systemHeight + Math.max(0, count - 1) * MIN_SYSTEM_SPACING;
    // Would one more system fit?
    const spaceForNext = systemHeight + MIN_SYSTEM_SPACING;
    const isFull = usedHeight + spaceForNext > availableHeight;

    pageIsFull.push(isFull);
  }

  // ─── PHASE 3: Calculate justified spacing for each page ───
  const pageJustifiedSpacings: number[] = [];

  for (let i = 0; i < pageSystemCounts.length; i++) {
    const count = pageSystemCounts[i];
    const availableHeight = pageAvailableHeights[i];

    if (count <= 1) {
      // Single system on page - no spacing needed
      pageJustifiedSpacings.push(0);
    } else if (pageIsFull[i]) {
      // Full page: justify vertically (distribute systems equidistantly)
      // spacing = (availableHeight - totalSystemsHeight) / (count - 1)
      const totalSystemsHeight = count * systemHeight;
      const justifiedSpacing = (availableHeight - totalSystemsHeight) / (count - 1);
      pageJustifiedSpacings.push(justifiedSpacing);
    } else {
      // Not full page: use previous full page's spacing or default
      // Find the most recent full page's spacing
      let spacingToUse = defaultSpacing;
      for (let j = i - 1; j >= 0; j--) {
        if (pageIsFull[j]) {
          spacingToUse = pageJustifiedSpacings[j];
          break;
        }
      }
      pageJustifiedSpacings.push(spacingToUse);
    }
  }

  // ─── PHASE 4: Build page assignments with justified Y positions ───
  const pages: { pageIndex: number; systems: SystemLayout[]; justifiedSpacing: number }[] = [];
  let systemIndex = 0;

  for (let i = 0; i < pageSystemCounts.length; i++) {
    const count = pageSystemCounts[i];
    const spacing = pageJustifiedSpacings[i];
    const startY = i === 0 ? metadataBottom : contentArea.y;

    const pageSystems: SystemLayout[] = [];
    let currentY = startY;

    for (let j = 0; j < count; j++) {
      pageSystems.push({
        ...systems[systemIndex],
        y: currentY,
      });
      currentY += systemHeight + spacing;
      systemIndex++;
    }

    pages.push({
      pageIndex: i,
      systems: pageSystems,
      justifiedSpacing: spacing,
    });
  }

  return pages;
};

/**
 * Calculates measure positions within a system.
 *
 * @param systemXOffset - X offset for the system
 * @param systemMeasures - Measure indices in this system
 * @param measureWidths - Array of all measure widths
 * @param systemContentWidth - Available content width for this system
 * @param justification - Justification factor (1.0 = full)
 * @returns Array of MeasurePosition with absolute X and computed width
 */
const calculateMeasurePositions = (
  systemXOffset: number,
  systemMeasures: number[],
  measureWidths: number[],
  systemContentWidth: number,
  justification: number
): MeasurePosition[] => {
  const positions: MeasurePosition[] = [];

  // Calculate natural total width
  const naturalWidth = systemMeasures.reduce((sum, idx) => sum + (measureWidths[idx] ?? 0), 0);

  // Stretch factor for justified systems
  const stretchFactor =
    justification === 1.0 && naturalWidth > 0 ? systemContentWidth / naturalWidth : 1.0;

  let currentX = systemXOffset;

  for (const measureIndex of systemMeasures) {
    const naturalMeasureWidth = measureWidths[measureIndex] ?? 0;
    const width = naturalMeasureWidth * stretchFactor;

    positions.push({
      measureIndex,
      x: currentX,
      width,
    });

    currentX += width;
  }

  return positions;
};

// =============================================================================
// PAGE LAYOUT CALCULATION
// =============================================================================

/**
 * Calculates the complete page layout for a score.
 *
 * This is the main entry point for page layout calculation.
 * Uses forward-flow Y positioning pattern (ADR-015).
 *
 * @param score - The score to layout
 * @param config - Layout configuration (uses defaults if not provided)
 * @returns Complete page layout with all systems
 */
export const calculatePageLayout = (
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): PageLayout => {
  const pageDims = PAGE_DIMENSIONS[config.pageSize];
  const margins = MARGIN_PRESETS[config.margins];
  const staffScale = config.staffSize / 100;
  // Note: config.systemSpacing is ignored in page view (vertical justification is used instead)

  // Convert margins to pixels
  const marginsPx: MarginsPx = {
    top: mmToPx(margins.top),
    right: mmToPx(margins.right),
    bottom: mmToPx(margins.bottom),
    left: mmToPx(margins.left),
  };

  // Page dimensions in pixels
  const pageWidth = mmToPx(pageDims.width);
  const pageHeight = mmToPx(pageDims.height);

  // Content area (drawable region within margins)
  const contentArea: ContentArea = {
    x: marginsPx.left,
    y: marginsPx.top,
    width: pageWidth - marginsPx.left - marginsPx.right,
    height: pageHeight - marginsPx.top - marginsPx.bottom,
  };

  // Calculate metadata layout (title, composer positioning)
  // Use score.metadata if available, otherwise create from score.title
  const effectiveMetadata = score.metadata ?? { title: score.title };
  const metadata = calculateMetadataLayout(effectiveMetadata, contentArea);

  // Calculate preamble widths for first and subsequent systems
  // First system: clef + key signature + time signature (wider)
  // Subsequent systems: clef + key signature only (narrower)
  const firstPreamble = calculateSystemPreamble(score.keySignature, { isFirstSystem: true });
  const subsequentPreamble = calculateSystemPreamble(score.keySignature, { isFirstSystem: false });

  // Preamble widths in staff coords (unscaled)
  const firstPreambleWidth = firstPreamble.measuresX;
  const subsequentPreambleWidth = subsequentPreamble.measuresX;

  // Calculate measure widths (excluding preamble, which is handled separately)
  const measureWidths = calculateAllMeasureWidths(score, staffScale);

  // Effective content widths for measures (page coords, after preamble)
  const firstSystemEffectiveWidth = contentArea.width - firstPreambleWidth * staffScale;
  const subsequentSystemEffectiveWidth = contentArea.width - subsequentPreambleWidth * staffScale;

  // Calculate system breaks with per-system widths
  const systemBreaks = calculateSystemBreaks(measureWidths, {
    firstSystemWidth: firstSystemEffectiveWidth,
    subsequentSystemWidth: subsequentSystemEffectiveWidth,
    firstSystemIndent: FIRST_SYSTEM_INDENT,
  });

  // Calculate staff height with scale (page coords)
  const scaledStaffHeight = STAFF_GEOMETRY.height * staffScale;

  // Default spacing for single-page scores: 1 staff height
  // Multi-page scores use vertical justification (spacing calculated per page)
  const defaultSpacing = scaledStaffHeight;

  // Calculate system height (staff height + spacing for staves in grand staff)
  const stavesCount = score.staves.length;
  const systemHeight =
    stavesCount > 1
      ? scaledStaffHeight * stavesCount + CONFIG.staffSpacing * staffScale * (stavesCount - 1)
      : scaledStaffHeight;

  // Build system layouts (without final Y positions - will be set during page distribution)
  const allSystems: SystemLayout[] = [];

  for (let i = 0; i < systemBreaks.length; i++) {
    const systemMeasures = systemBreaks[i];
    const isFirst = i === 0;
    const isLast = i === systemBreaks.length - 1;

    // Use per-system preamble width (staff coords)
    const systemPreambleWidth = isFirst ? firstPreambleWidth : subsequentPreambleWidth;
    const effectiveContentWidth = isFirst ? firstSystemEffectiveWidth : subsequentSystemEffectiveWidth;

    // First system indent (relative to effective content area)
    const indentX = isFirst ? FIRST_SYSTEM_INDENT * effectiveContentWidth : 0;

    // X offset: content area left + preamble width + indent (page coords)
    const xOffset = contentArea.x + systemPreambleWidth * staffScale + indentX;

    // Available width for this system (excludes indent)
    const systemContentWidth = isFirst
      ? effectiveContentWidth * (1 - FIRST_SYSTEM_INDENT)
      : effectiveContentWidth;

    // Calculate justification
    const justification = calculateJustification(
      systemMeasures,
      measureWidths,
      systemContentWidth,
      isLast
    );

    // Calculate measure positions within this system
    const measurePositions = calculateMeasurePositions(
      xOffset,
      systemMeasures,
      measureWidths,
      systemContentWidth,
      justification
    );

    allSystems.push({
      index: i,
      measures: systemMeasures,
      y: 0, // Will be set during page distribution
      height: systemHeight,
      xOffset,
      contentWidth: systemContentWidth,
      preambleWidth: systemPreambleWidth, // Staff coords (unscaled)
      isFirst,
      isLast,
      justification,
      measurePositions,
    });
  }

  // Distribute systems across pages with vertical justification
  const pageAssignments = distributeSystemsToPages(
    allSystems,
    contentArea,
    metadata.bottom,
    defaultSpacing,
    systemHeight
  );

  // Build Page objects
  const pages: Page[] = pageAssignments.map(({ pageIndex, systems: pageSystems }) => {
    const canvasY = pageIndex * (pageHeight + PAGE_GAP);

    // Update system indices relative to this page
    const pageRelativeSystems = pageSystems.map((system, idx) => ({
      ...system,
      // isFirst only for first system on first page
      isFirst: pageIndex === 0 && idx === 0,
      // isLast only for last system on last page
      isLast: pageIndex === pageAssignments.length - 1 && idx === pageSystems.length - 1,
    }));

    return {
      index: pageIndex,
      systems: pageRelativeSystems,
      footer: calculateFooterLayout(
        contentArea,
        marginsPx.bottom,
        pageIndex + 1, // 1-based page number
        pageIndex === 0 ? effectiveMetadata.copyright : undefined
      ),
      canvasY,
      isFirst: pageIndex === 0,
      isLast: pageIndex === pageAssignments.length - 1,
    };
  });

  const pageCount = pages.length;
  const totalHeight = pageCount * pageHeight + Math.max(0, pageCount - 1) * PAGE_GAP;

  // For backwards compatibility, use first page systems and footer
  const firstPageSystems = pages[0]?.systems ?? [];
  const firstPageFooter =
    pages[0]?.footer ?? calculateFooterLayout(contentArea, marginsPx.bottom, 1);

  return {
    pages,
    pageCount,
    pageGap: PAGE_GAP,
    totalHeight,
    systems: firstPageSystems,
    pageSize: config.pageSize,
    dimensions: { width: pageWidth, height: pageHeight },
    margins: config.margins,
    contentWidth: contentArea.width,
    firstSystemIndent: FIRST_SYSTEM_INDENT,
    staffScale,
    contentArea,
    marginsPx,
    metadata,
    footer: firstPageFooter,
  };
};

// =============================================================================
// LOOKUP FUNCTIONS
// =============================================================================

/**
 * Finds which system contains a given measure.
 *
 * @param measureIndex - 0-based measure index
 * @param pageLayout - The page layout to search
 * @returns System index, or -1 if not found
 */
export const getSystemForMeasure = (measureIndex: number, pageLayout: PageLayout): number => {
  for (const system of pageLayout.systems) {
    if (system.measures.includes(measureIndex)) {
      return system.index;
    }
  }
  return -1;
};

/**
 * Calculates the X origin of a measure within its system.
 *
 * @param measureIndex - 0-based measure index
 * @param pageLayout - The page layout
 * @param measureWidths - Array of measure widths
 * @returns Object with x position and system index, or null if not found
 */
export const getMeasureOriginInSystem = (
  measureIndex: number,
  pageLayout: PageLayout,
  measureWidths: number[]
): { x: number; systemIndex: number } | null => {
  const systemIndex = getSystemForMeasure(measureIndex, pageLayout);
  if (systemIndex === -1) return null;

  const system = pageLayout.systems[systemIndex];
  if (!system) return null;

  // Calculate X by summing widths of preceding measures in this system
  let x = system.xOffset;

  for (const idx of system.measures) {
    if (idx === measureIndex) {
      return { x, systemIndex };
    }

    const width = measureWidths[idx] ?? 0;

    // Apply justification if system is justified
    if (system.justification === 1.0 && system.measures.length > 1) {
      const naturalWidth = system.measures.reduce((sum, i) => sum + (measureWidths[i] ?? 0), 0);
      const stretchFactor = system.contentWidth / naturalWidth;
      x += width * stretchFactor;
    } else {
      x += width;
    }
  }

  return null;
};

/**
 * Finds which page contains a given measure.
 *
 * @param measureIndex - 0-based measure index
 * @param pageLayout - The page layout to search
 * @returns Page index, or -1 if not found
 */
export const getPageForMeasure = (measureIndex: number, pageLayout: PageLayout): number => {
  for (const page of pageLayout.pages) {
    for (const system of page.systems) {
      if (system.measures.includes(measureIndex)) {
        return page.index;
      }
    }
  }
  return -1;
};
