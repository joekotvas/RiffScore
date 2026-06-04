/**
 * MusicXML Exporter — Rhythm & Pitch Correctness (first-principles)
 *
 * These tests assert REAL musical correctness against independent oracles:
 *  - <alter> is cross-checked against Tonal `Note.get(pitch).alt` (the sounding
 *    alteration), NOT against the exporter's own logic.
 *  - The per-measure duration-sum invariant Σ(<duration>) == divisions × beats
 *    is a pure rhythmic conservation law, derived from the time signature, not
 *    from the exporter.
 *  - Every emitted <duration> must be a positive integer (the bug being guarded:
 *    tuplet durations were floored to a non-summing/zero value).
 *
 * The document is parsed structurally with small regex helpers (no external XML
 * parser — another lane adds fast-xml-parser later).
 */

import { Note } from 'tonal';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { Score, ScoreEvent } from '@/types';

// ---------------------------------------------------------------------------
// Structural parsing helpers (independent of the exporter internals)
// ---------------------------------------------------------------------------

/** Extract the integer <divisions> value declared in the attributes. */
const getDivisions = (xml: string): number => {
  const m = xml.match(/<divisions>(\d+)<\/divisions>/);
  expect(m).not.toBeNull();
  return parseInt(m![1], 10);
};

/** Split into <measure>...</measure> blocks (one part assumed). */
const getMeasureBlocks = (xml: string): string[] => {
  return [...xml.matchAll(/<measure number="\d+">([\s\S]*?)<\/measure>/g)].map((m) => m[1]);
};

/** All integer <duration> values within a chunk of XML, in order. */
const getDurations = (chunk: string): number[] => {
  return [...chunk.matchAll(/<duration>(-?\d+(?:\.\d+)?)<\/duration>/g)].map((m) =>
    Number(m[1])
  );
};

/** Parse the single <note> block containing the given pitch step+octave. */
const findNoteBlock = (xml: string, step: string, octave: number): string => {
  const blocks = [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map((m) => m[1]);
  const block = blocks.find(
    (b) => b.includes(`<step>${step}</step>`) && b.includes(`<octave>${octave}</octave>`)
  );
  expect(block).toBeDefined();
  return block!;
};

/** Read the <alter> value of a note block, or 0 when absent (natural). */
const getAlter = (noteBlock: string): number => {
  const m = noteBlock.match(/<alter>(-?\d+)<\/alter>/);
  return m ? parseInt(m[1], 10) : 0;
};

// ---------------------------------------------------------------------------
// Score builders
// ---------------------------------------------------------------------------

const singlePitchScore = (pitch: string, timeSignature = '4/4'): Score => ({
  title: 'T',
  timeSignature,
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 's1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'm1',
          events: [{ id: 'e1', duration: 'whole', dotted: false, notes: [{ id: 'n1', pitch }] }],
        },
      ],
    },
  ],
});

const tupletEvent = (
  id: string,
  pitch: string,
  position: number,
  ratio: [number, number],
  groupSize: number,
  baseDuration: string
): ScoreEvent => ({
  id,
  duration: baseDuration,
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio, groupSize, position, baseDuration },
});

// ===========================================================================
// <alter> derivation from pitch (contract C1)
// ===========================================================================

