/**
 * ABC Importer — first-principles tests of the supported ABC 2.1 subset.
 *
 * Each case asserts REAL ABC semantics on the produced score (pitch spelling, quant lengths,
 * measure-local accidental memory, tuplet ratios, chord anchors) rather than mirroring the
 * parser's internals. Unsupported constructs must still import the surrounding music and
 * surface exactly one deduplicated warning per category.
 */

import fc from 'fast-check';
import { parseABC } from '@/importers/abcImporter';
import type { Score, ScoreEvent } from '@/types';
import { NOTE_TYPES } from '@/constants';
import { isValidPitch, validateScore } from '@/utils/validation';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ok = (abc: string): Score => {
  const result = parseABC(abc);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.score;
};

const warningsOf = (abc: string): string[] => parseABC(abc).warnings;

const DUR: Record<string, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
  thirtysecond: '32',
  sixtyfourth: '64',
};

/** "C4q", "C4+E4+G4h", "zq", tie "-", forced accidental "!", tuplet "(3:2/3#0)". */
const fmt = (e: ScoreEvent): string => {
  const d = DUR[e.duration] + (e.dotted ? '.' : '');
  const t = e.tuplet
    ? `(${e.tuplet.ratio[0]}:${e.tuplet.ratio[1]}/${e.tuplet.groupSize}#${e.tuplet.position})`
    : '';
  const body = e.isRest
    ? 'z'
    : e.notes
        .map((n) => `${n.pitch}${n.tied ? '-' : ''}${n.accidentalDisplay === 'show' ? '!' : ''}`)
        .join('+');
  return `${body}${d}${t}`;
};

const bars = (score: Score, staff = 0): string[] =>
  score.staves[staff].measures.map((m) => m.events.map(fmt).join(' '));

/** A tune with a fixed 4/4, L:1/8, C major header unless overridden. */
const tune = (body: string, header = 'M:4/4\nL:1/8\nK:C'): string =>
  `X:1\nT:T\n${header}\n${body}\n`;

