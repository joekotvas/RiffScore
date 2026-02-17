# ADR-017: Stretch Factor Justification for Page View

> **Principle**: Single Source of Truth, No Duplicate Calculations
> **Status**: Accepted
> **Date**: 2026-02-15
> **Related**: [#174](https://github.com/joekotvas/riffscore/issues/174) Page View & Print

## Context

Page view requires justified systems where measures stretch to fill the available width. The justification calculation exists in `PageLayoutService.calculateMeasurePositions()` but is **not consumed during rendering**.

Current state:
- `PageLayoutService` computes `system.justification` and `system.measurePositions` with stretched widths
- `Staff.tsx` receives `staffLayout` from **scroll view layout** (not page layout)
- `Measure` renders using natural (unstretched) widths
- Result: measures bunch to the left instead of filling the system width

### Problem Illustration

```
COMPUTED (PageLayoutService)          RENDERED (Staff/Measure)
─────────────────────────────         ───────────────────────────
system.measurePositions = [           Staff uses layout.staves[staffIndex]
  {x: 100, width: 180},  ← stretched  which has natural widths
  {x: 280, width: 180},
]                                     Result: |▬▬▬▬|▬▬▬▬|        |
                                              ↑ bunched to left
Expected:
|▬▬▬▬▬▬▬▬|▬▬▬▬▬▬▬▬|
↑ fills system width
```

## Decision

Implement **stretch factor propagation** through the rendering pipeline:

1. **Layout helper** calculates stretch factor (single source of truth)
2. **Staff** receives system data and computes stretch factor once
3. **Measure** receives stretch factor and applies it to all X coordinates
4. **No duplicate calculations** - same math in layout engine, used everywhere

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│ PageLayoutService (already computes)                                    │
│ ─────────────────────────────────────                                   │
│ system.contentWidth     = 600px (available width)                       │
│ system.justification    = 1.0 (fully justified) or <1.0 (ragged)       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ScoreCanvas.tsx                                                         │
│ ──────────────                                                          │
│ Passes to Staff:                                                        │
│   systemContentWidth={system.contentWidth}                              │
│   justification={system.justification}                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Staff.tsx                                                               │
│ ─────────                                                               │
│ Calls helper: calculateStretchFactor(naturalWidth, contentWidth, just) │
│ Passes to each Measure: stretchFactor={stretchFactor}                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Measure.tsx → calculateMeasureLayout(..., stretchFactor)                │
│ ─────────────────────────────────────────────────────────               │
│ Applies internally:                                                     │
│   eventX *= stretchFactor                                               │
│   totalWidth *= stretchFactor                                           │
│   hitZones scaled accordingly                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### New Helper Function

Add to `engines/layout/measure.ts`:

```typescript
/**
 * Calculates the stretch factor for justified systems.
 *
 * @param naturalWidth - Sum of natural measure widths
 * @param availableWidth - System content width to fill
 * @param justification - 1.0 for justified, <1.0 for ragged
 * @returns Stretch factor (1.0 = no stretch)
 */
export const calculateStretchFactor = (
  naturalWidth: number,
  availableWidth: number,
  justification: number
): number => {
  if (justification !== 1.0 || naturalWidth <= 0) {
    return 1.0; // Ragged or invalid - no stretching
  }
  return availableWidth / naturalWidth;
};
```

### Modified Functions

**calculateMeasureLayout** - Add optional `stretchFactor` parameter:

```typescript
export const calculateMeasureLayout = (
  events: ScoreEvent[],
  totalQuants: number = CONFIG.quantsPerMeasure,
  clef: string = 'treble',
  isPickup: boolean = false,
  forcedEventPositions?: Record<number, number>,
  stretchFactor: number = 1.0  // NEW
): MeasureLayout => {
  // ... existing logic ...

  // Apply stretch to event X positions
  const noteheadX = (baseX + metrics.accidentalSpace + negativeCompensation) * stretchFactor;

  // Apply stretch to final width
  const finalWidth = Math.max(currentX + CONFIG.measurePaddingRight, minWidth) * stretchFactor;

  // Apply stretch to hit zones
  // ...
};
```

## Consequences

### Positive

- **Single source of truth**: Stretch factor math lives in one helper
- **No duplicate rendering**: Same layout code, just scaled
- **Minimal prop additions**: Only 2 props to Staff, 1 to Measure
- **Backwards compatible**: `stretchFactor=1.0` default preserves scroll view behavior
- **Correct hit detection**: Stretched hit zones match stretched visuals

### Negative

- **Natural width recalculation**: Staff computes natural width sum (but this is cheap)
- **Prop drilling**: `stretchFactor` flows through Staff → Measure
- **Testing**: Need to verify stretched hit zones work correctly

### Neutral

- **PageLayoutService.measurePositions**: Still computed but now redundant for rendering
  - Consider removing in future cleanup (breaking change)
  - Or keep for other consumers (playback cursor, coordinate lookup)

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Use `system.measurePositions` directly | Would require building synthetic `StaffLayout` from page layout; more complex than passing stretch factor |
| Apply stretch via SVG transform on Measure | Breaks hit detection; scaled text/strokes look wrong |
| Move stretch into `useMeasureLayout` hook | Would require page layout context in scroll view code; violates separation |
| Build page-view-aware StaffLayout | Duplicates layout data structure; harder to maintain |

## Implementation Files

| File | Change |
|------|--------|
| `src/engines/layout/measure.ts` | Add `calculateStretchFactor`, modify `calculateMeasureLayout` |
| `src/engines/layout/index.ts` | Export new function |
| `src/components/Canvas/Staff.tsx` | Accept and compute stretch factor, pass to Measure |
| `src/components/Canvas/Measure.tsx` | Accept and pass `stretchFactor` to layout |
| `src/components/Canvas/ScoreCanvas.tsx` | Pass `systemContentWidth` and `justification` to Staff |
| `src/__tests__/engines/layout/measure.test.ts` | Add stretch factor tests |

## Related

- [ADR-015: Forward-Flow Y Positioning](./015-forward-flow-y-positioning.md) - Similar layout API pattern
- [ADR-016: Measure-Relative X](./016-measure-relative-x.md) - X coordinate system
- [PageLayoutService](../../src/services/PageLayoutService.ts) - System justification source
