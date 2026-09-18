/**
 * MusicXML Importer — first-principles tests of the supported subset.
 *
 * Each case asserts real MusicXML semantics on the produced score (pitch spelling, written
 * values, tuplet ratios, voice and staff assignment, chord anchors, warnings) rather than
 * mirroring the parser's internals. Unsupported constructs must still import the surrounding
 * music and surface exactly one deduplicated warning per category.
 */

import fc from 'fast-check';
import { parseMusicXML } from '@/importers/musicXmlImporter';
import type { Score, ScoreEvent } from '@/types';
import { validateScore } from '@/utils/validation';

// ---------------------------------------------------------------------------
// Helpers — a tiny MusicXML writer (divisions = 16, so a quarter is 16)
// ---------------------------------------------------------------------------

const TYPE_DIV: Record<string, number> = {
  breve: 128,
  whole: 64,
  half: 32,
  quarter: 16,
  eighth: 8,
  '16th': 4,
  '32nd': 2,
  '64th': 1,
};

interface NoteOpts {
  dots?: number;
  chord?: boolean;
  tie?: 'start' | 'stop';
  tied?: 'start' | 'stop';
  tuplet?: 'start' | 'stop';
  timeMod?: [number, number, string?];
  accidental?: string;
  accidentalAttrs?: string;
  voice?: string;
  staff?: number;
  duration?: number | null;
  extra?: string;
  notations?: string;
}

