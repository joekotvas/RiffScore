# Page View & Print - Software Design Document

**Feature:** Page View Mode with System Breaks and Print Support
**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Status:** Draft
**Date:** 2026-02-14
**Parent:** [PRD.md](./PRD.md) | [SRS.md](./SRS.md)

---

## 1. Overview

### 1.1 Purpose

This document describes the software architecture and detailed design for implementing page view mode with system breaks and print support in RiffScore. It maps requirements from the SRS to concrete code structures, following established project patterns.

### 1.2 Design Principles

1. **Layer Separation:** Components → Hooks → Engines → Services
2. **Command Pattern:** All layout/metadata mutations through undoable commands
3. **Fail-Soft API:** Structured feedback, never throw
4. **Existing Patterns:** Follow ADRs 004 (Factory), 005 (Dispatch), 011 (Feedback), 015 (Forward-Flow Y), 016 (Measure-Relative X)

### 1.3 Architecture Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                           COMPONENTS                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐ │
│  │ ViewToggle   │  │ ScoreSetup   │  │ ScoreCanvas                │ │
│  │ (button)     │  │ Dialog       │  │ (multi-system rendering)   │ │
│  └──────┬───────┘  └──────┬───────┘  └─────────────┬──────────────┘ │
│         │                 │                         │                │
├─────────┼─────────────────┼─────────────────────────┼────────────────┤
│         │          HOOKS  │                         │                │
│         ▼                 ▼                         ▼                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    usePageLayout                                 ││
│  │  - system break calculation, justification, Y positioning        ││
│  └──────────────────────────────┬──────────────────────────────────┘│
│                                 │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    useScoreSetup                                 ││
│  │  - dialog state, metadata editing, layout config                 ││
│  └──────────────────────────────┬──────────────────────────────────┘│
│                                 │                                    │
├─────────────────────────────────┼────────────────────────────────────┤
│                          ENGINES│                                    │
│                                 ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    ScoreLayout (extended)                        ││
│  │  - getX with system awareness, getSystemForMeasure               ││
│  └──────────────────────────────┬──────────────────────────────────┘│
│                                 │                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    ScoreEngine                                   ││
│  │  - executes layout/metadata commands with undo/redo              ││
│  └──────────────────────────────┬──────────────────────────────────┘│
│                                 │                                    │
├─────────────────────────────────┼────────────────────────────────────┤
│                        SERVICES │                                    │
│                                 ▼                                    │
│  ┌────────────────┐  ┌─────────────────┐  ┌────────────────────────┐│
│  │ PageLayout     │  │ PrintService    │  │ MetadataService        ││
│  │ Service        │  │ (print prep)    │  │ (validation)           ││
│  └────────────────┘  └─────────────────┘  └────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. File Organization

### 2.1 New Files

```
src/
├── services/
│   ├── PageLayoutService.ts        # System break calculation (~150 lines)
│   ├── PrintService.ts             # Print preparation (~80 lines)
│   └── MetadataService.ts          # Metadata validation (~60 lines)
│
├── commands/
│   └── layout/
│       ├── SetViewModeCommand.ts       # Toggle view mode (~40 lines)
│       ├── SetLayoutConfigCommand.ts   # Update layout config (~50 lines)
│       ├── SetMetadataCommand.ts       # Update metadata (~45 lines)
│       └── index.ts                    # Barrel export
│
├── components/
│   ├── Toolbar/
│   │   ├── ViewToggle.tsx              # View mode button (~60 lines)
│   │   ├── ScoreSetupButton.tsx        # Score Setup button (~30 lines)
│   │   └── PrintButton.tsx             # Print button (~40 lines)
│   │
│   └── Dialog/
│       └── ScoreSetupDialog/
│           ├── ScoreSetupDialog.tsx    # Main dialog (~150 lines)
│           ├── MetadataSection.tsx     # Metadata form (~80 lines)
│           ├── LayoutSection.tsx       # Layout controls (~100 lines)
│           ├── ScoreSetupDialog.css    # Styles (~80 lines)
│           └── index.ts                # Barrel export
│
├── hooks/
│   └── layout/
│       ├── usePageLayout.ts            # System layout logic (~200 lines)
│       ├── useScoreSetup.ts            # Dialog state & handlers (~150 lines)
│       └── useMetadataTrack.ts         # Metadata editing (reuses useChordTrack pattern) (~120 lines)
│
├── hooks/api/
│   ├── layout.ts                       # Layout API factory (~120 lines)
│   └── metadata.ts                     # Metadata API factory (~80 lines)
│
├── styles/
│   └── print.css                       # Print stylesheet (~100 lines)
│
└── __tests__/
    ├── services/
    │   ├── PageLayoutService.test.ts
    │   └── PrintService.test.ts
    ├── commands/
    │   └── layout/
    │       └── LayoutCommands.test.ts
    └── hooks/
        └── usePageLayout.test.ts
```

### 2.2 Extended Existing Files

| File | Change | Lines Added |
|------|--------|-------------|
| `src/types.ts` | Add `ScoreMetadata`, `LayoutConfig`, `SystemLayout`, `PageLayout` | ~60 |
| `src/config.ts` | Add `DEFAULT_LAYOUT_CONFIG`, `DEFAULT_SCORE_METADATA` | ~20 |
| `src/engines/layout/scoreLayout.ts` | Add `getSystemForMeasure()`, update `getX()` for systems | ~80 |
| `src/hooks/api/useScoreAPI.ts` | Import and spread layout/metadata methods | ~5 |
| `src/api.types.ts` | Add layout/metadata method type definitions | ~40 |
| `src/styles/theme.css` | Add page view CSS variables | ~15 |

### 2.3 Modified Files (Rendering & Export)

| File | Changes |
|------|---------|
| `src/components/Canvas/ScoreCanvas.tsx` | Render multiple systems in page view |
| `src/components/Canvas/MetadataTrack.tsx` | New: Container for metadata editing (reuses ChordTrack pattern) (~150 lines) |
| `src/components/Canvas/MetadataField.tsx` | New: Display component (analogous to ChordSymbol) (~60 lines) |
| `src/components/Canvas/MetadataInput.tsx` | New: Input component (analogous to ChordInput) (~100 lines) |
| `src/components/Canvas/PageFooter.tsx` | New: Page footer (copyright + page number) (~80 lines) |
| `src/components/Canvas/PageBoundary.tsx` | New component for page outline (~40 lines) |
| `src/components/Canvas/Staff.tsx` | Render clef/key on each system |
| `src/components/Canvas/Tie.tsx` | Handle tie splitting at system breaks |
| `src/components/Canvas/Barline.tsx` | Extend barlines across staves |
| `src/components/Canvas/MeasureNumber.tsx` | New component for measure numbers |
| `src/components/Toolbar/Toolbar.tsx` | Add ViewToggle and ScoreSetupButton |
| `src/exporters/abcExporter.ts` | Export metadata |
| `src/exporters/musicXmlExporter.ts` | Export metadata |

---

## 3. Type Definitions

### 3.1 Core Types (src/types.ts additions)

```typescript
// ========== PAGE VIEW & LAYOUT ==========
// Add to existing src/types.ts

/**
 * Score metadata for display and export.
 */
export interface ScoreMetadata {
  /** Score title (required, pre-filled to "Untitled") */
  title: string;

  /** Composer name */
  composer?: string;

  /** Lyricist name */
  lyricist?: string;

  /** Copyright notice */
  copyright?: string;
}

/**
 * Layout configuration for page view.
 */
export interface LayoutConfig {
  /** Page size identifier */
  pageSize: 'letter' | 'a4';

  /** Page margins preset */
  margins: 'narrow' | 'normal' | 'wide';

  /** Staff size as percentage (100 = default), stepped by 10 */
  staffSize: number;

  /** Spacing between systems */
  systemSpacing: 'compact' | 'normal' | 'relaxed';

  /** Current view mode */
  viewMode: 'scroll' | 'page';
}

/**
 * Computed layout for a single system (line of music).
 */
export interface SystemLayout {
  /** 0-based system index */
  index: number;

  /** Measure indices contained in this system */
  measures: number[];

  /** Y position of system top */
  y: number;

  /** Total height of system */
  height: number;

  /** X offset (indent for first system) */
  xOffset: number;

  /** Available content width */
  contentWidth: number;

  /** First system flag */
  isFirst: boolean;

  /** Last system flag */
  isLast: boolean;

  /** Justification factor (1.0 = full, <1.0 = natural) */
  justification: number;
}

/**
 * Complete page layout with all systems.
 */
export interface PageLayout {
  /** Systems on this page */
  systems: SystemLayout[];

  /** Page dimensions */
  pageSize: 'letter' | 'a4';
  dimensions: { width: number; height: number };

  /** Margins in mm */
  margins: LayoutConfig['margins'];

  /** Computed content width */
  contentWidth: number;

  /** First system indent (0-1) */
  firstSystemIndent: number;

  /** Staff scale factor */
  staffScale: number;
}
```

### 3.2 Score Extension

```typescript
// Extend existing Score interface
export interface Score {
  // ... existing fields ...

  /** Score metadata for display and export */
  metadata?: ScoreMetadata;

  /** Layout configuration */
  layout?: LayoutConfig;
}
```

### 3.3 Config Defaults (src/config.ts additions)

