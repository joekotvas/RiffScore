/**
 * Measure index conversion utilities.
 *
 * RiffScore uses 0-based indexing internally for all measure references.
 * This matches JavaScript's array indexing convention and simplifies code.
 *
 * - Internal indices: 0-based (array index) - used throughout the codebase
 * - Display numbers: 1-based (human readable) - used in UI, exports, messages
 *
 * @example
 * // Internal: measures[0] is the first measure
 * // Display: "Measure 1" shown to users
 */

/**
 * Convert internal measure index to display number.
 * Use this when showing measure numbers to users.
 *
 * @param index - 0-based internal index (array index)
 * @returns 1-based display number (human readable)
 *
 * @example
 * toDisplayMeasureNumber(0) // => 1 (first measure)
 * toDisplayMeasureNumber(3) // => 4 (fourth measure)
 */
export const toDisplayMeasureNumber = (index: number): number => index + 1;

/**
 * Convert display measure number to internal index.
 * Use this when accepting measure numbers from user input.
 *
 * @param displayNumber - 1-based display number (human readable)
 * @returns 0-based internal index (array index)
 *
 * @example
 * toInternalMeasureIndex(1) // => 0 (first measure)
 * toInternalMeasureIndex(4) // => 3 (fourth measure)
 */
export const toInternalMeasureIndex = (displayNumber: number): number => displayNumber - 1;

/**
 * Type guard for valid measure index.
 * Validates that an index is within bounds and is a valid integer.
 *
 * @param index - Potential measure index to validate
 * @param measureCount - Total number of measures in the score
 * @returns True if index is valid (0-based, in range)
 *
 * @example
 * isValidMeasureIndex(0, 4)  // => true (first of 4 measures)
 * isValidMeasureIndex(3, 4)  // => true (last of 4 measures)
 * isValidMeasureIndex(4, 4)  // => false (out of bounds)
 * isValidMeasureIndex(-1, 4) // => false (negative)
 * isValidMeasureIndex(1.5, 4) // => false (not an integer)
 */
export const isValidMeasureIndex = (index: number, measureCount: number): boolean =>
  Number.isInteger(index) && index >= 0 && index < measureCount;

/**
 * Clamp a measure index to valid bounds.
 * Returns 0 if index is negative, measureCount-1 if index exceeds bounds.
 *
 * @param index - Measure index to clamp
 * @param measureCount - Total number of measures
 * @returns Clamped index within valid range
 *
 * @example
 * clampMeasureIndex(-1, 4) // => 0
 * clampMeasureIndex(5, 4)  // => 3
 * clampMeasureIndex(2, 4)  // => 2
 */
export const clampMeasureIndex = (index: number, measureCount: number): number =>
  Math.max(0, Math.min(index, measureCount - 1));
