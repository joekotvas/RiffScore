/**
 * Clef-glyph placement parity (Finding 1D, render side).
 *
 * The drawn clef glyph must sit on the SAME staff line the engraver positions
 * notes against; otherwise "the staff contradicts itself" (the critical alto/
 * tenor finding, and the separate tenor-glyph-on-wrong-line finding).
 *
 * First-principles assertion: the glyph's text `y` must equal
 *   baseY + getOffsetForPitch(referencePitch, clef)
 * i.e. the glyph baseline lands exactly where a note of the clef's reference
 * pitch would be drawn. We compute that from the (independently tested) note
 * geometry, NOT from the glyph code, so the two are cross-checked against each
 * other rather than against a shared magic number.
 */

import React from 'react';
import { render } from '@testing-library/react';
import ScoreHeader from '@/components/Canvas/ScoreHeader';
import ClefIcon from '@/components/Assets/ClefIcon';
import { ThemeProvider } from '@/context/ThemeContext';
import { CONFIG } from '@/config';
import { getOffsetForPitch } from '@/engines/layout/positioning';
import { CLEFS } from '@/constants/SMuFL';

const REFERENCE_PITCH: Record<string, string> = {
  treble: 'G4',
  bass: 'F3',
  alto: 'C4',
  tenor: 'C4',
};

const EXPECTED_GLYPH: Record<string, string> = {
  treble: CLEFS.gClef,
  bass: CLEFS.fClef,
  alto: CLEFS.cClef,
  tenor: CLEFS.cClef,
};

const renderHeader = (clef: string, baseY: number) =>
  render(
    <ThemeProvider>
      <svg>
        <ScoreHeader
          clef={clef}
          keySignature="C"
          timeSignature="4/4"
          baseY={baseY}
          onClefClick={() => {}}
          onKeySigClick={() => {}}
          onTimeSigClick={() => {}}
        />
      </svg>
    </ThemeProvider>
  );

/**
 * Find the clef glyph <text> by matching the expected glyph character.
 * SVG <text> nodes carry no ARIA role and no queryable accessible text, so
 * Testing Library's role/text queries cannot reach them; a scoped DOM query is
 * the only option for asserting their geometry.
 */
const findClefText = (container: HTMLElement, glyph: string): SVGTextElement | undefined =>
  // eslint-disable-next-line testing-library/no-node-access
  Array.from(container.querySelectorAll('text')).find(
    (t) => t.textContent === glyph
  ) as SVGTextElement | undefined;

describe('ScoreHeader clef glyph baseline = note position of the reference pitch', () => {
  const clefs = ['treble', 'bass', 'alto', 'tenor'] as const;
  const baseY = 200;

  test.each(clefs)('%s: glyph y equals baseY + offset(referencePitch)', (clef) => {
    const { container } = renderHeader(clef, baseY);
    const text = findClefText(container, EXPECTED_GLYPH[clef]);
    expect(text).toBeDefined();

    const expectedY = baseY + getOffsetForPitch(REFERENCE_PITCH[clef], clef);
    expect(Number(text!.getAttribute('y'))).toBe(expectedY);
  });

  test('tenor glyph is on line 4, distinctly LOWER on the page than the bug position', () => {
    // The previous bug drew the tenor C-clef at baseY + lineHeight*3 (line 2),
    // contradicting the notes. Correct placement is line 4 = baseY + lineHeight.
    const { container } = renderHeader('tenor', baseY);
    const text = findClefText(container, CLEFS.cClef)!;
    expect(Number(text.getAttribute('y'))).toBe(baseY + CONFIG.lineHeight); // line 4
    expect(Number(text.getAttribute('y'))).not.toBe(baseY + CONFIG.lineHeight * 3); // old (wrong)
  });

  test('alto and tenor C-clef glyphs are NOT at the same height', () => {
    const altoY = Number(
      findClefText(renderHeader('alto', baseY).container, CLEFS.cClef)!.getAttribute('y')
    );
    const tenorY = Number(
      findClefText(renderHeader('tenor', baseY).container, CLEFS.cClef)!.getAttribute('y')
    );
    // Alto ref line 3, tenor ref line 4 -> one line gap apart (12px), tenor higher offset.
    expect(altoY - tenorY).toBe(CONFIG.lineHeight);
  });
});

describe('ClefIcon glyph baseline derives from the same reference line', () => {
  const ICON_TOP_LINE_Y = 10;
  const ICON_LINE_GAP = 10;
  const REFERENCE_LINE: Record<string, number> = { treble: 2, bass: 4, alto: 3, tenor: 4 };

  const iconClefText = (clef: string): SVGTextElement => {
    const { container } = render(<ClefIcon clef={clef} />);
    return findClefText(container, EXPECTED_GLYPH[clef])!;
  };

  test.each(['treble', 'bass', 'alto', 'tenor'])('%s icon glyph sits on its reference line', (clef) => {
    const expectedY = ICON_TOP_LINE_Y + (5 - REFERENCE_LINE[clef]) * ICON_LINE_GAP;
    expect(Number(iconClefText(clef).getAttribute('y'))).toBe(expectedY);
  });

  test('tenor icon glyph (line 4) is higher on screen than alto icon glyph (line 3)', () => {
    const altoY = Number(iconClefText('alto').getAttribute('y'));
    const tenorY = Number(iconClefText('tenor').getAttribute('y'));
    // Line 4 is physically above line 3, so its y is smaller in screen coords.
    expect(tenorY).toBeLessThan(altoY);
    expect(altoY - tenorY).toBe(ICON_LINE_GAP);
  });
});