/** `note('F#4', 'quarter')` → a <note>; `note(null, 'quarter')` → a rest. */
const note = (pitch: string | null, type: string | null, opts: NoteOpts = {}): string => {
  const dots = opts.dots ?? 0;
  const base = type ? TYPE_DIV[type] * (2 - 1 / Math.pow(2, dots)) : 0;
  const duration =
    opts.duration === null
      ? ''
      : `<duration>${opts.duration ?? (opts.timeMod ? (base * opts.timeMod[1]) / opts.timeMod[0] : base)}</duration>`;
  let pitchXml = '<rest/>';
  if (pitch) {
    const m = pitch.match(/^([A-G])(#{1,2}|b{1,2})?(-?\d)$/)!;
    const alter = m[2] ? (m[2][0] === '#' ? m[2].length : -m[2].length) : 0;
    pitchXml = `<pitch><step>${m[1]}</step>${alter ? `<alter>${alter}</alter>` : ''}<octave>${m[3]}</octave></pitch>`;
  }
  const notations = [
    opts.tied ? `<tied type="${opts.tied}"/>` : '',
    opts.tuplet ? `<tuplet type="${opts.tuplet}"/>` : '',
    opts.notations ?? '',
  ].join('');
  return [
    '<note>',
    opts.chord ? '<chord/>' : '',
    pitchXml,
    duration,
    opts.tie ? `<tie type="${opts.tie}"/>` : '',
    opts.voice ? `<voice>${opts.voice}</voice>` : '',
    type ? `<type>${type}</type>` : '',
    '<dot/>'.repeat(dots),
    opts.accidental
      ? `<accidental${opts.accidentalAttrs ?? ''}>${opts.accidental}</accidental>`
      : '',
    opts.timeMod
      ? `<time-modification><actual-notes>${opts.timeMod[0]}</actual-notes><normal-notes>${opts.timeMod[1]}</normal-notes>${opts.timeMod[2] ? `<normal-type>${opts.timeMod[2]}</normal-type>` : ''}</time-modification>`
      : '',
    opts.staff ? `<staff>${opts.staff}</staff>` : '',
    notations ? `<notations>${notations}</notations>` : '',
    opts.extra ?? '',
    '</note>',
  ].join('');
};

const rest = (type: string | null, opts: NoteOpts = {}) => note(null, type, opts);

const ATTRIBUTES = (
  extra = '',
  key = '<key><fifths>0</fifths></key>',
  time = '<time><beats>4</beats><beat-type>4</beat-type></time>'
) =>
  `<attributes><divisions>16</divisions>${key}${time}<clef><sign>G</sign><line>2</line></clef>${extra}</attributes>`;

const measure = (n: number | string, content: string, attrs = ''): string =>
  `<measure number="${n}"${attrs}>${content}</measure>`;

interface DocOpts {
  head?: string;
  partList?: string;
  parts?: string;
}

const doc = (measures: string, opts: DocOpts = {}): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">${opts.head ?? ''}<part-list>${opts.partList ?? '<score-part id="P1"><part-name>Music</part-name></score-part>'}</part-list>${opts.parts ?? `<part id="P1">${measures}</part>`}</score-partwise>`;

/** A one-part document whose first measure carries the standard attributes. */
const tune = (firstMeasureContent: string, ...more: string[]): string =>
  doc(
    [measure(1, ATTRIBUTES() + firstMeasureContent), ...more.map((m, i) => measure(i + 2, m))].join(
      ''
    )
  );

const ok = (xml: string): Score => {
  const result = parseMusicXML(xml);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.score;
};

const warningsOf = (xml: string): string[] => parseMusicXML(xml).warnings;

const DUR: Record<string, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
  thirtysecond: '32',
  sixtyfourth: '64',
};

/** "C4q", "C4+E4+G4h", "zq", tie "-", forced glyph "!", courtesy "?", tuplet "(3:2/3#0)". */
const fmt = (e: ScoreEvent): string => {
  const d = DUR[e.duration] + (e.dotted ? '.' : '');
  const t = e.tuplet
    ? `(${e.tuplet.ratio[0]}:${e.tuplet.ratio[1]}/${e.tuplet.groupSize}#${e.tuplet.position})`
    : '';
  const body = e.isRest
    ? 'z'
    : e.notes
        .map(
          (n) =>
            `${n.pitch}${n.tied ? '-' : ''}${n.accidentalDisplay === 'show' ? '!' : n.accidentalDisplay === 'courtesy' ? '?' : ''}`
        )
        .join('+');
  return `${body}${d}${t}`;
};

const bars = (score: Score, staff = 0): string[] =>
  score.staves[staff].measures.map((m) => m.events.map(fmt).join(' '));

const body = (first: string, ...more: string[]): string[] => bars(ok(tune(first, ...more)));

// ---------------------------------------------------------------------------
// Header and structure
// ---------------------------------------------------------------------------

describe('MusicXML importer — header', () => {
  it('maps work-title, creators and rights to metadata', () => {
    const score = ok(
      doc(measure(1, ATTRIBUTES() + note('C4', 'whole')), {
        head: '<work><work-title>  My  Piece </work-title></work><identification><creator type="composer">J. Doe</creator><creator type="lyricist">A. Poet</creator><creator type="arranger">Ignored</creator><rights>© 2026 Me</rights></identification>',
      })
    );
    expect(score.title).toBe('My Piece');
    expect(score.metadata).toEqual({
      title: 'My Piece',
      composer: 'J. Doe',
      lyricist: 'A. Poet',
      copyright: '© 2026 Me',
    });
  });

  it('falls back to movement-title, then a title credit, then "Untitled"', () => {
    const m = measure(1, ATTRIBUTES() + note('C4', 'whole'));
    expect(ok(doc(m, { head: '<movement-title>Movement</movement-title>' })).title).toBe(
      'Movement'
    );
    expect(
      ok(
        doc(m, {
          head: '<credit page="1"><credit-type>title</credit-type><credit-words>From a credit</credit-words></credit><credit><credit-words>Not a title</credit-words></credit>',
        })
      ).title
    ).toBe('From a credit');
    expect(ok(doc(m)).title).toBe('Untitled');
    expect(ok(doc(m)).metadata).toEqual({ title: 'Untitled' });
  });

  it('treats an untyped creator as the composer', () => {
    const score = ok(
      doc(measure(1, ATTRIBUTES() + note('C4', 'whole')), {
        head: '<identification><creator>Anon.</creator></identification>',
      })
    );
    expect(score.metadata?.composer).toBe('Anon.');
  });
});

describe('MusicXML importer — parts and staves', () => {
  const part = (id: string, ...notes: string[]) =>
    `<part id="${id}">${measure(1, ATTRIBUTES() + notes.join(''))}</part>`;

  it('imports every part as a staff, in part-list order', () => {
    const score = ok(
      doc('', {
        partList:
          '<part-group type="start" number="1"/><score-part id="P2"><part-name>Second</part-name></score-part><score-part id="P1"><part-name>First</part-name></score-part><part-group type="stop" number="1"/>',
        parts:
          part('P1', note('C4', 'whole')) +
          part('P2', note('G3', 'whole')) +
          part('P3', note('E2', 'whole')),
      })
    );
    expect(score.staves.map((s) => s.measures[0].events[0].notes[0].pitch)).toEqual([
      'G3',
      'C4',
      'E2',
    ]);
  });

  it('reads a grand-staff part (<staves>2</staves>, numbered clefs, <staff> on notes, <backup>)', () => {
    const score = ok(
      doc(
        measure(
          1,
          ATTRIBUTES('<staves>2</staves><clef number="2"><sign>F</sign><line>4</line></clef>') +
            note('E5', 'half', { staff: 1 }) +
            note('D5', 'half', { staff: 1 }) +
            '<backup><duration>64</duration></backup>' +
            note('C3', 'whole', { staff: 2 })
        )
      )
    );
    expect(score.staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    expect(bars(score, 0)).toEqual(['E5h D5h']);
    expect(bars(score, 1)).toEqual(['C3w']);
  });

  it('creates the second staff even when only the attributes mention it', () => {
    const score = ok(
      doc(measure(1, ATTRIBUTES('<staves>2</staves>') + note('C4', 'whole', { staff: 1 })))
    );
    expect(score.staves).toHaveLength(2);
    expect(score.staves[1].measures[0].events).toEqual([]);
  });

  it('keeps the first voice of a staff and reports the others', () => {
    const r = parseMusicXML(
      tune(
        note('E5', 'half', { voice: '1' }) +
          note('D5', 'half', { voice: '1' }) +
          '<backup><duration>64</duration></backup>' +
          note('C4', 'whole', { voice: '2' })
      )
    );
    expect(r.ok && bars(r.score)).toEqual(['E5h D5h']);
    expect(r.warnings).toEqual([
      'The staff has more than one voice; only voice 1 was imported (the editor holds one voice per staff)',
    ]);
  });

  it('pads parts with fewer bars and reports it', () => {
    const r = parseMusicXML(
      doc('', {
        partList:
          '<score-part id="P1"><part-name>A</part-name></score-part><score-part id="P2"><part-name>B</part-name></score-part>',
        parts:
          `<part id="P1">${measure(1, ATTRIBUTES() + note('C4', 'whole'))}${measure(2, note('D4', 'whole'))}</part>` +
          part('P2', note('G3', 'whole')),
      })
    );
    expect(r.ok && r.score.staves.map((s) => s.measures.length)).toEqual([2, 2]);
    expect(r.warnings).toEqual([
      'Part "B" has 1 bars where another staff has 2; it was padded with empty bars',
    ]);
  });

  it('reads a timewise document like its partwise twin', () => {
    const timewise = `<score-timewise version="3.0"><part-list><score-part id="P1"><part-name>A</part-name></score-part><score-part id="P2"><part-name>B</part-name></score-part></part-list>
      <measure number="1"><part id="P1">${ATTRIBUTES()}${note('C4', 'whole')}</part><part id="P2">${ATTRIBUTES()}${note('G3', 'whole')}</part></measure>
      <measure number="2"><part id="P1">${note('D4', 'whole')}</part><part id="P2">${note('A3', 'whole')}</part></measure>
    </score-timewise>`;
    const score = ok(timewise);
    expect(bars(score, 0)).toEqual(['C4w', 'D4w']);
    expect(bars(score, 1)).toEqual(['G3w', 'A3w']);
  });
});

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

describe('MusicXML importer — attributes', () => {
  const withKey = (key: string) => ok(doc(measure(1, ATTRIBUTES('', key) + note('C4', 'whole'))));

  it.each([
    ['<key><fifths>0</fifths></key>', 'C'],
    ['<key><fifths>1</fifths><mode>major</mode></key>', 'G'],
    ['<key><fifths>-3</fifths></key>', 'Eb'],
    ['<key><fifths>3</fifths><mode>minor</mode></key>', 'F#m'],
    ['<key><fifths>-1</fifths><mode>minor</mode></key>', 'Dm'],
    ['<key><fifths>7</fifths></key>', 'C#'],
    ['<key><fifths>-7</fifths></key>', 'Cb'],
    ['<key><fifths>8</fifths></key>', 'Ab'],
    ['<key><fifths>0</fifths><mode>aeolian</mode></key>', 'Am'],
    ['<key><fifths>0</fifths><mode>dorian</mode></key>', 'Am'],
    ['<key><fifths>1</fifths><mode>lydian</mode></key>', 'G'],
    ['<key><fifths>2</fifths><mode>mixolydian</mode></key>', 'D'],
  ])('%s → %s', (key, expected) => {
    const score = withKey(key);
    expect(score.keySignature).toBe(expected);
    expect(score.staves[0].keySignature).toBe(expected);
  });

  it('warns about modes it maps to a relative key, and about non-traditional keys', () => {
    expect(
      warningsOf(
        doc(
          measure(
            1,
            ATTRIBUTES('', '<key><fifths>0</fifths><mode>dorian</mode></key>') + note('C4', 'whole')
          )
        )
      )
    ).toEqual([
      'Dorian mode has no equivalent key; imported as A minor (same key signature) (bar 1)',
    ]);
    const r = parseMusicXML(
      doc(
        measure(
          1,
          ATTRIBUTES('', '<key><key-step>F</key-step><key-alter>1</key-alter></key>') +
            note('C4', 'whole')
        )
      )
    );
    expect(r.ok && r.score.keySignature).toBe('C');
    expect(r.warnings).toEqual([
      'Non-traditional key signatures are not supported; C major was used (bar 1)',
    ]);
  });

  it('keeps the first key signature and warns about later ones; pitches stay right via alter', () => {
    const r = parseMusicXML(
      doc(
        measure(1, ATTRIBUTES('', '<key><fifths>1</fifths></key>') + note('F#4', 'whole')) +
          measure(
            2,
            '<attributes><key><fifths>-1</fifths></key></attributes>' + note('Bb4', 'whole')
          )
      )
    );
    expect(r.ok && r.score.keySignature).toBe('G');
    expect(r.ok && bars(r.score)).toEqual(['F#4w', 'Bb4w']);
    expect(r.warnings).toEqual([
      'Only one key signature per score is supported; the key signature stays G Major and notes that differ carry explicit accidentals (bar 2)',
    ]);
  });

  it.each([
    ['<time><beats>3</beats><beat-type>4</beat-type></time>', '3/4'],
    ['<time symbol="common"><beats>4</beats><beat-type>4</beat-type></time>', '4/4'],
    ['<time symbol="cut"><beats>2</beats><beat-type>2</beat-type></time>', '2/2'],
    ['<time><beats>6</beats><beat-type>8</beat-type></time>', '6/8'],
    ['<time><beats>3+2</beats><beat-type>8</beat-type></time>', '5/8'],
    [
      '<time><beats>3</beats><beat-type>4</beat-type><beats>1</beats><beat-type>8</beat-type></time>',
      '7/8',
    ],
  ])('%s → %s', (time, expected) => {
    expect(
      ok(doc(measure(1, ATTRIBUTES('', undefined, time) + note('C4', 'whole')))).timeSignature
    ).toBe(expected);
  });

  it('supports senza misura and defaults to 4/4 for absent or unreadable meters', () => {
    expect(
      ok(
        doc(measure(1, '<attributes><divisions>16</divisions></attributes>' + note('C4', 'whole')))
      ).timeSignature
    ).toBe('4/4');
    const free = parseMusicXML(
      doc(
        measure(1, ATTRIBUTES('', undefined, '<time><senza-misura/></time>') + note('C4', 'whole'))
      )
    );
    expect(free.ok && free.score.timeSignature).toBe('none');
    expect(free.warnings).toEqual([]);
    expect(
      warningsOf(
        doc(
          measure(
            1,
            ATTRIBUTES('', undefined, '<time><beats>4</beats><beat-type>3</beat-type></time>') +
              note('C4', 'whole')
          )
        )
      )
    ).toEqual(['An unsupported time signature was imported as 4/4 (bar 1)']);
  });

  it('reports a <time> missing its beats or beat-type', () => {
    const r = parseMusicXML(
      doc(
        measure(1, ATTRIBUTES('', undefined, '<time><beats>3</beats></time>') + note('C4', 'whole'))
      )
    );
    expect(r.ok && r.score.timeSignature).toBe('4/4');
    expect(r.warnings).toEqual(['An unsupported time signature was imported as 4/4 (bar 1)']);
  });

  it('keeps the first meter and reports a later change', () => {
    const r = parseMusicXML(
      tune(
        note('C4', 'whole'),
        '<attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>' +
          note('D4', 'half', { dots: 1 })
      )
    );
    expect(r.ok && r.score.timeSignature).toBe('4/4');
    expect(r.warnings).toEqual([
      'Meter changes inside the score are not supported; the score stays in 4/4 (bar 2)',
    ]);
  });

  it.each([
    ['G', 2, 'treble', null],
    ['F', 4, 'bass', null],
    ['C', 3, 'alto', null],
    ['C', 4, 'tenor', null],
    ['G', 1, 'treble', 'Unsupported clef "G1" was imported as treble (bar 1)'],
    ['F', 3, 'bass', 'Unsupported clef "F3" was imported as bass (bar 1)'],
    ['C', 1, 'alto', 'Unsupported clef "C1" was imported as alto (bar 1)'],
    ['percussion', null, 'treble', 'Unsupported clef "percussion" was imported as treble (bar 1)'],
    ['TAB', 5, 'treble', 'Unsupported clef "TAB5" was imported as treble (bar 1)'],
  ])('clef %s%s → %s', (sign, line, expected, warning) => {
    const clef = `<clef><sign>${sign}</sign>${line ? `<line>${line}</line>` : ''}</clef>`;
    const r = parseMusicXML(
      doc(
        measure(
          1,
          `<attributes><divisions>16</divisions>${clef}</attributes>` + note('C4', 'whole')
        )
      )
    );
    expect(r.ok && r.score.staves[0].clef).toBe(expected);
    expect(r.warnings).toEqual(warning ? [warning] : []);
  });

  it('imports an octave-transposing clef as the plain clef, keeping written pitches', () => {
    const r = parseMusicXML(
      doc(
        measure(
          1,
          '<attributes><divisions>16</divisions><clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes>' +
            note('C4', 'whole')
        )
      )
    );
    expect(r.ok && r.score.staves[0].clef).toBe('treble');
    expect(r.ok && bars(r.score)).toEqual(['C4w']);
    expect(r.warnings).toEqual([
      'Octave-transposing clefs were imported as plain clefs (written pitches kept) (bar 1)',
    ]);
  });

  it('keeps the first clef of a staff and reports a change', () => {
    const r = parseMusicXML(
      tune(
        note('C4', 'whole'),
        '<attributes><clef><sign>F</sign><line>4</line></clef></attributes>' + note('C3', 'whole')
      )
    );
    expect(r.ok && r.score.staves[0].clef).toBe('treble');
    expect(r.warnings).toEqual([
      'Clef changes inside the score are not supported; each staff keeps its first clef (bar 2)',
    ]);
  });

  it('honours a divisions change mid-part', () => {
    const score = ok(
      tune(
        note('C4', 'quarter') + rest('quarter') + rest('half'),
        '<attributes><divisions>4</divisions></attributes>' +
          note('D4', null, { duration: 8 }) +
          note('E4', null, { duration: 8 })
      )
    );
    expect(bars(score)).toEqual(['C4q zq zh', 'D4h E4h']);
  });
});

// ---------------------------------------------------------------------------
// Tempo and directions
// ---------------------------------------------------------------------------

describe('MusicXML importer — tempo and directions', () => {
  const dir = (inner: string, sound = '') =>
    `<direction placement="above"><direction-type>${inner}</direction-type>${sound}</direction>`;
  const metronome = (unit: string, perMinute: string, dotted = false) =>
    `<metronome><beat-unit>${unit}</beat-unit>${dotted ? '<beat-unit-dot/>' : ''}<per-minute>${perMinute}</per-minute></metronome>`;

  it.each([
    [dir('', '<sound tempo="100"/>'), 100],
    ['<sound tempo="88"/>', 88],
    [dir(metronome('quarter', '90')), 90],
    [dir(metronome('quarter', '60', true)), 90],
    [dir(metronome('half', '60')), 120],
    [dir(metronome('eighth', '200')), 100],
    [dir(metronome('quarter', '120–132')), 120],
    [dir(metronome('quarter', 'ca. 72'), '<sound tempo="72"/>'), 72],
  ])('%s → %d bpm', (direction, bpm) => {
    const r = parseMusicXML(tune(direction + note('C4', 'whole')));
    expect(r.ok && r.score.bpm).toBe(bpm);
    expect(r.warnings).toEqual([]);
  });

  it('defaults to 120 with no tempo, clamps extremes, and keeps the first of several tempi', () => {
    expect(ok(tune(note('C4', 'whole'))).bpm).toBe(120);
    const fast = parseMusicXML(tune('<sound tempo="400"/>' + note('C4', 'whole')));
    expect(fast.ok && fast.score.bpm).toBe(300);
    expect(fast.warnings).toEqual(['Tempo 400 BPM is out of range; clamped to 300 (bar 1)']);
    const change = parseMusicXML(
      tune(
        '<sound tempo="100"/>' + note('C4', 'whole'),
        '<sound tempo="80"/>' + note('D4', 'whole')
      )
    );
    expect(change.ok && change.score.bpm).toBe(100);
    expect(change.warnings).toEqual([
      'Tempo changes inside the score are not supported; the first tempo was kept (bar 2)',
    ]);
  });

  it('does not report the words beside a tempo mark, but does report other text', () => {
    expect(
      warningsOf(
        tune(dir('<words>Allegro</words>' + metronome('quarter', '132')) + note('C4', 'whole'))
      )
    ).toEqual([]);
    expect(warningsOf(tune(dir('<words>dolce</words>') + note('C4', 'whole')))).toEqual([
      'Text directions (expressions, rehearsal marks) were ignored (bar 1)',
    ]);
  });

  it('reports dynamics, hairpins, octave shifts, pedals and navigation marks once each', () => {
    const xml = tune(
      dir('<dynamics><p/></dynamics>') +
        dir('<wedge type="crescendo"/>') +
        dir('<octave-shift type="down" size="8"/>') +
        dir('<pedal type="start"/>') +
        dir('<segno/>') +
        note('C4', 'whole', { notations: '<dynamics><f/></dynamics>' }),
      dir('<coda/>', '<sound tocoda="x"/>') + note('D4', 'whole')
    );
    expect(warningsOf(xml)).toEqual([
      'Dynamics and hairpins are not supported and were ignored (3 occurrences, first at bar 1)',
      'Octave shifts (8va/8vb) were ignored; written pitches were kept (bar 1)',
      'Other directions (pedal marks, brackets, …) were ignored (bar 1)',
      'Segno, coda and D.C./D.S. marks were ignored; the music was imported once, in order (3 occurrences, first at bar 1)',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

describe('MusicXML importer — pitches', () => {
  it('spells pitches from step, alter and octave', () => {
    expect(
      body(
        note('C4', 'quarter') +
          note('F#4', 'quarter') +
          note('Bb3', 'quarter') +
          note('C##5', 'quarter')
      )
    ).toEqual(['C4q F#4q Bb3q C##5q']);
    expect(body(note('Ebb4', 'whole'))).toEqual(['Ebb4w']);
  });

  it('rounds microtones and clamps triple accidentals, with warnings', () => {
    const quarterSharp = tune(
      '<note><pitch><step>C</step><alter>0.5</alter><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>'
    );
    expect(ok(quarterSharp).staves[0].measures[0].events[0].notes[0].pitch).toBe('C#4');
    expect(warningsOf(quarterSharp)).toEqual([
      'Microtonal alterations were rounded to the nearest semitone (bar 1)',
    ]);
    const triple = tune(
      '<note><pitch><step>C</step><alter>3</alter><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>'
    );
    expect(ok(triple).staves[0].measures[0].events[0].notes[0].pitch).toBe('C##4');
    expect(warningsOf(triple)).toEqual([
      'Alterations beyond a double sharp or flat were clamped (bar 1)',
    ]);
  });

  it('imports unpitched and unreadable notes as rests', () => {
    const r = parseMusicXML(
      tune(
        '<note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>32</duration><type>half</type></note><note><pitch><step>H</step><octave>4</octave></pitch><duration>32</duration><type>half</type></note>'
      )
    );
    expect(r.ok && bars(r.score)).toEqual(['zh zh']);
    expect(r.warnings).toEqual([
      'Unpitched (percussion) notes were imported as rests (bar 1)',
      'Notes without a readable pitch were imported as rests (bar 1)',
    ]);
  });
});

describe('MusicXML importer — written values', () => {
  it('reads type and dots', () => {
    expect(
      body(
        note('C4', 'quarter', { dots: 1 }) +
          note('D4', 'eighth') +
          note('E4', 'eighth', { dots: 1 }) +
          note('F4', '16th') +
          note('G4', 'quarter')
      )
    ).toEqual(['C4q. D48 E48. F416 G4q']);
    expect(
      body(
        note('C4', 'half') +
          note('D4', '32nd') +
          note('E4', '32nd') +
          note('F4', '64th') +
          note('G4', '64th') +
          rest('eighth') +
          rest('quarter', { dots: 1 })
      )
    ).toEqual(['C4h D432 E432 F464 G464 z8 zq.']);
  });

  it('splits values the model lacks into tied notes (double dots, breve)', () => {
    expect(
      body(
        note('C4', 'quarter', { dots: 2 }) +
          note('D4', 'quarter') +
          note('E4', '16th') +
          note('F4', 'quarter')
      )
    ).toEqual(['C4-q. C416 D4q E416 F4q']);
    expect(body(note('C4', 'breve'), note('D4', 'whole'))).toEqual(['C4-w C4w', 'D4w']);
  });

  it('derives the value from <duration> when there is no <type>', () => {
    expect(
      body(
        note('C4', null, { duration: 24 }) +
          note('D4', null, { duration: 8 }) +
          rest(null, { duration: 20 }) +
          note('E4', null, { duration: 12 })
      )
    ).toEqual(['C4q. D48 zq z16 E48.']);
  });

  it('prefers <duration> when it contradicts the written value, with one warning', () => {
    const xml = tune(
      note('C4', 'quarter', { duration: 8 }) +
        note('D4', 'quarter', { duration: 8 }) +
        note('E4', 'half', { duration: 48 })
    );
    expect(bars(ok(xml))).toEqual(['C48 D48 E4h.']);
    expect(warningsOf(xml)).toEqual([
      "Some notes' written values disagreed with their durations; the durations were used (3 occurrences, first at bar 1)",
    ]);
  });

  it('rounds values off the 64th-note grid', () => {
    const xml = tune(
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>0.5</duration><type>128th</type></note>' +
        note('D4', null, { duration: 62.5 })
    );
    expect(bars(ok(xml))).toEqual(['C464 D4-h. D4-8. D432.']);
    expect(warningsOf(xml)).toEqual([
      'Some note lengths were not on the 64th-note grid and were rounded (2 occurrences, first at bar 1)',
    ]);
  });
});

describe('MusicXML importer — chords, rests and bars', () => {
  it('joins <chord/> notes to the preceding note (first note sets the value)', () => {
    expect(
      body(
        note('C4', 'half') +
          note('E4', 'half', { chord: true }) +
          note('G4', 'quarter', { chord: true }) +
          note('D4', 'half')
      )
    ).toEqual(['C4+E4+G4h D4h']);
  });

  it('ignores a chord note with nothing to join', () => {
    const xml = tune(rest('half') + note('E4', 'half', { chord: true }) + note('D4', 'half'));
    expect(bars(ok(xml))).toEqual(['zh D4h']);
    expect(warningsOf(xml)).toEqual(['A chord note with nothing to attach to was ignored (bar 1)']);
  });

  it('turns a lone whole-bar rest into an empty bar (measure="yes", a whole rest, or a full duration)', () => {
    const score = ok(
      tune(
        '<note><rest measure="yes"/><duration>64</duration></note>',
        rest('whole'),
        rest(null, { duration: 64 }),
        rest('half') + rest('half'),
        '<note><rest measure="yes"/><duration>64</duration></note><note><rest measure="yes"/><duration>64</duration></note>'
      )
    );
    // Two measure rests in one bar are not "a lone rest": they stay explicit (and the bar is over-full).
    expect(score.staves[0].measures.map((m) => m.events.length)).toEqual([0, 0, 0, 2, 2]);
  });

  it('reads a measure rest in 3/4 by its duration', () => {
    const score = ok(
      doc(
        measure(
          1,
          ATTRIBUTES('', undefined, '<time><beats>3</beats><beat-type>4</beat-type></time>') +
            '<note><rest measure="yes"/><duration>48</duration></note>'
        ) +
          measure(
            2,
            '<note><rest measure="yes"/><duration>48</duration></note>' +
              '<harmony><root><root-step>C</root-step></root><kind>major</kind></harmony>'
          )
      )
    );
    expect(score.staves[0].measures[0].events).toEqual([]);
    // A chord symbol needs an event to anchor to, so that bar keeps its rest.
    expect(bars(score)[1]).toBe('zh.');
  });

  it("lets a chord symbol keep only the top staff's measure rest explicit", () => {
    const score = ok(
      doc(
        measure(
          1,
          ATTRIBUTES('<staves>2</staves><clef number="2"><sign>F</sign><line>4</line></clef>') +
            '<harmony><root><root-step>G</root-step></root><kind>dominant</kind></harmony>' +
            '<note><rest measure="yes"/><duration>64</duration><staff>1</staff></note>' +
            '<backup><duration>64</duration></backup>' +
            '<note><rest measure="yes"/><duration>64</duration><staff>2</staff></note>'
        )
      )
    );
    expect(bars(score, 0)).toEqual(['zw']);
    expect(score.staves[1].measures[0].events).toEqual([]);
    expect(score.chordTrack?.map((c) => c.symbol)).toEqual(['G7']);
  });

  it('keeps an empty measure element as an empty bar and ignores unknown measure children', () => {
    const score = ok(
      tune(note('C4', 'whole'), '<print new-system="yes"/>', '<print/>' + note('D4', 'whole'))
    );
    expect(score.staves[0].measures.map((m) => m.events.length)).toEqual([1, 0, 1]);
  });

  it('fills the time a <forward> skips with rests and drops overlapping notes', () => {
    const xml = tune(
      '<forward><duration>16</duration></forward>' +
        note('C4', 'quarter') +
        '<forward><duration>24</duration></forward>' +
        note('D4', 'eighth')
    );
    expect(bars(ok(xml))).toEqual(['zq C4q zq. D48']);
    const overlap = tune(
      note('C4', 'half') +
        '<backup><duration>16</duration></backup>' +
        note('D4', 'half') +
        note('E4', 'quarter')
    );
    expect(bars(ok(overlap))).toEqual(['C4h zq E4q']);
    expect(warningsOf(overlap)).toEqual([
      'Notes that overlap an earlier note in the same voice were dropped (bar 1)',
    ]);
  });

  it('reports over-full bars through validation', () => {
    const r = parseMusicXML(tune(note('C4', 'whole') + note('D4', 'quarter')));
    expect(r.ok).toBe(true);
    expect(r.warnings).toEqual(['Bar 1 holds more than a full bar (80/64 quants)']);
  });

  it('fills the time the bar still spans after the kept voice stops, so a full bar is no pickup', () => {
    const xml = tune(
      note('C4', 'half', { voice: '1' }) +
        '<forward><duration>32</duration></forward>' +
        '<backup><duration>64</duration></backup>' +
        note('C3', 'whole', { voice: '2' }),
      note('D4', 'whole', { voice: '1' })
    );
    const score = ok(xml);
    expect(bars(score)).toEqual(['C4h zh', 'D4w']);
    expect(score.staves[0].measures[0].isPickup).toBeUndefined();
  });

  it('marks a rest-only first bar the file calls implicit as a pickup', () => {
    const score = ok(
      doc(
        measure(
          0,
          ATTRIBUTES() + '<note><rest measure="yes"/><duration>16</duration></note>',
          ' implicit="yes"'
        ) +
          measure(1, note('C5', 'whole')) +
          measure(2, note('D5', 'whole'))
      )
    );
    expect(score.staves[0].measures.map((m) => !!m.isPickup)).toEqual([true, false, false]);
    expect(score.staves[0].measures[0].events).toEqual([]);
  });

  it('infers a pickup from an implicit or under-full first bar', () => {
    const implicit = ok(
      doc(
        measure(0, ATTRIBUTES() + note('G4', 'quarter'), ' implicit="yes"') +
          measure(1, note('C5', 'whole'))
      )
    );
    expect(implicit.staves[0].measures.map((m) => !!m.isPickup)).toEqual([true, false]);
    const plain = ok(tune(note('G4', 'quarter'), note('C5', 'whole')));
    expect(plain.staves[0].measures[0].isPickup).toBe(true);
    expect(
      ok(tune(note('G4', 'whole'), note('C5', 'whole'))).staves[0].measures[0].isPickup
    ).toBeUndefined();
    expect(ok(tune(note('G4', 'quarter'))).staves[0].measures[0].isPickup).toBeUndefined();
  });
});

describe('MusicXML importer — ties and accidentals', () => {
  it('ties from <tie> or <tied> start elements, also across the bar line', () => {
    expect(
      body(
        note('C4', 'half', { tie: 'start' }) + note('C4', 'half', { tie: 'stop', tied: 'start' }),
        note('C4', 'quarter', { tied: 'stop' }) + rest('half', { dots: 1 })
      )
    ).toEqual(['C4-h C4-h', 'C4q zh.']);
    expect(
      body(
        note('C4', 'half') +
          note('E4', 'half', { chord: true, tied: 'start' }) +
          note('C4', 'half') +
          note('E4', 'half', { chord: true, tied: 'stop' })
      )
    ).toEqual(['C4+E4-h C4+E4h']);
  });

  it('drops ties that lead nowhere', () => {
    const xml = tune(note('C4', 'half', { tie: 'start' }) + note('D4', 'half', { tie: 'start' }));
    expect(bars(ok(xml))).toEqual(['C4h D4h']);
    expect(warningsOf(xml)).toEqual([
      'Ties with no matching note to tie to were dropped (2 occurrences)',
    ]);
  });

  it('turns a redundant <accidental> into a forced glyph and a parenthesized one into a courtesy', () => {
    const inG = doc(
      measure(
        1,
        ATTRIBUTES('', '<key><fifths>1</fifths></key>') +
          note('F#4', 'quarter') +
          note('F#4', 'quarter', { accidental: 'sharp' }) +
          note('F4', 'quarter', { accidental: 'natural' }) +
          note('F4', 'quarter')
      ) +
        measure(
          2,
          note('F#4', 'quarter', { accidental: 'sharp', accidentalAttrs: ' parentheses="yes"' }) +
            note('F#4', 'quarter', { accidental: 'sharp', accidentalAttrs: ' cautionary="yes"' }) +
            note('F4', 'half', { accidental: 'natural', accidentalAttrs: ' parentheses="yes"' })
        )
    );
    expect(bars(ok(inG))).toEqual(['F#4q F#4!q F4q F4q', 'F#4?q F#4!q F4?h']);
  });

  it('carries an accidental glyph on the first of a split note only', () => {
    expect(
      body(
        note('C#4', 'quarter', { dots: 2, accidental: 'sharp' }) +
          note('C#4', 'quarter', { accidental: 'sharp' }) +
          rest('quarter')
      )
    ).toEqual(['C#4-q. C#416 C#4!q zq']);
  });
});

// ---------------------------------------------------------------------------
// Tuplets
// ---------------------------------------------------------------------------

describe('MusicXML importer — tuplets', () => {
  const triplet = (a: string, b: string, c: string, notations = true) =>
    note(a, 'eighth', { timeMod: [3, 2, 'eighth'], tuplet: notations ? 'start' : undefined }) +
    note(b, 'eighth', { timeMod: [3, 2, 'eighth'] }) +
    note(c, 'eighth', { timeMod: [3, 2, 'eighth'], tuplet: notations ? 'stop' : undefined });

  it('groups members between <tuplet> start and stop notations', () => {
    expect(
      body(
        triplet('C4', 'D4', 'E4') +
          note('F4', 'quarter') +
          triplet('G4', 'A4', 'B4') +
          rest('quarter')
      )
    ).toEqual([
      'C48(3:2/3#0) D48(3:2/3#1) E48(3:2/3#2) F4q G48(3:2/3#0) A48(3:2/3#1) B48(3:2/3#2) zq',
    ]);
  });

  it('groups by the ratio alone when a file has no bracket notations', () => {
    expect(
      body(triplet('C4', 'D4', 'E4', false) + triplet('F4', 'G4', 'A4', false) + rest('half'))
    ).toEqual(['C48(3:2/3#0) D48(3:2/3#1) E48(3:2/3#2) F48(3:2/3#0) G48(3:2/3#1) A48(3:2/3#2) zh']);
    // Without normal-type either, the first member's value is the unit.
    const bare = (p: string) => note(p, '16th', { timeMod: [5, 4] });
    expect(
      body(
        bare('C4') +
          bare('D4') +
          bare('E4') +
          bare('F4') +
          bare('G4') +
          rest('quarter') +
          rest('half')
      )
    ).toEqual(['C416(5:4/5#0) D416(5:4/5#1) E416(5:4/5#2) F416(5:4/5#3) G416(5:4/5#4) zq zh']);
  });

  it('allows rests and mixed values inside a tuplet', () => {
    expect(
      body(
        note('C4', 'eighth', { timeMod: [3, 2], tuplet: 'start' }) +
          rest('eighth', { timeMod: [3, 2] }) +
          note('E4', 'eighth', { timeMod: [3, 2], tuplet: 'stop' }) +
          rest('half') +
          rest('quarter')
      )
    ).toEqual(['C48(3:2/3#0) z8(3:2/3#1) E48(3:2/3#2) zh zq']);
    expect(
      body(
        note('C4', 'quarter', { timeMod: [3, 2, 'eighth'], tuplet: 'start' }) +
          note('D4', 'eighth', { timeMod: [3, 2, 'eighth'], tuplet: 'stop' }) +
          rest('half') +
          rest('quarter')
      )
    ).toEqual(['C4q(3:2/2#0) D48(3:2/2#1) zh zq']);
  });

  it('reads a duplet in 6/8 and a sextuplet', () => {
    const duplet = doc(
      measure(
        1,
        ATTRIBUTES('', undefined, '<time><beats>6</beats><beat-type>8</beat-type></time>') +
          note('G4', 'eighth', { timeMod: [2, 3, 'eighth'], tuplet: 'start' }) +
          note('A4', 'eighth', { timeMod: [2, 3, 'eighth'], tuplet: 'stop' }) +
          note('B4', 'quarter', { dots: 1 })
      )
    );
    expect(bars(ok(duplet))).toEqual(['G48(2:3/2#0) A48(2:3/2#1) B4q.']);
    const six = (p: string, t?: 'start' | 'stop') =>
      note(p, '16th', { timeMod: [6, 4, '16th'], tuplet: t });
    expect(
      body(
        six('C4', 'start') +
          six('D4') +
          six('E4') +
          six('F4') +
          six('G4') +
          six('A4', 'stop') +
          rest('half') +
          rest('quarter')
      )
    ).toEqual([
      'C416(6:4/6#0) D416(6:4/6#1) E416(6:4/6#2) F416(6:4/6#3) G416(6:4/6#4) A416(6:4/6#5) zh zq',
    ]);
  });

  it('drops the bracket of a tuplet that does not add up, keeping its notes', () => {
    const xml = tune(
      note('C4', 'eighth', { timeMod: [3, 2, 'eighth'], tuplet: 'start' }) +
        note('D4', 'eighth', { timeMod: [3, 2, 'eighth'], tuplet: 'stop' }) +
        rest('half') +
        rest('quarter')
    );
    expect(bars(ok(xml))).toEqual(['C48 D48 zh zq']);
    expect(warningsOf(xml)).toEqual([
      'A tuplet did not add up to a whole number of beats (its bracket was probably cut off); its notes were imported without the tuplet (bar 1)',
    ]);
    expect(validateScore(ok(xml)).valid).toBe(true);
  });

  it('reads a bracket notation that sits on a chord member', () => {
    const tm: [number, number, string] = [3, 2, 'eighth'];
    expect(
      body(
        note('C4', 'eighth', { timeMod: tm, tuplet: 'start' }) +
          note('D4', 'eighth', { timeMod: tm }) +
          note('E4', 'eighth', { timeMod: tm }) +
          note('G4', 'eighth', { timeMod: tm, chord: true, tuplet: 'stop' }) +
          note('F4', 'eighth', { timeMod: tm }) +
          note('G4', 'eighth', { timeMod: tm }) +
          note('A4', 'eighth', { timeMod: tm }) +
          rest('half')
      )
    ).toEqual([
      'C48(3:2/3#0) D48(3:2/3#1) E4+G48(3:2/3#2) F48(3:2/3#0) G48(3:2/3#1) A48(3:2/3#2) zh',
    ]);
  });

  it('warns once about nested tuplets and malformed time modifications', () => {
    const nested = tune(
      note('C4', 'eighth', {
        timeMod: [9, 4, '16th'],
        notations: '<tuplet type="start" number="1"/><tuplet type="start" number="2"/>',
      }) +
        note('D4', '16th', { timeMod: [9, 4] }) +
        note('E4', '16th', {
          timeMod: [9, 4],
          notations: '<tuplet type="stop" number="2"/><tuplet type="stop" number="1"/>',
        })
    );
    expect(warningsOf(nested)).toContain(
      'Nested tuplets are not supported; only the combined ratio was kept, so a group that no longer adds up loses its bracket (2 occurrences, first at bar 1)'
    );
    const malformed = tune(
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type><time-modification><actual-notes>0</actual-notes><normal-notes>2</normal-notes></time-modification></note>'
    );
    expect(bars(ok(malformed))).toEqual(['C4w']);
    expect(warningsOf(malformed)).toEqual(['A malformed <time-modification> was ignored (bar 1)']);
  });
});

// ---------------------------------------------------------------------------
// Chord symbols
// ---------------------------------------------------------------------------

describe('MusicXML importer — harmony', () => {
  const harmony = (step: string, kind: string, extra = '', rootAlter = 0) =>
    `<harmony><root><root-step>${step}</root-step>${rootAlter ? `<root-alter>${rootAlter}</root-alter>` : ''}</root><kind>${kind}</kind>${extra}</harmony>`;

  it.each([
    [harmony('C', 'major'), 'C'],
    [harmony('A', 'minor'), 'Am'],
    [harmony('G', 'dominant'), 'G7'],
    [harmony('C', 'major-seventh'), 'Cmaj7'],
    [harmony('D', 'minor-seventh'), 'Dm7'],
    [harmony('B', 'diminished'), 'Bdim'],
    [harmony('B', 'half-diminished'), 'Bm7b5'],
    [harmony('C', 'suspended-fourth'), 'Csus4'],
    [harmony('C', 'dominant-ninth'), 'C9'],
    [harmony('B', 'major', '', -1), 'Bb'],
    [harmony('F', 'major', '', 1), 'F#'],
    [harmony('C', 'major', '<bass><bass-step>E</bass-step></bass>'), 'C/E'],
    [
      harmony(
        'C',
        'major',
        '<degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree>'
      ),
      'Cadd9',
    ],
    [
      harmony('C', 'other', '<bass><bass-step>G</bass-step></bass>').replace(
        '<kind>other</kind>',
        '<kind text="m7">other</kind>'
      ),
      'Cm7/G',
    ],
  ])('%s → %s', (xml, symbol) => {
    const score = ok(tune(xml + note('C4', 'whole')));
    expect(score.chordTrack?.map((c) => c.symbol)).toEqual([symbol]);
  });

  it.each([
    [harmony('C', 'augmented-seventh'), 'Caug7'],
    [harmony('C', 'major-minor'), 'Cmmaj7'],
    [harmony('C', 'power'), 'C5'],
    [harmony('C', 'major-sixth'), 'C6'],
    [harmony('C', 'minor-ninth'), 'Cm9'],
  ])('%s → %s (kinds the exporter also writes)', (xml, symbol) => {
    expect(ok(tune(xml + note('C4', 'whole'))).chordTrack?.map((c) => c.symbol)).toEqual([symbol]);
  });

  it('simplifies a symbol the chord parser cannot hold instead of dropping it', () => {
    const add9OverA = harmony(
      'F',
      'major',
      '<degree><degree-value>9</degree-value><degree-alter>0</degree-alter><degree-type>add</degree-type></degree><bass><bass-step>A</bass-step></bass>'
    );
    const r = parseMusicXML(tune(add9OverA + note('F4', 'whole')));
    expect(r.ok && r.score.chordTrack?.map((c) => c.symbol)).toEqual(['F/A']);
    expect(r.warnings).toEqual(['Chord symbol "Fadd9/A" was simplified to "F/A" (bar 1)']);
    // The parser reads "maj9" as a dominant ninth, so the major quality is kept at the seventh.
    const maj9 = parseMusicXML(tune(harmony('C', 'major-ninth') + note('C4', 'whole')));
    expect(maj9.ok && maj9.score.chordTrack?.map((c) => c.symbol)).toEqual(['Cmaj7']);
    expect(maj9.warnings).toEqual(['Chord symbol "Cmaj9" was simplified to "Cmaj7" (bar 1)']);
  });

  it('never lets an altered tone re-spell the root', () => {
    const flatNine = harmony(
      'C',
      'major',
      '<degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>'
    );
    const r = parseMusicXML(tune(flatNine + note('C4', 'whole')));
    const symbols = r.ok ? r.score.chordTrack?.map((c) => c.symbol) : [];
    expect(symbols).toHaveLength(1);
    expect(symbols?.[0]).toMatch(/^C(?![#b])/);
  });

  it('anchors symbols at the cursor (plus <offset>), keeps the first at a beat, and skips "none"', () => {
    const score = ok(
      tune(
        harmony('C', 'major') +
          note('C4', 'quarter') +
          harmony('F', 'major') +
          harmony('G', 'major') +
          note('D4', 'quarter') +
          harmony('G', 'dominant', '<offset>16</offset>') +
          note('E4', 'half'),
        harmony('C', 'none') + note('F4', 'whole')
      )
    );
    // G7 was written 16 quants into the half note: no note starts there, so it moves back to it.
    expect(score.chordTrack?.map((c) => [c.measure, c.quant, c.symbol])).toEqual([
      [0, 0, 'C'],
      [0, 16, 'F'],
      [0, 32, 'G7'],
    ]);
  });

  it('moves a symbol that is not on a note of the top staff to the note sounding there', () => {
    const r = parseMusicXML(
      tune(
        harmony('C', 'major') +
          note('C4', 'half') +
          harmony('G', 'dominant', '<offset>8</offset>') +
          note('D4', 'half') +
          harmony('F', 'major', '<offset>-16</offset>')
      )
    );
    // G7 was placed 8 quants after the second note began → back to that note (quant 32); the
    // negative offset puts F at quant 48, where no note starts → back to quant 32 too, where G7
    // already sits, so it is dropped.
    expect(r.ok && r.score.chordTrack?.map((c) => [c.measure, c.quant, c.symbol])).toEqual([
      [0, 0, 'C'],
      [0, 32, 'G7'],
    ]);
    expect(r.warnings).toEqual([
      'Chord symbols that did not fall on a note of the top staff were moved to the note sounding there (2 occurrences, first at bar 1)',
    ]);
  });

  it('reports symbols it cannot read', () => {
    const xml = tune(
      harmony('C', 'Tristan') +
        '<harmony><function>V</function><kind>major</kind></harmony>' +
        note('C4', 'whole')
    );
    expect(ok(xml).chordTrack).toEqual([]);
    expect(warningsOf(xml)).toEqual([
      'Chord kind "Tristan" is not supported; the chord symbol was dropped (bar 1)',
      'Functional (Roman numeral) chord symbols were ignored (bar 1)',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Unsupported constructs
// ---------------------------------------------------------------------------

describe('MusicXML importer — unsupported constructs', () => {
  it('skips grace and cue notes (a cue note leaves a rest in its place)', () => {
    const xml = tune(
      '<note><grace/><pitch><step>B</step><octave>3</octave></pitch><type>16th</type></note>' +
        note('C4', 'half') +
        '<note><cue/><pitch><step>D</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>' +
        note('E4', 'quarter')
    );
    expect(bars(ok(xml))).toEqual(['C4h zq E4q']);
    expect(warningsOf(xml)).toEqual([
      'Grace notes are not supported and were ignored (bar 1)',
      'Cue notes were ignored (bar 1)',
    ]);
  });

  it('skips the chord members of a skipped cue or grace note with it', () => {
    const xml = tune(
      '<note><cue/><pitch><step>C</step><octave>5</octave></pitch><duration>16</duration><type>quarter</type></note>' +
        '<note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>16</duration><type>quarter</type></note>' +
        '<note><grace/><pitch><step>B</step><octave>4</octave></pitch><type>16th</type></note>' +
        '<note><chord/><grace/><pitch><step>D</step><octave>5</octave></pitch><type>16th</type></note>' +
        note('C4', 'half') +
        note('E4', 'half', { chord: true })
    );
    expect(bars(ok(xml))).toEqual(['zq C4+E4h']);
    expect(warningsOf(xml)).toEqual([
      'Cue notes were ignored (bar 1)',
      'Grace notes are not supported and were ignored (bar 1)',
    ]);
  });

  it('reports figured bass', () => {
    const xml = tune(
      '<figured-bass><figure><figure-number>6</figure-number></figure></figured-bass>' +
        note('C4', 'whole')
    );
    expect(bars(ok(xml))).toEqual(['C4w']);
    expect(warningsOf(xml)).toEqual(['Figured bass was ignored (bar 1)']);
  });

  it('reports lyrics, slurs, articulations and repeats once per category', () => {
    const xml = tune(
      note('C4', 'quarter', {
        notations: '<slur type="start"/><articulations><staccato/></articulations>',
        extra: '<lyric><syllabic>single</syllabic><text>la</text></lyric>',
      }) +
        note('D4', 'quarter', {
          notations: '<slur type="stop"/><fermata/>',
          extra: '<lyric><text>la</text></lyric>',
        }) +
        note('E4', 'half', { notations: '<ornaments><trill-mark/></ornaments>' }) +
        '<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/></barline>',
      '<barline location="left"><ending number="1" type="start"/></barline>' + note('F4', 'whole')
    );
    expect(bars(ok(xml))).toEqual(['C4q D4q E4h', 'F4w']);
    expect(warningsOf(xml)).toEqual([
      'Lyrics are not supported and were ignored (2 occurrences, first at bar 1)',
      'Slurs are not supported and were ignored (2 occurrences, first at bar 1)',
      'Articulations, ornaments and other note decorations are not supported and were ignored (3 occurrences, first at bar 1)',
      'Repeat signs are not supported; the music was imported once, as written (bar 1)',
      'Repeat endings (1., 2. …) are not supported; every bar was imported in sequence (bar 2)',
    ]);
  });
});

// ---------------------------------------------------------------------------
// A realistic notation-app export
// ---------------------------------------------------------------------------

describe('MusicXML importer — a MuseScore-style file', () => {
  const MUSESCORE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Étude</work-title></work>
  <identification>
    <creator type="composer">Someone</creator>
    <encoding><software>MuseScore 4.3.2</software><encoding-date>2026-01-01</encoding-date>
      <supports element="accidental" type="yes"/><supports element="beam" type="yes"/></encoding>
  </identification>
  <defaults><scaling><millimeters>6.99911</millimeters><tenths>40</tenths></scaling>
    <page-layout><page-height>1596.77</page-height><page-width>1233.87</page-width></page-layout></defaults>
  <credit page="1"><credit-type>title</credit-type><credit-words default-x="616.935" default-y="1511.05" justify="center" valign="top" font-size="22">Étude</credit-words></credit>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno.</part-abbreviation>
      <score-instrument id="P1-I1"><instrument-name>Piano</instrument-name></score-instrument>
      <midi-device id="P1-I1" port="1"></midi-device>
      <midi-instrument id="P1-I1"><midi-channel>1</midi-channel><midi-program>1</midi-program><volume>78.7402</volume><pan>0</pan></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1" width="300">
      <print><system-layout><system-margins><left-margin>0</left-margin><right-margin>0</right-margin></system-margins><top-system-distance>170</top-system-distance></system-layout></print>
      <attributes>
        <divisions>2</divisions>
        <key><fifths>-1</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <direction placement="above">
        <direction-type><words font-weight="bold">Andante</words></direction-type>
        <direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>76</per-minute></metronome></direction-type>
        <staff>1</staff>
        <sound tempo="76"/>
      </direction>
      <direction placement="below"><direction-type><dynamics default-x="6.5" default-y="-40"><mp/></dynamics></direction-type><staff>1</staff><sound dynamics="71.11"/></direction>
      <note default-x="80"><pitch><step>F</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff>
        <notations><slur type="start" placement="above"/></notations></note>
      <note default-x="140"><pitch><step>B</step><alter>-1</alter><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff><beam number="1">begin</beam></note>
      <note default-x="180"><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff><beam number="1">end</beam>
        <notations><slur type="stop"/></notations></note>
      <note default-x="220"><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><tie type="start"/><voice>1</voice><type>quarter</type><stem>up</stem><staff>1</staff>
        <notations><tied type="start"/></notations></note>
      <backup><duration>6</duration></backup>
      <note default-x="80"><pitch><step>F</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><type>quarter</type><stem>down</stem><staff>2</staff></note>
      <note default-x="140"><pitch><step>A</step><octave>3</octave></pitch><duration>2</duration><voice>5</voice><type>quarter</type><stem>down</stem><staff>2</staff></note>
      <note default-x="140"><chord/><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>5</voice><type>quarter</type><stem>down</stem><staff>2</staff></note>
      <note default-x="220"><rest/><duration>2</duration><voice>5</voice><type>quarter</type><staff>2</staff></note>
    </measure>
    <measure number="2" width="250">
      <note default-x="20"><pitch><step>G</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff><beam number="1">begin</beam>
        <notations><tied type="stop"/></notations></note>
      <note default-x="60"><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>eighth</type><stem>up</stem><staff>1</staff><beam number="1">end</beam></note>
      <note default-x="100"><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>half</type><stem>up</stem><staff>1</staff>
        <notations><fermata type="upright"/></notations></note>
      <backup><duration>6</duration></backup>
      <note><rest measure="yes"/><duration>6</duration><voice>5</voice><staff>2</staff></note>
      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;

  it('imports the music, layout noise and all', () => {
    const r = parseMusicXML(MUSESCORE);
    expect(r.ok).toBe(true);
    const score = (r as { score: Score }).score;
    expect(score.title).toBe('Étude');
    expect(score.metadata?.composer).toBe('Someone');
    expect(score.keySignature).toBe('F');
    expect(score.timeSignature).toBe('3/4');
    expect(score.bpm).toBe(76);
    expect(score.staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
    expect(bars(score, 0)).toEqual(['F4q Bb48 A48 G4-q', 'G48 E48 F4h']);
    expect(bars(score, 1)).toEqual(['F3q A3+C4q zq', '']);
    expect(r.warnings).toEqual([
      'Dynamics and hairpins are not supported and were ignored (bar 1)',
      'Slurs are not supported and were ignored (2 occurrences, first at bar 1)',
      'Articulations, ornaments and other note decorations are not supported and were ignored (bar 2)',
    ]);
    expect(validateScore(score).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Failures and robustness
// ---------------------------------------------------------------------------

describe('MusicXML importer — failures', () => {
  it.each([
    ['not xml at all', /not well-formed XML: Text outside the root element \(line 1\)/],
    [
      '<score-partwise><part-list/><part id="P1"><measure number="1"></part></score-partwise>',
      /not well-formed XML: Mismatched closing tag/,
    ],
    [
      '<html><body/></html>',
      /not a MusicXML score \(the root element is <html>, not <score-partwise>\)/,
    ],
    ['<opus><score xlink:href="a.xml"/></opus>', /opus files/],
    ['<score-partwise><part-list/></score-partwise>', /No <part> elements/],
    ['<score-partwise><part-list/><part id="P1"/></score-partwise>', /No music found/],
  ])('%s', (input, error) => {
    const r = parseMusicXML(input);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(error);
  });

  it('accepts a blank score (empty bars) and a bare partwise root without a declaration', () => {
    const score = ok(
      '<score-partwise><part-list/><part id="P1"><measure number="1"/><measure number="2"/></part></score-partwise>'
    );
    expect(score.staves[0].measures.map((m) => m.events.length)).toEqual([0, 0]);
    expect(validateScore(score).valid).toBe(true);
  });

  it.each([
    [
      'a note type named after a prototype member',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>constructor</type></note>',
    ],
    [
      'a chord kind named after a prototype member',
      '<harmony><root><root-step>C</root-step></root><kind>constructor</kind></harmony>' +
        '<note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>',
    ],
    [
      'a mode named after a prototype member',
      '<attributes><key><fifths>0</fifths><mode>constructor</mode></key></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>',
    ],
    [
      'a beat unit named after a prototype member',
      '<direction><direction-type><metronome><beat-unit>constructor</beat-unit><per-minute>100</per-minute></metronome></direction-type></direction><note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>',
    ],
    [
      'an astronomically long duration',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>1e308</duration><type>whole</type></note>',
    ],
    [
      'a huge integer duration',
      '<attributes><divisions>1</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>100000000</duration></note>',
    ],
    [
      'an astronomical fifths count',
      '<attributes><key><fifths>1e300</fifths></key></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>',
    ],
    [
      'a billion staves',
      '<attributes><staves>1000000000</staves></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type><staff>1000000000</staff></note>',
    ],
    [
      'eleven hundred dots',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type>' +
        '<dot/>'.repeat(1100) +
        '</note>',
    ],
    [
      'vanishing divisions',
      '<attributes><divisions>0.0000001</divisions></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration></note>',
    ],
    [
      'a huge forward',
      '<forward><duration>1e12</duration></forward><note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type></note>',
    ],
    [
      'an entity named after a prototype member',
      '<note><pitch><step>C</step><octave>4</octave></pitch><duration>64</duration><type>whole</type><lyric><text>&constructor;</text></lyric></note>',
    ],
  ])('survives %s quickly and without throwing', (_name, content) => {
    const t0 = Date.now();
    const r = parseMusicXML(
      `<score-partwise><part-list/><part id="P1"><measure number="1"><attributes><divisions>16</divisions></attributes>${content}</measure></part></score-partwise>`
    );
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(typeof r.ok).toBe('boolean');
    if (r.ok) {
      expect(r.score.staves.length).toBeLessThanOrEqual(16);
      expect(JSON.stringify(r.score)).not.toMatch(/native code/);
      expect(r.score.staves[0].measures[0].events.length).toBeLessThan(200);
    }
  });

  it('never throws, whatever the input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (s) => {
        const r = parseMusicXML(s);
        expect(typeof r.ok).toBe('boolean');
      }),
      { numRuns: 300 }
    );
    const fragments = fc.array(
      fc.constantFrom(
        '<note>',
        '</note>',
        '<pitch><step>C</step><octave>4</octave></pitch>',
        '<duration>3</duration>',
        '<type>quarter</type>',
        '<chord/>',
        '<rest/>',
        '<backup><duration>4</duration></backup>',
        '<forward><duration>x</duration></forward>',
        '<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>',
        '<notations><tuplet type="start"/></notations>',
        '<notations><tuplet type="stop"/></notations>',
        '<attributes><divisions>0</divisions><key><fifths>99</fifths></key></attributes>',
        '<harmony><root><root-step>Q</root-step></root></harmony>',
        '<measure>',
        '</measure>'
      ),
      { maxLength: 30 }
    );
    fc.assert(
      fc.property(fragments, (parts) => {
        const r = parseMusicXML(
          `<score-partwise><part id="P1"><measure number="1">${parts.join('')}</measure></part></score-partwise>`
        );
        if (r.ok) expect(r.score.staves.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 }
    );
  });
});