```typescript
/**
 * Default score metadata.
 */
export const DEFAULT_SCORE_METADATA: ScoreMetadata = {
  title: 'Untitled',
};

/**
 * Default layout configuration.
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  pageSize: 'letter',
  margins: 'normal',
  staffSize: 100,
  systemSpacing: 'normal',
  viewMode: 'scroll',
};

/**
 * Margin preset values in mm.
 */
export const MARGIN_PRESETS = {
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  normal: { top: 19, right: 19, bottom: 19, left: 19 },
  wide: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
} as const;

/**
 * Page dimensions in mm.
 */
export const PAGE_DIMENSIONS = {
  letter: { width: 215.9, height: 279.4 },
  a4: { width: 210, height: 297 },
} as const;

/**
 * System spacing multipliers.
 */
export const SYSTEM_SPACING_MULTIPLIERS = {
  compact: 1.5,
  normal: 2.0,
  relaxed: 2.5,
} as const;

/**
 * First system indent as fraction of content width.
 */
export const FIRST_SYSTEM_INDENT = 0.15;

/**
 * Layout element widths in SVG units.
 * These are base values; multiply by staffScale for actual width.
 */
export const LAYOUT_WIDTHS = {
  clef: 30,
  timeSignature: 24,
  barline: 2,
  keySignaturePerAccidental: 10,
} as const;

/**
 * Metadata typography heights in SVG units.
 * Used for calculating title block dimensions.
 */
export const METADATA_TYPOGRAPHY = {
  titleHeight: 30,
  composerHeight: 16,
  blockSpacing: 20,
} as const;

/**
 * Timing constants in milliseconds.
 */
export const TIMING = {
  /** Delay before opening print dialog to allow styles to settle */
  printStyleSettleMs: 100,
} as const;

// Helper functions (add to src/engines/layout/layoutUtils.ts)

/**
 * Get staff height based on scale.
 *
 * @tested src/__tests__/engines/layout/layoutUtils.test.ts
 */
export const getStaffHeight = (staffScale: number): number =>
  CONFIG.staffHeight * staffScale;

/**
 * Get spacing for an event based on its duration.
 *
 * @tested src/__tests__/engines/layout/layoutUtils.test.ts
 */
export const getEventSpacing = (event: Event, staffScale: number): number => {
  const baseSpacing = CONFIG.baseNoteSpacing * Math.sqrt(event.duration / 16);
  return baseSpacing * staffScale;
};

/**
 * Get key signature width based on number of accidentals.
 *
 * @tested src/__tests__/engines/layout/layoutUtils.test.ts
 */
export const getKeySignatureWidth = (keySignature: string): number => {
  const accidentalCount = getAccidentalCount(keySignature);
  return accidentalCount * LAYOUT_WIDTHS.keySignaturePerAccidental;
};

/**
 * Calculate header height for title block.
 *
 * @tested src/__tests__/engines/layout/layoutUtils.test.ts
 */
export const calculateHeaderHeight = (config: LayoutConfig): number => {
  const { titleHeight, composerHeight, blockSpacing } = METADATA_TYPOGRAPHY;
  const totalHeight = titleHeight + composerHeight + blockSpacing;
  return totalHeight * (config.staffSize / 100);
};
```

### 3.4 Dialog State Types

```typescript
/**
 * Score Setup dialog state.
 *
 * Note: Dialog uses live preview with batched undo on cancel.
 * Changes are applied immediately but can be undone as a single operation.
 */
export interface ScoreSetupState {
  /** Dialog open state */
  isOpen: boolean;

  /** Number of commands executed since dialog opened (for batch undo) */
  commandCount: number;

  /** Validation errors */
  errors: {
    title?: string;
    staffSize?: string;
  };
}
```

---

## 4. Service Design

### 4.1 PageLayoutService (src/services/PageLayoutService.ts)

The PageLayoutService calculates system breaks and layout positions.

```typescript
/**
 * PageLayoutService - System break calculation and layout positioning.
 *
 * Follows forward-flow pattern (ADR-015) for Y positioning.
 * Uses measure-relative X (ADR-016) for multi-system support.
 *
 * @see Issue #174
 * @tested src/__tests__/services/PageLayoutService.test.ts
 */

import { Score, LayoutConfig, SystemLayout, PageLayout } from '@/types';
import {
  PAGE_DIMENSIONS,
  SYSTEM_SPACING_MULTIPLIERS,
  FIRST_SYSTEM_INDENT,
  DEFAULT_LAYOUT_CONFIG,
} from '@/config';

// ============================================================================
// 1. MEASURE WIDTH CALCULATION
// ============================================================================

/**
 * Calculate the rendered width of a measure.
 * Accounts for clef, key signature, time signature, and notes.
 */
export const calculateMeasureWidth = (
  score: Score,
  measureIndex: number,
  staffScale: number
): number => {
  const measure = score.staves[0].measures[measureIndex];
  if (!measure) return 0;

  let width = 0;

  // Base note spacing
  for (const event of measure.events) {
    width += getEventSpacing(event, staffScale);
  }

  // Clef (first measure or after change)
  if (measureIndex === 0) {
    width += CLEF_WIDTH * staffScale;
  }

  // Key signature (first measure or after change)
  if (measureIndex === 0) {
    width += getKeySignatureWidth(score.keySignature) * staffScale;
  }

  // Time signature (first measure or after change)
  if (measureIndex === 0) {
    width += TIME_SIGNATURE_WIDTH * staffScale;
  }

  // Barline
  width += BARLINE_WIDTH;

  return width;
};

/**
 * Calculate widths for all measures.
 */
export const calculateAllMeasureWidths = (
  score: Score,
  staffScale: number
): number[] => {
  const measureCount = score.staves[0]?.measures.length ?? 0;
  return Array.from({ length: measureCount }, (_, i) =>
    calculateMeasureWidth(score, i, staffScale)
  );
};

// ============================================================================
// 2. SYSTEM BREAK CALCULATION
// ============================================================================

/**
 * Calculate which measures belong to each system.
 * Uses greedy algorithm to fill systems.
 */
export const calculateSystemBreaks = (
  measureWidths: number[],
  contentWidth: number,
  firstSystemIndent: number = FIRST_SYSTEM_INDENT
): number[][] => {
  if (measureWidths.length === 0) return [];

  const systems: number[][] = [];
  let currentSystem: number[] = [];
  let currentWidth = 0;
  let isFirstSystem = true;

  for (let i = 0; i < measureWidths.length; i++) {
    const measureWidth = measureWidths[i];
    const availableWidth = isFirstSystem
      ? contentWidth * (1 - firstSystemIndent)
      : contentWidth;

    // Always accept first measure in a system
    if (currentSystem.length === 0) {
      currentSystem.push(i);
      currentWidth = measureWidth;
      continue;
    }

    // Check if measure fits
    if (currentWidth + measureWidth <= availableWidth) {
      currentSystem.push(i);
      currentWidth += measureWidth;
    } else {
      // Start new system
      systems.push(currentSystem);
      currentSystem = [i];
      currentWidth = measureWidth;
      isFirstSystem = false;
    }
  }

  // Add final system
  if (currentSystem.length > 0) {
    systems.push(currentSystem);
  }

  return systems;
};

// ============================================================================
// 3. JUSTIFICATION CALCULATION
// ============================================================================

/**
 * Calculate justification factor for a system.
 * Returns 1.0 for full justification, <1.0 for natural width.
 */
export const calculateJustification = (
  systemMeasures: number[],
  measureWidths: number[],
  availableWidth: number,
  isLastSystem: boolean
): number => {
  const naturalWidth = systemMeasures.reduce(
    (sum, idx) => sum + measureWidths[idx],
    0
  );

  // Last system: ragged if < 60% full
  if (isLastSystem && naturalWidth < availableWidth * 0.6) {
    return naturalWidth / availableWidth;
  }

  // Full justification
  return 1.0;
};

// ============================================================================
// 4. COMPLETE PAGE LAYOUT
// ============================================================================

/**
 * Calculate complete page layout with all systems.
 */
export const calculatePageLayout = (
  score: Score,
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): PageLayout => {
  const pageDimensions = PAGE_DIMENSIONS[config.pageSize];
  const staffScale = config.staffSize / 100;

  // Calculate content width
  const contentWidth =
    pageDimensions.width - config.margins.left - config.margins.right;

  // Calculate measure widths
  const measureWidths = calculateAllMeasureWidths(score, staffScale);

  // Calculate system breaks
  const systemBreaks = calculateSystemBreaks(
    measureWidths,
    contentWidth,
    FIRST_SYSTEM_INDENT
  );

  // Build system layouts
  const systems = buildSystemLayouts(
    systemBreaks,
    measureWidths,
    contentWidth,
    config,
    score.staves.length
  );

  return {
    systems,
    pageSize: config.pageSize,
    dimensions: pageDimensions,
    margins: config.margins,
    contentWidth,
    firstSystemIndent: FIRST_SYSTEM_INDENT,
    staffScale,
  };
};

/**
 * Build SystemLayout objects with positions and justification.
 */
const buildSystemLayouts = (
  systemBreaks: number[][],
  measureWidths: number[],
  contentWidth: number,
  config: LayoutConfig,
  numStaves: number
): SystemLayout[] => {
  const staffHeight = getStaffHeight(config.staffSize / 100);
  const systemHeight = staffHeight * numStaves;
  const spacingMultiplier = SYSTEM_SPACING_MULTIPLIERS[config.systemSpacing];
  const headerHeight = calculateHeaderHeight(config);

  let currentY = headerHeight;

  return systemBreaks.map((measures, index) => {
    const isFirst = index === 0;
    const isLast = index === systemBreaks.length - 1;
    const xOffset = isFirst ? contentWidth * FIRST_SYSTEM_INDENT : 0;
    const availableWidth = contentWidth - xOffset;

    const justification = calculateJustification(
      measures,
      measureWidths,
      availableWidth,
      isLast
    );

    const system: SystemLayout = {
      index,
      measures,
      y: currentY,
      height: systemHeight,
      xOffset,
      contentWidth: availableWidth,
      isFirst,
      isLast,
      justification,
    };

    // Advance Y for next system
    currentY += systemHeight + systemHeight * spacingMultiplier;

    return system;
  });
};

// ============================================================================
// 5. LOOKUP FUNCTIONS
// ============================================================================

/**
 * Find the system containing a given measure.
 */
export const getSystemForMeasure = (
  measureIndex: number,
  pageLayout: PageLayout
): SystemLayout | null => {
  return (
    pageLayout.systems.find((s) => s.measures.includes(measureIndex)) ?? null
  );
};

/**
 * Get measure origin X within its system.
 */
export const getMeasureOriginInSystem = (
  measureIndex: number,
  pageLayout: PageLayout,
  measureWidths: number[]
): { x: number; systemIndex: number } | null => {
  const system = getSystemForMeasure(measureIndex, pageLayout);
  if (!system) return null;

  let x = system.xOffset;
  for (const idx of system.measures) {
    if (idx === measureIndex) break;
    x += measureWidths[idx] * system.justification;
  }

  return { x, systemIndex: system.index };
};
```