describe('MusicXML <alter> derives from the pitch spelling (Tonal oracle)', () => {
  // Oracle list: for each pitch the expected alter is Tonal's own Note.get().alt.
  const pitches = ['C4', 'C#4', 'Db4', 'F#4', 'Bb3', 'E#4', 'Cb5', 'G##4', 'Bbb3'];

  it.each(pitches)('emits <alter> matching Tonal alt for %s', (pitch) => {
    const expectedAlt = Note.get(pitch).alt; // independent oracle
    const xml = generateMusicXML(singlePitchScore(pitch));
    const step = Note.get(pitch).letter;
    const octave = Note.get(pitch).oct as number;
    const block = findNoteBlock(xml, step, octave);

    expect(getAlter(block)).toBe(expectedAlt);
  });

  it('round-trips C#4: step C, alter 1, octave 4 (the audit bug)', () => {
    const xml = generateMusicXML(singlePitchScore('C#4'));
    const block = findNoteBlock(xml, 'C', 4);
    expect(block).toContain('<step>C</step>');
    expect(block).toContain('<alter>1</alter>');
    expect(block).toContain('<octave>4</octave>');
  });

  it('round-trips Db4: alter -1', () => {
    const xml = generateMusicXML(singlePitchScore('Db4'));
    const block = findNoteBlock(xml, 'D', 4);
    expect(block).toContain('<alter>-1</alter>');
  });

  it('emits no <alter> for a natural pitch', () => {
    const xml = generateMusicXML(singlePitchScore('C4'));
    const block = findNoteBlock(xml, 'C', 4);
    expect(block).not.toContain('<alter>');
  });

  it('emits double-sharp/double-flat <alter> ±2 and the matching visible glyph', () => {
    const sharpXml = generateMusicXML(singlePitchScore('G##4'));
    const sharpBlock = findNoteBlock(sharpXml, 'G', 4);
    expect(getAlter(sharpBlock)).toBe(2);
    expect(sharpBlock).toContain('<accidental>double-sharp</accidental>');

    const flatXml = generateMusicXML(singlePitchScore('Bbb3'));
    const flatBlock = findNoteBlock(flatXml, 'B', 3);
    expect(getAlter(flatBlock)).toBe(-2);
    expect(flatBlock).toContain('<accidental>flat-flat</accidental>');
  });

  it('derives octave from the full pitch (not the last character)', () => {
    // C10 would have slice(-1) === '0'; Tonal gives oct 10.
    const xml = generateMusicXML(singlePitchScore('C10'));
    const block = findNoteBlock(xml, 'C', 10);
    expect(block).toContain('<octave>10</octave>');
  });
});

// ===========================================================================
// <alter> is independent of the legacy note.accidental field
// ===========================================================================

describe('MusicXML <alter> ignores the legacy note.accidental field', () => {
  it('emits <alter>1</alter> for F#4 even when the accidental field is absent', () => {
    const score = singlePitchScore('F#4');
    // No accidental field at all — pitch alone must drive <alter>.
    expect(score.staves[0].measures[0].events[0].notes[0].accidental).toBeUndefined();
    const xml = generateMusicXML(score);
    const block = findNoteBlock(xml, 'F', 4);
    expect(getAlter(block)).toBe(1);
  });

  it('does NOT trust a stale/contradictory accidental field over the pitch', () => {
    const score = singlePitchScore('F#4');
    // Legacy field wrongly says "flat" — the sounding pitch is still F#.
    score.staves[0].measures[0].events[0].notes[0].accidental = 'flat';
    const xml = generateMusicXML(score);
    const block = findNoteBlock(xml, 'F', 4);
    // <alter> must reflect the pitch (+1), never the stale field (-1).
    expect(getAlter(block)).toBe(1);
    expect(block).not.toContain('<alter>-1</alter>');
  });
});

// ===========================================================================
// Rhythm: divisions, integer durations, per-measure conservation
// ===========================================================================

/**
 * The conservation law: in any well-formed measure of a metered score,
 *   Σ over events of <duration> === divisions × beatsPerMeasure
 * where beatsPerMeasure is the numerator of the time signature scaled by how
 * many quarter notes each beat is worth. We compute the expected total directly
 * from the time signature, independent of the exporter.
 *
 * divisions is divisions-per-QUARTER, so a full 4/4 bar = divisions × 4,
 * a 3/4 bar = divisions × 3, a 6/8 bar = 6 eighths = divisions × 3 quarters.
 */
const expectedQuartersPerMeasure = (timeSig: string): number => {
  const [beats, beatType] = timeSig.split('/').map(Number);
  return (beats * 4) / beatType;
};

