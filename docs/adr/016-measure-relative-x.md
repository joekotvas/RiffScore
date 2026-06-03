# ADR-016: Measure-Relative X Positioning

> **Principle**: Single Source of Truth, Preparation for System Breaks
> **Status**: Accepted
> **Date**: 2026-02-14
> **Spec**: [measure-relative-x-spec.md](../migration/measure-relative-x-spec.md)

## Context

The original `getX(quant)` API returned absolute X coordinates. While this works for single-system scores, it breaks when implementing system breaks (multi-line rendering) where the same measure can appear at different X positions on different lines.

**Original API:**
```typescript
layout.getX(globalQuant)  // Returns absolute X (e.g., 450)
```

**Problem:** With system breaks, measure 5 might start at X=100 on line 1 but X=50 on line 2. A global quant-to-absolute-X mapping cannot represent this.

## Decision

Implement a **measure-relative coordinate system** where:

1. `getX({ measure, quant })` returns position **within** the measure
2. `getX.measureOrigin({ measure })` returns the measure's **absolute origin**
3. `NoteLayout.localX` and `EventLayout.localX` are measure-relative

### New API

```typescript
getX: {
  /** X position within a measure (measure-relative) */
  (params: { measure: number; quant: number }): number | null;

  /** Measure's origin X (for SVG transforms) */
  measureOrigin: (params: { measure: number }) => number | null;
};
```

### Key Design Choices

| Aspect | Decision |
|--------|----------|
| **Return type** | `number | null` for graceful handling of invalid indices |
| **Coordinate system** | Measure-relative for positions, absolute for origins |
| **Layout types** | `NoteLayout.localX` and `EventLayout.localX` are measure-relative |
| **Hit detection** | Convert to absolute when needed (`origin + localX`) |
| **Rendering pattern** | Use SVG `<g transform>` with measureOrigin |

### Rendering Pattern

```tsx
<g transform={`translate(${layout.getX.measureOrigin({ measure }) ?? 0}, 0)`}>
  <Element x={layout.getX({ measure, quant }) ?? 0} />
</g>
```

Or when absolute X is needed:
```typescript
const absoluteX = (layout.getX.measureOrigin({ measure }) ?? 0) +
                  (layout.getX({ measure, quant }) ?? 0);
```

## Consequences

### Positive

- **System breaks ready**: Same measure can appear at different X positions
- **Measure insertion robust**: Moving measures doesn't require recalculating global quants
- **Clear semantics**: Positions are relative to their container (measure)
- **Type-safe**: `null` returns catch errors at compile time
- **Single source of truth**: All X positions come from `layout.getX`

### Negative

- **Migration effort**: All getX consumers updated (ChordTrack, Cursor, etc.)
- **Extra computation**: Absolute X requires `measureOrigin + localX`
- **API complexity**: Two-step lookup vs single-step

### Neutral

- **ChordSymbol data model**: Now uses `{ measure, quant }` instead of global quant (aligns with API)

## Migration Summary

| Stage | Component | Changes |
|-------|-----------|---------|
| 0 | ChordSymbol | `{ measure, quant }` instead of global quant |
| 1 | ScoreLayout | New `getX` signature with `measureOrigin` |
| 2 | ChordTrack | Use `getAbsoluteX()` helper |
| 3 | useCursorLayout | Return `{ measure, x }` instead of absolute X |
| 4 | ScoreCanvas | Calculate absolute X from measure + localX |
| 5 | useDragToSelect | Already compatible (has measureIndex) |
| 6 | Layout types | Rename `x` to `localX` |

All 1209 tests pass after migration.

## Usage Examples

```typescript
// Get X position for chord at beat 3 of measure 2
const localX = layout.getX({ measure: 2, quant: 48 });  // e.g., 65
const origin = layout.getX.measureOrigin({ measure: 2 }); // e.g., 350
const absoluteX = (origin ?? 0) + (localX ?? 0);  // 415

// Cursor positioning
const { measure, x: localX } = useCursorLayout(layout, position);
const cursorX = (layout.getX.measureOrigin({ measure }) ?? 0) + (localX ?? 0);

// NoteLayout is measure-relative
Object.values(layout.notes).forEach(note => {
  const absoluteX = (layout.getX.measureOrigin({ measure: note.measureIndex }) ?? 0)
                  + note.localX;
});
```

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Keep absolute X | Doesn't support system breaks |
| System-relative X | Still requires offset when system position changes |
| Per-system layout objects | More complex API, harder to query across systems |
| Store both absolute and relative | Data duplication, maintenance burden |

## Related

- [Measure-Relative X Spec](../migration/measure-relative-x-spec.md) - Full implementation details
- [ADR-015: Forward-Flow Y Positioning](./015-forward-flow-y-positioning.md) - Y coordinate design
- Issue #204 - Coordinate service work