### 4.2 PrintService (src/services/PrintService.ts)

```typescript
/**
 * PrintService - Print preparation and cleanup.
 *
 * @see Issue #174
 * @tested src/__tests__/services/PrintService.test.ts
 */

import { TIMING } from '@/config';

/**
 * Prepare the document for printing.
 * Adds print class to body, hides UI elements.
 *
 * @tested src/__tests__/services/PrintService.test.ts
 */
export const preparePrint = (): void => {
  document.body.classList.add('riff-printing');

  // Ensure page view mode for print
  const editor = document.querySelector('.riff-editor');
  if (editor) {
    editor.setAttribute('data-print-mode', 'true');
  }
};

/**
 * Restore normal view after printing.
 *
 * @tested src/__tests__/services/PrintService.test.ts
 */
export const restoreFromPrint = (): void => {
  document.body.classList.remove('riff-printing');

  const editor = document.querySelector('.riff-editor');
  if (editor) {
    editor.removeAttribute('data-print-mode');
  }
};

/**
 * Open browser print dialog.
 *
 * @tested src/__tests__/services/PrintService.test.ts
 */
export const openPrintDialog = (): void => {
  preparePrint();

  // Delay to ensure styles are applied before print dialog opens
  setTimeout(() => {
    window.print();

    // Restore after print dialog closes
    // Note: afterprint fires when dialog opens, but CSS handles hiding
    window.addEventListener(
      'afterprint',
      () => {
        restoreFromPrint();
      },
      { once: true }
    );
  }, TIMING.printStyleSettleMs);
};
```

### 4.3 MetadataService (src/services/MetadataService.ts)

```typescript
/**
 * MetadataService - Metadata validation and normalization.
 *
 * @see Issue #174
 * @tested src/__tests__/services/MetadataService.test.ts
 */

import { ScoreMetadata } from '@/types';

export interface MetadataValidationResult {
  ok: boolean;
  errors: {
    title?: string;
    composer?: string;
    lyricist?: string;
    copyright?: string;
  };
}

/**
 * Validate score metadata.
 */
export const validateMetadata = (
  metadata: Partial<ScoreMetadata>
): MetadataValidationResult => {
  const errors: MetadataValidationResult['errors'] = {};

  // Title is required
  if (!metadata.title || metadata.title.trim().length === 0) {
    errors.title = 'Title is required';
  } else if (metadata.title.length > 200) {
    errors.title = 'Title must be 200 characters or less';
  }

  // Validate field lengths
  if (metadata.composer && metadata.composer.length > 100) {
    errors.composer = 'Composer must be 100 characters or less';
  }

  if (metadata.lyricist && metadata.lyricist.length > 100) {
    errors.lyricist = 'Lyricist must be 100 characters or less';
  }

  if (metadata.copyright && metadata.copyright.length > 300) {
    errors.copyright = 'Copyright must be 300 characters or less';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
};

/**
 * Normalize metadata (trim whitespace, etc.).
 */
export const normalizeMetadata = (
  metadata: Partial<ScoreMetadata>
): ScoreMetadata => {
  return {
    title: metadata.title?.trim() || 'Untitled',
    composer: metadata.composer?.trim() || undefined,
    lyricist: metadata.lyricist?.trim() || undefined,
    copyright: metadata.copyright?.trim() || undefined,
  };
};
```

---

## 5. Command Design

### 5.1 SetViewModeCommand

```typescript
/**
 * SetViewModeCommand
 *
 * Toggles between scroll view and page view.
 *
 * @see Issue #174
 */

import { Command, CommandResult } from '@/commands/types';
import { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export class SetViewModeCommand implements Command {
  readonly type = 'SET_VIEW_MODE';
  private previousMode: LayoutConfig['viewMode'];

  constructor(private newMode: LayoutConfig['viewMode']) {}

  execute(score: Score): CommandResult<Score> {
    const layout = score.layout ?? DEFAULT_LAYOUT_CONFIG;
    this.previousMode = layout.viewMode;

    if (this.previousMode === this.newMode) {
      return { ok: true, value: score };
    }

    return {
      ok: true,
      value: {
        ...score,
        layout: {
          ...layout,
          viewMode: this.newMode,
        },
      },
    };
  }

  undo(score: Score): CommandResult<Score> {
    const layout = score.layout ?? DEFAULT_LAYOUT_CONFIG;

    return {
      ok: true,
      value: {
        ...score,
        layout: {
          ...layout,
          viewMode: this.previousMode,
        },
      },
    };
  }

  describe(): string {
    return `Set view mode to ${this.newMode}`;
  }
}
```

### 5.2 SetLayoutConfigCommand

```typescript
/**
 * SetLayoutConfigCommand
 *
 * Updates layout configuration (page size, margins, etc.).
 *
 * @see Issue #174
 */

import { Command, CommandResult } from '@/commands/types';
import { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export class SetLayoutConfigCommand implements Command {
  readonly type = 'SET_LAYOUT_CONFIG';
  private previousConfig: LayoutConfig;

  constructor(private updates: Partial<LayoutConfig>) {}

  execute(score: Score): CommandResult<Score> {
    this.previousConfig = score.layout ?? DEFAULT_LAYOUT_CONFIG;

    const newConfig: LayoutConfig = {
      ...this.previousConfig,
      ...this.updates,
    };

    // Validate margins preset
    if (newConfig.margins && !['narrow', 'normal', 'wide'].includes(newConfig.margins)) {
      newConfig.margins = 'normal';
    }

    // Validate and round staff size to nearest 10%
    newConfig.staffSize = Math.round(clamp(newConfig.staffSize, 50, 150) / 10) * 10;

    return {
      ok: true,
      value: {
        ...score,
        layout: newConfig,
      },
    };
  }

  undo(score: Score): CommandResult<Score> {
    return {
      ok: true,
      value: {
        ...score,
        layout: this.previousConfig,
      },
    };
  }

  describe(): string {
    return 'Update layout configuration';
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
```

### 5.3 SetMetadataCommand

```typescript
/**
 * SetMetadataCommand
 *
 * Updates score metadata (title, composer, etc.).
 *
 * @see Issue #174
 */

import { Command, CommandResult } from '@/commands/types';
import { Score, ScoreMetadata } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';
import { validateMetadata, normalizeMetadata } from '@/services/MetadataService';

export class SetMetadataCommand implements Command {
  readonly type = 'SET_METADATA';
  private previousMetadata: ScoreMetadata;

  constructor(private updates: Partial<ScoreMetadata>) {}

  execute(score: Score): CommandResult<Score> {
    this.previousMetadata = score.metadata ?? DEFAULT_SCORE_METADATA;

    const merged = {
      ...this.previousMetadata,
      ...this.updates,
    };

    // Validate
    const validation = validateMetadata(merged);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: Object.values(validation.errors).join(', '),
        },
      };
    }

    // Normalize and apply
    const normalized = normalizeMetadata(merged);

    return {
      ok: true,
      value: {
        ...score,
        metadata: normalized,
      },
    };
  }

  undo(score: Score): CommandResult<Score> {
    return {
      ok: true,
      value: {
        ...score,
        metadata: this.previousMetadata,
      },
    };
  }

  describe(): string {
    return 'Update score metadata';
  }
}
```

---

## 6. Component Design

### 6.1 ViewToggle Component

```typescript
/**
 * ViewToggle
 *
 * Toolbar button to toggle between scroll and page view.
 * Uses ToolbarButton for consistent styling and accessibility.
 *
 * @see Issue #174
 * @tested src/__tests__/components/Toolbar/ViewToggle.test.tsx
 */

import React from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';
import { ToolbarButton } from '@/components/Toolbar/ToolbarButton';
import { CONFIG } from '@/config';
import { isMac } from '@/utils/platform';

const ICON_SIZE = CONFIG.toolbar.iconSize;

export const ViewToggle: React.FC = () => {
  const api = useScoreAPI();
  const viewMode = api.getViewMode();
  const isPageView = viewMode === 'page';

  const handleToggle = () => {
    api.toggleViewMode();
  };

  const shortcutKey = isMac() ? 'Cmd' : 'Ctrl';

  return (
    <ToolbarButton
      label={isPageView ? 'Scroll View' : 'Page View'}
      icon={isPageView ? <ScrollViewIcon /> : <PageViewIcon />}
      onClick={handleToggle}
      title={`${isPageView ? 'Scroll View' : 'Page View'} (${shortcutKey}+\\)`}
    />
  );
};

const ScrollViewIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
    <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" />
  </svg>
);

const PageViewIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
    <rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" />
    <path d="M3 9h18M3 15h18" stroke="currentColor" />
  </svg>
);
```

### 6.2 PrintButton Component