const body = (abc: string, header?: string): string[] => bars(ok(tune(abc, header)));

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe('ABC importer — header', () => {
  it('maps T:, C:, Z:Lyricist: and a copyright N: to score metadata', () => {
    const score = ok(
      'X:1\nT:My Tune\nT:Subtitle\nC:Trad.\nZ:Lyricist: Anon\nN:© 2024 Me\nK:C\nC4|'
    );
    expect(score.title).toBe('My Tune');
    expect(score.metadata).toEqual({
      title: 'My Tune',
      composer: 'Trad.',
      lyricist: 'Anon',
      copyright: '© 2024 Me',
    });
  });

  it('does not turn an ordinary N: note or a transcriber Z: into metadata', () => {
    const score = ok('X:1\nT:T\nZ:Jane Doe\nN:Also known as The Other One\nK:C\nC4|');
    expect(score.metadata).toEqual({ title: 'T' });
  });

  it('titles an untitled tune "Untitled"', () => {
    const score = ok('X:1\nK:C\nC4|');
    expect(score.title).toBe('Untitled');
    expect(score.metadata?.title).toBe('Untitled');
  });

  describe('meter', () => {
    it.each([
      ['C', '4/4'],
      ['C|', '2/2'],
      ['6/8', '6/8'],
      ['3/4', '3/4'],
      ['(2+3)/8', '5/8'],
      ['2+3/8', '5/8'],
    ])('M:%s → %s', (m, expected) => {
      expect(ok(`X:1\nM:${m}\nK:C\nC|`).timeSignature).toBe(expected);
    });

    it('defaults to 4/4 without M:, and for an unsupported meter with a warning', () => {
      expect(ok('X:1\nK:C\nC|').timeSignature).toBe('4/4');
      const r = parseABC('X:1\nM:none\nK:C\nC|');
      expect(r.ok && r.score.timeSignature).toBe('4/4');
      expect(r.warnings).toEqual([expect.stringMatching(/Unsupported meter "M:none"/)]);
      expect(warningsOf('X:1\nM:4/3\nK:C\nC|')).toEqual([
        expect.stringMatching(/Unsupported meter/),
      ]);
    });
  });

  describe('unit note length', () => {
    it('defaults to 1/8, or 1/16 when the meter is shorter than 3/4', () => {
      expect(body('C', 'M:4/4\nK:C')).toEqual(['C48']);
      expect(body('C', 'M:3/4\nK:C')).toEqual(['C48']);
      expect(body('C', 'M:2/4\nK:C')).toEqual(['C416']);
    });

    it('honours L: in the header and inline', () => {
      expect(body('C', 'M:4/4\nL:1/4\nK:C')).toEqual(['C4q']);
      expect(body('C [L:1/16] C')).toEqual(['C48 C416']);
    });

    it('warns on an unusable L: and keeps the default', () => {
      const r = parseABC('X:1\nM:4/4\nL:0\nK:C\nC|');
      expect(r.warnings).toEqual([expect.stringMatching(/unit note length "L:0"/)]);
      expect(r.ok && bars(r.score)).toEqual(['C48']);
    });
  });

  describe('tempo', () => {
    it.each([
      ['1/4=120', '4/4', 120],
      ['3/8=100', '6/8', 150],
      ['1/2=60', '2/2', 120],
      ['120', '4/4', 120],
      ['80', '6/8', 120],
      ['"Allegro" 1/4=132', '4/4', 132],
      ['1/4 3/8=40', '5/8', 100],
    ])('Q:%s in %s → %d quarter-notes per minute', (q, m, bpm) => {
      expect(ok(`X:1\nM:${m}\nQ:${q}\nK:C\nC|`).bpm).toBe(bpm);
    });

    it('ignores a label-only Q: silently', () => {
      const r = parseABC('X:1\nQ:"Allegro"\nK:C\nC|');
      expect(r.ok && r.score.bpm).toBe(120);
      expect(r.warnings).toEqual([]);
    });

    it('defaults to 120, clamps out-of-range tempos and warns on unparseable ones', () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(ok('X:1\nK:C\nC|').bpm).toBe(120);
      const fast = parseABC('X:1\nQ:1/4=400\nK:C\nC|');
      expect(fast.ok && fast.score.bpm).toBe(300);
      expect(fast.warnings).toEqual([expect.stringMatching(/clamped to 300/)]);
      const bad = parseABC('X:1\nQ:fast\nK:C\nC|');
      expect(bad.ok && bad.score.bpm).toBe(120);
      expect(bad.warnings).toEqual([expect.stringMatching(/Unrecognized tempo "Q:fast"/)]);
    });
  });

  describe('key', () => {
    it.each([
      ['G', 'G'],
      ['g', 'G'],
      ['Gm', 'Gm'],
      ['Gmin', 'Gm'],
      ['G minor', 'Gm'],
      ['Gmaj', 'G'],
      ['G major', 'G'],
      ['Bb', 'Bb'],
      ['F#m', 'F#m'],
      ['Ebm', 'Ebm'],
      ['none', 'C'],
      ['', 'C'],
      ['Dbm', 'C#m'],
      ['G#', 'Ab'],
    ])('K:%s → %s', (k, expected) => {
      expect(ok(`X:1\nK:${k}\nC|`).keySignature).toBe(expected);
    });

    it.each([
      ['Ador', 'Em', /A Dorian .* E minor/],
      ['A dorian', 'Em', /A Dorian/],
      ['Dmix', 'G', /D Mixolydian .* G Major/],
      ['Elyd', 'B', /E Lydian/],
      ['Ephr', 'Am', /E Phrygian/],
      ['Bloc', 'Am', /B Locrian/],
      ['Aaeo', 'Am', /A Aeolian/],
    ])('K:%s → %s with a same-signature warning', (k, expected, pattern) => {
      const r = parseABC(`X:1\nK:${k}\nC|`);
      expect(r.ok && r.score.keySignature).toBe(expected);
      expect(r.warnings).toEqual([expect.stringMatching(pattern)]);
    });

    it('resolves accidentals against the mode key signature', () => {
      // A Dorian = one sharp: F is F#, C is natural.
      expect(body('F C', 'M:4/4\nL:1/8\nK:Ador')).toEqual(['F#48 C48']);
    });

    it('treats K:HP as D major, unknown modes as major, and nonsense keys as C', () => {
      const hp = parseABC('X:1\nK:HP\nF|');
      expect(hp.ok && hp.score.keySignature).toBe('D');
      expect(hp.warnings).toEqual([expect.stringMatching(/K:HP/)]);
      const mode = parseABC('X:1\nK:Gfoo\nC|');
      expect(mode.ok && mode.score.keySignature).toBe('G');
      expect(mode.warnings).toEqual([expect.stringMatching(/Unknown mode "foo"/)]);
      const junk = parseABC('X:1\nK:?\nC|');
      expect(junk.ok && junk.score.keySignature).toBe('C');
      expect(junk.warnings).toEqual([expect.stringMatching(/Unrecognized key/)]);
    });

    it('takes the staff clef and octave from K:', () => {
      expect(ok('X:1\nK:G clef=bass\nC|').staves[0].clef).toBe('bass');
      expect(ok('X:1\nK:C alto\nC|').staves[0].clef).toBe('alto');
      expect(ok('X:1\nK:C clef=F4\nC|').staves[0].clef).toBe('bass');
      expect(body('A', 'K:G octave=-1')).toEqual(['A38']);
    });

    it.each([
      ['clef=bass', 'bass'],
      ['bass', 'bass'],
      ['alto', 'alto'],
      ['treble', 'treble'],
      ['tenor', 'tenor'],
      ['clef=treble octave=-1', 'treble'],
    ])('reads K:%s as a clef with no key signature', (k, clef) => {
      const r = parseABC(`X:1\nK:${k}\nB|`);
      expect(r.warnings).toEqual([]);
      expect(r.ok && r.score.keySignature).toBe('C');
      expect(r.ok && r.score.staves[0].clef).toBe(clef);
    });

    it('maps octave-transposing and unknown clefs to a plain clef with a warning', () => {
      const t8 = parseABC('X:1\nK:G treble-8\nC|');
      expect(t8.ok && t8.score.staves[0].clef).toBe('treble');
      expect(t8.warnings).toEqual([
        expect.stringMatching(/"treble-8" was imported as a plain treble/),
      ]);
      const perc = parseABC('X:1\nK:C clef=perc\nC|');
      expect(perc.ok && perc.score.staves[0].clef).toBe('treble');
      expect(perc.warnings).toEqual([expect.stringMatching(/Unsupported clef "perc"/)]);
    });

    it('ignores explicit key accidentals with a warning', () => {
      expect(warningsOf('X:1\nK:D exp ^f ^c\nC|')).toEqual([
        expect.stringMatching(/Explicit key-signature accidentals/),
      ]);
      expect(warningsOf('X:1\nK:C ^f\nC|')).toEqual([
        expect.stringMatching(/Explicit key-signature accidentals/),
      ]);
    });
  });
});

