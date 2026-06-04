/**
 * Independent SMuFL codepoint registry (Verify-infra scaffolding, Phase 1).
 *
 * Why this exists, and why it does NOT import src/constants/SMuFL.ts
 * ------------------------------------------------------------------
 * SMuFL (Standard Music Font Layout) assigns a canonical Unicode codepoint to every
 * musical glyph. The whole point of a glyph-identity oracle is to catch the case where
 * the *production* constant is wrong (e.g. a quarter note rendered with the half-note
 * head, E0A3 vs E0A4). If this registry imported `NOTEHEADS` from the production file,
 * a wrong production constant would silently flow into the "expected" value and the
 * oracle would rubber-stamp the bug.
 *
 * Therefore the values below are LITERAL hex strings transcribed by hand from the
 * published SMuFL specification (https://w3c.github.io/smufl/latest/tables/), and are
 * the single independent source of truth for the assertGlyph helper.
 *
 * Each entry is the canonical glyph name -> lowercase hex codepoint (no 'U+' prefix),
 * matching the format produced by geometry.firstCodepointHex().
 */

export const SMUFL_CODEPOINTS = {
  // ---- Noteheads (SMuFL Notehead range) ----
  noteheadDoubleWhole: 'e0a0',
  noteheadWhole: 'e0a2',
  noteheadHalf: 'e0a3',
  noteheadBlack: 'e0a4', // quarter note and shorter

  // ---- Accidentals (Standard accidentals range) ----
  accidentalFlat: 'e260',
  accidentalNatural: 'e261',
  accidentalSharp: 'e262',
  accidentalDoubleSharp: 'e263',
  accidentalDoubleFlat: 'e264',

  // ---- Clefs ----
  gClef: 'e050', // treble
  cClef: 'e05c', // alto / tenor
  fClef: 'e062', // bass

  // ---- Rests (Rests range) ----
  restWhole: 'e4e3',
  restHalf: 'e4e4',
  restQuarter: 'e4e5',
  rest8th: 'e4e6',
  rest16th: 'e4e7',
  rest32nd: 'e4e8',
  rest64th: 'e4e9',

  // ---- Augmentation dot ----
  augmentationDot: 'e1e7',

  // ---- Flags ----
  flag8thUp: 'e240',
  flag8thDown: 'e241',
  flag16thUp: 'e242',
  flag16thDown: 'e243',
} as const;

export type SmuflGlyphName = keyof typeof SMUFL_CODEPOINTS;

/**
 * The canonical lowercase-hex codepoint for a named SMuFL glyph.
 * Throws if the name is unknown so typos surface immediately.
 */
export function codepointFor(name: SmuflGlyphName): string {
  const cp = SMUFL_CODEPOINTS[name];
  if (cp === undefined) {
    throw new Error(`Unknown SMuFL glyph name: ${String(name)}`);
  }
  return cp;
}

/**
 * The literal single-character glyph string for a named SMuFL glyph.
 * Useful for rendering test fixtures without depending on production constants.
 */
export function glyphChar(name: SmuflGlyphName): string {
  return String.fromCodePoint(parseInt(codepointFor(name), 16));
}
