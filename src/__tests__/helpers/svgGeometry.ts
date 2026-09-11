/**
 * Compose SVG `transform` attributes (translate/scale sequences, as the renderer emits them)
 * so tests can compare where elements are actually drawn, independent of how deeply the
 * renderer nests groups. jsdom has no layout engine, so this is the only way to get
 * "drawn" coordinates in unit tests.
 */

/** Affine matrix [a, b, c, d, e, f] as in SVG's matrix(a b c d e f). */
export type Affine = [number, number, number, number, number, number];

const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

const multiply = (m: Affine, n: Affine): Affine => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** Parse a transform attribute containing translate(...) and scale(...) calls, in order. */
export function parseTransform(transform: string): Affine {
  let m = IDENTITY;
  const re = /(translate|scale)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(transform)) !== null) {
    const v = match[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    m = multiply(
      m,
      match[1] === 'translate' ? [1, 0, 0, 1, v[0], v[1] ?? 0] : [v[0], 0, 0, v[1] ?? v[0], 0, 0]
    );
  }
  return m;
}

/**
 * Position of an element's own (x, y) attributes after composing every ancestor transform
 * from `stopAt` (exclusive; the enclosing <svg> by default) down to the element itself.
 */
export function composedPosition(
  el: Element,
  stopAt: (ancestor: Element) => boolean = (a) => a.tagName.toLowerCase() === 'svg'
): { x: number; y: number } {
  const chain: Element[] = [];
  for (let e: Element | null = el; e && !stopAt(e); e = e.parentElement) chain.unshift(e);
  let m = IDENTITY;
  for (const e of chain) {
    const t = e.getAttribute('transform');
    if (t) m = multiply(m, parseTransform(t));
  }
  const x = Number(el.getAttribute('x') ?? 0);
  const y = Number(el.getAttribute('y') ?? 0);
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}
