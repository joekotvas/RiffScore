/**
 * coordinateUtils.test.ts
 *
 * Unit tests for coordinate transformation utilities.
 *
 * @see Issue #204
 */
import {
  quantToX,
  xToNearestQuant,
  clientToSvg,
  MeasurePosition,
} from '@/engines/layout/coordinateUtils';

describe('coordinateUtils', () => {
  describe('quantToX', () => {
    const quantsPerMeasure = 96; // 4/4 time

    it('returns exact match from map when quant exists', () => {
      const map = new Map<number, number>([
        [0, 100],
        [24, 150],
        [48, 200],
      ]);
      const measurePositions: MeasurePosition[] = [{ x: 100, width: 200 }];

      expect(quantToX(0, map, measurePositions, quantsPerMeasure)).toBe(100);
      expect(quantToX(24, map, measurePositions, quantsPerMeasure)).toBe(150);
      expect(quantToX(48, map, measurePositions, quantsPerMeasure)).toBe(200);
    });

    it('interpolates correctly for quants between notes', () => {
      const map = new Map<number, number>(); // Empty map forces interpolation
      const measurePositions: MeasurePosition[] = [{ x: 100, width: 200 }];

      // Quarter note at beat 2 (quant 24) should be 25% through measure
      const result = quantToX(24, map, measurePositions, quantsPerMeasure);
      expect(result).toBeCloseTo(100 + 0.25 * 200); // 150
    });

    it('interpolates across multiple measures', () => {
      const map = new Map<number, number>();
      const measurePositions: MeasurePosition[] = [
        { x: 100, width: 200 },
        { x: 300, width: 200 },
      ];

      // Beat 1 of measure 2 (quant 96) should be at x=300
      const result = quantToX(96, map, measurePositions, quantsPerMeasure);
      expect(result).toBe(300);

      // Beat 2 of measure 2 (quant 120) should be 25% through measure 2
      const result2 = quantToX(120, map, measurePositions, quantsPerMeasure);
      expect(result2).toBeCloseTo(300 + 0.25 * 200); // 350
    });

    it('returns null for out-of-bounds quants', () => {
      const map = new Map<number, number>();
      const measurePositions: MeasurePosition[] = [{ x: 100, width: 200 }];

      // Quant 192 would be in measure 2, which doesn't exist
      expect(quantToX(192, map, measurePositions, quantsPerMeasure)).toBeNull();
    });

    it('returns null when measurePositions is empty', () => {
      const map = new Map<number, number>();
      const measurePositions: MeasurePosition[] = [];

      expect(quantToX(0, map, measurePositions, quantsPerMeasure)).toBeNull();
    });

    it('prefers exact match over interpolation', () => {
      // If exact match exists, it should be used even if interpolation would give different result
      const map = new Map<number, number>([[24, 175]]); // Exact position at quant 24
      const measurePositions: MeasurePosition[] = [{ x: 100, width: 200 }];

      // Interpolation would give 150, but exact match is 175
      expect(quantToX(24, map, measurePositions, quantsPerMeasure)).toBe(175);
    });
  });

  describe('xToNearestQuant', () => {
    it('snaps to nearest quant within distance', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      const quantToXFn = (q: number): number => 100 + q * 2; // Linear mapping

      // X=145 is closest to quant 24 (x=148)
      expect(xToNearestQuant(145, validQuants, quantToXFn, 24)).toBe(24);

      // X=200 is closest to quant 48 (x=196)
      expect(xToNearestQuant(200, validQuants, quantToXFn, 24)).toBe(48);
    });

    it('returns null when outside snap distance', () => {
      const validQuants = new Set([0, 96]); // Beat 1 and beat 5 only
      const quantToXFn = (q: number): number => 100 + q * 2;

      // X=150 is 50px from quant 0 (x=100) and 92px from quant 96 (x=292)
      // With snapDistance=24, neither is close enough
      expect(xToNearestQuant(150, validQuants, quantToXFn, 24)).toBeNull();
    });

    it('returns null for empty validQuants', () => {
      const validQuants = new Set<number>();
      const quantToXFn = (q: number): number => 100 + q * 2;

      expect(xToNearestQuant(100, validQuants, quantToXFn, 24)).toBeNull();
    });

    it('uses default snap distance of 24', () => {
      const validQuants = new Set([0]);
      const quantToXFn = (q: number): number => 100 + q * 2;

      // X=124 is exactly 24px from quant 0 (x=100), should snap
      expect(xToNearestQuant(124, validQuants, quantToXFn)).toBe(0);

      // X=125 is 25px away, should not snap with default distance
      expect(xToNearestQuant(125, validQuants, quantToXFn)).toBeNull();
    });

    it('handles quantToXFn returning null', () => {
      const validQuants = new Set([0, 24, 48]);
      const quantToXFn = (q: number): number | null => (q === 24 ? null : 100 + q * 2);

      // Should skip quant 24 since it returns null
      // X=145 should snap to quant 48 (x=196) instead of quant 24
      expect(xToNearestQuant(145, validQuants, quantToXFn, 100)).toBe(0); // x=100 is closer
    });
  });

  describe('clientToSvg', () => {
    it('transforms coordinates using fallback when CTM is null', () => {
      // Create a mock SVG element where getScreenCTM returns null
      const mockElement = {
        ownerSVGElement: {
          getScreenCTM: () => null,
        },
        parentElement: {
          getScreenCTM: () => null,
        },
        getBoundingClientRect: () => ({ left: 50, top: 100 }),
      } as unknown as SVGElement;

      const result = clientToSvg(150, 200, mockElement);

      // Fallback: clientX - rect.left, clientY - rect.top
      expect(result.x).toBe(100); // 150 - 50
      expect(result.y).toBe(100); // 200 - 100
    });

    it('transforms coordinates using fallback when svg is null', () => {
      // Create a mock SVG element where ownerSVGElement is null and element itself has null CTM
      const mockElement = {
        ownerSVGElement: null,
        parentElement: null,
        getScreenCTM: () => null, // Element treated as SVGSVGElement needs this
        getBoundingClientRect: () => ({ left: 25, top: 50 }),
      } as unknown as SVGElement;

      const result = clientToSvg(125, 150, mockElement);

      // Fallback: clientX - rect.left, clientY - rect.top
      expect(result.x).toBe(100); // 125 - 25
      expect(result.y).toBe(100); // 150 - 50
    });

    // Note: Full CTM testing requires a real DOM/SVG context
    // These tests would typically be integration tests with jsdom or a real browser
  });
});
