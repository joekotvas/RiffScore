# ADR-018: Semantic Layout Model

**Status**: Implemented
**Date**: 2026-02-14
**Issue**: #174 (Page View & Print)

## Context

The layout system had accumulated complexity leading to a double-subtraction bug where the preamble width was subtracted twice.

### Problems Identified (Original State)

1. **Redundant Constants**: `LAYOUT_WIDTHS` vs `CONFIG.header` with different values
2. **Confusing Naming**: "header" meant both page metadata AND system preamble
3. **Coordinate System Confusion**: "page coords" vs "staff coords" not consistently defined
4. **Formula Duplication (BUG)**: Preamble width subtracted twice
5. **Magic Numbers**: `48` for staff height scattered across files

## Decision

Adopt a **semantic layout model** with:

1. **Single Source of Truth**: Each measurement defined once
2. **Semantic Names**: Variables describe what they measure
3. **Clear Coordinate Systems**: Explicit "page" vs "staff" coordinates
4. **Anchors Over Offsets**: Define edges (left, right) not deltas

## Coordinate Systems

```
PAGE COORDINATES (pixels)
├── Origin at top-left of page
├── Units: pixels at final render size
└── Used for: margins, content area, system Y positions

STAFF COORDINATES (unscaled pixels)
├── Origin at staff's local (0,0)
├── Units: pixels at 100% scale
├── Multiplied by staffScale for page coords
└── Used for: note positions, measure widths, preamble
```

## Completed Work

### Phase 1: Terminology Cleanup ✓

| Old | New |
|-----|-----|
| `HeaderLayout` type | `SystemPreamble` |
| `calculateHeaderLayout()` | `calculateSystemPreamble()` |
| `CONFIG.header` | `CONFIG.preamble` |
| `startOfMeasures` | `measuresX` |
| `LAYOUT_WIDTHS` | (removed - unused) |
| `CONFIG.headerWidth` | (removed - dead code) |

### Phase 2: Bug Fix ✓

```typescript
// Before (BUG): subtracted preambleWidth twice
const availableForMeasures = system.contentWidth / staffScale - preambleWidth;

// After (FIXED): system.contentWidth already excludes preamble
const availableForMeasures = system.contentWidth / staffScale;
```

### Phase 3: Variable Preamble Width ✓

First system has time signature (wider preamble), subsequent systems don't:

```typescript
// calculateSystemPreamble now accepts isFirstSystem option
const firstPreamble = calculateSystemPreamble(keySignature, { isFirstSystem: true });
const subsequentPreamble = calculateSystemPreamble(keySignature, { isFirstSystem: false });

// SystemLayout now stores per-system preamble width
interface SystemLayout {
  preambleWidth: number;  // Staff coords (narrower on subsequent systems)
  contentWidth: number;   // Page coords (space for measures, preamble excluded)
  // ...
}
```

### Phase 4: StaffGeometry Constant ✓

Consolidated in `constants.ts`:

```typescript
export const STAFF_GEOMETRY = {
  lineHeight: 12,   // CONFIG.lineHeight
  lineCount: 5,     // STAFF_LINES_COUNT
  height: 48,       // STAFF_HEIGHT
  spacing: 120,     // CONFIG.staffSpacing
} as const;
```

### Phase 5: Coordinate System Documentation ✓

Added inline comments at coordinate system boundaries in:
- `PageLayoutService.ts` header block
- `ScoreCanvas.tsx` stretch factor calculation

## Current Rendering Flow

```
PageGeometry (fixed)
    ↓
    ├── content.left, content.right, content.width
    ↓
SystemGeometry (per system)
    ↓
    ├── system.contentWidth = page coords (preamble already subtracted)
    ├── availableForMeasures = system.contentWidth / staffScale
    ├── stretchFactor = availableForMeasures / naturalWidth
    ↓
Staff Rendering
    ↓
    ├── Transform: translate(contentX + indent, systemY) scale(staffScale)
    ├── Render preamble at x=0
    ├── Render measures at x=measuresX, stretched by stretchFactor
```

## Stretch Factor Formula

```typescript
// Single source of truth (in ScoreCanvas):
const availableForMeasures = system.contentWidth / staffScale;
const stretchFactor = calculateStretchFactor(
  naturalMeasuresWidth,  // Sum of measure widths (staff coords)
  availableForMeasures,  // Available space (staff coords)
  system.justification   // 1.0 = justified, <1.0 = ragged
);
```

## Consequences

### Positive
- Clear terminology (preamble vs metadata)
- Bug fix prevents future double-calculation errors
- Documented coordinate systems

### Negative
- Breaking change: `calculateSystemPreamble` now returns `hasTimeSignature` boolean
- Breaking change: `SystemLayout` now requires `preambleWidth` field
- `calculateSystemBreaks` signature changed to accept config object

## Implementation Status

| Phase | Status |
|-------|--------|
| 1. Terminology | ✓ Complete |
| 2. Bug fix | ✓ Complete |
| 3. Variable preamble width | ✓ Complete |
| 4. StaffGeometry | ✓ Complete |
| 5. Documentation | ✓ Complete |