```typescript
/**
 * PrintButton
 *
 * Toolbar button to open the browser print dialog.
 * Uses ToolbarButton for consistent styling and accessibility.
 *
 * @see Issue #174
 * @tested src/__tests__/components/Toolbar/PrintButton.test.tsx
 */

import React from 'react';
import { openPrintDialog } from '@/services/PrintService';
import { ToolbarButton } from '@/components/Toolbar/ToolbarButton';
import { CONFIG } from '@/config';
import { isMac } from '@/utils/platform';

const ICON_SIZE = CONFIG.toolbar.iconSize;

export const PrintButton: React.FC = () => {
  const handlePrint = () => {
    openPrintDialog();
  };

  const shortcutKey = isMac() ? 'Cmd' : 'Ctrl';

  return (
    <ToolbarButton
      label="Print"
      icon={<PrintIcon />}
      onClick={handlePrint}
      title={`Print (${shortcutKey}+P)`}
    />
  );
};

const PrintIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
    <path d="M6 9V2h12v7" fill="none" stroke="currentColor" />
    <rect x="3" y="9" width="18" height="9" rx="1" fill="none" stroke="currentColor" />
    <path d="M6 18v4h12v-4" fill="none" stroke="currentColor" />
    <line x1="6" y1="14" x2="18" y2="14" stroke="currentColor" />
  </svg>
);
```

### 6.3 ScoreSetupButton Component

```typescript
/**
 * ScoreSetupButton
 *
 * Toolbar button to open the Score Setup dialog.
 * Uses ToolbarButton for consistent styling and accessibility.
 *
 * @see Issue #174
 * @tested src/__tests__/components/Toolbar/ScoreSetupButton.test.tsx
 */

import React from 'react';
import { ToolbarButton } from '@/components/Toolbar/ToolbarButton';
import { CONFIG } from '@/config';
import { isMac } from '@/utils/platform';

const ICON_SIZE = CONFIG.toolbar.iconSize;

interface ScoreSetupButtonProps {
  onClick: () => void;
}

export const ScoreSetupButton: React.FC<ScoreSetupButtonProps> = ({ onClick }) => {
  const shortcutKey = isMac() ? 'Cmd' : 'Ctrl';

  return (
    <ToolbarButton
      label="Score Setup"
      icon={<GearIcon />}
      onClick={onClick}
      title={`Score Setup (${shortcutKey}+,)`}
    />
  );
};

const GearIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" />
    <path
      d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
      stroke="currentColor"
      strokeLinecap="round"
    />
  </svg>
);
```

### 6.4 ScoreSetupDialog Component

```typescript
/**
 * ScoreSetupDialog
 *
 * Modal dialog for editing score metadata and layout configuration.
 *
 * @see Issue #174
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';
import { MetadataSection } from './MetadataSection';
import { LayoutSection } from './LayoutSection';
import { ScoreMetadata, LayoutConfig } from '@/types';
import './ScoreSetupDialog.css';

interface ScoreSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScoreSetupDialog: React.FC<ScoreSetupDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const api = useScoreAPI();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Track command count for batch undo on cancel
  const [commandCountOnOpen, setCommandCountOnOpen] = useState(0);

  // Capture command count when dialog opens (for batch undo)
  useEffect(() => {
    if (isOpen) {
      setCommandCountOnOpen(api.getCommandCount());
      setErrors({});
    }
  }, [isOpen, api]);

  // Live preview: apply changes immediately via commands
  const handleMetadataChange = useCallback((metadata: ScoreMetadata) => {
    if (!metadata.title?.trim()) {
      setErrors({ title: 'Title is required' });
      return;
    }
    setErrors({});
    api.setMetadata(metadata);  // Live preview via command
  }, [api]);

  const handleLayoutChange = useCallback((layout: LayoutConfig) => {
    api.setLayoutConfig(layout);  // Live preview via command
  }, [api]);

  const handleSave = useCallback(() => {
    // Validate current state
    const currentMetadata = api.getMetadata();
    if (!currentMetadata.title?.trim()) {
      setErrors({ title: 'Title is required' });
      return;
    }

    // Changes already applied; just close
    onClose();
  }, [api, onClose]);

  const handleCancel = useCallback(() => {
    // Batch undo all commands since dialog opened
    const currentCount = api.getCommandCount();
    const commandsToUndo = currentCount - commandCountOnOpen;
    for (let i = 0; i < commandsToUndo; i++) {
      api.undo();
    }
    onClose();
  }, [api, commandCountOnOpen, onClose]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel();
      } else if (e.key === 'Enter' && !isTextInput(e.target)) {
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleCancel, handleSave]);

  if (!isOpen) return null;

  return (
    <div
      className="riff-dialog-backdrop"
      onClick={handleCancel}
      role="presentation"
    >
      <div
        className="riff-dialog riff-score-setup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="riff-dialog__header">
          <h2 id="score-setup-title">Score Setup</h2>
          <button
            className="riff-dialog__close"
            onClick={handleCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Single scrollable form with section headers */}
        <div className="riff-dialog__content riff-dialog__content--scrollable">
          {/* Metadata Section */}
          <MetadataSection
            metadata={api.getMetadata()}
            onChange={handleMetadataChange}
            errors={errors}
          />

          {/* Layout Section */}
          <LayoutSection
            layout={api.getLayoutConfig()}
            onChange={handleLayoutChange}
          />
        </div>

        {/* Footer */}
        <div className="riff-dialog__footer">
          <button className="riff-btn riff-btn--secondary" onClick={handleCancel}>
            Cancel
          </button>
          <button className="riff-btn riff-btn--primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

const isTextInput = (target: EventTarget | null): boolean => {
  if (!target) return false;
  const el = target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
};
```

### 6.5 MetadataSection Component

```typescript
/**
 * MetadataSection
 *
 * Form fields for score metadata editing.
 * Part of the single scrollable Score Setup form.
 */

import React from 'react';
import { ScoreMetadata } from '@/types';

interface MetadataSectionProps {
  metadata: ScoreMetadata;
  onChange: (metadata: ScoreMetadata) => void;
  errors: Record<string, string>;
}

export const MetadataSection: React.FC<MetadataSectionProps> = ({
  metadata,
  onChange,
  errors,
}) => {
  const handleChange = (field: keyof ScoreMetadata, value: string) => {
    onChange({
      ...metadata,
      [field]: value || undefined,
    });
  };

  return (
    <section className="riff-form-section">
      <h3 className="riff-form-section__header" role="heading" aria-level={2}>
        Metadata
      </h3>

      <div className="riff-form-field">
        <label htmlFor="metadata-title">
          Title <span className="riff-required">*</span>
        </label>
        <input
          id="metadata-title"
          type="text"
          value={metadata.title}
          onChange={(e) => handleChange('title', e.target.value)}
          aria-required="true"
          aria-invalid={!!errors.title}
        />
        {errors.title && (
          <span className="riff-field-error" role="alert">
            {errors.title}
          </span>
        )}
      </div>

      <div className="riff-form-field">
        <label htmlFor="metadata-composer">Composer</label>
        <input
          id="metadata-composer"
          type="text"
          value={metadata.composer ?? ''}
          onChange={(e) => handleChange('composer', e.target.value)}
        />
      </div>

      <div className="riff-form-field">
        <label htmlFor="metadata-lyricist">Lyricist</label>
        <input
          id="metadata-lyricist"
          type="text"
          value={metadata.lyricist ?? ''}
          onChange={(e) => handleChange('lyricist', e.target.value)}
        />
      </div>

      <div className="riff-form-field">
        <label htmlFor="metadata-copyright">Copyright</label>
        <input
          id="metadata-copyright"
          type="text"
          value={metadata.copyright ?? ''}
          onChange={(e) => handleChange('copyright', e.target.value)}
          placeholder="© 2026 Your Name"
        />
      </div>
    </section>
  );
};
```

### 6.6 MetadataTrack Component

> **Reuses interaction pattern from ChordTrack.** Container component managing hover state and click dispatch.

