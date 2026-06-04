/**
 * assertGlyph — SMuFL glyph-identity assertion helper (Verify-infra scaffolding).
 *
 * Pairs the independent registry (smuflRegistry.ts) with the SVG extractor
 * (../geometry.ts) to answer one question precisely:
 *   "Does this rendered SVG draw glyph <name> with the canonical SMuFL codepoint?"
 *
 * A screenshot cannot reliably distinguish E0A3 (half) from E0A4 (black) at score
 * size; a codepoint comparison can. The "expected" codepoint comes from the
 * hand-transcribed SMuFL spec registry, NOT from RiffScore's own constants, so a
 * wrong production constant is detectable rather than self-confirming.
 *
 * These are plain functions returning a structured result so they work in any test
 * runner; thin Jest wrappers throw on failure with an actionable message.
 */

import { glyphs, type SvgInput, type GlyphFact } from '../geometry';
import { codepointFor, type SmuflGlyphName } from './smuflRegistry';

export interface GlyphMatchResult {
  pass: boolean;
  expectedCodepoint: string;
  /** Codepoints actually present (after applying the optional selector filter). */
  actualCodepoints: string[];
  message: string;
}

/**
 * Check whether the SVG contains a <text> glyph whose first codepoint equals the
 * canonical SMuFL codepoint for `name`.
 *
 * @param input    SVG string or DOM node.
 * @param name     Canonical SMuFL glyph name (key of SMUFL_CODEPOINTS).
 * @param selector Optional CSS selector to scope the search (e.g. 'text.NoteHead').
 *                 When omitted, every <text> glyph in the SVG is considered.
 */
export function matchGlyph(
  input: SvgInput,
  name: SmuflGlyphName,
  selector?: string
): GlyphMatchResult {
  const expected = codepointFor(name);
  let candidates: GlyphFact[] = glyphs(input);

  if (selector) {
    const all = glyphs(input);
    // Re-filter by selector by matching the elements again; geometry.glyphs already
    // captured className, so support the common 'text.Class' selector form here and
    // fall back to className contains for robustness.
    const classMatch = /\.([\w-]+)$/.exec(selector);
    if (classMatch) {
      const cls = classMatch[1];
      candidates = all.filter((g) => (g.className ?? '').split(/\s+/).includes(cls));
    }
  }

  const actualCodepoints = candidates.map((g) => g.codepoint).filter((cp) => cp.length > 0);
  const pass = actualCodepoints.includes(expected);

  const scope = selector ? ` matching selector "${selector}"` : '';
  const message = pass
    ? `Found glyph "${name}" (U+${expected.toUpperCase()})${scope}.`
    : `Expected glyph "${name}" (U+${expected.toUpperCase()})${scope}, ` +
      `but found codepoints: [${actualCodepoints.map((c) => `U+${c.toUpperCase()}`).join(', ') || 'none'}].`;

  return { pass, expectedCodepoint: expected, actualCodepoints, message };
}

/**
 * Jest assertion: throws (with a clear message) unless the SVG draws the named glyph.
 */
export function assertGlyph(input: SvgInput, name: SmuflGlyphName, selector?: string): void {
  const result = matchGlyph(input, name, selector);
  if (!result.pass) {
    throw new Error(result.message);
  }
}

/**
 * Jest assertion: throws unless the SVG does NOT draw the named glyph. Useful for
 * negative checks such as "a quarter note must NOT use the half notehead".
 */
export function assertNotGlyph(input: SvgInput, name: SmuflGlyphName, selector?: string): void {
  const result = matchGlyph(input, name, selector);
  if (result.pass) {
    throw new Error(
      `Did not expect glyph "${name}" (U+${result.expectedCodepoint.toUpperCase()})` +
        `${selector ? ` matching selector "${selector}"` : ''}, but it was present.`
    );
  }
}
