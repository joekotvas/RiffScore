# Coordinate Service v2 - Simplified Architecture

**Issue:** Follow-up to #204
**Date:** 2026-02-13

---

## Problem

Current positioning architecture is fragmented:
- `measure.ts` computes `eventPositions[eventId]` (relative)
- `scoreLayout.ts` converts to `layout.notes[key].x` (absolute)
- `ScoreCanvas.tsx` builds `quantToXMap` from `layout.notes` (~25 lines)
- Different elements access positions through different paths

Adding a new positioned element (lyrics, dynamics) requires understanding this whole chain.

---

## Goal

Adding a new positioned element should be one line:

```typescript
const x = layout.getX(quant);
```

---

## Solution

Build `getX` function directly in the layout engine. Include it in `ScoreLayout`.

### Updated `ScoreLayout` Interface

```typescript
// src/engines/layout/types.ts

export interface ScoreLayout {
  staves: StaffLayout[];
  notes: Record<string, NoteLayout>;
  events: Record<string, EventLayout>;

  // NEW: Single function for ALL positioned elements
  getX: (quant: number) => number;
}
```

### Build in Layout Engine

```typescript
// src/engines/layout/scoreLayout.ts

export const calculateScoreLayout = (score: Score): ScoreLayout => {
  // ... existing layout computation ...

  // Build quant→X map from note positions
  const quantToXMap = buildQuantToXMap(layout.notes, score, quantsPerMeasure);

  // Build measure positions for interpolation fallback
  const measurePositions = layout.staves[0]?.measures.map(m => ({ x: m.x, width: m.width })) ?? [];

  // Pre-bind the lookup function
  const getX = (quant: number): number =>
    quantToX(quant, quantToXMap, measurePositions, quantsPerMeasure) ?? 0;

  return { staves, notes, events, getX };
};
```

---

## Migration

### ScoreCanvas.tsx

**Remove ~30 lines:**
```diff
- import { quantToX as quantToXUtil } from '@/engines/layout/coordinateUtils';

- const quantToXMap = useMemo(() => {
-   const map = new Map<number, number>();
-   Object.values(layout.notes).forEach((noteLayout) => {
-     const measure = score.staves[noteLayout.staffIndex]?.measures[noteLayout.measureIndex];
-     if (!measure) return;
-     let localQuant = 0;
-     for (const event of measure.events) {
-       if (event.id === noteLayout.eventId) {
-         const globalQuant = noteLayout.measureIndex * quantsPerMeasure + localQuant;
-         if (!map.has(globalQuant)) {
-           map.set(globalQuant, noteLayout.x);
-         }
-         break;
-       }
-       localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
-     }
-   });
-   return map;
- }, [layout.notes, score.staves, quantsPerMeasure]);

- const quantToX = useCallback(
-   (quant: number): number => quantToXUtil(quant, quantToXMap, measurePositions, quantsPerMeasure) ?? 0,
-   [quantToXMap, measurePositions, quantsPerMeasure]
- );

+ // Just use layout.getX directly
+ const quantToX = layout.getX;
```

### ChordTrack

No changes - still receives `quantToX` as prop.

### Any Future Element

```typescript
const x = layout.getX(lyric.quant);
const x = layout.getX(dynamic.quant);
const x = layout.getX(annotation.quant);
```

---

## Implementation Steps

1. Add `getX` to `ScoreLayout` interface in `types.ts`
2. Build `quantToXMap` in `scoreLayout.ts` during layout calculation
3. Create `getX` function and include in returned layout
4. Remove map building from `ScoreCanvas.tsx`
5. Update tests

---

## Files Changed

| File | Change |
|------|--------|
| `src/engines/layout/types.ts` | Add `getX: (quant: number) => number` to `ScoreLayout` |
| `src/engines/layout/scoreLayout.ts` | Build map + `getX` during layout |
| `src/components/Canvas/ScoreCanvas.tsx` | Remove ~30 lines, use `layout.getX` |

---

## Result

**Before:**
- ScoreCanvas builds map (20 lines)
- ScoreCanvas creates callback (5 lines)
- Multiple dependencies to track

**After:**
- `layout.getX(quant)` - one function, computed once, used everywhere

```
score (state)
    ↓
useScoreLayout(score)
    ↓
layout.getX(quant) ← single source of truth
    ↓
Chords, Cursor, Lyrics, Dynamics...
```
