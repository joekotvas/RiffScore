/**
 * MusicXML round trip — the exporter's dialect must import back to an equivalent score.
 *
 * The strongest oracle is the exporter itself: exporting the imported score must reproduce the
 * original MusicXML byte for byte (`export ∘ import ∘ export = export`). That covers pitch
 * spelling, accidental glyphs and display policies, written values, dots, ties, tuplets, rests,
 * bar padding, pickups, grand staves and chord anchors at once. A structural projection then pins
 * the fields the XML does not spell out the same way (clefs, pickup flags, chord anchors,
 * metadata) and guards against a vacuous string match.
 *
 * One deliberate normalization: a bar holding nothing but a whole-bar rest imports as the model's
 * empty bar (the exporter writes both as `<rest measure="yes"/>`), so the original is normalized
 * the same way before it is exported for comparison.
 */

import { Note } from 'tonal';
import { MELODIES } from '@/data/melodies';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { padMeasureForExport } from '@/exporters/exportNormalize';
import { parseMusicXML } from '@/importers/musicXmlImporter';
import type { Measure, Score } from '@/types';
import { ev, score, tuplet } from '../helpers/roundTripFixtures';
import { migrateScore } from '@/types';
import { getMeasureCapacity } from '@/constants';
import { sumQuants } from '@/utils/tuplet';
import { quantizeChordAnchor } from '@/services/chord/ChordQuants';
import { resolveScoreMetadata } from '@/services/MetadataService';

// ---------------------------------------------------------------------------
// Normalization and projection
// ---------------------------------------------------------------------------

/**
 * What the exporter materializes: under-full bars are padded with trailing rests, and a bar
 * holding only a whole-bar rest (with no chord symbol) is the model's empty bar.
 */
const normalize = (s: Score): Score => {
  const capacity = getMeasureCapacity(s.timeSignature);
  const chordBars = new Set((s.chordTrack ?? []).map((c) => c.measure));
  const pickupSpan = s.staves[0]?.measures[0]?.isPickup
    ? sumQuants(s.staves[0].measures[0].events).quants
    : null;
  return {
    ...s,
    staves: s.staves.map((st) => ({
      ...st,
      measures: st.measures.map((m, i): Measure => {
        const events = padMeasureForExport(m, capacity);
        const [only] = events;
        const span = i === 0 && pickupSpan ? pickupSpan : capacity;
        const wholeBarRest =
          events.length === 1 &&
          !!only.isRest &&
          !only.tuplet &&
          !chordBars.has(i) &&
          sumQuants(events).quants === span;
        return { ...m, events: wholeBarRest ? [] : events };
      }),
    })),
  };
};

const project = (s: Score) => ({
  title: s.title,
  metadata: resolveScoreMetadata(s),
  timeSignature: s.timeSignature,
  keySignature: s.keySignature,
  bpm: s.bpm,
  staves: s.staves.map((st) => ({
    clef: st.clef,
    bars: st.measures.length,
    pickups: st.measures.map((m) => !!m.isPickup),
    events: st.measures.map((m) =>
      m.events.map((e) => ({
        duration: e.duration,
        dotted: e.dotted,
        rest: !!e.isRest,
        // Sounding pitches, spelled canonically ('Fx4' and 'F##4' agree), with ties and policies.
        notes: e.isRest
          ? []
          : e.notes
              .map((n) => ({
                pitch: Note.get(n.pitch!).name,
                tied: !!n.tied,
                display: n.accidentalDisplay ?? 'auto',
              }))
              .sort((a, b) => a.pitch.localeCompare(b.pitch)),
        tuplet: e.tuplet
          ? [e.tuplet.ratio[0], e.tuplet.ratio[1], e.tuplet.groupSize, e.tuplet.position]
          : null,
      }))
    ),
  })),
  chords: (s.chordTrack ?? [])
    .map((c) => ({ measure: c.measure, quant: quantizeChordAnchor(c.quant), symbol: c.symbol }))
    .sort((a, b) => a.measure - b.measure || a.quant - b.quant),
});