describe('MusicXML rhythm conservation (Σ duration == divisions × quarters)', () => {
  const buildTupletMeasureScore = (
    timeSignature: string,
    ratio: [number, number],
    groupSize: number,
    baseDuration: string,
    fillerEvents: ScoreEvent[]
  ): Score => {
    const tupletEvents: ScoreEvent[] = [];
    for (let i = 0; i < groupSize; i++) {
      tupletEvents.push(
        tupletEvent(`t${i}`, 'C5', i, ratio, groupSize, baseDuration)
      );
    }
    return {
      title: 'T',
      timeSignature,
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [{ id: 'm1', events: [...tupletEvents, ...fillerEvents] }],
        },
      ],
    };
  };

  it('triplet eighths + dotted half: every duration is a positive integer and the bar sums exactly', () => {
    // Eighth triplet (3 in space of 2) occupies one quarter beat; a dotted half
    // fills the remaining three beats of 4/4.
    const score = buildTupletMeasureScore('4/4', [3, 2], 3, 'eighth', [
      { id: 'f', duration: 'half', dotted: true, notes: [{ id: 'fn', pitch: 'G4' }] },
    ]);
    const xml = generateMusicXML(score);
    const divisions = getDivisions(xml);
    const durations = getDurations(getMeasureBlocks(xml)[0]);

    // No floor-to-zero / non-integer corruption.
    durations.forEach((d) => {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    });

    const total = durations.reduce((a, b) => a + b, 0);
    expect(total).toBe(divisions * expectedQuartersPerMeasure('4/4'));

    // The three triplet members are equal and sum to exactly one quarter beat.
    const tripletDur = durations[0];
    expect(durations.slice(0, 3)).toEqual([tripletDur, tripletDur, tripletDur]);
    expect(tripletDur * 3).toBe(divisions); // one quarter == divisions
  });

  it('quintuplet sixteenths fill one quarter beat with integer durations', () => {
    // 5 sixteenths in the space of 4 (a quintuplet that occupies one quarter).
    const score = buildTupletMeasureScore('4/4', [5, 4], 5, 'sixteenth', [
      { id: 'f1', duration: 'quarter', dotted: false, notes: [{ id: 'f1n', pitch: 'G4' }] },
      { id: 'f2', duration: 'half', dotted: false, notes: [{ id: 'f2n', pitch: 'G4' }] },
    ]);
    const xml = generateMusicXML(score);
    const divisions = getDivisions(xml);
    const durations = getDurations(getMeasureBlocks(xml)[0]);

    durations.forEach((d) => {
      expect(Number.isInteger(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
    });

    const total = durations.reduce((a, b) => a + b, 0);
    expect(total).toBe(divisions * expectedQuartersPerMeasure('4/4'));

    // 5 quintuplet sixteenths together equal one quarter beat.
    const quint = durations.slice(0, 5);
    expect(new Set(quint).size).toBe(1); // all equal
    expect(quint.reduce((a, b) => a + b, 0)).toBe(divisions);
  });

  it('mixed triplet + quintuplet in one score keeps all durations integral and bars conserved', () => {
    // Two measures: one quarter-triplet measure, one quintuplet-eighth measure.
    const m1: ScoreEvent[] = [0, 1, 2].map((i) =>
      tupletEvent(`a${i}`, 'C5', i, [3, 2], 3, 'quarter')
    );
    // 3 quarter-triplet = 2 quarters; pad with a half note.
    m1.push({ id: 'm1pad', duration: 'half', dotted: false, notes: [{ id: 'm1padn', pitch: 'G4' }] });

    const m2: ScoreEvent[] = [0, 1, 2, 3, 4].map((i) =>
      tupletEvent(`b${i}`, 'C5', i, [5, 4], 5, 'eighth')
    );
    // 5 eighth-quintuplet = 2 quarters; pad with a half note.
    m2.push({ id: 'm2pad', duration: 'half', dotted: false, notes: [{ id: 'm2padn', pitch: 'G4' }] });

    const score: Score = {
      title: 'T',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            { id: 'm1', events: m1 },
            { id: 'm2', events: m2 },
          ],
        },
      ],
    };

    const xml = generateMusicXML(score);
    const divisions = getDivisions(xml);
    const measures = getMeasureBlocks(xml);
    expect(measures).toHaveLength(2);

    for (const block of measures) {
      const durations = getDurations(block);
      durations.forEach((d) => {
        expect(Number.isInteger(d)).toBe(true);
        expect(d).toBeGreaterThan(0);
      });
      expect(durations.reduce((a, b) => a + b, 0)).toBe(
        divisions * expectedQuartersPerMeasure('4/4')
      );
    }
  });

  it('septuplet 64ths do not floor to <duration>0 (illegal in MusicXML)', () => {
    // 7 sixty-fourths in the space of 4 (occupies a sixteenth = quarter/4).
    // With the old floor(8*... ) against divisions=16 these collapsed to 0.
    const tuplet: ScoreEvent[] = [];
    for (let i = 0; i < 7; i++) {
      tuplet.push(tupletEvent(`s${i}`, 'C5', i, [7, 4], 7, 'sixtyfourth'));
    }
    const score: Score = {
      title: 'T',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 's1',
          clef: 'treble',
          keySignature: 'C',
          measures: [{ id: 'm1', events: tuplet }],
        },
      ],
    };
    const xml = generateMusicXML(score);
    const durations = getDurations(xml);
    durations.forEach((d) => expect(d).toBeGreaterThan(0));
  });
});