```typescript
/**
 * MetadataTrack
 *
 * Container component for metadata editing in the title block.
 * Reuses ChordTrack interaction pattern: hover preview, click-to-edit,
 * selection support, and keyboard navigation.
 *
 * @see ChordTrack.tsx for the base interaction pattern
 * @see Issue #174
 * @tested src/__tests__/components/Canvas/MetadataTrack.test.tsx
 */

import React, { useState, useCallback } from 'react';
import { MetadataField } from './MetadataField';
import { MetadataInput } from './MetadataInput';
import { ScoreMetadata } from '@/types';
import { METADATA_TYPOGRAPHY } from '@/config';
import { useModifierKeys } from '@/hooks/useModifierKeys';
import './MetadataTrack.css';

type MetadataFieldType = 'title' | 'composer' | 'lyricist';

// Field navigation order for Tab/Shift+Tab
const FIELD_ORDER: MetadataFieldType[] = ['title', 'composer', 'lyricist'];

interface MetadataTrackProps {
  metadata: ScoreMetadata;
  contentWidth: number;
  staffScale: number;
  // Event handlers (same pattern as ChordTrack)
  editingField: MetadataFieldType | null;
  selectedField: MetadataFieldType | null;
  onFieldClick: (field: MetadataFieldType) => void;
  onFieldSelect: (field: MetadataFieldType) => void;
  onEditComplete: (field: MetadataFieldType, value: string) => void;
  onEditCancel: () => void;
  onDelete: (field: MetadataFieldType) => void;
  onNavigateNext: (field: MetadataFieldType, value: string) => void;
  onNavigatePrevious: (field: MetadataFieldType, value: string) => void;
  onExitToScore: () => void;  // Tab from last field -> first note
}

export const MetadataTrack: React.FC<MetadataTrackProps> = ({
  metadata,
  contentWidth,
  staffScale,
  editingField,
  selectedField,
  onFieldClick,
  onFieldSelect,
  onEditComplete,
  onEditCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
  onExitToScore,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [hoveredField, setHoveredField] = useState<MetadataFieldType | null>(null);
  const { isMetaKeyHeld } = useModifierKeys();

  const { titleHeight, composerHeight, blockSpacing } = METADATA_TYPOGRAPHY;
  const titleY = titleHeight * staffScale;
  const subtitleY = titleY + composerHeight * staffScale + 8;

  // Calculate title block bounds for hover detection
  const blockHeight = titleY + composerHeight * staffScale + 16;

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setHoveredField(null);
  }, []);

  const handleFieldHover = useCallback((field: MetadataFieldType | null) => {
    setHoveredField(field);
  }, []);

  const handleFieldClick = useCallback((field: MetadataFieldType) => {
    if (isMetaKeyHeld) {
      onFieldSelect(field);  // Cmd/Ctrl+Click: select without editing
    } else {
      onFieldClick(field);   // Normal click: enter edit mode
    }
  }, [isMetaKeyHeld, onFieldClick, onFieldSelect]);

  // Handle Tab navigation with exit-to-score
  const handleNavigateNext = useCallback((field: MetadataFieldType, value: string) => {
    const currentIndex = FIELD_ORDER.indexOf(field);
    if (currentIndex === FIELD_ORDER.length - 1) {
      // Last field: exit to score
      onEditComplete(field, value);
      onExitToScore();
    } else {
      onNavigateNext(field, value);
    }
  }, [onEditComplete, onNavigateNext, onExitToScore]);

  // Field positions
  const fieldConfigs = {
    title: {
      x: contentWidth / 2,
      y: titleY,
      fontSize: 24 * staffScale,
      fontWeight: 'bold' as const,
      textAnchor: 'middle' as const,
      placeholder: 'Title',
      required: true,
    },
    composer: {
      x: contentWidth,
      y: subtitleY,
      fontSize: 12 * staffScale,
      fontWeight: 'normal' as const,
      textAnchor: 'end' as const,
      placeholder: 'Composer',
      required: false,
    },
    lyricist: {
      x: 0,
      y: subtitleY,
      fontSize: 12 * staffScale,
      fontWeight: 'normal' as const,
      textAnchor: 'start' as const,
      placeholder: 'Lyricist',
      required: false,
    },
  };

  return (
    <g
      className="riff-MetadataTrack"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Invisible hit area for hover detection */}
      <rect
        x={0}
        y={0}
        width={contentWidth}
        height={blockHeight}
        fill="transparent"
        className="riff-MetadataTrack__hitArea"
      />

      {/* Render each field */}
      {FIELD_ORDER.map((field) => {
        const config = fieldConfigs[field];
        const value = metadata[field] ?? '';
        const isEmpty = !value;
        const isEditing = editingField === field;
        const isSelected = selectedField === field;
        const isFieldHovered = hoveredField === field;
        const showPreview = isHovered && isEmpty && !isEditing;

        if (isEditing) {
          return (
            <MetadataInput
              key={field}
              field={field}
              initialValue={value}
              {...config}
              onComplete={(val) => onEditComplete(field, val)}
              onCancel={onEditCancel}
              onDelete={() => onDelete(field)}
              onNavigateNext={(val) => handleNavigateNext(field, val)}
              onNavigatePrevious={(val) => onNavigatePrevious(field, val)}
            />
          );
        }

        return (
          <MetadataField
            key={field}
            field={field}
            value={value}
            {...config}
            isHovered={isFieldHovered}
            isSelected={isSelected}
            showPreview={showPreview}
            onClick={() => handleFieldClick(field)}
            onMouseEnter={() => handleFieldHover(field)}
            onMouseLeave={() => handleFieldHover(null)}
          />
        );
      })}
    </g>
  );
};
```

### 6.7 MetadataField Component

> **Analogous to ChordSymbol.** Renders a single metadata field with selection/hover/preview states.

```typescript
/**
 * MetadataField
 *
 * Renders a single metadata field (title, composer, lyricist).
 * Supports hover, selection, and preview (placeholder) states.
 *
 * @see ChordSymbol.tsx for the base pattern
 * @see Issue #174
 */

import React from 'react';
import './MetadataField.css';

type MetadataFieldType = 'title' | 'composer' | 'lyricist';

interface MetadataFieldProps {
  field: MetadataFieldType;
  value: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textAnchor: 'start' | 'middle' | 'end';
  placeholder: string;
  isHovered: boolean;
  isSelected: boolean;
  showPreview: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export const MetadataField: React.FC<MetadataFieldProps> = ({
  field,
  value,
  x,
  y,
  fontSize,
  fontWeight,
  textAnchor,
  placeholder,
  isHovered,
  isSelected,
  showPreview,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const displayValue = value || (showPreview ? placeholder : '');

  if (!displayValue) return null;

  const className = [
    'riff-MetadataField',
    isHovered && 'riff-MetadataField--hovered',
    isSelected && 'riff-MetadataField--selected',
    showPreview && 'riff-MetadataField--preview',
  ].filter(Boolean).join(' ');

  return (
    <text
      x={x}
      y={y}
      fontSize={fontSize}
      fontWeight={fontWeight}
      textAnchor={textAnchor}
      className={className}
      data-field={field}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      {displayValue}
    </text>
  );
};
```

### 6.8 MetadataInput Component

> **Analogous to ChordInput.** Inline input for editing metadata fields with Tab/Shift+Tab navigation.

```typescript
/**
 * MetadataInput
 *
 * Inline input component for editing metadata fields.
 * Reuses ChordInput keyboard handling: Tab, Shift+Tab, Enter, Escape.
 *
 * @see ChordInput.tsx for the base pattern
 * @see Issue #174
 */

import React, { useRef, useEffect, useLayoutEffect, useState } from 'react';
import './MetadataInput.css';

type MetadataFieldType = 'title' | 'composer' | 'lyricist';

interface MetadataInputProps {
  field: MetadataFieldType;
  initialValue: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  textAnchor: 'start' | 'middle' | 'end';
  placeholder: string;
  required: boolean;
  onComplete: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onNavigateNext: (value: string) => void;
  onNavigatePrevious: (value: string) => void;
}

export const MetadataInput: React.FC<MetadataInputProps> = ({
  field,
  initialValue,
  x,
  y,
  fontSize,
  fontWeight,
  textAnchor,
  placeholder,
  required,
  onComplete,
  onCancel,
  onDelete,
  onNavigateNext,
  onNavigatePrevious,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [inputWidth, setInputWidth] = useState(100);

  // Focus and select on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  // Auto-size input width
  useLayoutEffect(() => {
    const measureSpan = document.createElement('span');
    measureSpan.style.font = `${fontWeight} ${fontSize}px sans-serif`;
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.style.whiteSpace = 'pre';
    measureSpan.textContent = value || placeholder || ' ';
    document.body.appendChild(measureSpan);
    const width = measureSpan.getBoundingClientRect().width + 16;
    document.body.removeChild(measureSpan);
    setInputWidth(Math.max(width, 80));
  }, [value, fontSize, fontWeight, placeholder]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed && !required) {
          onDelete();
        } else if (trimmed || required) {
          onComplete(required && !trimmed ? initialValue : trimmed);
        }
        break;

      case 'Escape':
        e.preventDefault();
        onCancel();
        break;

      case 'Tab':
        e.preventDefault();
        const tabValue = value.trim();
        if (e.shiftKey) {
          onNavigatePrevious(required && !tabValue ? initialValue : tabValue);
        } else {
          onNavigateNext(required && !tabValue ? initialValue : tabValue);
        }
        break;
    }
  };

  const handleBlur = () => {
    const trimmed = value.trim();
    if (!trimmed && !required) {
      onDelete();
    } else {
      onComplete(required && !trimmed ? initialValue : trimmed);
    }
  };

  // Calculate foreignObject position based on text-anchor
  const getInputX = () => {
    switch (textAnchor) {
      case 'middle': return x - inputWidth / 2;
      case 'end': return x - inputWidth;
      default: return x;
    }
  };

  return (
    <foreignObject
      x={getInputX()}
      y={y - fontSize}
      width={inputWidth}
      height={fontSize + 8}
      className="riff-MetadataInput__foreign"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        className="riff-MetadataInput"
        style={{
          fontSize: `${fontSize}px`,
          fontWeight,
          width: `${inputWidth}px`,
          textAlign: textAnchor === 'middle' ? 'center' :
                     textAnchor === 'end' ? 'right' : 'left',
        }}
        placeholder={placeholder}
        data-field={field}
      />
    </foreignObject>
  );
};
```

### 6.9 PageFooter Component

