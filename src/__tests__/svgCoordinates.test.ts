import { createScreenToSvgTransform } from '../utils/svgCoordinates';

it('maps a rotated, translated and scaled embed back to score coordinates', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  // Inverse of a 90° rotation at 2x scale, translated to (100, 200).
  Object.defineProperty(svg, 'getScreenCTM', {
    value: () => ({
      inverse: () => ({ a: 0, b: -0.5, c: 0.5, d: 0, e: -100, f: 50 }),
    }),
  });
  const project = createScreenToSvgTransform(svg)!;
  expect(project(40, 240)).toEqual({ x: 20, y: 30 });
  expect(project(28, 240).y - project(40, 240).y).toBe(6);
});

it('falls back safely when the SVG is detached or its transform cannot be inverted', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  expect(createScreenToSvgTransform(svg)).toBeNull();
  Object.defineProperty(svg, 'getScreenCTM', { configurable: true, value: () => null });
  expect(createScreenToSvgTransform(svg)).toBeNull();
  Object.defineProperty(svg, 'getScreenCTM', {
    value: () => ({
      inverse: () => ({ a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN }),
    }),
  });
  expect(createScreenToSvgTransform(svg)).toBeNull();
});