// ---------------------------------------------------------------------------
// Pitches and accidentals
// ---------------------------------------------------------------------------

describe('ABC importer — pitches', () => {
  it('reads case and octave marks as scientific octaves (C = middle C)', () => {
    expect(body("C, C c c' C,, c''")).toEqual(['C38 C48 C58 C68 C28 C78']);
  });

  it('applies the key signature to unmarked notes', () => {
    expect(body('F C B', 'M:4/4\nL:1/8\nK:G')).toEqual(['F#48 C48 B48']);
    expect(body('B E', 'M:4/4\nL:1/8\nK:Bb')).toEqual(['Bb48 Eb48']);
    expect(body('F', 'M:4/4\nL:1/8\nK:Em')).toEqual(['F#48']);
  });

  it('remembers an accidental for the rest of the bar, per octave, and resets at the bar line', () => {
    expect(body('^F F | F')).toEqual(['F#48 F#48', 'F48']);
    expect(body('^F f F')).toEqual(['F#48 F58 F#48']);
    expect(body('_B B c B')).toEqual(['Bb48 Bb48 C58 Bb48']);
  });

  it('cancels with a natural and re-marks after a later accidental', () => {
    expect(body('=F F | F', 'M:4/4\nL:1/8\nK:G')).toEqual(['F48 F48', 'F#48']);
    expect(body('^F =F F')).toEqual(['F#48 F48 F48']);
    expect(body('^F _F F')).toEqual(['F#48 Fb48 Fb48']);
  });

  it('carries a tied accidental over the bar line to the tied note only', () => {
    expect(body('^F4- | F2 F2', 'M:4/4\nL:1/4\nK:C')).toEqual(['F#4-w', 'F#4h F4h']);
    expect(body('=F4- | F2 F2', 'M:4/4\nL:1/4\nK:G')).toEqual(['F4-w', 'F4h F#4h']);
    expect(body('[^F^c]4- | [Fc]2 F2', 'M:4/4\nL:1/4\nK:C')).toEqual([
      'F#4-+C#5-w',
      'F#4+C#5h F4h',
    ]);
    // The carry expires with the first event of the bar, a rest included.
    expect(body('^F4- | z2 F2', 'M:4/4\nL:1/4\nK:C')).toEqual(['F#4w', 'zh F4h']);
  });

  it('spells double sharps and double flats', () => {
    expect(body('^^F __B ^^F')).toEqual(['F##48 Bbb48 F##4!8']);
  });

  it('keeps a written accidental visible when it merely restates what is in force', () => {
    expect(body('=F')).toEqual(['F4!8']);
    expect(body('^F ^F', 'M:4/4\nL:1/8\nK:G')).toEqual(['F#4!8 F#4!8']);
    expect(body('_B', 'M:4/4\nL:1/8\nK:F')).toEqual(['Bb4!8']);
    expect(body('^F ^F')).toEqual(['F#48 F#4!8']);
  });

  it('warns on an unknown accidental combination and reads the note plain', () => {
    const r = parseABC(tune('^=F'));
    expect(r.ok && bars(r.score)).toEqual(['F48']);
    expect(r.warnings).toEqual([expect.stringMatching(/Unrecognized accidental "\^="/)]);
  });
});