```typescript
/**
 * PageFooter
 *
 * Renders page footer containing copyright (page 1 only) and page number.
 * Copyright uses the same MetadataField/MetadataInput pattern.
 *
 * @see Issue #174
 */

import React from 'react';
import { MetadataField } from './MetadataField';
import { MetadataInput } from './MetadataInput';
import { ScoreMetadata } from '@/types';

interface PageFooterProps {
  pageNumber: number;
  totalPages: number;
  metadata: ScoreMetadata;
  contentWidth: number;
  pageHeight: number;
  marginBottom: number;
  staffScale: number;
  // Copyright editing state
  isEditingCopyright: boolean;
  isCopyrightSelected: boolean;
  isCopyrightHovered: boolean;
  showCopyrightPreview: boolean;
  onCopyrightClick: () => void;
  onCopyrightComplete: (value: string) => void;
  onCopyrightCancel: () => void;
  onCopyrightDelete: () => void;
  onCopyrightHover: (hovered: boolean) => void;
}

export const PageFooter: React.FC<PageFooterProps> = ({
  pageNumber,
  totalPages,
  metadata,
  contentWidth,
  pageHeight,
  marginBottom,
  staffScale,
  isEditingCopyright,
  isCopyrightSelected,
  isCopyrightHovered,
  showCopyrightPreview,
  onCopyrightClick,
  onCopyrightComplete,
  onCopyrightCancel,
  onCopyrightDelete,
  onCopyrightHover,
}) => {
  const fontSize = 10 * staffScale;
  const copyrightFontSize = 8 * staffScale;
  const pageNumberY = pageHeight - marginBottom / 2;
  const copyrightY = pageNumberY - 14;

  return (
    <g className="riff-page-footer">
      {/* Copyright - page 1 only */}
      {pageNumber === 1 && (isEditingCopyright ? (
        <MetadataInput
          field="copyright" as any
          initialValue={metadata.copyright ?? ''}
          x={contentWidth / 2}
          y={copyrightY}
          fontSize={copyrightFontSize}
          fontWeight="normal"
          textAnchor="middle"
          placeholder="© Your Name"
          required={false}
          onComplete={onCopyrightComplete}
          onCancel={onCopyrightCancel}
          onDelete={onCopyrightDelete}
          onNavigateNext={onCopyrightComplete}
          onNavigatePrevious={onCopyrightComplete}
        />
      ) : (metadata.copyright || showCopyrightPreview) && (
        <MetadataField
          field="copyright" as any
          value={metadata.copyright ?? ''}
          x={contentWidth / 2}
          y={copyrightY}
          fontSize={copyrightFontSize}
          fontWeight="normal"
          textAnchor="middle"
          placeholder="© Your Name"
          isHovered={isCopyrightHovered}
          isSelected={isCopyrightSelected}
          showPreview={showCopyrightPreview && !metadata.copyright}
          onClick={onCopyrightClick}
          onMouseEnter={() => onCopyrightHover(true)}
          onMouseLeave={() => onCopyrightHover(false)}
        />
      ))}

      {/* Page number - all pages */}
      <text
        x={contentWidth / 2}
        y={pageNumberY}
        fontSize={fontSize}
        textAnchor="middle"
        className="riff-page-number"
      >
        {pageNumber}
      </text>
    </g>
  );
};
```

## 7. Hook Design

### 7.1 usePageLayout Hook

```typescript
/**
 * usePageLayout
 *
 * Manages page layout state and system break calculation.
 *
 * @see Issue #174
 */

import { useMemo, useCallback } from 'react';
import { useScoreContext } from '@/hooks/useScoreContext';
import {
  calculatePageLayout,
  getSystemForMeasure,
} from '@/services/PageLayoutService';
import { PageLayout, SystemLayout, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

interface UsePageLayoutResult {
  /** Computed page layout */
  pageLayout: PageLayout;

  /** Current view mode */
  viewMode: LayoutConfig['viewMode'];

  /** Whether in page view mode */
  isPageView: boolean;

  /** Get system for a measure index */
  getSystem: (measureIndex: number) => SystemLayout | null;

  /** Get measure X position (system-aware) */
  getMeasureX: (measureIndex: number) => number | null;
}

export const usePageLayout = (): UsePageLayoutResult => {
  const { score } = useScoreContext();

  const config = score.layout ?? DEFAULT_LAYOUT_CONFIG;
  const viewMode = config.viewMode;
  const isPageView = viewMode === 'page';

  // Memoize page layout calculation
  const pageLayout = useMemo(() => {
    if (!isPageView) {
      // Return minimal layout for scroll view
      return {
        systems: [],
        pageSize: config.pageSize,
        dimensions: { width: 0, height: 0 },
        margins: config.margins,
        contentWidth: Infinity,
        firstSystemIndent: 0,
        staffScale: config.staffSize / 100,
      } as PageLayout;
    }

    return calculatePageLayout(score, config);
  }, [score, config, isPageView]);

  const getSystem = useCallback(
    (measureIndex: number) => {
      if (!isPageView) return null;
      return getSystemForMeasure(measureIndex, pageLayout);
    },
    [isPageView, pageLayout]
  );

  const getMeasureX = useCallback(
    (measureIndex: number) => {
      if (!isPageView) return null;
      const system = getSystemForMeasure(measureIndex, pageLayout);
      if (!system) return null;

      // Calculate X within system
      let x = system.xOffset;
      // ... additional measure positioning logic
      return x;
    },
    [isPageView, pageLayout]
  );

  return {
    pageLayout,
    viewMode,
    isPageView,
    getSystem,
    getMeasureX,
  };
};
```

### 7.2 useScoreSetup Hook

```typescript
/**
 * useScoreSetup
 *
 * Manages Score Setup dialog state and handlers.
 *
 * @see Issue #174
 */

import { useState, useCallback } from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';

interface UseScoreSetupResult {
  /** Whether dialog is open */
  isOpen: boolean;

  /** Open the dialog */
  open: () => void;

  /** Close the dialog */
  close: () => void;

  /** Toggle dialog open state */
  toggle: () => void;
}

export const useScoreSetup = (): UseScoreSetupResult => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
};
```

### 7.3 useMetadataTrack Hook

> **Reuses interaction pattern from useChordTrack.** Manages metadata editing state and command dispatch.

```typescript
/**
 * useMetadataTrack
 *
 * Manages metadata editing state, selection, and command dispatch.
 * Reuses useChordTrack pattern for consistency.
 *
 * @see useChordTrack.ts for the base pattern
 * @see Issue #174
 */

import { useState, useCallback } from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';
import { useSelectionEngine } from '@/hooks/useSelectionEngine';
import { ScoreMetadata } from '@/types';

type MetadataField = 'title' | 'composer' | 'lyricist' | 'copyright';

// Field navigation order
const FIELD_ORDER: MetadataField[] = ['title', 'composer', 'lyricist'];

interface MetadataEditingState {
  editingField: MetadataField | null;
  initialValue: string | null;
}

const INITIAL_EDITING_STATE: MetadataEditingState = {
  editingField: null,
  initialValue: null,
};

interface UseMetadataTrackResult {
  // Data
  metadata: ScoreMetadata;

  // Selection (from SelectionEngine)
  selectedField: MetadataField | null;

  // Editing state
  editingField: MetadataField | null;

  // Actions
  startEditing: (field: MetadataField) => void;
  completeEdit: (field: MetadataField, value: string) => void;
  cancelEdit: () => void;
  deleteField: (field: MetadataField) => void;
  selectField: (field: MetadataField) => void;
  clearSelection: () => void;

  // Navigation
  navigateToNext: (currentField: MetadataField, value: string) => void;
  navigateToPrevious: (currentField: MetadataField, value: string) => void;
  exitToScore: () => void;

  // Props for MetadataTrack component
  trackProps: {
    metadata: ScoreMetadata;
    editingField: MetadataField | null;
    selectedField: MetadataField | null;
    onFieldClick: (field: MetadataField) => void;
    onFieldSelect: (field: MetadataField) => void;
    onEditComplete: (field: MetadataField, value: string) => void;
    onEditCancel: () => void;
    onDelete: (field: MetadataField) => void;
    onNavigateNext: (field: MetadataField, value: string) => void;
    onNavigatePrevious: (field: MetadataField, value: string) => void;
    onExitToScore: () => void;
  };
}

export const useMetadataTrack = (): UseMetadataTrackResult => {
  const api = useScoreAPI();
  const { selectionState, setMetadataSelection, clearSelection } = useSelectionEngine();

  const [editingState, setEditingState] = useState<MetadataEditingState>(INITIAL_EDITING_STATE);

  const metadata = api.getMetadata();
  const selectedField = selectionState.metadataField ?? null;

  // Start editing a field
  const startEditing = useCallback((field: MetadataField) => {
    clearSelection();
    setEditingState({
      editingField: field,
      initialValue: metadata[field] ?? '',
    });
  }, [metadata, clearSelection]);

  // Complete editing with new value
  const completeEdit = useCallback((field: MetadataField, value: string) => {
    const trimmed = value.trim();
    const currentValue = metadata[field] ?? '';

    if (trimmed !== currentValue) {
      // Use SetMetadataCommand via API
      if (field === 'title' && !trimmed) {
        // Title required: revert to "Untitled"
        api.setMetadata({ title: 'Untitled' });
      } else {
        api.setMetadata({ [field]: trimmed || undefined });
      }
    }

    setEditingState(INITIAL_EDITING_STATE);
  }, [metadata, api]);

  // Cancel editing
  const cancelEdit = useCallback(() => {
    setEditingState(INITIAL_EDITING_STATE);
  }, []);

  // Delete field content
  const deleteField = useCallback((field: MetadataField) => {
    if (field === 'title') {
      api.setMetadata({ title: 'Untitled' });
    } else {
      api.setMetadata({ [field]: undefined });
    }
    setEditingState(INITIAL_EDITING_STATE);
  }, [api]);

  // Select a field (Cmd/Ctrl+Click)
  const selectField = useCallback((field: MetadataField) => {
    setEditingState(INITIAL_EDITING_STATE);
    setMetadataSelection(field);
  }, [setMetadataSelection]);

  // Navigate to next field
  const navigateToNext = useCallback((currentField: MetadataField, value: string) => {
    completeEdit(currentField, value);
    const currentIndex = FIELD_ORDER.indexOf(currentField);
    if (currentIndex < FIELD_ORDER.length - 1) {
      const nextField = FIELD_ORDER[currentIndex + 1];
      startEditing(nextField);
    }
  }, [completeEdit, startEditing]);

  // Navigate to previous field
  const navigateToPrevious = useCallback((currentField: MetadataField, value: string) => {
    completeEdit(currentField, value);
    const currentIndex = FIELD_ORDER.indexOf(currentField);
    if (currentIndex > 0) {
      const prevField = FIELD_ORDER[currentIndex - 1];
      startEditing(prevField);
    }
  }, [completeEdit, startEditing]);

  // Exit to first note/cursor in score
  const exitToScore = useCallback(() => {
    api.selectFirstElement();
  }, [api]);

  return {
    metadata,
    selectedField,
    editingField: editingState.editingField,
    startEditing,
    completeEdit,
    cancelEdit,
    deleteField,
    selectField,
    clearSelection,
    navigateToNext,
    navigateToPrevious,
    exitToScore,
    // Convenience props for MetadataTrack component
    trackProps: {
      metadata,
      editingField: editingState.editingField,
      selectedField,
      onFieldClick: startEditing,
      onFieldSelect: selectField,
      onEditComplete: completeEdit,
      onEditCancel: cancelEdit,
      onDelete: deleteField,
      onNavigateNext: navigateToNext,
      onNavigatePrevious: navigateToPrevious,
      onExitToScore: exitToScore,
    },
  };
};
```