// ===========================================================================
// <time-modification> + <normal-type>
// ===========================================================================

describe('MusicXML <time-modification> for tuplets', () => {
  const tripletScore = (): Score => ({
    title: 'T',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 's1',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          {
            id: 'm1',
            events: [0, 1, 2].map((i) => tupletEvent(`t${i}`, 'E5', i, [3, 2], 3, 'eighth')),
          },
        ],
      },
    ],
  });

  it('emits actual-notes / normal-notes / normal-type from the tuplet ratio', () => {
    const xml = generateMusicXML(tripletScore());
    const block = xml.match(/<time-modification>([\s\S]*?)<\/time-modification>/);
    expect(block).not.toBeNull();
    const content = block![1];
    expect(content).toContain('<actual-notes>3</actual-notes>');
    expect(content).toContain('<normal-notes>2</normal-notes>');
    // 3 eighths in the time of 2 eighths -> normal-type is the base value.
    expect(content).toContain('<normal-type>eighth</normal-type>');
  });

  it('emits <time-modification> on every member of the tuplet group', () => {
    const xml = generateMusicXML(tripletScore());
    const matches = xml.match(/<time-modification>/g);
    expect(matches).toHaveLength(3);
  });

  it('does not emit <time-modification> for non-tuplet notes', () => {
    const xml = generateMusicXML(singlePitchScore('C4'));
    expect(xml).not.toContain('<time-modification>');
  });
});

// ===========================================================================
// DTD child ordering of <note>
// ===========================================================================

describe('MusicXML <note> child ordering (DTD)', () => {
  // DTD order: (chord?) pitch duration tie* type dot* accidental time-modification ... notations
  const orderedScore: Score = {
    title: 'T',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 's1',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          {
            id: 'm1',
            events: [
              {
                id: 'e1',
                duration: 'quarter',
                dotted: true,
                notes: [{ id: 'n1', pitch: 'F#4', tied: true }],
              },
              {
                id: 'e2',
                duration: 'eighth',
                dotted: false,
                notes: [{ id: 'n2', pitch: 'F#4', tied: false }],
              },
              {
                id: 'e3',
                duration: 'half',
                dotted: false,
                notes: [{ id: 'n3', pitch: 'G4' }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('orders pitch < duration < tie < type < dot < accidental within a note', () => {
    const xml = generateMusicXML(orderedScore);
    const block = [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)]
      .map((m) => m[1])
      .find((b) => b.includes('<dot/>'))!; // the dotted F#4 start-tie note
    expect(block).toBeDefined();

    const iPitch = block.indexOf('<pitch>');
    const iDuration = block.indexOf('<duration>');
    const iTie = block.indexOf('<tie ');
    const iType = block.indexOf('<type>');
    const iDot = block.indexOf('<dot/>');
    const iAcc = block.indexOf('<accidental>');

    expect(iPitch).toBeLessThan(iDuration);
    expect(iDuration).toBeLessThan(iTie);
    expect(iTie).toBeLessThan(iType);
    expect(iType).toBeLessThan(iDot);
    expect(iDot).toBeLessThan(iAcc);
  });
});
