/**
 * coordinateUtils.ts
 *
 * Shared coordinate transformation utilities for score layout.
 * All X position logic flows through these functions.
 *
 * @see Issue #204
 */

/** Simple 2D point */
export interface Point {
  x: number;
  y: number;
}

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