---

## 8. API Factory Design

### 8.1 Layout API (src/hooks/api/layout.ts)

```typescript
/**
 * Layout API factory
 *
 * Creates layout-related API methods.
 *
 * @see Issue #174
 */

import { APIContext } from './types';
import { SetViewModeCommand, SetLayoutConfigCommand } from '@/commands/layout';
import { LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export const createLayoutMethods = (ctx: APIContext) => ({
  // ==================== View Mode ====================

  getViewMode(): LayoutConfig['viewMode'] {
    return ctx.getScore().layout?.viewMode ?? 'scroll';
  },

  setViewMode(mode: LayoutConfig['viewMode']) {
    ctx.execute(new SetViewModeCommand(mode));
    return ctx.api;
  },

  toggleViewMode() {
    const current = this.getViewMode();
    return this.setViewMode(current === 'scroll' ? 'page' : 'scroll');
  },

  // ==================== Layout Config ====================

  getLayoutConfig(): LayoutConfig {
    return ctx.getScore().layout ?? DEFAULT_LAYOUT_CONFIG;
  },

  setLayoutConfig(config: Partial<LayoutConfig>) {
    ctx.execute(new SetLayoutConfigCommand(config));
    return ctx.api;
  },

  resetLayoutConfig() {
    ctx.execute(new SetLayoutConfigCommand(DEFAULT_LAYOUT_CONFIG));
    return ctx.api;
  },
});
```

### 8.2 Metadata API (src/hooks/api/metadata.ts)

```typescript
/**
 * Metadata API factory
 *
 * Creates metadata-related API methods.
 *
 * @see Issue #174
 */

import { APIContext } from './types';
import { SetMetadataCommand } from '@/commands/layout';
import { ScoreMetadata } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';

export const createMetadataMethods = (ctx: APIContext) => ({
  // ==================== Metadata ====================

  getMetadata(): ScoreMetadata {
    return ctx.getScore().metadata ?? DEFAULT_SCORE_METADATA;
  },

  setMetadata(metadata: Partial<ScoreMetadata>) {
    ctx.execute(new SetMetadataCommand(metadata));
    return ctx.api;
  },

  // ==================== Individual Fields ====================

  getTitle(): string {
    return this.getMetadata().title;
  },

  setTitle(title: string) {
    return this.setMetadata({ title });
  },

  getComposer(): string | undefined {
    return this.getMetadata().composer;
  },

  setComposer(composer: string) {
    return this.setMetadata({ composer });
  },

  // ... additional field accessors
});

export const createNavigationMethods = (ctx: APIContext) => ({
  // ==================== Score Navigation ====================

  /**
   * Select the first element in the score.
   *
   * Selects the first note if present, otherwise positions the cursor
   * at the beginning of the score ready to add a note.
   *
   * Used for Tab navigation from metadata fields into the score.
   */
  selectFirstElement() {
    const score = ctx.getScore();
    const firstNote = findFirstNote(score);

    if (firstNote) {
      ctx.selectionEngine.selectNote(firstNote.id);
    } else {
      // Position cursor at start (measure 0, quant 0)
      ctx.selectionEngine.setCursorPosition({ measure: 0, quant: 0 });
    }
    return ctx.api;
  },

  /**
   * Select the last element in the score.
   * Used for Shift+Tab from title field back into score.
   */
  selectLastElement() {
    const score = ctx.getScore();
    const lastNote = findLastNote(score);

    if (lastNote) {
      ctx.selectionEngine.selectNote(lastNote.id);
    } else {
      // Position cursor at end
      const lastMeasure = score.staves[0]?.measures.length - 1 ?? 0;
      ctx.selectionEngine.setCursorPosition({ measure: lastMeasure, quant: 0 });
    }
    return ctx.api;
  },
});

// Helper functions
function findFirstNote(score: Score): Note | null {
  for (const staff of score.staves) {
    for (const measure of staff.measures) {
      for (const voice of measure.voices) {
        const firstNote = voice.notes.find(n => n.type === 'note');
        if (firstNote) return firstNote;
      }
    }
  }
  return null;
}

function findLastNote(score: Score): Note | null {
  for (let s = score.staves.length - 1; s >= 0; s--) {
    const staff = score.staves[s];
    for (let m = staff.measures.length - 1; m >= 0; m--) {
      const measure = staff.measures[m];
      for (let v = measure.voices.length - 1; v >= 0; v--) {
        const voice = measure.voices[v];
        for (let n = voice.notes.length - 1; n >= 0; n--) {
          if (voice.notes[n].type === 'note') return voice.notes[n];
        }
      }
    }
  }
  return null;
}
```

---

## 9. Stylesheet Design

### 9.1 Print Stylesheet (src/styles/print.css)

```css
/**
 * Print stylesheet for RiffScore
 *
 * @see Issue #174
 */

@media print {
  /* ============================================
     1. HIDE UI ELEMENTS
     ============================================ */

  .riff-toolbar,
  .riff-sidebar,
  .riff-footer,
  .riff-dialog,
  .riff-tooltip,
  .riff-cursor,
  .riff-selection-highlight,
  .riff-playback-cursor,
  .riff-scrollbar,
  .riff-zoom-controls,
  .riff-view-toggle,
  .riff-score-setup-btn {
    display: none !important;
  }

  /* ============================================
     2. RESET BACKGROUNDS
     ============================================ */

  html,
  body,
  .riff-editor,
  .riff-canvas-container,
  .riff-canvas {
    background: white !important;
    background-color: white !important;
  }

  /* ============================================
     3. ENSURE HIGH CONTRAST
     ============================================ */

  .riff-staff-line,
  .riff-ledger-line,
  .riff-barline {
    stroke: black !important;
  }

  .riff-notehead,
  .riff-stem,
  .riff-flag,
  .riff-beam,
  .riff-accidental,
  .riff-clef,
  .riff-rest {
    fill: black !important;
    stroke: black !important;
  }

  .riff-chord-symbol,
  .riff-measure-number,
  .riff-page-number,
  .riff-title,
  .riff-composer,
  .riff-copyright {
    fill: black !important;
    color: black !important;
  }

  /* ============================================
     4. PAGE BREAK CONTROL
     ============================================ */

  .riff-system {
    page-break-inside: avoid;
  }

  .riff-page-break {
    page-break-before: always;
  }

  /* ============================================
     5. SIZING
     ============================================ */

  .riff-editor {
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .riff-canvas-container {
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  .riff-canvas {
    width: 100% !important;
    height: auto !important;
  }

  /* ============================================
     6. REMOVE BORDERS & SHADOWS
     ============================================ */

  .riff-editor,
  .riff-canvas,
  .riff-system {
    border: none !important;
    box-shadow: none !important;
  }
}
```

### 9.2 Page View CSS Variables (src/styles/theme.css additions)

```css
/* ============================================
   PAGE VIEW VARIABLES
   ============================================ */

:root {
  /* Page dimensions */
  --riff-page-bg: #f5f5f5;
  --riff-page-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  --riff-page-border: 1px solid #ddd;

  /* System spacing */
  --riff-system-gap-compact: 1.5;
  --riff-system-gap-normal: 2.0;
  --riff-system-gap-relaxed: 2.5;

  /* First system indent */
  --riff-first-system-indent: 15%;

  /* Measure numbers */
  --riff-measure-number-size: 10px;
  --riff-measure-number-color: #666;

  /* Metadata typography */
  --riff-title-size: 24px;
  --riff-title-weight: bold;
  --riff-composer-size: 12px;
  --riff-copyright-size: 8px;

  /* Page numbers */
  --riff-page-number-size: 10px;
  --riff-page-number-color: #333;
}
```

### 9.3 Score Setup Dialog CSS (src/components/Dialog/ScoreSetupDialog/ScoreSetupDialog.css)

```css
/**
 * Score Setup Dialog styles
 *
 * @see Issue #174
 */

.riff-score-setup-dialog {
  width: 480px;
  max-width: 90vw;
  max-height: 80vh;
}

/* Section headers */
.riff-form-section {
  margin-bottom: var(--riff-spacing-lg);
}

.riff-form-section__header {
  font-size: 14px;
  font-weight: 600;
  color: var(--riff-text-secondary);
  border-bottom: 1px solid var(--riff-border-color);
  padding-bottom: var(--riff-spacing-xs);
  margin-bottom: var(--riff-spacing-md);
}

/* Scrollable content */
.riff-dialog__content--scrollable {
  max-height: 60vh;
  overflow-y: auto;
  padding: var(--riff-spacing-md);
}

/* Form fields */
.riff-form-field {
  margin-bottom: var(--riff-spacing-md);
}

.riff-form-field label {
  display: block;
  margin-bottom: var(--riff-spacing-xs);
  font-weight: 500;
}

.riff-form-field input,
.riff-form-field select {
  width: 100%;
  padding: var(--riff-spacing-sm);
  border: 1px solid var(--riff-border-color);
  border-radius: var(--riff-border-radius);
}

.riff-form-field input:focus,
.riff-form-field select:focus {
  outline: none;
  border-color: var(--riff-accent-color);
  box-shadow: 0 0 0 2px rgba(var(--riff-accent-rgb), 0.2);
}

.riff-required {
  color: var(--riff-error-color);
}

.riff-field-error {
  display: block;
  margin-top: var(--riff-spacing-xs);
  color: var(--riff-error-color);
  font-size: 12px;
}

/* Slider labels */
.riff-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--riff-text-secondary);
  margin-top: 2px;
}

/* Slider */
.riff-slider-group {
  display: flex;
  align-items: center;
  gap: var(--riff-spacing-sm);
}

.riff-slider-group input[type="range"] {
  flex: 1;
}

.riff-slider-value {
  min-width: 45px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Fieldset */
.riff-form-fieldset {
  border: 1px solid var(--riff-border-color);
  border-radius: var(--riff-border-radius);
  padding: var(--riff-spacing-md);
  margin-bottom: var(--riff-spacing-md);
}

.riff-form-fieldset legend {
  padding: 0 var(--riff-spacing-xs);
  font-weight: 500;
}
```