const roundTrip = (original: Score) => {
  const normalized = normalize(migrateScore(original));
  const xml = generateMusicXML(normalized);
  const imported = parseMusicXML(xml);
  if (!imported.ok) throw new Error(`import failed: ${imported.error}\n${xml}`);
  return {
    xml,
    normalized,
    imported: imported.score,
    warnings: imported.warnings,
    again: generateMusicXML(imported.score),
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
        [ev('C#5:h'), ev('Bb4?:h')],
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
        [ev('C4:h'), ev({ rest: 'q' }), ev({ rest: '8' }), ev({ rest: '16' }), ev({ rest: '16' })],
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
        [
          ...tuplet([3, 2], ['C4:q', 'D4:8'], 'eighth'),
          ev('E4:h'),
          ...tuplet([3, 2], ['F4:8', 'G4:8', 'A4:8']),
        ],
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
        [2, 0, 'Bb'],
        [2, 16, 'Gm7b5'],
        [2, 32, 'C/E'],
        [2, 48, 'Dsus4'],
        [3, 0, 'Caug7'],
        [3, 16, 'Cmmaj7'],
        [3, 32, 'C5'],
        [3, 48, 'Cadd9'],
      ],
    },
    {
      clef: 'treble',
      measures: [
        [ev('G4:q'), ev('A4:q'), ...tuplet([3, 2], ['B4:8', 'C5:8', 'D5:8']), ev('E5:q')],
        [ev('C5:q.'), ev('B4:8'), ev('A4:q'), ev({ rest: 'q' })],
        [ev('Bb4:q'), ev('G4:q'), ev('E4:q'), ev('D4:q')],
        [ev('C4:q'), ev('E4:q'), ev('G4:q'), ev('B4:q')],
      ],
    }
  ),
  'a pickup bar that is nothing but rests on every staff': score(
    { timeSignature: '4/4' },
    { clef: 'treble', measures: [{ pickup: [ev({ rest: 'q' })] }, [ev('C4:w')], [ev('D4:w')]] },
    { clef: 'bass', measures: [{ pickup: [] }, [ev('C3:w')], [ev('D3:w')]] }
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

describe('MusicXML round trip — synthetic fixtures', () => {
  it.each(Object.entries(fixtures))('%s', (_name, original) => {
    const { xml, normalized, imported, warnings, again } = roundTrip(original);
    expect(warnings).toEqual([]);
    expect(again).toBe(xml);
    expect(project(imported)).toEqual(project(normalized));
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

  it('brings an empty bar and a lone whole-bar rest back as empty bars', () => {
    const { imported } = roundTrip(fixtures['dotted values, sixteenths and a whole rest bar']);
    expect(imported.staves[0].measures.slice(2, 4).map((m) => m.events.length)).toEqual([0, 0]);
  });

  it('keeps a forced (redundant) accidental visible and a courtesy parenthesized', () => {
    const { imported } = roundTrip(fixtures['minor keys, forced accidentals and a courtesy']);
    const [bar1, bar2] = imported.staves[0].measures;
    expect(bar1.events[1].notes[0]).toMatchObject({ pitch: 'Bb4', accidentalDisplay: 'show' });
    expect(bar1.events[0].notes[0].accidentalDisplay).toBeUndefined();
    expect(bar2.events[1].notes[0]).toMatchObject({ pitch: 'Bb4', accidentalDisplay: 'courtesy' });
  });

  it('keeps the base value of a non-uniform tuplet from <normal-type>', () => {
    const { imported } = roundTrip(
      fixtures['tuplets: eighth triplet, quintuplet sixteenths, triplet with a rest']
    );
    const [first, second] = imported.staves[0].measures[2].events;
    expect(first.tuplet).toMatchObject({ ratio: [3, 2], baseDuration: 'eighth' });
    expect(second.tuplet).toMatchObject({ ratio: [3, 2], baseDuration: 'eighth' });
  });

  it('restores a rest-only pickup from the implicit measure marker', () => {
    const { imported } = roundTrip(
      fixtures['a pickup bar that is nothing but rests on every staff']
    );
    expect(imported.staves.map((s) => s.measures[0].isPickup)).toEqual([true, true]);
    expect(imported.staves.map((s) => s.measures[0].events.length)).toEqual([0, 0]);
  });

  it('flags the pickup on every staff of a grand staff', () => {
    const { imported } = roundTrip(fixtures['pickup bar, 3/4, grand staff with an empty bass bar']);
    expect(imported.staves.map((s) => s.measures[0].isPickup)).toEqual([true, true]);
    expect(imported.staves.map((s) => s.measures[1].isPickup)).toEqual([undefined, undefined]);
  });
});

describe('MusicXML round trip — bundled melodies', () => {
  it.each(MELODIES.map((m) => [m.title, m.score] as const))('%s', (_title, melody) => {
    const { xml, normalized, imported, warnings, again } = roundTrip(migrateScore(melody));
    expect(warnings).toEqual([]);
    expect(again).toBe(xml);
    expect(project(imported)).toEqual(project(normalized));
  });
});
