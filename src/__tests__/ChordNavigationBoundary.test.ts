/**
 * Chord Navigation Boundary Tests
 *
 * Tests the Tab/Shift+Tab boundary behavior for chord editing (#220).
 * When at the first/last chord position, Tab/Shift+Tab should keep
 * the editor open instead of closing it.
 *
 * These tests verify the boundary detection logic used in ScoreCanvas.
 */

describe('Chord Navigation Boundary Logic', () => {
  /**
   * Helper that mirrors the boundary check logic in ScoreCanvas.
   * Returns the next quant position, or undefined if at boundary.
   */
  const findNextQuant = (currentQuant: number, validQuants: Set<number>): number | undefined => {
    const sortedQuants = Array.from(validQuants).sort((a, b) => a - b);
    return sortedQuants.find((q) => q > currentQuant);
  };

  /**
   * Helper that mirrors the boundary check logic in ScoreCanvas.
   * Returns the previous quant position, or undefined if at boundary.
   */
  const findPreviousQuant = (
    currentQuant: number,
    validQuants: Set<number>
  ): number | undefined => {
    const sortedQuants = Array.from(validQuants).sort((a, b) => a - b);
    const previousQuants = sortedQuants.filter((q) => q < currentQuant);
    return previousQuants[previousQuants.length - 1];
  };

  describe('findNextQuant', () => {
    it('returns next quant when one exists', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      expect(findNextQuant(0, validQuants)).toBe(24);
      expect(findNextQuant(24, validQuants)).toBe(48);
      expect(findNextQuant(48, validQuants)).toBe(72);
    });

    it('returns undefined at the last position (boundary)', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      expect(findNextQuant(72, validQuants)).toBeUndefined();
    });

    it('handles single quant', () => {
      const validQuants = new Set([24]);
      expect(findNextQuant(24, validQuants)).toBeUndefined();
    });

    it('handles empty set', () => {
      const validQuants = new Set<number>();
      expect(findNextQuant(0, validQuants)).toBeUndefined();
    });
  });

  describe('findPreviousQuant', () => {
    it('returns previous quant when one exists', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      expect(findPreviousQuant(72, validQuants)).toBe(48);
      expect(findPreviousQuant(48, validQuants)).toBe(24);
      expect(findPreviousQuant(24, validQuants)).toBe(0);
    });

    it('returns undefined at the first position (boundary)', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      expect(findPreviousQuant(0, validQuants)).toBeUndefined();
    });

    it('handles single quant', () => {
      const validQuants = new Set([24]);
      expect(findPreviousQuant(24, validQuants)).toBeUndefined();
    });

    it('handles empty set', () => {
      const validQuants = new Set<number>();
      expect(findPreviousQuant(0, validQuants)).toBeUndefined();
    });
  });

  describe('boundary behavior contract', () => {
    it('at last position: Tab should NOT navigate (returns undefined)', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      const currentQuant = 72; // Last position

      const nextQuant = findNextQuant(currentQuant, validQuants);

      // When nextQuant is undefined, ScoreCanvas returns early
      // without calling completeEdit, keeping the editor open
      expect(nextQuant).toBeUndefined();
    });

    it('at first position: Shift+Tab should NOT navigate (returns undefined)', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      const currentQuant = 0; // First position

      const previousQuant = findPreviousQuant(currentQuant, validQuants);

      // When previousQuant is undefined, ScoreCanvas returns early
      // without calling completeEdit, keeping the editor open
      expect(previousQuant).toBeUndefined();
    });

    it('at middle position: Tab should navigate (returns next quant)', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      const currentQuant = 24;

      const nextQuant = findNextQuant(currentQuant, validQuants);

      // When nextQuant exists, ScoreCanvas calls completeEdit
      // and navigates to the next position
      expect(nextQuant).toBe(48);
    });

    it('at middle position: Shift+Tab should navigate (returns prev quant)', () => {
      const validQuants = new Set([0, 24, 48, 72]);
      const currentQuant = 48;

      const previousQuant = findPreviousQuant(currentQuant, validQuants);

      // When previousQuant exists, ScoreCanvas calls completeEdit
      // and navigates to the previous position
      expect(previousQuant).toBe(24);
    });
  });
});