### 9.4 Metadata Track CSS (src/components/Canvas/MetadataTrack.css)

> **Reuses styling patterns from ChordTrack.css** for consistency.

```css
/**
 * MetadataTrack Styles
 *
 * Chord-like WYSIWYG editing for score metadata.
 * @see ChordTrack.css for the base pattern
 * @see Issue #174
 */

/* ============================================
   METADATA TRACK CONTAINER
   ============================================ */

.riff-MetadataTrack {
  /* Container for hover detection */
}

.riff-MetadataTrack__hitArea {
  cursor: default;
}

/* ============================================
   METADATA FIELD (Display Mode)
   Analogous to ChordSymbol
   ============================================ */

.riff-MetadataField {
  cursor: pointer;
  fill: var(--riff-text-primary);
  user-select: none;
  transition: fill 0.15s ease;
}

.riff-MetadataField--hovered {
  fill: var(--riff-color-primary);
}

.riff-MetadataField--selected {
  fill: var(--riff-color-primary);
}

/* Preview: placeholder text for empty fields (50% opacity) */
.riff-MetadataField--preview {
  fill: var(--riff-color-primary);
  opacity: 0.5;
  pointer-events: none;
}

/* ============================================
   METADATA INPUT (Edit Mode)
   Analogous to ChordInput
   ============================================ */

.riff-MetadataInput__foreign {
  overflow: visible;
}

.riff-MetadataInput {
  box-sizing: border-box;
  padding: 2px 8px;
  border: none;
  border-radius: 2px;
  background: transparent;
  outline: none;
  font-family: var(--riff-font-sans);
  color: var(--riff-text-primary);
}

.riff-MetadataInput:focus {
  /* Subtle focus indication */
}

.riff-MetadataInput::placeholder {
  color: var(--riff-color-muted);
  opacity: 0.7;
}

.riff-MetadataInput::selection {
  background-color: rgba(var(--riff-color-primary-rgb), 0.3);
}

/* ============================================
   PRINT STYLES
   ============================================ */

@media print {
  .riff-MetadataField {
    cursor: default;
    fill: black !important;
  }

  .riff-MetadataField--preview {
    display: none !important;
  }

  .riff-MetadataInput__foreign {
    display: none !important;
  }

  .riff-MetadataTrack__hitArea {
    display: none !important;
  }
}
```

---

## 10. Export Integration

### 10.1 ABC Exporter Updates

```typescript
// Add to abcExporter.ts

/**
 * Export score metadata to ABC header fields.
 */
const exportMetadata = (metadata: ScoreMetadata): string => {
  const lines: string[] = [];

  lines.push(`T:${metadata.title}`);

  if (metadata.composer) {
    lines.push(`C:${metadata.composer}`);
  }

  if (metadata.lyricist) {
    lines.push(`Z:Lyrics by ${metadata.lyricist}`);
  }

  if (metadata.copyright) {
    lines.push(`%%footer ${metadata.copyright}`);
  }

  return lines.join('\n');
};
```

### 10.2 MusicXML Exporter Updates

```typescript
// Add to musicXmlExporter.ts

/**
 * Export score metadata to MusicXML elements.
 */
const exportMetadata = (metadata: ScoreMetadata): string => {
  let xml = '';

  xml += '<work>\n';
  xml += `  <work-title>${escapeXml(metadata.title)}</work-title>\n`;
  xml += '</work>\n';

  xml += '<identification>\n';

  if (metadata.composer) {
    xml += `  <creator type="composer">${escapeXml(metadata.composer)}</creator>\n`;
  }

  if (metadata.lyricist) {
    xml += `  <creator type="lyricist">${escapeXml(metadata.lyricist)}</creator>\n`;
  }

  if (metadata.copyright) {
    xml += `  <rights>${escapeXml(metadata.copyright)}</rights>\n`;
  }

  xml += '</identification>\n';

  return xml;
};
```

---

## 11. Implementation Phases

> **Note:** These phases refine and expand the 8 phases defined in the PRD, adding technical detail and separating concerns for clearer work breakdown.

### Phase 1: Foundation & Data Model (2-3 days)
*PRD Phase 1: System Break Engine*

- [ ] Add type definitions to `types.ts`
- [ ] Add default configs to `config.ts`
- [ ] Create `PageLayoutService.ts` with system break algorithm
- [ ] Create `MetadataService.ts` with validation
- [ ] Unit tests for services

### Phase 2: Commands & API (1-2 days)
*PRD Phase 1: System Break Engine (continued)*

- [ ] Create `SetViewModeCommand.ts`
- [ ] Create `SetLayoutConfigCommand.ts`
- [ ] Create `SetMetadataCommand.ts`
- [ ] Create `layout.ts` API factory
- [ ] Create `metadata.ts` API factory
- [ ] Integrate into `useScoreAPI.ts`
- [ ] Unit tests for commands

### Phase 3: Multi-System Rendering (3-4 days)
*PRD Phases 2 & 3: Multi-System Rendering, Tie Splitting*

- [ ] Update `ScoreCanvas.tsx` for multi-system
- [ ] Update `Staff.tsx` for per-system clef/key
- [ ] Create `MeasureNumber.tsx` component
- [ ] Update `Barline.tsx` for cross-staff rendering
- [ ] Update `Tie.tsx` for system break splitting
- [ ] Integration tests for rendering

### Phase 4: Score Setup Dialog (2-3 days)
*PRD Phase 6: Score Setup Dialog*

- [ ] Create `ScoreSetupDialog.tsx`
- [ ] Create `MetadataSection.tsx`
- [ ] Create `LayoutSection.tsx`
- [ ] Create `useScoreSetup.ts` hook
- [ ] Add CSS styling
- [ ] Accessibility testing

### Phase 5: Toolbar Controls (1 day)
*PRD Phase 5: Toolbar & View Mode Toggle*

- [ ] Create `ViewToggle.tsx`
- [ ] Create `ScoreSetupButton.tsx`
- [ ] Create `PrintButton.tsx`
- [ ] Update `Toolbar.tsx` to include new buttons
- [ ] Add keyboard shortcuts

### Phase 6: Print Support (2 days)
*PRD Phase 4: Print Support*

- [ ] Create `print.css` stylesheet
- [ ] Create `PrintService.ts`
- [ ] Add Cmd/Ctrl+P handler
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)

### Phase 7: Metadata Rendering (3-4 days)
*PRD Phase 7: Metadata Rendering*

> **Reuses interaction logic from ChordTrack.** See sections 6.6–6.9 for component designs.

- [ ] Create `MetadataTrack.tsx` (reuses ChordTrack interaction pattern)
- [ ] Create `MetadataField.tsx` (analogous to ChordSymbol)
- [ ] Create `MetadataInput.tsx` (analogous to ChordInput)
- [ ] Create `PageFooter.tsx` (copyright + page numbers)
- [ ] Create `useMetadataTrack.ts` hook (reuses useChordTrack pattern)
- [ ] Add `selectFirstElement()` and `selectLastElement()` to API
- [ ] Add `MetadataTrack.css` styles
- [ ] Hover preview for empty metadata fields (50% opacity)
- [ ] Tab/Shift+Tab navigation between fields
- [ ] Tab from last field → first note via `api.selectFirstElement()`
- [ ] Cmd/Ctrl+Click selection support
- [ ] Render page numbers (centered, bottom of each page)
- [ ] Integration tests for inline editing

### Phase 8: Export Integration (1 day)
*PRD Phase 7: Metadata Rendering (export portion)*

- [ ] Update ABC exporter
- [ ] Update MusicXML exporter
- [ ] Export tests

### Phase 9: Polish & Testing (2-3 days)
*PRD Phase 8: Interaction Polish*

- [ ] Playback cursor across systems
- [ ] Selection highlighting across systems
- [ ] Keyboard navigation across systems
- [ ] Auto-scroll in page view
- [ ] Performance optimization
- [ ] Full integration testing

---

## 12. Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| **System** | A horizontal line of music containing one or more staves |
| **Brace** | Curly bracket connecting staves of a grand staff |
| **Bracket** | Square bracket grouping related staves |
| **Courtesy Signature** | Preview of upcoming key/time change at end of system (deferred to v2) |
| **Justification** | Horizontal stretching to fill available width |
| **Ragged** | Not justified; using natural spacing |

### B. Related ADRs

- **ADR-015:** Forward-Flow Y Positioning
- **ADR-016:** Measure-Relative X Positioning

### C. References

- Elaine Gould, *Behind Bars: The Definitive Guide to Music Notation* (2011)
- Ted Ross, *Teach Yourself the Art of Music Engraving and Processing* (1987)
