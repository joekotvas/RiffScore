/**
 * ChordService - Chord parsing, normalization, and notation conversion.
 *
 * This is a facade module that re-exports from focused sub-modules in src/services/chord/.
 * For new code, prefer importing directly from the sub-modules.
 *
 * @tested src/__tests__/services/ChordService.test.ts
 * @see src/services/chord/index.ts for the modular implementation
 */

// Re-export everything from the modular chord service
export * from './chord';