// ---------------------------------------------------------------------------
// Lengths, broken rhythm, rests
// ---------------------------------------------------------------------------

describe('ABC importer — lengths', () => {
  it('scales note lengths by the unit length', () => {
    expect(body('A A2 A3 A4 A/ A// A/4 A3/2 A6 A8 A3/4')).toEqual([
      'A48 A4q A4q. A4h A416 A432 A432 A48. A4h. A4w A416.',
    ]);
    expect(body('A A2 A/ A3', 'M:4/4\nL:1/4\nK:C')).toEqual(['A4q A4h A48 A4h.']);
  });

  it('splits lengths that need more than one note into tied notes', () => {
    expect(body('A5')).toEqual(['A4-h A48']);
    expect(body('A7')).toEqual(['A4-h. A48']);
    expect(body('A16')).toEqual(['A4-w A4w']);
    expect(body('z5')).toEqual(['zh z8']);
  });

  it('warns and rounds a length that is off the 64th-note grid', () => {
    const r = parseABC(tune('A1/3'));
    expect(r.warnings).toEqual([expect.stringMatching(/Note length 1\/3 .*rounded/)]);
    expect(r.ok && bars(r.score)).toEqual(['A432.']);
  });

  it('applies broken rhythm in both directions, including double dots', () => {
    expect(body('A>B')).toEqual(['A48. B416']);
    expect(body('A<B')).toEqual(['A416 B48.']);
    expect(body('A2>B2')).toEqual(['A4q. B48']);
    expect(body('A>>B')).toEqual(['A4-8. A432 B432']);
    expect(body('"G"A>"D"B')).toEqual(['A48. B416']);
  });

  it('ignores a broken-rhythm sign with a note missing on one side', () => {
    const r = parseABC(tune('>A B | C>'));
    expect(r.ok && bars(r.score)).toEqual(['A48 B48', 'C48']);
    expect(r.warnings).toEqual([expect.stringMatching(/broken-rhythm sign/)]);
  });

  it('reads visible and invisible rests', () => {
    expect(body('z z2 z/ x2 z4')).toEqual(['z8 zq z16 zq zh']);
  });

  it('reads a lone whole-note rest as a whole-bar rest (empty bar) in any meter', () => {
    const r = parseABC(tune('A B c | z4 | A B c |', 'M:3/4\nL:1/4\nK:C'));
    expect(r.warnings).toEqual([]);
    expect(r.ok && bars(r.score)).toEqual(['A4q B4q C5q', '', 'A4q B4q C5q']);
    expect(body('z8 | C8 |')).toEqual(['', 'C4w']);
    // …but not when it is dotted, accompanied, or carrying a chord symbol.
    expect(body('z4 C4 | z6 |', 'M:6/4\nL:1/4\nK:C')).toEqual(['zw C4w', 'zw.']);
    expect(body('"G"z4 |', 'M:3/4\nL:1/4\nK:C')).toEqual(['zw']);
  });

  it('expands multi-bar rests into empty bars', () => {
    const score = ok(tune('A2 | Z2 | B2 |'));
    expect(bars(score)).toEqual(['A4q', '', '', 'B4q']);
    expect(bars(ok(tune('A2 Z |')))).toEqual(['A4q', '']);
    expect(bars(ok(tune('Z |')))).toEqual(['']);
  });
});

// ---------------------------------------------------------------------------
// Chords, ties, tuplets
// ---------------------------------------------------------------------------

