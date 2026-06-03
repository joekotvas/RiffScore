# Page View & Print - Software Requirements Specification

**Feature:** Page View Mode with System Breaks and Print Support
**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Status:** Draft
**Date:** 2026-02-14
**Parent:** [PRD.md](./PRD.md)

---

## 1. Introduction

### 1.1 Purpose

This document specifies the detailed software requirements for the Page View & Print feature, translating product requirements into technical specifications suitable for implementation.

### 1.2 Scope

This specification covers:
- Data structures for layout configuration and score metadata
- System break calculation algorithms
- Multi-system rendering specifications
- Print stylesheet requirements
- Score Setup dialog specifications
- Toolbar control specifications

### 1.3 Definitions

| Term | Definition |
|------|------------|
| **System** | A single horizontal line of music; one or more staves grouped together |
| **System Break** | The point where music wraps to a new system |
| **Page View** | Layout mode showing music wrapped across multiple systems |
| **Scroll View** | Default layout mode showing music as single horizontal line |
| **Content Width** | Page width minus left and right margins |
| **First System Indent** | Space reserved at left of first system for title placement |
| **Courtesy Signature** | Preview of key/time change shown at end of preceding system (v2) |

---

## 2. Data Specifications

### 2.1 ScoreMetadata Interface

```typescript
interface ScoreMetadata {
  /** Score title (required, pre-filled to "Untitled") */
  title: string;

  /** Composer name */
  composer?: string;

  /** Lyricist name */
  lyricist?: string;

  /** Copyright notice */
  copyright?: string;
}
```

#### 2.1.1 Field Specifications

| Field | Type | Required | Constraints | Display Location |
|-------|------|----------|-------------|------------------|
| `title` | `string` | Yes | Non-empty, max 200 chars, default "Untitled" | Centered above first system |
| `composer` | `string` | No | Max 100 chars | Right-aligned above first system |
| `lyricist` | `string` | No | Max 100 chars | Left-aligned above first system |
| `copyright` | `string` | No | Max 300 chars | Bottom of first page, centered |

### 2.2 LayoutConfig Interface

```typescript
interface LayoutConfig {
  /** Page size identifier */
  pageSize: 'letter' | 'a4';

  /** Page margins preset */
  margins: 'narrow' | 'normal' | 'wide';

  /** Staff size as percentage of default (100 = default), stepped by 10 */
  staffSize: number;

  /** Spacing between systems */
  systemSpacing: 'compact' | 'normal' | 'relaxed';

  /** Current view mode */
  viewMode: 'scroll' | 'page';
}
```

#### 2.2.1 Field Specifications

| Field | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `pageSize` | `'letter' \| 'a4'` | Yes | `'letter'` (US) / `'a4'` (International) | Enum value |
| `margins` | `'narrow' \| 'normal' \| 'wide'` | Yes | `'normal'` | Enum value |
| `staffSize` | `number` | Yes | `100` | 50-150 (percentage), stepped by 10 |
| `systemSpacing` | `enum` | Yes | `'normal'` | Enum value |
| `viewMode` | `enum` | Yes | `'scroll'` | Enum value |

#### 2.2.2 Margin Preset Values

