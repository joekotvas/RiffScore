/**
 * Visual-regression fixture corpus (issue #252).
 *
 * A curated set of native `Score` objects, each exercising one corner of RiffScore's
 * CURRENT engraving envelope. These feed both lanes of the visual harness:
 *   - Lane A (jsdom): rendered and reduced to structured engraving facts, snapshotted
 *     and asserted (src/__tests__/visual/visualRegression.test.tsx).
 *   - Lane B (real browser): rendered to pixels and image-diffed; also dumped to a
 *     static HTML gallery for human eyeballing.
 *
 * DETERMINISM CONTRACT (load-bearing — see #252):
 *   - Every id is FIXED and explicit. Note/event ids leak into the SVG as `data-testid`
 *     (`note-${id}`, `chord-${eventId}`), and `createId()` is random — so a fixture must
 *     never rely on a generated id.
 *   - Fixtures are rendered PURE (load + render, no edits); an edit would mint random ids.
 *   - Fixtures must be valid/complete so `migrateScore` synthesizes nothing on load.
 *
 * COVERAGE CAVEAT: a corpus only tests what RiffScore can REPRESENT today. It tracks the
 * feature envelope, it does not lead it. Known-buggy outputs (e.g. cross-measure tie
 * layout, #249) are deliberately EXCLUDED so we don't bless a bug as "golden".
 */

import type { Score, ScoreEvent, Note } from '@/types';

export interface VisualFixture {
  /** Stable, kebab-case identifier — used as the snapshot key and gallery anchor. */
  name: string;
  /** One-line human description (shown in the gallery). */
  description: string;
  /** The score to render. All ids fixed; valid on load with no migration synthesis. */
  score: Score;
  /** Coarse tags for filtering / documentation. */
  tags: string[];
}

// --- small builders (keep fixtures terse and obviously-correct) -------------------------

let _serial = 0;
/** Deterministic unique-ish id seed for builder convenience (NOT random). */
const seq = () => (_serial++).toString(36);

const note = (pitch: string | null, extra: Partial<Note> = {}): Note => ({
  id: `n${seq()}`,
  pitch,
  ...extra,
});

const ev = (
  duration: string,
  notes: Note[],
  extra: Partial<ScoreEvent> = {}
): ScoreEvent => ({
  id: `e${seq()}`,
  duration,
  dotted: false,
  notes,
  ...extra,
});

const rest = (duration: string, extra: Partial<ScoreEvent> = {}): ScoreEvent => ({
  id: `r${seq()}`,
  duration,
  dotted: false,
  isRest: true,
  notes: [],
  ...extra,
});

/** A single-event quarter note, convenience for one-note-per-measure melodies. */
const q = (pitch: string) => ev('quarter', [note(pitch)]);

let _mid = 0;
const measure = (events: ScoreEvent[], extra: Partial<{ isPickup: boolean }> = {}) => ({
  id: `m${(_mid++).toString(36)}`,
  events,
  ...extra,
});

const score = (
  partial: Pick<Score, 'staves'> & Partial<Score>
): Score => ({
  // Title is intentionally blank: a non-empty title renders into the canvas (MetadataBlock),
  // polluting the engraving facts with a non-musical glyph and the gallery with stray text.
  // The gallery already labels each card from the fixture name/description.
  title: '',
  bpm: 120,
  timeSignature: '4/4',
  keySignature: 'C',
  ...partial,
});

const trebleStaff = (measures: ReturnType<typeof measure>[], keySignature = 'C') => ({
  id: 'staff-treble',
  clef: 'treble' as const,
  keySignature,
  measures,
});

// --- the corpus -------------------------------------------------------------------------