describe('ABC importer — chords, ties and tuplets', () => {
  it('reads bracketed chords with inner, outer and combined lengths', () => {
    expect(body('[CEG] [C2E2G2] [CEG]2 [CEG]/ [C E G] [^CEG]')).toEqual([
      'C4+E4+G48 C4+E4+G4q C4+E4+G4q C4+E4+G416 C4+E4+G48 C#4+E4+G48',
    ]);
    expect(body('[C2EG]2')).toEqual(['C4+E4+G4h']);
  });

  it('ties whole chords and single chord notes', () => {
    expect(body('[CEG]2-[CEG]2')).toEqual(['C4-+E4-+G4-q C4+E4+G4q']);
    expect(body('[C-EG] [CEG]')).toEqual(['C4-+E4+G48 C4+E4+G48']);
  });

  it('warns on an empty or unterminated chord bracket', () => {
    expect(warningsOf(tune('[] A'))).toEqual([expect.stringMatching(/empty chord/)]);
    const r = parseABC(tune('[CEG'));
    expect(r.ok && bars(r.score)).toEqual(['C4+E4+G48']);
    expect(r.warnings).toEqual([expect.stringMatching(/Unterminated chord bracket/)]);
  });

  it('ties adjacent same-pitch notes, including across a bar line', () => {
    expect(body('A2-A2')).toEqual(['A4-q A4q']);
    expect(body('A2- A2')).toEqual(['A4-q A4q']);
    expect(body('A4- | A4')).toEqual(['A4-h', 'A4h']);
  });

  it('drops a tie that has no same-pitch successor, with one warning', () => {
    const r = parseABC(tune('A-B A- z A'));
    expect(r.ok && bars(r.score)).toEqual(['A48 B48 A48 z8 A48']);
    expect(r.warnings).toEqual([expect.stringMatching(/Ties with no matching note/)]);
  });

  it('reads tuplets with default, explicit and full p:q:r ratios', () => {
    expect(body('(3ABc d')).toEqual(['A48(3:2/3#0) B48(3:2/3#1) C58(3:2/3#2) D58']);
    expect(body('(3 A B c')).toEqual(['A48(3:2/3#0) B48(3:2/3#1) C58(3:2/3#2)']);
    expect(body('(5:4:5ABcde')).toEqual([
      'A48(5:4/5#0) B48(5:4/5#1) C58(5:4/5#2) D58(5:4/5#3) E58(5:4/5#4)',
    ]);
    expect(body('(3:2:2A2B')).toEqual(['A4q(3:2/2#0) B48(3:2/2#1)']);
  });

  it('uses the compound-meter defaults for (2 and (5', () => {
    expect(body('(2AB', 'M:6/8\nL:1/8\nK:C')).toEqual(['A48(2:3/2#0) B48(2:3/2#1)']);
    expect(body('(5ABcde', 'M:6/8\nL:1/8\nK:C')[0]).toContain('(5:3/5#0)');
    expect(body('(5ABcde')[0]).toContain('(5:2/5#0)');
  });

  it('counts a chord as one tuplet member and lets a tuplet contain rests', () => {
    expect(body('(3[CEG]zA')).toEqual(['C4+E4+G48(3:2/3#0) z8(3:2/3#1) A48(3:2/3#2)']);
    const ids = new Set(
      ok(tune('(3[CEG]zA')).staves[0].measures[0].events.map((e) => e.tuplet?.id)
    );
    expect(ids.size).toBe(1);
    expect([...ids][0]).toEqual(expect.any(String));
  });

  it('imports the notes of a tuplet cut short by a bar line as plain notes, with a warning', () => {
    const r = parseABC(tune('(3AB | c'));
    expect(r.ok && bars(r.score)).toEqual(['A48 B48', 'C58']);
    expect(r.warnings).toEqual([expect.stringMatching(/reached a bar line .* without the tuplet/)]);
  });

  it('ignores nested and invalid tuplet markers with a warning', () => {
    const nested = parseABC(tune('(3A(3Bc'));
    expect(nested.ok && bars(nested.score)).toEqual(['A48(3:2/3#0) B48(3:2/3#1) C58(3:2/3#2)']);
    expect(nested.warnings).toEqual([expect.stringMatching(/Nested or overlapping tuplets/)]);
    const invalid = parseABC(tune('(1A'));
    expect(invalid.ok && bars(invalid.score)).toEqual(['A48']);
    expect(invalid.warnings).toEqual([expect.stringMatching(/Invalid tuplet "\(1"/)]);
  });
});

// ---------------------------------------------------------------------------
// Bars, repeats, chord symbols, inline fields
// ---------------------------------------------------------------------------

