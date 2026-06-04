/**
 * Self-test for the SMuFL registry (smuflRegistry.ts) and assertGlyph (assertGlyph.ts).
 *
 * Two layers of proof:
 *
 *  1. The registry is an INDEPENDENT oracle. We cross-check the hand-transcribed
 *     codepoints against the production constants in src/constants/SMuFL.ts. If a
 *     production constant ever drifts from the SMuFL spec value here, this test fails —
 *     which is exactly the bug class (E0A3 half vs E0A4 black) the oracle must catch.
 *     Because the registry does not IMPORT the production constants, agreement here is
 *     meaningful rather than circular.
 *
 *  2. assertGlyph works end-to-end against REAL rendered output. We render the actual
 *     NoteHead / Accidental / Rest components to static SVG markup and assert the
 *     correct SMuFL codepoint appears (and a wrong one does not). This proves the helper
 *     reads real renderer output, not just hand-written fixtures.
 */

/*
 * Note: this file uses react-dom/server's renderToStaticMarkup to produce SVG STRINGS
 * (not React Testing Library's render() into a DOM). The
 * testing-library/render-result-naming-convention rule assumes an RTL render() result
 * that must be named `view`/`utils`; that premise does not apply here, so it is disabled
 * for this file. All other testing-library rules remain in force.
 */
/* eslint-disable testing-library/render-result-naming-convention */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NoteHead, Accidental } from '@/components/Canvas/Note';
import { Rest } from '@/components/Canvas/Rest';
import { ThemeProvider } from '@/context/ThemeContext';
import { NOTEHEADS, ACCIDENTALS, RESTS, DOTS } from '@/constants/SMuFL';
import { SMUFL_CODEPOINTS, codepointFor, glyphChar } from '../helpers/glyphs/smuflRegistry';
import { assertGlyph, assertNotGlyph, matchGlyph } from '../helpers/glyphs/assertGlyph';

/** Render a React node to an SVG string the helpers can parse. */
function svg(node: React.ReactElement): string {
  return renderToStaticMarkup(<ThemeProvider>{node}</ThemeProvider>);
}

describe('SMuFL registry self-test', () => {
  it('codepointFor returns the literal hex for a known name and throws for unknown', () => {
    expect(codepointFor('noteheadBlack')).toBe('e0a4');
    expect(codepointFor('noteheadHalf')).toBe('e0a3');
    // @ts-expect-error intentionally passing an unknown name
    expect(() => codepointFor('noSuchGlyph')).toThrow();
  });

  it('glyphChar reconstructs the single-character glyph from the codepoint', () => {
    expect(glyphChar('noteheadBlack')).toBe('');
    expect(glyphChar('accidentalSharp')).toBe('');
    expect(glyphChar('accidentalSharp').codePointAt(0)!.toString(16)).toBe('e262');
  });

  // The independent cross-check: spec registry vs production constants.
  it('matches production NOTEHEADS constants (cross-check, not import)', () => {
    expect(NOTEHEADS.whole.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.noteheadWhole);
    expect(NOTEHEADS.half.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.noteheadHalf);
    expect(NOTEHEADS.black.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.noteheadBlack);
  });

  it('matches production ACCIDENTALS constants', () => {
    expect(ACCIDENTALS.flat.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.accidentalFlat);
    expect(ACCIDENTALS.natural.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.accidentalNatural);
    expect(ACCIDENTALS.sharp.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.accidentalSharp);
  });

  it('matches production RESTS and DOTS constants', () => {
    expect(RESTS.quarter.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.restQuarter);
    expect(RESTS.eighth.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.rest8th);
    expect(DOTS.augmentationDot.codePointAt(0)!.toString(16)).toBe(SMUFL_CODEPOINTS.augmentationDot);
  });

  // The half and black noteheads must NOT collide — the headline confusable pair.
  it('half and black noteheads are distinct codepoints', () => {
    expect(SMUFL_CODEPOINTS.noteheadHalf).not.toBe(SMUFL_CODEPOINTS.noteheadBlack);
  });
});

describe('assertGlyph self-test (against REAL rendered components)', () => {
  it('a quarter note renders the BLACK notehead (E0A4), not the half (E0A3)', () => {
    const markup = svg(<NoteHead x={0} y={0} duration="quarter" color="#000" />);
    assertGlyph(markup, 'noteheadBlack', 'text.NoteHead');
    assertNotGlyph(markup, 'noteheadHalf', 'text.NoteHead');
  });

  it('a half note renders the HALF notehead (E0A3), not the black (E0A4)', () => {
    const markup = svg(<NoteHead x={0} y={0} duration="half" color="#000" />);
    assertGlyph(markup, 'noteheadHalf', 'text.NoteHead');
    assertNotGlyph(markup, 'noteheadBlack', 'text.NoteHead');
  });

  it('a whole note renders the WHOLE notehead (E0A2)', () => {
    const markup = svg(<NoteHead x={0} y={0} duration="whole" color="#000" />);
    assertGlyph(markup, 'noteheadWhole', 'text.NoteHead');
  });

  it('a sharp accidental renders the sharp glyph (E262)', () => {
    const markup = svg(<Accidental x={0} y={0} symbol={ACCIDENTALS.sharp} color="#000" />);
    assertGlyph(markup, 'accidentalSharp');
    assertNotGlyph(markup, 'accidentalFlat');
  });

  it('a quarter rest renders the quarter-rest glyph (E4E5)', () => {
    const markup = svg(<Rest duration="quarter" />);
    assertGlyph(markup, 'restQuarter');
  });

  it('matchGlyph reports a clear failure message and the codepoints it actually saw', () => {
    const markup = svg(<NoteHead x={0} y={0} duration="quarter" color="#000" />);
    const result = matchGlyph(markup, 'noteheadHalf', 'text.NoteHead');
    expect(result.pass).toBe(false);
    expect(result.expectedCodepoint).toBe('e0a3');
    expect(result.actualCodepoints).toContain('e0a4');
    expect(result.message).toContain('E0A3');
  });
});
