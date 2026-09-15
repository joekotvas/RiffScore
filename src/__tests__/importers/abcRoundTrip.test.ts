/**
 * ABC round trip — the exporter's dialect must import back to an equivalent score.
 *
 * The strongest oracle is the exporter itself: exporting the imported score must reproduce the
 * original ABC byte for byte (`export ∘ import ∘ export = export`). That covers pitch spelling,
 * accidental cancellation, lengths, dots, ties, tuplets, rests, bar padding, pickups, voices
 * and chord anchors at once. A structural projection then pins the fields ABC does not print
 * (clefs, pickup flags, chord anchors, metadata) and guards against a vacuous string match.
 */

import { Note } from 'tonal';
import { MELODIES } from '@/data/melodies';
import { generateABC } from '@/exporters/abcExporter';
import { parseABC } from '@/importers/abcImporter';
import type { Score } from '@/types';
import { migrateScore } from '@/types';
import { ev, score, tuplet } from '../helpers/roundTripFixtures';
import { quantizeChordAnchor } from '@/services/chord/ChordQuants';

// ---------------------------------------------------------------------------
// Projection: the fields ABC does not spell out
// ---------------------------------------------------------------------------

const project = (s: Score) => ({
  title: s.title,
  timeSignature: s.timeSignature,
  keySignature: s.keySignature,
  bpm: s.bpm,
  staves: s.staves.map((st) => ({
    clef: st.clef,
    bars: st.measures.length,
    pickups: st.measures.map((m) => !!m.isPickup),
    // Sounding pitches of every non-rest event, spelled canonically ('Fx4' and 'F##4' agree).
    pitches: st.measures.map((m) =>
      m.events
        .filter((e) => !e.isRest)
        .map((e) => e.notes.map((n) => Note.get(n.pitch!).name).sort())
    ),
    // Rests are excluded: the exporter pads under-full bars with rests, which is expected to survive.
    tuplets: st.measures.map((m) =>
      m.events
        .filter((e) => !e.isRest)
        .map((e) =>
          e.tuplet
            ? [e.tuplet.ratio[0], e.tuplet.ratio[1], e.tuplet.groupSize, e.tuplet.position]
            : null
        )
    ),
  })),
  chords: (s.chordTrack ?? [])
    .map((c) => ({ measure: c.measure, quant: quantizeChordAnchor(c.quant), symbol: c.symbol }))
    .sort((a, b) => a.measure - b.measure || a.quant - b.quant),
});