describe('ABC importer — bars and structure', () => {
  it('treats every bar-line form as a bar boundary', () => {
    expect(body('A2 | B2 || c2 |] ')).toEqual(['A4q', 'B4q', 'C5q']);
    expect(body('[| A2 | B2 |]')).toEqual(['A4q', 'B4q']);
  });

  it('never opens an empty bar from consecutive bar lines', () => {
    expect(body('| A2 |')).toEqual(['A4q']);
    expect(body('A2 | | B2')).toEqual(['A4q', 'B4q']);
    expect(body('|: A2 :|\n|: B2 :|')).toEqual(['A4q', 'B4q']);
    expect(body('A2 |\n')).toEqual(['A4q']);
  });

  it('imports repeated sections once and warns about repeats and endings', () => {
    const r = parseABC(tune('|: A2 |1 B2 :|2 c2 | [1 d2 :: e2 |'));
    expect(r.ok && bars(r.score)).toEqual(['A4q', 'B4q', 'C5q', 'D5q', 'E5q']);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Repeat signs are not supported.*\(3 occurrences, first at line 6\)/),
        expect.stringMatching(/Repeat endings .*\(3 occurrences, first at line 6\)/),
      ])
    );
  });

  it('anchors chord symbols to the next note, rest or chord', () => {
    const score = ok(tune('"G"A2 "D7"B2 | "Em"z2 "Cmaj7"[CEG]2 | A2 "Am7" | B2'));
    expect(score.chordTrack).toEqual([
      expect.objectContaining({ measure: 0, quant: 0, symbol: 'G' }),
      expect.objectContaining({ measure: 0, quant: 16, symbol: 'D7' }),
      expect.objectContaining({ measure: 1, quant: 0, symbol: 'Em' }),
      expect.objectContaining({ measure: 1, quant: 16, symbol: 'Cmaj7' }),
      expect.objectContaining({ measure: 3, quant: 0, symbol: 'Am7' }),
    ]);
  });

  it('anchors a chord inside a tuplet on its fractional quant', () => {
    const score = ok(tune('(3A"G"Bc'));
    expect(score.chordTrack?.[0]).toMatchObject({ measure: 0, symbol: 'G' });
    expect(score.chordTrack?.[0].quant).toBeCloseTo(16 / 3, 3);
  });

  it('warns about unrecognized chord symbols, annotations and trailing chords', () => {
    const r = parseABC(tune('"N.C."A2 "^slow"B2 "G"'));
    expect(r.ok && r.score.chordTrack).toEqual([]);
    expect(r.warnings).toHaveLength(3);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Unrecognized chord symbol "N\.C\."/),
        expect.stringMatching(/Text annotations were ignored/),
        expect.stringMatching(/chord symbol with no note after it/),
      ])
    );
  });

  it('keeps the first chord symbol when two land on the same beat', () => {
    const score = ok(tune('"G""G7"A2'));
    expect(score.chordTrack?.map((c) => c.symbol)).toEqual(['G']);
  });

  it('keeps the score key on a mid-tune K: but resolves later accidentals in the new key', () => {
    const r = parseABC(tune('F [K:D] F | F'));
    expect(r.ok && r.score.keySignature).toBe('C');
    expect(r.ok && bars(r.score)).toEqual(['F48 F#48', 'F#48']);
    expect(r.warnings).toEqual([
      expect.stringMatching(/Key changes inside the tune are not supported/),
    ]);
  });

  it('keeps the score meter on a mid-tune M: with a warning', () => {
    const r = parseABC(tune('A2 B2 c2 d2 | [M:3/4] A2 B2 c2 |'));
    expect(r.ok && r.score.timeSignature).toBe('4/4');
    expect(r.warnings).toEqual([
      expect.stringMatching(/Meter changes inside the tune are not supported/),
    ]);
  });

  it('accepts the exporter’s pickup-bar meter pair silently', () => {
    const r = parseABC(tune('[M:1/4] A2 | [M:4/4] B2 c2 d2 e2 |'));
    expect(r.warnings).toEqual([]);
    expect(r.ok && r.score.timeSignature).toBe('4/4');
    expect(r.ok && r.score.staves[0].measures.map((m) => !!m.isPickup)).toEqual([true, false]);
  });

  it('warns on a tempo change inside the tune', () => {
    expect(warningsOf(tune('A2 [Q:1/4=90] B2', 'M:4/4\nL:1/8\nQ:1/4=120\nK:C'))).toEqual([
      expect.stringMatching(/Tempo changes inside the tune/),
    ]);
  });

  it('marks an under-full first bar followed by more music as a pickup', () => {
    const score = ok(tune('D | G2 A2 B2 c2 | d4 |'));
    expect(score.staves[0].measures.map((m) => !!m.isPickup)).toEqual([true, false, false]);
    expect(ok(tune('D E')).staves[0].measures[0].isPickup).toBeUndefined();
  });

  it('reports an over-full bar as a warning but still imports it', () => {
    const r = parseABC(tune('A2 B2 c2 d2 e2 | A2'));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual([
      expect.stringMatching(/Bar 1 holds more than a full bar \(80\/64 quants\)/),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------

describe('ABC importer — validation warnings', () => {
  it('lists the first eight problem bars and counts the rest', () => {
    const r = parseABC(tune(Array(12).fill('A2 B2 c2 d2 e2').join(' | ')));
    expect(r.warnings).toHaveLength(9);
    expect(r.warnings[7]).toMatch(/^Bar 8 holds/);
    expect(r.warnings[8]).toBe('4 more bars hold more than a full bar');
  });
});

describe('ABC importer — voices', () => {
  const grand = 'X:1\nM:4/4\nL:1/4\nK:C\nV:1 clef=treble\nV:2 clef=bass\n';

  it('turns each voice into a staff with its own clef', () => {
    const score = ok(`${grand}V:1\nA B c d |\nV:2\nA, B, C D |`);
    expect(score.staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    expect(bars(score, 0)).toEqual(['A4q B4q C5q D5q']);
    expect(bars(score, 1)).toEqual(['A3q B3q C4q D4q']);
  });

  it('continues a voice across interleaved blocks and inline switches', () => {
    const score = ok(`${grand}V:1\nA4 |\nV:2\nA,4 |\n[V:1] B4 | [V:2] B,4 |`);
    expect(bars(score, 0)).toEqual(['A4w', 'B4w']);
    expect(bars(score, 1)).toEqual(['A3w', 'B3w']);
  });

  it('declares voices in header order and reads names and octaves without complaint', () => {
    const abc =
      'X:1\nL:1/4\nK:C\nV:B name="Bass" clef=bass\nV:T octave=-1 sname=T\nV:T\nA4|\nV:B\nC,4|';
    const score = ok(abc);
    expect(score.staves.map((s) => s.clef)).toEqual(['bass', 'treble']);
    expect(bars(score, 0)).toEqual(['C3w']);
    expect(bars(score, 1)).toEqual(['A3w']);
    expect(parseABC(abc).warnings).toEqual([]);
  });

  it('pads a shorter voice with empty bars so every staff has the same length', () => {
    const r = parseABC(`${grand}V:1\nA4 | B4 |\nV:2\nA,4 |`);
    expect(r.ok && r.score.staves.map((s) => s.measures.length)).toEqual([2, 2]);
    expect(r.ok && bars(r.score, 1)).toEqual(['A3w', '']);
    expect(r.warnings).toEqual([
      expect.stringMatching(/Voice 2 has 1 bars where another voice has 2/),
    ]);
  });

  it('drops a declared voice that never plays', () => {
    expect(ok(`${grand}V:1\nA4 |`).staves).toHaveLength(1);
  });

  it('collects chord symbols from any voice, first one wins per beat', () => {
    const score = ok(`${grand}V:1\n"G"A4 |\nV:2\n"G7"A,2 "D"B,2 |`);
    expect(score.chordTrack?.map((c) => `${c.measure}:${c.quant}:${c.symbol}`)).toEqual([
      '0:0:G',
      '0:32:D',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Unsupported constructs: music survives, one warning per category
// ---------------------------------------------------------------------------

describe('ABC importer — unsupported constructs', () => {
  it.each([
    ['slurs', '(A B) (c d)', 'A48 B48 C58 D58', /Slurs are not supported/],
    ['grace notes', '{g}A {/fg}B', 'A48 B48', /Grace notes are not supported/],
    [
      'decorations',
      '!trill!A .B ~c +fermata+d TA',
      'A48 B48 C58 D58 A48',
      /Ornaments and articulations/,
    ],
    ['text annotations', '"^slow"A "_x"B', 'A48 B48', /Text annotations were ignored/],
    ['overlays', 'A2 & B2 | c2', 'A4q', /Voice overlays/],
    ['unknown characters', 'A2 # B2', 'A4q B4q', /Unrecognized character "#"/],
  ])('%s', (_name, abc, expected, pattern) => {
    const r = parseABC(tune(abc));
    expect(r.ok && bars(r.score)[0]).toBe(expected);
    expect(r.warnings).toEqual([expect.stringMatching(pattern)]);
  });

  it('skips overlay notes only up to the next bar line', () => {
    const r = parseABC(tune('A2 & B2 | c2'));
    expect(r.ok && bars(r.score)).toEqual(['A4q', 'C5q']);
  });

  it('ignores lyrics and part markers with a warning', () => {
    const r = parseABC(tune('P:A\nA2 B2 |\nw: la la\nW: full lyrics'));
    expect(r.ok && bars(r.score)).toEqual(['A4q B4q']);
    expect(r.warnings).toEqual([
      expect.stringMatching(/Part markers/),
      expect.stringMatching(/Lyrics are not supported .*\(2 occurrences, first at line 8\)/),
    ]);
  });

  it('ignores spacers, beam marks, line-break marks and layout characters', () => {
    expect(body('A`B y c $ d ! e')).toEqual(['A48 B48 C58 D58 E58']);
  });

  it('dedupes warnings and reports the first line', () => {
    const r = parseABC(tune('(A B)\n(c d)\n(e f)'));
    expect(r.warnings).toEqual([
      'Slurs are not supported and were ignored (3 occurrences, first at line 6)',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Input handling and robustness
// ---------------------------------------------------------------------------

describe('ABC importer — input handling', () => {
  it('reads a bare fragment with no header', () => {
    const score = ok('C D E F | G A B c |');
    expect(score.timeSignature).toBe('4/4');
    expect(score.keySignature).toBe('C');
    expect(bars(score)).toEqual(['C48 D48 E48 F48', 'G48 A48 B48 C58']);
  });

  it('reads header fields without an X: line', () => {
    const score = ok('T:Fragment\nK:G\nF2 |');
    expect(score.title).toBe('Fragment');
    expect(bars(score)).toEqual(['F#4q']);
  });

  it('strips comments, joins continued lines and accepts CRLF', () => {
    expect(bars(ok('X:1\nK:C % the key\nA2 % first\n"G"B2 |'))).toEqual(['A4q B4q']);
    expect(bars(ok('X:1\nK:C\nA2 B2 \\\n c2 d2 |'))).toEqual(['A4q B4q C5q D5q']);
    expect(bars(ok('X:1\r\nK:C\r\nA2|\r\n'))).toEqual(['A4q']);
  });

  it('keeps a % inside a chord symbol', () => {
    expect(warningsOf('X:1\nK:C\n"G%"A2|')).toEqual([
      expect.stringMatching(/Unrecognized chord symbol "G%"/),
    ]);
  });

  it('skips text before X: and imports only the first of several tunes', () => {
    const r = parseABC('Some notes about the file.\nX:1\nK:C\nA2|\n\nX:2\nK:G\nB2|');
    expect(r.ok && bars(r.score)).toEqual(['A4q']);
    expect(r.warnings).toEqual([expect.stringMatching(/more than one tune/)]);
  });

  it('ignores %% directives and unknown information fields', () => {
    expect(parseABC('%abc-2.1\nX:1\nR:reel\nS:trad\nK:C\n%%staves {1}\nA2|').warnings).toEqual([]);
  });

  it('fails only when there is no music', () => {
    expect(parseABC('')).toMatchObject({ ok: false, error: expect.stringMatching(/No music/) });
    expect(parseABC('X:1\nT:Header only\nM:4/4\n')).toMatchObject({ ok: false });
    expect(parseABC('X:1\nK:C\n')).toMatchObject({ ok: false });
    expect(parseABC('X:1\nK:C\nV:1\nV:2\n')).toMatchObject({ ok: false });
  });

  it('assigns unique ids to every staff, measure, event, note, tuplet and chord', () => {
    const score = ok(tune('"G"(3ABc [CEG]2 | z4 |'));
    const ids: string[] = [];
    score.staves.forEach((s) => {
      ids.push(s.id);
      s.measures.forEach((m) => {
        ids.push(m.id);
        m.events.forEach((e) => {
          ids.push(e.id);
          e.notes.forEach((n) => ids.push(n.id));
        });
      });
    });
    score.chordTrack?.forEach((c) => ids.push(c.id));
    expect(new Set(ids).size).toBe(ids.length);
    const tupletIds = new Set(
      score.staves[0].measures[0].events.filter((e) => e.tuplet).map((e) => e.tuplet!.id)
    );
    expect(tupletIds.size).toBe(1);
  });

  it('never throws and always yields a structurally valid score (property)', () => {
    const alphabet = [...'ABCDEFGabcdefg^_=,\'0123456789/<>-|:[]()"!{}zZxyV:KLMQ \n%&.~+$`#°Δ'];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...alphabet), { maxLength: 80 }), (chars) => {
        const result = parseABC(chars.join(''));
        expect(Array.isArray(result.warnings)).toBe(true);
        if (!result.ok) return;
        const { score } = result;
        expect(score.staves.length).toBeGreaterThan(0);
        const counts = new Set(score.staves.map((s) => s.measures.length));
        expect(counts.size).toBe(1);
        for (const staff of score.staves) {
          for (const measure of staff.measures) {
            for (const event of measure.events) {
              expect(NOTE_TYPES[event.duration]).toBeDefined();
              expect(event.notes.length).toBeGreaterThan(0);
              for (const note of event.notes) expect(isValidPitch(note.pitch)).toBe(true);
            }
          }
        }
        // Parity holds even when bars are over-full (that is reported, not repaired).
        expect(validateScore(score).errors.every((e) => e.measureIndex >= 0)).toBe(true);
      }),
      { numRuns: 400 }
    );
  });
});
