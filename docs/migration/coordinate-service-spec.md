# Coordinate Utilities - Technical Spec

**Issue:** [#204](https://github.com/joekotvas/riffscore/issues/204)
**Date:** 2026-02-13

---

## Problem

X position logic is fragmented:
- `ScoreCanvas.tsx` has `quantToX` callback with two-stage lookup
- `ChordTrack.tsx` has `xToNearestQuant` and CTM handling
- Other components use different approaches

## Solution

Extract 3 utility functions into a shared file. All score elements use the same positioning logic.

---

## Implementation

### New File: `src/engines/layout/coordinateUtils.ts`

```typescript
import type { Point } from '@/types';

/** Measure position data for interpolation fallback */
export interface MeasurePosition {
  x: number;
  width: number;
}

/**
 * Convert quant to X coordinate.
 * Two-stage lookup: exact match from map, then interpolation fallback.
 */
export function quantToX(
  quant: number,
  quantToXMap: Map<number, number>,
  measurePositions: MeasurePosition[],
  quantsPerMeasure: number
): number | null {
  // Stage 1: Exact match (O(1) lookup)
  const exact = quantToXMap.get(quant);
  if (exact !== undefined) return exact;

  // Stage 2: Interpolation fallback
  if (measurePositions.length === 0) return null;

  const measureIndex = Math.floor(quant / quantsPerMeasure);
  const measure = measurePositions[measureIndex];
  if (!measure) return null;

  const localQuant = quant % quantsPerMeasure;
  const proportion = localQuant / quantsPerMeasure;
  return measure.x + proportion * measure.width;
}

/**
 * Find nearest quant position to an X coordinate.
 */
export function xToNearestQuant(
  x: number,
  validQuants: Set<number>,
  quantToXFn: (quant: number) => number | null,
  snapDistance = 24
): number | null {
  let nearest: number | null = null;
  let nearestDist = Infinity;

  for (const quant of validQuants) {
    const qx = quantToXFn(quant);
    if (qx === null) continue;

    const dist = Math.abs(x - qx);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = quant;
    }
  }

  return nearestDist <= snapDistance ? nearest : null;
}

/**
 * Transform client (screen) coordinates to SVG local coordinates.
 * Uses CTM for accurate handling of nested transforms.
 */
export function clientToSvg(
  clientX: number,
  clientY: number,
  element: SVGElement
): Point {
  const svg = element.ownerSVGElement ?? (element as SVGSVGElement);
  const parent = element.parentElement as SVGGraphicsElement | null;
  const ctm = parent?.getScreenCTM() ?? svg?.getScreenCTM();

  if (!svg || !ctm) {
    // Fallback for detached elements
    const rect = element.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(ctm.inverse());
  return { x: transformed.x, y: transformed.y };
}
```

---

## Migration

### ScoreCanvas.tsx

```diff
+ import { quantToX } from '@/engines/layout/coordinateUtils';

  // In useScoreLayout or ScoreCanvas:
  const quantToXMap = useMemo(() => buildQuantToXMap(layout, score), [layout, score]);
  const measurePositions = useMemo(() => buildMeasurePositions(layout), [layout]);

- const quantToXCallback = useCallback((quant: number) => {
-   const mappedX = quantToXMap.get(quant);
-   if (mappedX !== undefined) return mappedX;
-   // ... 15 lines of interpolation logic
- }, [quantToXMap, measurePositions, quantsPerMeasure]);

+ const quantToXCallback = useCallback(
+   (quant: number) => quantToX(quant, quantToXMap, measurePositions, quantsPerMeasure),
+   [quantToXMap, measurePositions, quantsPerMeasure]
+ );
```

### ChordTrack.tsx

```diff
+ import { clientToSvg, xToNearestQuant } from '@/engines/layout/coordinateUtils';

- function xToNearestQuant(...) { ... }  // Delete ~20 lines

  const handleTrackClick = (e: React.MouseEvent) => {
-   const svg = e.currentTarget.ownerSVGElement;
-   const parentGroup = e.currentTarget.parentElement as SVGGraphicsElement | null;
-   const ctm = parentGroup?.getScreenCTM() ?? svg.getScreenCTM();
-   const pt = svg.createSVGPoint();
-   pt.x = e.clientX;
-   pt.y = e.clientY;
-   const svgP = pt.matrixTransform(ctm?.inverse());
+   const { x } = clientToSvg(e.clientX, e.clientY, e.currentTarget);

-   const quant = xToNearestQuant(svgP.x, validQuants, quantToX);
+   const quant = xToNearestQuant(x, validQuants, quantToX);
    // ...
  };
```

---

## Result

All X positioning flows through one place:

```
Layout Engine (computes positions)
       ↓
  quantToXMap (built in useScoreLayout)
       ↓
  quantToX() ← single function, shared by all
       ↓
  Notes, Chords, Cursor, Hit Detection
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/engines/layout/coordinateUtils.ts` | **New** (~70 lines) |
| `src/engines/layout/index.ts` | Add export |
| `src/components/Canvas/ScoreCanvas.tsx` | Use `quantToX`, delete duplicate logic |
| `src/components/Canvas/ChordTrack/ChordTrack.tsx` | Use all 3 utils, delete duplicates |

---

## Testing

**Unit tests:**
- `quantToX` returns exact match when quant exists in map
- `quantToX` interpolates correctly for quants between notes
- `quantToX` returns null for out-of-bounds quants
- `xToNearestQuant` snaps within distance, returns null outside
- `clientToSvg` handles nested transforms

**Manual:**
1. Click in ChordTrack → chord at correct position
2. Hover over measures → pitch indicator tracks correctly
3. Playback cursor → follows notes accurately