| Preset | All Margins |
|--------|-------------|
| `narrow` | 12.7 mm (0.5") |
| `normal` | 19 mm (0.75") |
| `wide` | 25.4 mm (1") |

#### 2.2.3 Page Size Dimensions

| Size | Width | Height | Region |
|------|-------|--------|--------|
| `letter` | 215.9 mm (8.5") | 279.4 mm (11") | US/Canada |
| `a4` | 210 mm | 297 mm | International |

#### 2.2.4 System Spacing Values

| Value | Staff-to-Staff Distance |
|-------|-------------------------|
| `compact` | 1.5x staff height |
| `normal` | 2.0x staff height |
| `relaxed` | 2.5x staff height |

### 2.3 SystemLayout Interface

```typescript
interface SystemLayout {
  /** 0-based system index */
  index: number;

  /** Measure indices contained in this system */
  measures: number[];

  /** Y position of system top (SVG coordinates) */
  y: number;

  /** Total height of system including all staves */
  height: number;

  /** X offset for this system (0 for most, indent for first) */
  xOffset: number;

  /** Available width for music content */
  contentWidth: number;

  /** Whether this is the first system (may have indent) */
  isFirst: boolean;

  /** Whether this is the last system (may be ragged) */
  isLast: boolean;

  /** Justification factor (1.0 = fully justified, <1.0 = natural width) */
  justification: number;
}
```

### 2.4 PageLayout Interface

```typescript
interface PageLayout {
  /** Array of systems on this page */
  systems: SystemLayout[];

  /** Page size identifier */
  pageSize: 'letter' | 'a4';

  /** Page dimensions in mm */
  dimensions: {
    width: number;
    height: number;
  };

  /** Margin preset */
  margins: 'narrow' | 'normal' | 'wide';

  /** Computed margins in mm (derived from preset) */
  computedMargins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  /** Computed content width (page width - margins) */
  contentWidth: number;

  /** First system indent (% of content width) */
  firstSystemIndent: number;

  /** Staff size scaling factor */
  staffScale: number;
}
```

### 2.5 Score Extension

```typescript
interface Score {
  // ... existing fields ...

  /** Score metadata for display and export */
  metadata?: ScoreMetadata;

  /** Layout configuration */
  layout?: LayoutConfig;
}
```

#### 2.5.1 Invariants

1. `metadata.title` SHALL never be empty when `metadata` exists (default: "Untitled")
2. `layout.staffSize` SHALL be clamped to 50-150 range, stepped by 10
3. `layout.margins` SHALL be one of: 'narrow', 'normal', 'wide'
4. When `layout.viewMode` is `'page'`, systems SHALL be recalculated on any layout change

### 2.6 Default Values

```typescript
export const DEFAULT_SCORE_METADATA: ScoreMetadata = {
  title: 'Untitled',
};

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  pageSize: 'letter',
  margins: 'normal',
  staffSize: 100,
  systemSpacing: 'normal',
  viewMode: 'scroll',
};

export const MARGIN_PRESETS = {
  narrow: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 },
  normal: { top: 19, right: 19, bottom: 19, left: 19 },
  wide: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 },
} as const;

export const DEFAULT_PAGE_LAYOUT: Partial<PageLayout> = {
  firstSystemIndent: 0.15, // 15% of content width
};
```

---

## 3. Algorithm Specifications

### 3.1 System Break Calculation

**Input:** Score measures, layout config, content width
**Output:** Array of SystemLayout objects

#### 3.1.1 System Break Pipeline

```
1. Calculate measure widths → [measureWidth[]]
2. Apply first system indent → adjustedFirstWidth
3. Greedily fill systems → SystemLayout[]
4. Calculate Y positions → SystemLayout[] with y values
5. Apply justification → SystemLayout[] with justification factors
```

#### 3.1.2 Measure Width Calculation

```typescript
function calculateMeasureWidth(
  measure: Measure,
  staffIndex: number,
  config: LayoutConfig
): number {
  // Base width from note spacing
  let width = 0;
  for (const event of measure.events) {
    width += getEventSpacing(event, config.staffSize);
  }

  // Add clef width (first measure or after clef change)
  if (measure.index === 0 || measure.clefChange) {
    width += CLEF_WIDTH * (config.staffSize / 100);
  }

  // Add key signature width (first measure or after key change)
  if (measure.index === 0 || measure.keyChange) {
    width += getKeySignatureWidth(measure.keySignature) * (config.staffSize / 100);
  }

  // Add time signature width (first measure or after time change)
  if (measure.index === 0 || measure.timeChange) {
    width += TIME_SIGNATURE_WIDTH * (config.staffSize / 100);
  }

  // Add barline width
  width += BARLINE_WIDTH;

  return width;
}
```

#### 3.1.3 Greedy System Fill Algorithm

```typescript
function calculateSystemBreaks(
  measureWidths: number[],
  contentWidth: number,
  firstSystemIndent: number
): number[][] {
  const systems: number[][] = [];
  let currentSystem: number[] = [];
  let currentWidth = 0;
  let isFirstSystem = true;

  const availableWidth = isFirstSystem
    ? contentWidth * (1 - firstSystemIndent)
    : contentWidth;

  for (let i = 0; i < measureWidths.length; i++) {
    const measureWidth = measureWidths[i];
    const effectiveWidth = isFirstSystem
      ? contentWidth * (1 - firstSystemIndent)
      : contentWidth;

    // Check if measure fits
    if (currentWidth + measureWidth <= effectiveWidth || currentSystem.length === 0) {
      // Measure fits, add to current system
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
}
```

#### 3.1.4 Edge Cases

| Condition | Behavior |
|-----------|----------|
| Single measure exceeds content width | Scale entire score proportionally; alert user if scale < 50% |
| Measure > 50% of system width | Give measure its own system (never scale individual measures) |
| Very short piece (1-2 measures) | Render at natural width, no justification |
| Measure at exactly content width | Include in current system, start new for next |
| Empty score | No systems rendered |

#### 3.1.5 Wide Measure Algorithm

```typescript
function handleWideMeasure(
  measureWidth: number,
  availableWidth: number,
  currentSystemMeasures: number[]
): 'fit' | 'own-system' | 'scale-all' {
  // If measure is > 50% of available width, give it its own system
  if (measureWidth > availableWidth * 0.5 && currentSystemMeasures.length > 0) {
    return 'own-system';
  }

  // If single measure exceeds page width, must scale entire score
  if (measureWidth > availableWidth) {
    return 'scale-all';
  }

  return 'fit';
}
```

### 3.2 Justification Algorithm

**Input:** System with measure widths, content width, isLast flag
**Output:** Justification factor (1.0 = full width, <1.0 = natural)

```typescript
function calculateJustification(
  system: SystemLayout,
  measureWidths: number[],
  contentWidth: number
): number {
  const naturalWidth = system.measures.reduce(
    (sum, idx) => sum + measureWidths[idx],
    0
  );

  const effectiveWidth = system.isFirst
    ? contentWidth * (1 - DEFAULT_PAGE_LAYOUT.firstSystemIndent)
    : contentWidth;

  // Last system: use natural width if < 60% full
  if (system.isLast && naturalWidth < effectiveWidth * 0.6) {
    return naturalWidth / effectiveWidth;
  }

  // All other systems: justify to full width
  return 1.0;
}
```

### 3.3 Y Position Calculation

**Input:** Systems array, staff heights, system spacing config
**Output:** Systems with Y positions

```typescript
function calculateSystemYPositions(
  systems: SystemLayout[],
  staffHeight: number,
  numStaves: number,
  systemSpacing: 'compact' | 'normal' | 'relaxed',
  headerHeight: number  // Space for title/metadata
): SystemLayout[] {
  const spacingMultiplier = {
    compact: 1.5,
    normal: 2.0,
    relaxed: 2.5,
  };

  const systemHeight = staffHeight * numStaves;
  const gapBetweenSystems = systemHeight * spacingMultiplier[systemSpacing];

  let currentY = headerHeight;

  return systems.map((system, index) => ({
    ...system,
    y: currentY,
    height: systemHeight,
    // Advance Y for next system
    _nextY: (currentY += systemHeight + gapBetweenSystems),
  }));
}
```

### 3.4 Measure Origin Calculation (Multi-System)

**Input:** Measure index, system layouts, justification factors
**Output:** X coordinate for measure start within its system

```typescript
function getMeasureOrigin(
  measureIndex: number,
  systems: SystemLayout[],
  measureWidths: number[]
): { x: number; systemIndex: number } | null {
  // Find system containing this measure
  const system = systems.find(s => s.measures.includes(measureIndex));
  if (!system) return null;  // Fail-soft: return null instead of throwing

  // Calculate X within system
  let x = system.xOffset;
  for (const idx of system.measures) {
    if (idx === measureIndex) break;
    x += measureWidths[idx] * system.justification;
  }

  return { x, systemIndex: system.index };
}
```

### 3.4.1 ScoreLayout API Extension

The existing `ScoreLayout` interface (ADR-016) SHALL be extended to support page view:

```typescript
interface ScoreLayout {
  // Existing methods...
  getX(params: { measure: number; quant: number }): number;

  // New for page view:
  /** Get the system containing a measure */
  getSystemForMeasure(measureIndex: number): SystemLayout | null;

  /** Get Y offset for a system */
  getSystemY(systemIndex: number): number;

  /** Check if view mode is page */
  isPageView(): boolean;
}
```

**Behavior change in `getX()`:**

In **scroll view** (existing):
- Returns X relative to single-system origin

In **page view** (new):
- Returns X relative to the **system containing the measure**
- Accounts for first-system indent
- Applies justification factor

```typescript
// Scroll view: measure 5 might be at X=500
layout.getX({ measure: 5, quant: 0 })  // → 500

// Page view: same measure on system 2 starts at X=50 (within that system)
layout.getX({ measure: 5, quant: 0 })  // → 50
```

Components using `getX()` also need the system's Y position to render correctly. They should call `getSystemForMeasure()` to get the full context.

### 3.5 Tie Split Detection

**Input:** Note with tie, system breaks
**Output:** Tie rendering instructions

```typescript
interface TieSplitResult {
  /** Tie stays within system */
  type: 'normal';
} | {
  /** Tie crosses system break */
  type: 'split';
  /** Render arc to right edge of first system */
  firstSystemArc: { endX: number };
  /** Render arc from left edge of second system */
  secondSystemArc: { startX: number };
}

function analyzeTieSplit(
  tieStart: { measure: number; quant: number },
  tieEnd: { measure: number; quant: number },
  systems: SystemLayout[]
): TieSplitResult {
  const startSystem = systems.find(s => s.measures.includes(tieStart.measure));
  const endSystem = systems.find(s => s.measures.includes(tieEnd.measure));

  if (startSystem?.index === endSystem?.index) {
    return { type: 'normal' };
  }

  return {
    type: 'split',
    firstSystemArc: {
      endX: startSystem!.xOffset + startSystem!.contentWidth,
    },
    secondSystemArc: {
      startX: endSystem!.xOffset,
    },
  };
}
```

### 3.6 Courtesy Signature Detection

> **Deferred to v2:** Courtesy signatures at system breaks are not implemented in v1.

---

## 4. Interface Specifications

### 4.1 View Mode Toggle

#### 4.1.1 States

```
┌──────────────────────────────────────────────────────-───────┐
│                     VIEW MODE STATES                         │
├────────────────────────────────────────────────────────-─────┤
│                                                              │
│  SCROLL_VIEW ◄────────────────────────────────────-───────┐  │
│       │                                                   │  │
│       │ toggle (button click or keyboard shortcut)        │  │
│       ▼                                                   │  │
│  PAGE_VIEW ──────────────────────────────────────────────►│  │
│       │        toggle                                     │  │
│       │                                                   │  │
│       └───────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────-───┘
```

#### 4.1.2 Transition Behavior

| From | To | Actions |
|------|----|---------|
| Scroll View | Page View | Calculate system breaks, reposition elements, animate |
| Page View | Scroll View | Flatten to single system, animate |

#### 4.1.3 State Preservation

When switching view modes, preserve:
- Selection state (selected notes, cursor position)
- Playback position
- Scroll position (map to equivalent system/measure)
- Undo/redo history

### 4.2 Score Setup Dialog

#### 4.2.1 Dialog States

```
┌─────────────────────────────────────────────────────────────┐
│                  SCORE SETUP DIALOG STATES                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  CLOSED ─────────────────────────────────────────────────┐  │
│     │                                                     │  │
│     │ open (toolbar button or Cmd/Ctrl+,)                 │  │
│     ▼                                                     │  │
│  OPEN ◄──────────────────────────────────────────────────┤  │
│     │                                                     │  │
│     │ Save (Enter) / Cancel (Escape)                      │  │
│     ▼                                                     │  │
│  CLOSED ◄─────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.2 Dialog Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Score Setup                                            [X] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ─── METADATA ─────────────────────────────────────────────  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Title*:     [Untitled_______________________]       │   │
│  │ Composer:   [____________________________]          │   │
│  │ Lyricist:   [____________________________]          │   │
│  │ Copyright:  [____________________________]          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ─── LAYOUT ───────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Page Size:      [Letter ▼]                          │   │
│  │                                                     │   │
│  │ Margins:        [Normal ▼]                          │   │
│  │                                                     │   │
│  │ Staff Size:     [====●====] 100%                    │   │
│  │                 50%        150%  (10% increments)   │   │
│  │                                                     │   │
│  │ System Spacing: [Normal ▼]                          │   │
│  │                                                     │   │
│  │ [Reset to Defaults]                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                               [Cancel]  [Save]              │
└─────────────────────────────────────────────────────────────┘
```

#### 4.2.3 Field Validation

| Field | Validation | Error Message |
|-------|------------|---------------|
| Title | Non-empty | "Title is required" |
| Staff Size | 50-150%, stepped by 10 | "Staff size must be between 50% and 150%" |

#### 4.2.4 Undo Behavior

Changes made in the Score Setup dialog are applied immediately via a batched command. When the user presses Cancel, all changes made during the session are undone as a single operation. This ensures:
- Live preview of changes as the user edits
- Clean undo semantics (Cancel = undo all dialog changes)
- No orphaned partial changes in the undo stack

### 4.3 Keyboard Bindings

#### 4.3.1 View Mode Toggle

| Key (macOS) | Key (Windows/Linux) | Action |
|-------------|---------------------|--------|
| `Cmd+\` | `Ctrl+\` | Toggle view mode |

#### 4.3.2 Score Setup Dialog

| Context | Key (macOS) | Key (Windows/Linux) | Action |
|---------|-------------|---------------------|--------|
| Editor | `Cmd+,` | `Ctrl+,` | Open Score Setup dialog |
| Dialog | `Escape` | `Escape` | Cancel and close |
| Dialog | `Enter` | `Enter` | Save and close (when not in text field) |
| Dialog | `Tab` | `Tab` | Move to next field |
| Dialog | `Shift+Tab` | `Shift+Tab` | Move to previous field |

#### 4.3.3 Print

| Key (macOS) | Key (Windows/Linux) | Action |
|-------------|---------------------|--------|
| `Cmd+P` | `Ctrl+P` | Open browser print dialog |

### 4.4 Mouse Interactions

#### 4.4.1 View Toggle Button

| Target | Action | Result |
|--------|--------|--------|
| View Toggle button | Click | Toggle between scroll/page view |
| View Toggle button | Hover | Show tooltip indicating current mode |

#### 4.4.2 Score Setup Button

| Target | Action | Result |
|--------|--------|--------|
| Score Setup button | Click | Open Score Setup dialog |
| Score Setup button | Hover | Show "Score Setup" tooltip |

#### 4.4.3 Print Button

| Target | Action | Result |
|--------|--------|--------|
| Print button | Click | Open browser print dialog |
| Print button | Hover | Show "Print (Cmd+P)" tooltip |

#### 4.4.4 Dialog Interactions

| Target | Action | Result |
|--------|--------|--------|
| Text field | Click | Focus field for editing |
| Slider | Drag | Adjust value with live preview |
| Dropdown | Click | Open options menu |
| Cancel button | Click | Undo all changes, close dialog |
| Save button | Click | Confirm changes, close dialog |
| Close (X) button | Click | Same as Cancel |
| Dialog backdrop | Click | Same as Cancel |

#### 4.4.5 Inline Metadata Editing (WYSIWYG)

> Uses same interaction pattern as chord editing. See section 5.2.3 for full specification.

**Hover Interactions:**

| Target | Action | Result |
|--------|--------|--------|
| Title block area | Hover | Show placeholder text for all empty fields (50% opacity) |
| Title block area | Mouse leave | Hide placeholder text |

**Click Interactions:**

| Target | Action | Result |
|--------|--------|--------|
| Any field | Click | Enter edit mode, select all text |
| Any field | Cmd/Ctrl+Click | Select field without editing |
| Selected field | `Delete`/`Backspace` | Clear field (title reverts to "Untitled") |

**Keyboard Navigation (while editing):**

| Key | Result |
|-----|--------|
| `Tab` | Save current, move to next field |
| `Shift+Tab` | Save current, move to previous field |
| `Enter` | Save and exit (clear if empty non-required) |
| `Escape` | Cancel changes, exit edit mode |
| `Tab` (from last field) | Exit to first note via `api.selectFirstElement()` |

---

## 5. Rendering Specifications

### 5.1 Multi-System Rendering

#### 5.1.1 System Structure

Each system SHALL render:

```svg
<g class="riff-system" data-system-index="0">
  <!-- System brace/bracket (for grand staff) -->
  <path class="riff-brace" d="..." />

  <!-- Clef (all systems) -->
  <use href="#clef-treble" x="..." y="..." />

  <!-- Key signature (all systems) -->
  <g class="riff-key-signature">...</g>

  <!-- Time signature (first system only, unless changed) -->
  <g class="riff-time-signature">...</g>

  <!-- Staves -->
  <g class="riff-staff" data-staff-index="0">...</g>
  <g class="riff-staff" data-staff-index="1">...</g>

  <!-- Barlines (extend across all staves) -->
  <line class="riff-barline" ... />

  <!-- Measure number (start of system) -->
  <text class="riff-measure-number">5</text>
</g>
```

#### 5.1.2 First System Indent

The first system SHALL be indented by 15% of content width:

```typescript
const firstSystemOffset = contentWidth * 0.15;
```

This space accommodates title/composer placement.

#### 5.1.3 Measure Numbers

Measure numbers SHALL appear:
- At the start of each system
- Above the top staff
- Left-aligned with first barline
- Font size: 70% of staff text size

```svg
<text class="riff-measure-number" x="50" y="-10">5</text>
```

#### 5.1.4 Page Boundaries

In page view, the editor SHALL display a subtle page outline to provide WYSIWYG feedback:

```svg
<rect class="riff-page-boundary"
      x="0" y="0"
      width="215.9" height="279.4"
      fill="white"
      stroke="#ddd"
      stroke-width="1" />
```

**Visual styling:**
- Background: White (`#ffffff`)
- Border: Subtle gray (`#dddddd`), 1px
- Shadow: Light drop shadow for depth
- Canvas background (outside page): Light gray (`#f5f5f5`)

### 5.2 Metadata Rendering

#### 5.2.1 Title Block Layout

```
┌─────────────────────────────────────────────────────────────┐
│                           TITLE                              │  ← Large, centered
│  Lyricist                                         Composer   │  ← Left/right aligned
├─────────────────────────────────────────────────────────────┤
│  [First system of music, indented]                          │
└─────────────────────────────────────────────────────────────┘
│  © Copyright notice (bottom of first page)                   │
```

#### 5.2.2 Font Specifications

| Element | Size | Weight | Position |
|---------|------|--------|----------|
| Title | 24pt | Bold | Center, top |
| Composer | 12pt | Normal | Right-aligned |
| Lyricist | 12pt | Normal | Left-aligned |
| Copyright | 8pt | Normal | Center, bottom of first page |

#### 5.2.3 Inline Editing (WYSIWYG)

Metadata editing SHALL use the same interaction pattern as chord editing, with hover preview for empty fields.

##### 5.2.3.1 Hover Preview

When the mouse hovers over the title block area (containing title, composer, lyricist):

**Empty Field Preview:**
- All empty metadata fields SHALL display placeholder text
- Placeholder text SHALL use `--riff-color-primary` at 50% opacity (matching chord preview)
- Placeholder values: "Title", "Composer", "Lyricist"

**Placeholder Styling:**
```css
.riff-MetadataField--preview {
  fill: var(--riff-color-primary);
  opacity: 0.5;
  pointer-events: none;
}
```

**Hover Area:**
```
┌─────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    HOVER AREA                          │  │  ← Title block bounds
│  │  [Title placeholder]                                   │  │
│  │  [Lyricist]                              [Composer]    │  │
│  └───────────────────────────────────────────────────────┘  │
│  [First system of music]                                     │
└─────────────────────────────────────────────────────────────┘
```

##### 5.2.3.2 Click and Focus Behavior

| Action | Result |
|--------|--------|
| Click field | Enter edit mode, select all text, ready to replace |
| Click empty area (in title block) | Focus title field |
| Cmd/Ctrl+Click field | Select field without editing (like chord selection) |

##### 5.2.3.3 Keyboard Navigation

| Key | Behavior |
|-----|----------|
| `Tab` | Save current field, move to next field in order |
| `Shift+Tab` | Save current field, move to previous field in order |
| `Enter` | If valid: save and exit edit mode. If empty: clear field or cancel |
| `Escape` | Discard changes, exit edit mode |

**Field Order (Tab Navigation):**
1. Title
2. Composer
3. Lyricist
4. (Exit to first note or cursor position via `api.selectFirstElement()`)

**Tab Exit Behavior:**
- Tab from last field (Lyricist) → calls `api.selectFirstElement()`
- `selectFirstElement()` selects first note if present, otherwise positions cursor at start

##### 5.2.3.4 Selection and Deletion

Metadata fields SHALL be selectable like chords:
- Cmd/Ctrl+Click to select without editing
- Selected field highlighted with `--riff-color-primary`
- `Delete`/`Backspace` when selected → clear field content (title reverts to "Untitled")

##### 5.2.3.5 Visual States

| State | Styling |
|-------|---------|
| Default | Normal text color |
| Hovered | Primary color (teal) |
| Selected | Primary color + selection indicator |
| Editing | Input field with subtle border |
| Preview (empty) | Primary color at 50% opacity |

##### 5.2.3.6 Implementation Pattern

```typescript
// Reuses interaction logic from ChordTrack/ChordInput
interface MetadataTrackProps {
  metadata: ScoreMetadata;
  contentWidth: number;
  staffScale: number;
  // Event handlers (same pattern as ChordTrack)
  onFieldClick: (field: MetadataField) => void;
  onFieldSelect: (field: MetadataField) => void;
  onEditComplete: (field: MetadataField, value: string) => void;
  onEditCancel: () => void;
  onDelete: (field: MetadataField) => void;
  onNavigateNext: (field: MetadataField, value: string) => void;
  onNavigatePrevious: (field: MetadataField, value: string) => void;
  // State
  editingField: MetadataField | null;
  selectedField: MetadataField | null;
  isHovered: boolean;
}

type MetadataField = 'title' | 'composer' | 'lyricist' | 'copyright';
```

### 5.3 Page Footer Rendering

#### 5.3.1 Page Footer Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Page content - systems, music]                             │
│                                                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  © Copyright notice (page 1 only)                            │  ← 8pt, centered
│                         1                                    │  ← Page number, centered
└─────────────────────────────────────────────────────────────┘
```

#### 5.3.2 Page Number Specifications

| Element | Size | Position | Visibility |
|---------|------|----------|------------|
| Page number | 10pt | Centered, bottom margin | All pages |
| Copyright | 8pt | Centered, above page number | Page 1 only |

#### 5.3.3 Footer Y Positioning

```typescript
const pageNumberY = pageHeight - marginBottom / 2;
const copyrightY = pageNumberY - 12; // Above page number
```

### 5.4 Tie Rendering at System Breaks

#### 5.3.1 Split Tie Visual

```
System 1:                              System 2:
┌──────────────────────────────┐      ┌──────────────────────────────┐
│                          ◠──│      │──◠                           │
│                         ●   │      │   ●                          │
└──────────────────────────────┘      └──────────────────────────────┘
```

#### 5.3.2 Tie Arc Specifications

| Segment | Start X | End X | Control Points |
|---------|---------|-------|----------------|
| First system | Note center | Right edge + 10px | Curve toward edge |
| Second system | Left edge - 10px | Note center | Curve from edge |

### 5.4 Barline Rendering

Barlines SHALL extend across all staves within a system:

```svg
<line class="riff-barline riff-barline--system"
      x1="100" y1="0"
      x2="100" y2="160"
      stroke-width="1" />
```

---

## 6. Print Specifications

### 6.1 Print Stylesheet

#### 6.1.1 Hide UI Elements

```css
@media print {
  /* Hide all UI chrome */
  .riff-toolbar,
  .riff-sidebar,
  .riff-scrollbar,
  .riff-cursor,
  .riff-selection,
  .riff-playback-cursor,
  .riff-dialog,
  .riff-tooltip {
    display: none !important;
  }

  /* Remove backgrounds */
  body,
  .riff-editor,
  .riff-canvas {
    background: white !important;
  }

  /* Ensure high contrast */
  .riff-staff-lines,
  .riff-notehead,
  .riff-stem,
  .riff-beam,
  .riff-barline {
    stroke: black !important;
    fill: black !important;
  }
}
```

#### 6.1.2 Page Break Control

```css
@media print {
  .riff-system {
    page-break-inside: avoid;
  }

  .riff-page-break {
    page-break-before: always;
  }
}
```

### 6.2 PDF Output Quality

#### 6.2.1 Vector Requirements

- All music notation SHALL be rendered as SVG paths
- No bitmap images for notation elements
- Text SHALL remain selectable in PDF output

#### 6.2.2 Resolution Independence

- SVG viewBox SHALL use logical coordinates
- Scale transformations SHALL use matrix transforms
- Stroke widths SHALL be proportional to scale

---

## 7. API Specifications

### 7.1 Layout API Methods

```typescript
interface LayoutAPI {
  // ==================== View Mode ====================

  /** Get current view mode */
  getViewMode(): 'scroll' | 'page';

  /** Set view mode */
  setViewMode(mode: 'scroll' | 'page'): MusicEditorAPI;

  /** Toggle between scroll and page view */
  toggleViewMode(): MusicEditorAPI;

  // ==================== Layout Config ====================

  /** Get current layout configuration */
  getLayoutConfig(): LayoutConfig;

  /** Update layout configuration */
  setLayoutConfig(config: Partial<LayoutConfig>): MusicEditorAPI;

  /** Reset layout to defaults */
  resetLayoutConfig(): MusicEditorAPI;

  // ==================== Page Layout ====================

  /** Get computed page layout (systems, positions) */
  getPageLayout(): PageLayout;

  /** Get system containing a measure */
  getSystemForMeasure(measureIndex: number): SystemLayout | null;

  /** Force recalculation of system breaks */
  recalculateSystems(): MusicEditorAPI;
}
```

### 7.2 Metadata API Methods

```typescript
interface MetadataAPI {
  /** Get score metadata */
  getMetadata(): ScoreMetadata;

  /** Update score metadata */
  setMetadata(metadata: Partial<ScoreMetadata>): MusicEditorAPI;

  /** Get specific metadata field */
  getTitle(): string;
  getComposer(): string | undefined;
  // ... etc

  /** Set specific metadata field */
  setTitle(title: string): MusicEditorAPI;
  setComposer(composer: string): MusicEditorAPI;
  // ... etc
}
```

### 7.3 Print API Methods

```typescript
interface PrintAPI {
  /** Open browser print dialog */
  print(): void;

  /** Prepare score for print (apply print styles, hide UI) */
  preparePrint(): void;

  /** Restore normal view after print */
  restoreFromPrint(): void;
}
```

---

## 8. Export Specifications

### 8.1 JSON Export

Layout configuration and metadata SHALL be included in score JSON:

```json
{
  "staves": [...],
  "metadata": {
    "title": "My Score",
    "composer": "J. Smith",
    "lyricist": "B. Brown",
    "copyright": "© 2026"
  },
  "layout": {
    "pageSize": "letter",
    "margins": "normal",
    "staffSize": 100,
    "systemSpacing": "normal",
    "viewMode": "scroll"
  }
}
```

> **Note:** The root-level `title` field is deprecated. Use `metadata.title` as the canonical location. Existing scores with root-level `title` will be migrated automatically.

### 8.2 ABC Export

Metadata SHALL be exported using ABC header fields:

```abc
X:1
T:My Score
T:Op. 1
C:J. Smith
Z:Arranged by A. Jones
%%footer © 2026
```

### 8.3 MusicXML Export

Metadata SHALL be exported using MusicXML elements:

```xml
<work>
  <work-title>My Score</work-title>
</work>
<identification>
  <creator type="composer">J. Smith</creator>
  <creator type="lyricist">B. Brown</creator>
  <rights>© 2026</rights>
</identification>
```

### 8.4 Print

Print is accessible via the toolbar Print button and keyboard shortcut (`Cmd+P` / `Ctrl+P`).

```typescript
interface PrintOptions {
  /** Trigger source: 'toolbar' | 'shortcut' | 'api' */
  source: string;
}

function openPrint(options: PrintOptions): void {
  // Apply print stylesheet
  preparePrint();

  // Open print dialog
  window.print();

  // Restore normal view
  window.addEventListener('afterprint', restoreFromPrint, { once: true });
}
```

> **Note:** Users can print directly or select "Save as PDF" in the browser's print dialog.

---

## 9. Accessibility Specifications

### 9.1 Screen Reader Support

#### 9.1.1 System Announcements

When navigating between systems, announce:
- "System X of Y"
- "Measures N through M"

#### 9.1.2 Dialog Accessibility

| Element | ARIA Attribute |
|---------|---------------|
| Dialog container | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="title"` |
| Section headers | `role="heading"`, `aria-level="2"` |
| Required fields | `aria-required="true"` |
| Error messages | `role="alert"` |

### 9.2 Keyboard Navigation

#### 9.2.1 Focus Order

1. View Toggle button
2. Score Setup button
3. (other toolbar items)
4. Score canvas

#### 9.2.2 Focus Indicators

All focusable elements SHALL have visible focus indicators meeting WCAG 2.1 AA contrast requirements.

---

## 10. Performance Specifications

### 10.1 System Break Calculation

| Metric | Target |
|--------|--------|
| Initial calculation (100 measures) | < 50ms |
| Incremental update (measure added) | < 10ms |
| View mode toggle | < 200ms |

### 10.2 Rendering Performance

| Metric | Target |
|--------|--------|
| 10 systems render | < 16ms (60fps) |
| 50 systems render | < 50ms |
| Scroll performance | No frame drops |

### 10.3 Memoization

System break calculation SHALL be memoized, recalculating only when:
- Page size changes
- Margins change
- Staff size changes
- Measures added/removed
- Time signature changes
- View mode changes to 'page'

---

## 11. Test Specifications

### 11.1 Unit Tests

#### 11.1.1 System Break Algorithm

```typescript
describe('calculateSystemBreaks', () => {
  it('fills first system respecting indent');
  it('breaks before measure that would overflow');
  it('handles single measure exceeding width');
  it('handles empty score');
  it('handles single measure score');
  it('respects page size differences');
});
```

#### 11.1.2 Justification

```typescript
describe('calculateJustification', () => {
  it('returns 1.0 for non-last systems');
  it('returns < 1.0 for sparse last system');
  it('returns 1.0 for dense last system');
});
```

### 11.2 Integration Tests

```typescript
describe('PageView', () => {
  it('renders multiple systems');
  it('preserves selection on view toggle');
  it('updates on layout config change');
  it('splits ties across systems');
});
```

### 11.3 Print Tests

```typescript
describe('Print', () => {
  it('hides UI elements');
  it('maintains vector quality');
  it('respects page breaks');
});
```

### 11.4 Metadata Tests

```typescript
describe('MetadataService', () => {
  it('validates required title field');
  it('rejects title over 200 characters');
  it('validates optional field lengths');
  it('normalizes whitespace');
  it('preserves valid metadata unchanged');
});
```

### 11.5 View Mode Tests

```typescript
describe('ViewModeToggle', () => {
  it('preserves selection when switching to page view');
  it('preserves selection when switching to scroll view');
  it('preserves playback position on toggle');
  it('preserves undo history on toggle');
  it('maps scroll position to equivalent system');
});
```

### 11.6 Keyboard Shortcut Tests

```typescript
describe('PageViewKeyboardShortcuts', () => {
  it('Cmd+\\ toggles view mode on Mac');
  it('Ctrl+\\ toggles view mode on Windows/Linux');
  it('Cmd+, opens Score Setup dialog on Mac');
  it('Ctrl+, opens Score Setup dialog on Windows/Linux');
  it('Cmd+P opens print dialog on Mac');
  it('Ctrl+P opens print dialog on Windows/Linux');
});
```

### 11.7 Accessibility Tests

```typescript
describe('PageViewAccessibility', () => {
  it('announces system navigation to screen readers');
  it('provides focus indicators on all interactive elements');
  it('supports keyboard-only dialog navigation');
  it('uses correct ARIA roles and labels');
});
```

### 11.8 Export Tests

```typescript
describe('MetadataExport', () => {
  it('exports title to ABC T: field');
  it('exports composer to ABC C: field');
  it('exports metadata to MusicXML <identification>');
  it('escapes special characters in exports');
});
```
