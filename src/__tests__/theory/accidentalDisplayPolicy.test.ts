/**
 * Accidental display-policy field (#236).
 *
 * `note.accidentalDisplay` ('auto' | 'show' | 'hide' | 'courtesy') is orthogonal
 * to the sounding pitch (contract C1): it changes only WHETHER/HOW the accidental
 * glyph is drawn, never the pitch. The single shared resolver honours it, and
 * both exporters reflect it (MusicXML parentheses / forced / suppressed glyph;
 * ABC best-effort forced/suppressed token, no standard courtesy parens).
 */

import { resolveMeasureAccidentals } from '@/utils/accidentalContext';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { generateABC } from '@/exporters/abcExporter';
import { ACCIDENTALS } from '@/constants/SMuFL';
import { Score, AccidentalDisplay } from '@/types';

const ev = (id: string, pitch: string, display?: AccidentalDisplay) => ({
  id,
  duration: 'quarter' as const,
  dotted: false,
  notes: [{ id: `${id}n`, pitch, ...(display ? { accidentalDisplay: display } : {}) }],
});

describe('#236 resolveMeasureAccidentals honours the display policy', () => {
  it("'auto' (default) is the standard behaviour", () => {
    expect(resolveMeasureAccidentals([ev('e1', 'F#4')], 'C').e1n).toEqual({
      glyph: ACCIDENTALS.sharp,
      parenthesized: false,
    });
    expect(resolveMeasureAccidentals([ev('e1', 'C4')], 'C').e1n).toBeNull();
  });

  it("'show' forces a glyph on an otherwise-bare diatonic note", () => {
    expect(resolveMeasureAccidentals([ev('e1', 'C4', 'show')], 'C').e1n).toEqual({
      glyph: ACCIDENTALS.natural,
      parenthesized: false,
    });
  });

  it("'courtesy' forces a PARENTHESIZED cautionary glyph", () => {
    expect(resolveMeasureAccidentals([ev('e1', 'C4', 'courtesy')], 'C').e1n).toEqual({
      glyph: ACCIDENTALS.natural,
      parenthesized: true,
    });
  });

  it("'hide' suppresses a glyph the rules would otherwise show", () => {
    expect(resolveMeasureAccidentals([ev('e1', 'F#4', 'hide')], 'C').e1n).toBeNull();
  });

  it("'hide' still updates measure memory (the pitch still sounds)", () => {
    // F#4 is hidden but still sounds; a following F4 must show a cancelling ♮.
    const r = resolveMeasureAccidentals([ev('e1', 'F#4', 'hide'), ev('e2', 'F4')], 'C');
    expect(r.e1n).toBeNull();
    expect(r.e2n).toEqual({ glyph: ACCIDENTALS.natural, parenthesized: false });
  });
});

/** A single-note score in a given key, with an optional display policy. */
const scoreWithNote = (pitch: string, display: AccidentalDisplay, keySignature = 'C'): Score => ({
  title: 'Test',
  timeSignature: '4/4',
  keySignature,
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature,
      measures: [{ id: 'm1', events: [ev('e1', pitch, display)] }],
    },
  ],
});

describe('#236 MusicXML reflects the display policy', () => {
  it("'courtesy' emits <accidental parentheses=\"yes\">", () => {
    const xml = generateMusicXML(scoreWithNote('C4', 'courtesy'));
    expect(xml).toContain('<accidental parentheses="yes">natural</accidental>');
  });

  it("'show' forces an <accidental> on a diatonic note (and no spurious <alter>)", () => {
    const xml = generateMusicXML(scoreWithNote('C4', 'show'));
    expect(xml).toContain('<accidental>natural</accidental>');
    expect(xml).not.toContain('<alter>'); // C natural has alter 0
  });

  it("'hide' suppresses the <accidental> but keeps the sounding <alter>", () => {
    const xml = generateMusicXML(scoreWithNote('C#4', 'hide'));
    expect(xml).not.toContain('<accidental>');
    expect(xml).toContain('<alter>1</alter>'); // pitch still sounds C#
  });
});

describe('#236 ABC reflects the display policy (best-effort)', () => {
  it("'show' forces the accidental token on a diatonic note", () => {
    const abc = generateABC(scoreWithNote('C4', 'show'), 120);
    // The natural token '=' precedes the note letter in the tune body.
    expect(abc).toMatch(/=C/);
  });

  it("'hide' falls back to showing — ABC can't hide without losing the pitch", () => {
    // In ABC the accidental token carries the pitch (no structural <alter>), so a
    // suppressed C#4 would read as C-natural. 'hide' therefore degrades to 'auto'
    // (best-effort): the policy is not honored, but the sounding pitch is kept.
    const abc = generateABC(scoreWithNote('C#4', 'hide'), 120);
    expect(abc).toMatch(/\^C/);
  });
});
