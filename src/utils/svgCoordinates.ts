/** Convert screen pixels to local SVG units, including CSS rotation, viewBox, and zoom. */
export type ScreenToSvg = (x: number, y: number) => { x: number; y: number };

export function createScreenToSvgTransform(element: Element): ScreenToSvg | null {
  const graphics = element as SVGGraphicsElement;
  if (typeof graphics.getScreenCTM !== 'function') return null;
  try {
    const inverse = graphics.getScreenCTM()?.inverse();
    if (
      !inverse ||
      ![inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite)
    )
      return null;
    return (x, y) => ({
      x: inverse.a * x + inverse.c * y + inverse.e,
      y: inverse.b * x + inverse.d * y + inverse.f,
    });
  } catch {
    // Hidden, detached, or non-invertible SVGs retain the caller's fallback geometry.
    return null;
  }
}