export const visualFixtures: VisualFixture[] = [
  {
    name: 'treble-ascending-scale',
    description: 'Treble clef, C major — an ascending C4→C5 scale in one bar (pitch-contour anchor).',
    tags: ['clef', 'treble', 'pitch-contour'],
    score: score({
      staves: [
        trebleStaff([
          // One bar of eighths so notehead x is globally monotonic (x is measure-local).
          measure(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'].map((p) => ev('eighth', [note(p)]))),
        ]),
      ],
    }),
  },
  {
    name: 'bass-clef',
    description: 'Bass clef, C major — a low ascending line.',
    tags: ['clef', 'bass'],
    score: score({
      staves: [
        {
          id: 'staff-bass',
          clef: 'bass',
          keySignature: 'C',
          measures: [measure([q('C3'), q('E3'), q('G3'), q('C4')])],
        },
      ],
    }),
  },
  {
    name: 'alto-clef-sharp-key',
    description: 'Alto (C) clef in A major (3 sharps) — guards key-sig glyph placement (#233/#235).',
    tags: ['clef', 'alto', 'key-signature', 'sharp'],
    score: score({
      keySignature: 'A',
      staves: [
        {
          id: 'staff-alto',
          clef: 'alto',
          keySignature: 'A',
          measures: [measure([q('E4'), q('F#4'), q('A4'), q('C#5')])],
        },
      ],
    }),
  },
  {
    name: 'tenor-clef-flat-key',
    description: 'Tenor (C) clef in Eb major (3 flats) — guards key-sig glyph placement (#233/#235).',
    tags: ['clef', 'tenor', 'key-signature', 'flat'],
    score: score({
      keySignature: 'Eb',
      staves: [
        {
          id: 'staff-tenor',
          clef: 'tenor',
          keySignature: 'Eb',
          measures: [measure([q('C3'), q('Eb3'), q('G3'), q('Bb3')])],
        },
      ],
    }),
  },
  {
    name: 'grand-staff',
    description: 'Grand staff (treble + bass, braced) — two-staff layout.',
    tags: ['grand-staff', 'multi-staff'],
    score: score({
      staves: [
        {
          id: 'staff-treble',
          clef: 'treble',
          keySignature: 'C',
          measures: [measure([ev('half', [note('E4'), note('G4'), note('C5')]), q('D4'), q('E4')])],
        },
        {
          id: 'staff-bass',
          clef: 'bass',
          keySignature: 'C',
          measures: [measure([ev('half', [note('C3'), note('G3')]), q('B2'), q('C3')])],
        },
      ],
    }),
  },
  {
    name: 'pickup-measure',
    description: 'Pickup (anacrusis) bar of one quarter, then a full 4/4 bar.',
    tags: ['pickup', 'anacrusis'],
    score: score({
      staves: [
        trebleStaff([
          measure([q('G4')], { isPickup: true }),
          measure([q('C5'), q('B4'), q('A4'), q('G4')]),
        ]),
      ],
    }),
  },
  {
    name: 'accidentals-display-policy',
    description:
      'Out-of-key accidentals plus accidentalDisplay policy: forced show, hidden, and courtesy (#236).',
    tags: ['accidentals', 'accidental-display'],
    score: score({
      staves: [
        trebleStaff([
          measure([
            ev('quarter', [note('F#4')]), // out-of-key sharp (drawn by default)
            ev('quarter', [note('C4', { accidentalDisplay: 'show' })]), // forced natural-position show
            ev('quarter', [note('Bb4', { accidentalDisplay: 'hide' })]), // suppressed glyph
            ev('quarter', [note('G4', { accidentalDisplay: 'courtesy' })]), // parenthesized cautionary
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'key-sharp-A-major',
    description: 'A major (3 sharps) in treble — sharp key signature.',
    tags: ['key-signature', 'sharp'],
    score: score({
      keySignature: 'A',
      staves: [trebleStaff([measure([q('A4'), q('C#5'), q('E5'), q('A5')])], 'A')],
    }),
  },
  {
    name: 'key-flat-Eb-major',
    description: 'Eb major (3 flats) in treble — flat key signature.',
    tags: ['key-signature', 'flat'],
    score: score({
      keySignature: 'Eb',
      staves: [trebleStaff([measure([q('Eb4'), q('G4'), q('Bb4'), q('Eb5')])], 'Eb')],
    }),
  },
  {
    name: 'key-minor-Em',
    description: 'E minor (1 sharp) in treble — minor key signature.',
    tags: ['key-signature', 'minor'],
    score: score({
      keySignature: 'Em',
      staves: [trebleStaff([measure([q('E4'), q('F#4'), q('G4'), q('B4')])], 'Em')],
    }),
  },
  {
    name: 'beaming-4-4',
    description: '4/4 — four straight eighths beam as one group.',
    tags: ['beaming', 'simple-meter'],
    score: score({
      timeSignature: '4/4',
      staves: [
        trebleStaff([
          measure([
            ev('eighth', [note('C4')]),
            ev('eighth', [note('D4')]),
            ev('eighth', [note('E4')]),
            ev('eighth', [note('F4')]),
            rest('half'),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'beaming-6-8',
    description: '6/8 — six eighths beam as two dotted-quarter groups of three (#241).',
    tags: ['beaming', 'compound-meter'],
    score: score({
      timeSignature: '6/8',
      staves: [
        trebleStaff([
          measure([
            ev('eighth', [note('C4')]),
            ev('eighth', [note('D4')]),
            ev('eighth', [note('E4')]),
            ev('eighth', [note('F4')]),
            ev('eighth', [note('G4')]),
            ev('eighth', [note('A4')]),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'beaming-9-8',
    description: '9/8 — nine eighths beam as three groups of three (#241).',
    tags: ['beaming', 'compound-meter'],
    score: score({
      timeSignature: '9/8',
      staves: [
        trebleStaff([
          measure(
            ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5'].map((p) =>
              ev('eighth', [note(p)])
            )
          ),
        ]),
      ],
    }),
  },
  {
    name: 'beaming-12-8',
    description: '12/8 — twelve eighths beam as four groups of three (#241).',
    tags: ['beaming', 'compound-meter'],
    score: score({
      timeSignature: '12/8',
      staves: [
        trebleStaff([
          measure(
            ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'].map((p) =>
              ev('eighth', [note(p)])
            )
          ),
        ]),
      ],
    }),
  },
  {
    name: 'beaming-3-8',
    description: '3/8 — three eighths beam as a single whole-bar group (#241).',
    tags: ['beaming', 'compound-meter'],
    score: score({
      timeSignature: '3/8',
      staves: [
        trebleStaff([
          measure([
            ev('eighth', [note('C4')]),
            ev('eighth', [note('D4')]),
            ev('eighth', [note('E4')]),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'triplet-complete',
    description: 'A complete eighth-note triplet (3:2) plus a quarter — bracket reads "3".',
    tags: ['tuplet', 'triplet'],
    score: score({
      staves: [
        trebleStaff([
          measure([
            ev('eighth', [note('C4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 0 } }),
            ev('eighth', [note('D4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 1 } }),
            ev('eighth', [note('E4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 2 } }),
            q('F4'),
            rest('half'),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'triplet-unbeamed-quarters',
    description: 'A quarter-note triplet (3:2) — UNBEAMED, so the bracket uses the stem-tip contour.',
    tags: ['tuplet', 'triplet', 'unbeamed'],
    score: score({
      staves: [
        trebleStaff([
          measure([
            ev('quarter', [note('C4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 0 } }),
            ev('quarter', [note('E4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 1 } }),
            ev('quarter', [note('G4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 2 } }),
            rest('half'),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'triplet-high-stems-down',
    description: 'A high eighth-note triplet (stems down, beam below) — guards the down-side bracket.',
    tags: ['tuplet', 'triplet', 'stems-down'],
    score: score({
      staves: [
        trebleStaff([
          measure([
            ev('eighth', [note('A5')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 0 } }),
            ev('eighth', [note('G5')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 1 } }),
            ev('eighth', [note('F5')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 2 } }),
            q('E5'),
            rest('half'),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'chord-triad',
    description: 'A four-beat chord measure — stacked triads share one stem.',
    tags: ['chord'],
    score: score({
      staves: [
        trebleStaff([
          measure([
            ev('quarter', [note('C4'), note('E4'), note('G4')]),
            ev('quarter', [note('D4'), note('F4'), note('A4')]),
            ev('half', [note('E4'), note('G4'), note('C5')]),
          ]),
        ]),
      ],
    }),
  },
  {
    name: 'rests-all-durations',
    description: 'Whole-ish bar of assorted rests — whole/half/quarter/eighth glyphs.',
    tags: ['rests'],
    score: score({
      staves: [
        trebleStaff([
          measure([rest('quarter'), rest('eighth'), rest('eighth'), rest('quarter'), rest('quarter')]),
        ]),
      ],
    }),
  },
  {
    name: 'justification-multi-measure',
    description: 'Four measures of differing densities — exercises system justification/stretch.',
    tags: ['justification', 'layout'],
    score: score({
      staves: [
        trebleStaff([
          measure([ev('whole', [note('C4')])]),
          measure([q('C4'), q('D4'), q('E4'), q('F4')]),
          measure([ev('half', [note('G4')]), ev('half', [note('A4')])]),
          measure(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'].map((p) => ev('eighth', [note(p)]))),
        ]),
      ],
    }),
  },
];

/** Lookup by name (used by the gallery + targeted oracle assertions). */
export const fixtureByName = (name: string): VisualFixture => {
  const f = visualFixtures.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown visual fixture: ${name}`);
  return f;
};