const roundTrip = (original: Score) => {
  const abc = generateABC(original, original.bpm);
  const imported = parseABC(abc);
  if (!imported.ok) throw new Error(`import failed: ${imported.error}\n${abc}`);
  return {
    abc,
    imported: imported.score,
    warnings: imported.warnings,
    again: generateABC(imported.score, imported.score.bpm),
  };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixtures: Record<string, Score> = {
  'accidentals in G major with cancellation and octave-specific memory': score(
    { keySignature: 'G' },
    {
      clef: 'treble',
      measures: [
        [ev('F#4:q'), ev('F4:q'), ev('F5:q'), ev('F#4:q')],
        [ev('F#4:q'), ev('C#5:q'), ev('C5:q'), ev('C5:q')],
      ],
    }
  ),
  'double accidentals and enharmonic spellings': score(
    {},
    {
      clef: 'treble',
      measures: [
        [ev('Fx4:q'), ev('F##4:q'), ev('Bbb3:q'), ev('Cb4:q')],
        [ev('E#4:h'), ev('B#3:h')],
      ],
    }
  ),
  'minor keys, forced accidentals and a courtesy': score(
    { keySignature: 'Dm' },
    {
      clef: 'treble',
      measures: [
        [ev('Bb4:q'), ev('Bb4!:q'), ev('B4:q'), ev('B4:q')],
        [ev('C#5:h'), ev('Bb4:h')],
      ],
    }
  ),
  'dotted values, sixteenths and a whole rest bar': score(
    {},
    {
      clef: 'treble',
      measures: [
        [ev('C4:q.'), ev('D4:8'), ev('E4:8.'), ev('F4:16'), ev('G4:q')],
        [
          ev('A4:16'),
          ev('B4:16'),
          ev('C5:16'),
          ev('D5:16'),
          ev('E5:32'),
          ev('F5:32'),
          ev('G5:32'),
          ev('A5:32'),
          ev('B5:64'),
          ev('C6:64'),
          ev('D6:32'),
          ev('E6:8'),
          ev('F6:8.'),
          ev('G6:q'),
        ],
        [ev({ rest: 'w' })],
        [],
      ],
    }
  ),
  'ties within and across bars, chord ties': score(
    {},
    {
      clef: 'treble',
      measures: [
        [ev('C4-:h'), ev('C4:q'), ev(['E4-:q', 'G4-'])],
        [ev(['E4:q', 'G4']), ev('D4-:q'), ev('D4-:q'), ev('D4:q')],
      ],
    }
  ),
  'tuplets: eighth triplet, quintuplet sixteenths, triplet with a rest': score(
    {},
    {
      clef: 'treble',
      measures: [
        [
          ...tuplet([3, 2], ['C4:8', 'D4:8', 'E4:8']),
          ev('F4:q'),
          ...tuplet([5, 4], ['G4:16', 'A4:16', 'B4:16', 'C5:16', 'D5:16']),
          ev('E5:q'),
        ],
        [...tuplet([3, 2], ['C4:8', { rest: '8' }, 'E4:8']), ev('F4:q'), ev('G4:h')],
      ],
    }
  ),
  'chord symbols on beats and inside a tuplet': score(
    {
      chords: [
        [0, 0, 'G'],
        [0, 16, 'D7'],
        [0, 32 + 16 / 3, 'Em'],
        [1, 0, 'Cmaj7'],
        [1, 24, 'Am7'],
        [1, 32, 'F#dim'],
      ],
    },
    {
      clef: 'treble',
      measures: [
        [ev('G4:q'), ev('A4:q'), ...tuplet([3, 2], ['B4:8', 'C5:8', 'D5:8']), ev('E5:q')],
        [ev('C5:q.'), ev('B4:8'), ev('A4:q'), ev({ rest: 'q' })],
      ],
    }
  ),
  'pickup bar, 3/4, grand staff with an empty bass bar': score(
    { timeSignature: '3/4', keySignature: 'F', bpm: 96, title: 'Waltz' },
    {
      clef: 'treble',
      measures: [{ pickup: [ev('C4:q')] }, [ev('F4:h'), ev('A4:q')], [ev('Bb4:h.')], [ev('A4:h')]],
    },
    {
      clef: 'bass',
      measures: [
        { pickup: [ev({ rest: 'q' })] },
        [ev(['F3:h.', 'A3'])],
        [],
        [ev('F3:q'), ev('C3:q'), ev('F2:q')],
      ],
    }
  ),
  '6/8 with dotted rhythms and a duplet': score(
    { timeSignature: '6/8', keySignature: 'D', bpm: 100 },
    {
      clef: 'treble',
      measures: [
        [ev('D4:q'), ev('E4:8'), ev('F#4:q.')],
        [...tuplet([2, 3], ['G4:8', 'A4:8']), ev('B4:q.')],
      ],
    }
  ),
  '2/4, alto and tenor clefs': score(
    { timeSignature: '2/4' },
    { clef: 'alto', measures: [[ev('C4:q'), ev('D4:q')], [ev('E4:h')]] },
    { clef: 'tenor', measures: [[ev('A3:h')], [ev('G3:q'), ev('F3:q')]] }
  ),
  'metadata round trip': (() => {
    const s = score({ title: 'Meta' }, { clef: 'treble', measures: [[ev('C4:w')]] });
    s.metadata = {
      title: 'Meta',
      composer: 'A. Composer',
      lyricist: 'A. Lyricist',
      copyright: '© 2026 Someone',
    };
    return s;
  })(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ABC round trip — synthetic fixtures', () => {
  it.each(Object.entries(fixtures))('%s', (_name, original) => {
    const { abc, imported, warnings, again } = roundTrip(original);
    expect(warnings).toEqual([]);
    expect(again).toBe(abc);
    expect(project(imported)).toEqual(project(migrateScore(original)));
  });

  it('round-trips metadata fields', () => {
    const { imported } = roundTrip(fixtures['metadata round trip']);
    expect(imported.metadata).toEqual({
      title: 'Meta',
      composer: 'A. Composer',
      lyricist: 'A. Lyricist',
      copyright: '© 2026 Someone',
    });
  });

  it('brings an empty bar back as an empty bar, and a lone written whole rest as an empty bar too', () => {
    const { imported } = roundTrip(fixtures['dotted values, sixteenths and a whole rest bar']);
    expect(imported.staves[0].measures.slice(2).map((m) => m.events.length)).toEqual([0, 0]);
  });

  it('keeps a forced (redundant) accidental visible', () => {
    const { imported } = roundTrip(fixtures['minor keys, forced accidentals and a courtesy']);
    const [bar] = imported.staves[0].measures;
    expect(bar.events[1].notes[0]).toMatchObject({ pitch: 'Bb4', accidentalDisplay: 'show' });
    expect(bar.events[0].notes[0].accidentalDisplay).toBeUndefined();
  });
});

describe('ABC round trip — bundled melodies', () => {
  it.each(MELODIES.map((m) => [m.title, m.score] as const))('%s', (_title, melody) => {
    const original = migrateScore(melody);
    const { abc, imported, warnings, again } = roundTrip(original);
    expect(warnings).toEqual([]);
    expect(again).toBe(abc);
    expect(project(imported)).toEqual(project(original));
  });
});
