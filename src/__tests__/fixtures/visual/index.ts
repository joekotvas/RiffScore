/**
 * Visual-regression fixture corpus (issue #252).
 *
 * Each fixture is a FOCUSED scenario — split at natural seams so a regression points at one
 * thing, while related fixtures share a `feature` so the gallery can group/filter them.
 * Packing works WITH the model:
 *   - per-event features (accidentals, durations, tuplets, chords, ledgers) use a measure or
 *     two;
 *   - clef/key vary per STAFF;
 *   - time signature is score-level, so beaming is one fixture PER METER.
 *
 * Every fixture carries `feature` (gallery grouping + filter) and `covers` (the scenarios it
 * exercises — fed into the gallery search and shown as a caption).
 *
 * DETERMINISM CONTRACT (load-bearing — see #252): every id is FIXED (note/event ids leak
 * into the SVG as data-testid and createId() is random); fixtures render PURE (no edits) and
 * must be valid so `migrateScore` synthesizes nothing.
 *
 * COVERAGE CAVEAT: only what RiffScore renders CORRECTLY today. Known-buggy/incomplete output
 * is excluded so we don't bless it: cross-measure ties (#249).
 *
 * Non-triplet tuplets (duplet/quintuplet/sextuplet/septuplet/quadruplet) and edge cases
 * (16th/quarter bases, mid-bar, beat-spanning, rest/chord inside, compound meter, stems-down,
 * non-uniform members) ARE now included — the gallery review + render-free oracles
 * (tupletFixtureOracles.test.ts) verified the layout engine draws the correct bracket number and
 * beams around interior rests (#245 re-scoped to RENDERING-done). #237 (exact internal tuplet
 * quant precision) is orthogonal and still open — it doesn't affect the rendered layout here.
 */

import type { Score, ScoreEvent, Note, Staff } from '@/types';

export interface VisualFixture {
  name: string; // stable, kebab/id-safe (no '#' '/') — snapshot key + gallery anchor + baseline
  feature: string; // gallery section + filter chip
  description: string;
  covers: string[]; // scenarios/edge cases (search text + gallery caption)
  tags: string[];
  score: Score;
}

// --- terse, obviously-correct builders --------------------------------------------------

let _serial = 0;
const seq = () => (_serial++).toString(36);
let _mid = 0;
const mid = () => (_mid++).toString(36);

const note = (pitch: string | null, extra: Partial<Note> = {}): Note => ({ id: `n${seq()}`, pitch, ...extra });
const ev = (duration: string, notes: Note[], extra: Partial<ScoreEvent> = {}): ScoreEvent => ({
  id: `e${seq()}`,
  duration,
  dotted: false,
  notes,
  ...extra,
});
const dot = (duration: string, notes: Note[], extra: Partial<ScoreEvent> = {}) =>
  ev(duration, notes, { dotted: true, ...extra });
const rest = (duration: string, extra: Partial<ScoreEvent> = {}): ScoreEvent => ({
  id: `r${seq()}`,
  duration,
  dotted: false,
  isRest: true,
  notes: [],
  ...extra,
});
const q = (p: string) => ev('quarter', [note(p)]);
const e = (p: string) => ev('eighth', [note(p)]);
const s = (p: string) => ev('sixteenth', [note(p)]);
const chord = (duration: string, pitches: string[], extra: Partial<ScoreEvent> = {}) =>
  ev(duration, pitches.map((p) => note(p)), extra);
const trip = (duration: string, notes: Note[], position: number, extra: Partial<ScoreEvent> = {}) =>
  ev(duration, notes, { tuplet: { ratio: [3, 2], groupSize: 3, position }, ...extra });

/**
 * A COMPLETE tuplet group: one event per member, positions auto-assigned 0..n-1, groupSize = the
 * member count. `ratio` is [actual notes, in space of N]; defaults to a triplet. Each member is a
 * pitch string, a pitch array (chord), a `Note` (to carry tied/accidental), or null (a rest member).
 * Used by the extended tuplet stress fixtures to exercise the layout engine across ratios/contents.
 */
const tupg = (
  duration: string,
  members: Array<string | string[] | Note | null>,
  ratio: [number, number] = [3, 2]
): ScoreEvent[] =>
  members.map((m, position) => {
    const notes: Note[] =
      m === null ? [] : Array.isArray(m) ? m.map((p) => note(p)) : typeof m === 'string' ? [note(m)] : [m];
    return ev(duration, notes, {
      tuplet: { ratio, groupSize: members.length, position },
      ...(m === null ? { isRest: true } : {}),
    });
  });

type Measure = Staff['measures'][number];
const measure = (events: ScoreEvent[], extra: { isPickup?: boolean } = {}): Measure => ({
  id: `m${mid()}`,
  events,
  ...extra,
});
const staff = (id: string, clef: Staff['clef'], keySignature: string, measures: Measure[]): Staff => ({
  id,
  clef,
  keySignature,
  measures,
});
const score = (partial: Pick<Score, 'staves'> & Partial<Score>): Score => ({
  title: '',
  bpm: 120,
  timeSignature: '4/4',
  keySignature: 'C',
  ...partial,
});
const trebleStaff = (measures: Measure[], keySignature = 'C') =>
  staff('staff-treble', 'treble', keySignature, measures);
/** One bar of eighths over the given pitches. */
const eighthBar = (pitches: string[]) => measure(pitches.map((p) => e(p)));

/** A simple single-treble-staff fixture in C, one or more measures. */
const treble = (
  name: string,
  feature: string,
  description: string,
  covers: string[],
  tags: string[],
  measures: Measure[],
  timeSignature = '4/4',
  keySignature = 'C'
): VisualFixture => ({
  name,
  feature,
  description,
  covers,
  tags,
  score: score({ timeSignature, keySignature, staves: [trebleStaff(measures, keySignature)] }),
});

// --- generated families ----------------------------------------------------------------

/** Make `name` id-safe: '#'→'sharp' (and keep flats 'b' as-is). */
const idSafe = (k: string) => k.replace(/#/g, 'sharp');

const clefFixture = (clef: Staff['clef'], pitches: string[]): VisualFixture => ({
  name: `clef-${clef}`,
  feature: 'Clefs',
  description: `${clef[0].toUpperCase()}${clef.slice(1)} clef — an ascending one-octave scale.`,
  covers: [`${clef} clef glyph`, 'note positioning', 'staff lines'],
  tags: ['clef', clef],
  score: score({ staves: [staff(`staff-${clef}`, clef, 'C', [eighthBar(pitches)])] }),
});

const keyFixture = (
  keySig: string,
  tonicPitch: string,
  mode: 'major' | 'minor',
  accDesc: string
): VisualFixture => {
  // Derive the family from accDesc, NOT the key string: sharp keys like G/D/A/E/B contain
  // no '#', and 'b' appears in flat keys only as a lowercase suffix — regex-deriving would
  // mis-tag B major (5 sharps) as "natural".
  const family = accDesc.includes('sharp') ? 'sharp' : accDesc.includes('flat') ? 'flat' : 'natural';
  return {
    name: `key-${idSafe(keySig)}-${mode}`,
    feature: 'Key signatures',
    description: `${keySig.replace('m', '')} ${mode} — ${accDesc}.`,
    covers: [accDesc, `${keySig.replace('m', '')} ${mode}`, 'key-signature glyph placement'],
    tags: ['key-signature', mode, family],
    score: score({ keySignature: keySig, staves: [staff('staff-0', 'treble', keySig, [measure([ev('whole', [note(tonicPitch)])])])] }),
  };
};

const SHARP_KEYS: Array<[string, string, string]> = [
  ['G', 'G4', '1 sharp'],
  ['D', 'D4', '2 sharps'],
  ['A', 'A4', '3 sharps'],
  ['E', 'E4', '4 sharps'],
  ['B', 'B4', '5 sharps'],
  ['F#', 'F#4', '6 sharps'],
  ['C#', 'C#4', '7 sharps'],
];
const FLAT_KEYS: Array<[string, string, string]> = [
  ['F', 'F4', '1 flat'],
  ['Bb', 'Bb4', '2 flats'],
  ['Eb', 'Eb4', '3 flats'],
  ['Ab', 'Ab4', '4 flats'],
  ['Db', 'Db4', '5 flats'],
  ['Gb', 'Gb4', '6 flats'],
  ['Cb', 'Cb4', '7 flats (enharmonic)'],
];
const MINOR_KEYS: Array<[string, string, string]> = [
  ['Am', 'A4', 'no accidentals'],
  ['Em', 'E4', '1 sharp'],
  ['Bm', 'B4', '2 sharps'],
  ['F#m', 'F#4', '3 sharps'],
  ['Dm', 'D4', '1 flat'],
  ['Gm', 'G4', '2 flats'],
  ['Cm', 'C4', '3 flats'],
];

// =======================================================================================
// THE CORPUS
// =======================================================================================

export const visualFixtures: VisualFixture[] = [
  // --- Clefs ---------------------------------------------------------------------------
  clefFixture('treble', ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']),
  clefFixture('bass', ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']),
  clefFixture('alto', ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']),
  clefFixture('tenor', ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']),

  // --- Key signatures (one per key) ----------------------------------------------------
  ...SHARP_KEYS.map(([k, p, d]) => keyFixture(k, p, 'major', d)),
  ...FLAT_KEYS.map(([k, p, d]) => keyFixture(k, p, 'major', d)),
  ...MINOR_KEYS.map(([k, p, d]) => keyFixture(k, p, 'minor', d)),
  {
    name: 'key-placement-all-clefs',
    feature: 'Key signatures',
    description: 'A major (3 sharps) on every clef — compares key-sig glyph placement across clefs (#233/#235).',
    covers: ['placement on treble', 'on bass', 'on alto', 'on tenor'],
    tags: ['key-signature', 'placement', 'clef', 'sharp'],
    score: score({
      keySignature: 'A',
      staves: [
        staff('staff-treble', 'treble', 'A', [measure([chord('whole', ['A4', 'C#5', 'E5'])])]),
        staff('staff-bass', 'bass', 'A', [measure([chord('whole', ['A2', 'C#3', 'E3'])])]),
        staff('staff-alto', 'alto', 'A', [measure([chord('whole', ['A3', 'C#4', 'E4'])])]),
        staff('staff-tenor', 'tenor', 'A', [measure([chord('whole', ['A3', 'C#4', 'E4'])])]),
      ],
    }),
  },

  // --- Accidentals ---------------------------------------------------------------------
  treble('accidentals-basic', 'Accidentals', 'Out-of-key sharps and flats.', ['sharp', 'flat'], ['accidentals', 'sharp', 'flat'], [
    measure([q('F#4'), q('Bb4'), q('G#4'), q('Eb5')]),
  ]),
  treble('accidentals-double', 'Accidentals', 'Double sharp and double flat.', ['double sharp', 'double flat'], ['accidentals', 'double-accidental'], [
    measure([q('F##4'), q('Bbb4'), q('C4'), q('E4')]),
  ]),
  treble('accidentals-cancellation', 'Accidentals', 'Measure-local accidental memory: sharp, natural cancels, sharp again, natural.', ['natural cancels a prior accidental', 'measure-local memory'], ['accidentals', 'natural', 'cancellation'], [
    measure([q('F#4'), q('F4'), q('F#4'), q('F4')]),
  ]),
  treble('accidentals-display', 'Accidentals', 'accidentalDisplay policy: default, forced show, hidden, parenthesized courtesy (#236).', ["show (forced)", "hide (suppressed)", 'courtesy (parenthesized)'], ['accidentals', 'accidental-display'], [
    measure([
      ev('quarter', [note('C#5')]),
      ev('quarter', [note('C5', { accidentalDisplay: 'show' })]),
      ev('quarter', [note('Bb4', { accidentalDisplay: 'hide' })]),
      ev('quarter', [note('G4', { accidentalDisplay: 'courtesy' })]),
    ]),
  ]),

  // --- Durations & rests ---------------------------------------------------------------
  treble('note-values', 'Durations & rests', 'Whole, half, and quarter noteheads.', ['whole note', 'half note', 'quarter note'], ['duration', 'notehead'], [
    measure([ev('whole', [note('G4')])]),
    measure([ev('half', [note('G4')]), ev('half', [note('A4')])]),
    measure([q('G4'), q('A4'), q('B4'), q('C5')]),
  ]),
  treble('eighth-notes', 'Durations & rests', 'Eighth notes beamed by the beat.', ['eighth notehead', 'beaming'], ['duration', 'eighth', 'beam'], [
    eighthBar(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']),
  ]),
  treble('sixteenth-notes', 'Durations & rests', 'Sixteenth notes beamed in groups of four.', ['sixteenth notehead', 'secondary beam'], ['duration', 'sixteenth', 'beam'], [
    measure(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6', 'D6'].map((p) => s(p))),
  ]),
  treble('dotted-rhythms', 'Durations & rests', 'Dotted notes — augmentation dots.', ['dotted half', 'dotted quarter'], ['duration', 'dotted', 'augmentation-dot'], [
    measure([dot('half', [note('G4')]), q('A4')]),
    measure([dot('quarter', [note('C4')]), e('D4'), dot('quarter', [note('E4')]), e('F4')]),
  ]),
  treble('rests', 'Durations & rests', 'Rest glyphs for every duration (whole-bar whole rest is centered).', ['whole rest', 'half rest', 'quarter rest', 'eighth rest', 'sixteenth rest', 'whole-bar rest centered'], ['rest'], [
    measure([rest('whole')]),
    measure([rest('half'), rest('quarter'), rest('quarter')]),
    measure([rest('quarter'), rest('eighth'), rest('sixteenth'), rest('sixteenth'), rest('quarter'), rest('quarter')]),
  ]),
  treble('rests-short', 'Durations & rests', '32nd and 64th rest glyphs.', ['32nd rest', '64th rest'], ['rest', 'thirtysecond', 'sixtyfourth'], [
    // 4 × 32nd (8q) + 8 × 64th (8q) + half (32q) + quarter (16q) = 64q = a full 4/4 bar
    measure([
      ...Array.from({ length: 4 }, () => rest('thirtysecond')),
      ...Array.from({ length: 8 }, () => rest('sixtyfourth')),
      rest('half'),
      rest('quarter'),
    ]),
  ]),
  treble('dotted-rests', 'Durations & rests', 'A dotted-quarter rest with an eighth and half rest.', ['dotted rest'], ['rest', 'dotted'], [
    measure([rest('quarter', { dotted: true }), rest('eighth'), rest('half')]),
  ]),

  // --- Beaming (one fixture per meter) -------------------------------------------------
  treble('beaming-4-4', 'Beaming', '4/4 — eighths beam in pairs by the quarter beat.', ['four beat-groups of two'], ['beaming', 'simple-meter', '4/4'], [
    eighthBar(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']),
  ], '4/4'),
  treble('beaming-2-4', 'Beaming', '2/4 — two beat-groups of two eighths.', ['two beat-groups'], ['beaming', 'simple-meter', '2/4'], [
    eighthBar(['C4', 'D4', 'E4', 'F4']),
  ], '2/4'),
  treble('beaming-3-4', 'Beaming', '3/4 — three beat-groups of two eighths (NOT a whole-bar beam).', ['three beat-groups', 'simple triple'], ['beaming', 'simple-meter', '3/4'], [
    eighthBar(['C4', 'D4', 'E4', 'F4', 'G4', 'A4']),
  ], '3/4'),
  treble('beaming-6-8', 'Beaming', '6/8 — two dotted-quarter groups of three (#241).', ['two groups of three', 'compound'], ['beaming', 'compound-meter', '6/8'], [
    eighthBar(['C4', 'D4', 'E4', 'F4', 'G4', 'A4']),
  ], '6/8'),
  treble('beaming-9-8', 'Beaming', '9/8 — three groups of three (#241).', ['three groups of three', 'compound'], ['beaming', 'compound-meter', '9/8'], [
    eighthBar(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5']),
  ], '9/8'),
  treble('beaming-12-8', 'Beaming', '12/8 — four groups of three; multi-digit time signature.', ['four groups of three', 'multi-digit "12" numerator'], ['beaming', 'compound-meter', '12/8', 'time-signature'], [
    measure(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F5', 'G5'].map((p) => e(p))),
  ], '12/8'),
  treble('beaming-3-8', 'Beaming', '3/8 — three eighths beam as a single whole-bar group (#241).', ['whole-bar single group'], ['beaming', 'compound-meter', '3/8'], [
    eighthBar(['C4', 'D4', 'E4']),
  ], '3/8'),

  // --- Tuplets -------------------------------------------------------------------------
  treble('tuplet-eighth-triplet', 'Tuplets', 'A beamed eighth-note triplet — bracket parallels the beam, reads "3".', ['beamed triplet', 'bracket parallel to beam'], ['tuplet', 'triplet'], [
    measure([trip('eighth', [note('C4')], 0), trip('eighth', [note('D4')], 1), trip('eighth', [note('E4')], 2), q('F4'), rest('half')]),
  ]),
  treble('tuplet-quarter-triplet', 'Tuplets', 'An unbeamed quarter-note triplet — bracket follows the stem-tip contour.', ['unbeamed triplet', 'stem-tip contour'], ['tuplet', 'triplet', 'unbeamed'], [
    measure([trip('quarter', [note('C4')], 0), trip('quarter', [note('E4')], 1), trip('quarter', [note('G4')], 2), rest('half')]),
  ]),
  treble('tuplet-stems-down', 'Tuplets', 'A high triplet (stems down, beam below) — bracket sits below.', ['stems down', 'bracket below the beam'], ['tuplet', 'triplet', 'stems-down'], [
    measure([trip('eighth', [note('A5')], 0), trip('eighth', [note('G5')], 1), trip('eighth', [note('F5')], 2), q('E5'), rest('half')]),
  ]),
  treble('tuplet-with-rest', 'Tuplets', 'A triplet containing a rest.', ['triplet with a rest'], ['tuplet', 'triplet', 'rest'], [
    measure([trip('eighth', [note('C4')], 0), trip('eighth', [], 1, { isRest: true }), trip('eighth', [note('E4')], 2), q('F4'), rest('half')]),
  ]),

  // --- Chords --------------------------------------------------------------------------
  treble('chords-triads', 'Chords', 'Root-position triads sharing one stem.', ['triads', 'shared stem'], ['chord'], [
    measure([chord('quarter', ['C4', 'E4', 'G4']), chord('quarter', ['D4', 'F4', 'A4']), chord('half', ['E4', 'G4', 'C5'])]),
  ]),
  treble('chords-seconds', 'Chords', 'Second intervals — noteheads offset to opposite sides of the stem.', ['second-interval notehead offset'], ['chord', 'second-interval'], [
    measure([chord('quarter', ['C4', 'D4']), chord('quarter', ['E4', 'F4']), chord('half', ['G4', 'A4'])]),
  ]),
  treble('chords-accidentals', 'Chords', 'Chords with accidentals on some chord tones.', ['accidentals within a chord'], ['chord', 'accidentals'], [
    measure([chord('quarter', ['C4', 'E4', 'G#4']), chord('quarter', ['F4', 'A4', 'C#5']), chord('half', ['D4', 'F#4', 'A4'])]),
  ]),
  treble('chords-wide', 'Chords', 'A wide chord spanning a ledger line below.', ['wide chord', 'ledger inside a chord'], ['chord', 'ledger'], [
    measure([chord('whole', ['C4', 'E4', 'G4', 'C5', 'E5'])]),
  ]),

  // --- Ties ----------------------------------------------------------------------------
  treble('tie-low', 'Ties', 'A within-measure tie on a low note (curve below). Cross-measure ties excluded (#249).', ['within-measure tie', 'curve below'], ['tie'], [
    measure([ev('half', [note('C4', { tied: true })]), ev('half', [note('C4')])]),
  ]),
  treble('tie-high', 'Ties', 'A within-measure tie on a high note (curve above).', ['within-measure tie', 'curve above'], ['tie'], [
    measure([ev('half', [note('G5', { tied: true })]), ev('half', [note('G5')])]),
  ]),

  // --- Ledger lines --------------------------------------------------------------------
  treble('ledger-above', 'Ledger lines', 'Notes high above the staff — multiple ledger lines above.', ['multiple ledgers above'], ['ledger'], [
    measure([q('C6'), q('E6'), q('G6'), q('A6')]),
  ]),
  treble('ledger-below', 'Ledger lines', 'Notes far below the staff — multiple ledger lines below.', ['multiple ledgers below'], ['ledger'], [
    measure([q('A3'), q('F3'), q('D3'), q('C3')]),
  ]),
  treble('ledger-whole-note', 'Ledger lines', 'Whole notes on ledger lines — the ledger must peek past the wide head.', ['whole-note ledger width'], ['ledger', 'whole-note'], [
    measure([ev('whole', [note('C4')])]),
    measure([ev('whole', [note('C6')])]),
  ]),

  // --- Grand staff ---------------------------------------------------------------------
  {
    name: 'grand-staff',
    feature: 'Grand staff',
    description: 'Braced treble + bass with independent content (chords above, bass line below).',
    covers: ['two-staff brace', 'chords on the treble', 'independent bass line'],
    tags: ['grand-staff', 'multi-staff'],
    score: score({
      staves: [
        staff('staff-treble', 'treble', 'C', [measure([chord('half', ['E4', 'G4', 'C5']), q('D4'), q('E4')])]),
        staff('staff-bass', 'bass', 'C', [measure([ev('half', [note('C3'), note('G3')]), q('B2'), q('C3')])]),
      ],
    }),
  },

  // --- Layout --------------------------------------------------------------------------
  treble('pickup-measure', 'Layout', 'A pickup (anacrusis) bar before a full bar.', ['pickup / anacrusis'], ['pickup', 'anacrusis', 'layout'], [
    measure([q('G4')], { isPickup: true }),
    measure([q('C5'), q('B4'), q('A4'), q('G4')]),
  ]),
  treble('justification', 'Layout', 'Measures of differing density — exercises system justification/stretch.', ['sparse vs dense measures', 'justification / stretch'], ['justification', 'layout'], [
    measure([ev('whole', [note('C4')])]),
    measure([q('C4'), q('D4'), q('E4'), q('F4')]),
    eighthBar(['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4']),
  ]),

  // --- Tuplets (extended set) ----------------------------------------------------------
  // Appended (not spliced into the Tuplets block above) so existing fixtures keep their fixed ids;
  // the gallery groups by `feature`, so these still render under "Tuplets". These put the tuplet
  // LAYOUT engine through its paces: bracket placement/angle, beam interaction, stem-direction
  // conflicts, brackets over rests/chords/ties/ledgers, adjacent groups, half-bar groups, compound
  // meters, and the non-triplet ratios. The `stress` tag marks the non-triplet/edge cases that the
  // #245 caveat once excluded; the gallery review + tupletFixtureOracles.test.ts verified they render
  // correctly, so they're now blessed (committed pixel baselines). #237 (internal quant precision) is
  // orthogonal and still open.
  treble('tuplet-sixteenth-triplet', 'Tuplets', 'Four sixteenth-note triplets — fast groups with a primary + secondary beam under one bracket each.', ['sixteenth triplet', 'secondary beam under bracket', 'four adjacent groups'], ['tuplet', 'triplet', 'sixteenth', 'beam'], [
    measure([...tupg('sixteenth', ['C5', 'D5', 'E5']), ...tupg('sixteenth', ['F5', 'E5', 'D5']), ...tupg('sixteenth', ['C5', 'D5', 'E5']), ...tupg('sixteenth', ['F5', 'G5', 'A5']), rest('half')]),
  ]),
  treble('tuplet-two-eighth-triplets', 'Tuplets', 'Two back-to-back eighth-note triplets — adjacent brackets must not collide or merge.', ['two adjacent triplets', 'independent brackets'], ['tuplet', 'triplet', 'adjacent'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4']), ...tupg('eighth', ['F4', 'G4', 'A4']), rest('half')]),
  ]),
  treble('tuplet-adjacent-to-eighths', 'Tuplets', 'An eighth triplet immediately followed by a plain beamed eighth group — tuplet vs non-tuplet beam-group boundary.', ['triplet beside a normal beam group', 'beam-group boundary'], ['tuplet', 'triplet', 'beam', 'mixed'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4']), e('F4'), e('G4'), e('A4'), e('B4'), rest('quarter')]),
  ]),
  treble('tuplet-chords', 'Tuplets', 'An eighth-note triplet of chords — shared stems within the group, bracket clears the chord stack.', ['triplet of chords', 'bracket over chords'], ['tuplet', 'triplet', 'chord'], [
    measure([...tupg('eighth', [['C4', 'E4'], ['D4', 'F4'], ['E4', 'G4']]), rest('half'), rest('quarter')]),
  ]),
  treble('tuplet-accidentals', 'Tuplets', 'A triplet whose members carry accidentals — spacing must absorb the glyphs without skewing the bracket.', ['accidentals inside a tuplet', 'bracket spacing with accidentals'], ['tuplet', 'triplet', 'accidentals'], [
    measure([...tupg('eighth', ['F#4', 'Ab4', 'B4']), q('C5'), rest('half')]),
  ]),
  treble('tuplet-tie-within', 'Tuplets', 'A tie between two members of one triplet (slur-vs-tie + bracket coexistence).', ['tie inside a tuplet', 'tie under the bracket'], ['tuplet', 'triplet', 'tie'], [
    measure([
      ev('eighth', [note('C4', { tied: true })], { tuplet: { ratio: [3, 2], groupSize: 3, position: 0 } }),
      ev('eighth', [note('C4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 1 } }),
      ev('eighth', [note('E4')], { tuplet: { ratio: [3, 2], groupSize: 3, position: 2 } }),
      q('F4'),
      rest('half'),
    ]),
  ]),
  treble('tuplet-ledger-high', 'Tuplets', 'A triplet high above the staff — bracket sits clear above the ledger lines.', ['triplet on ledger lines', 'bracket above ledgers'], ['tuplet', 'triplet', 'ledger'], [
    measure([...tupg('eighth', ['A5', 'C6', 'E6']), q('G5'), rest('half')]),
  ]),
  treble('tuplet-mixed-stems', 'Tuplets', 'A triplet straddling the middle line — members want opposite stem directions; the group must pick one.', ['stem-direction conflict within a group', 'forced common stem'], ['tuplet', 'triplet', 'stems'], [
    measure([...tupg('eighth', ['G4', 'B4', 'D5']), q('C5'), rest('half')]),
  ]),
  treble('tuplet-half-triplet', 'Tuplets', 'A half-note triplet filling the whole bar — a wide unbeamed bracket spanning three stems.', ['half-note triplet', 'full-bar bracket', 'unbeamed contour'], ['tuplet', 'triplet', 'half', 'unbeamed'], [
    measure([...tupg('half', ['C4', 'E4', 'G4'])]),
  ]),
  treble('tuplet-two-quarter-triplets', 'Tuplets', 'Two quarter-note triplets filling the bar — two wide unbeamed brackets side by side.', ['two unbeamed triplets', 'side-by-side brackets'], ['tuplet', 'triplet', 'quarter', 'unbeamed'], [
    measure([...tupg('quarter', ['C4', 'D4', 'E4']), ...tupg('quarter', ['F4', 'G4', 'A4'])]),
  ]),
  treble('tuplet-triplets-6-8', 'Tuplets', 'Three eighth-note triplets in 6/8 — triplet subdivision against a compound (dotted-quarter) pulse.', ['triplet against compound pulse', '6/8 with triplets'], ['tuplet', 'triplet', 'compound-meter', '6/8'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4']), ...tupg('eighth', ['F4', 'G4', 'A4']), ...tupg('eighth', ['B4', 'C5', 'D5'])]),
  ], '6/8'),
  treble('tuplet-duplet-6-8', 'Tuplets', 'A duplet (2 in the space of 3) in 6/8 — the classic compound-meter borrowed division. Non-triplet ratio (#245).', ['duplet 2:3', 'compound-meter borrowing'], ['tuplet', 'duplet', 'compound-meter', '6/8', 'stress'], [
    measure([...tupg('eighth', ['C5', 'A4'], [2, 3]), rest('quarter', { dotted: true })]),
  ], '6/8'),
  treble('tuplet-quintuplet', 'Tuplets', 'An eighth-note quintuplet (5 in the space of 4). STRESS: non-triplet ratio the engine does not fully support yet (#245/#237).', ['quintuplet 5:4', 'reads "5"'], ['tuplet', 'quintuplet', 'stress', 'wip'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4', 'F4', 'G4'], [5, 4]), rest('half')]),
  ]),
  treble('tuplet-sextuplet', 'Tuplets', 'An eighth-note sextuplet (6 in the space of 4). STRESS: non-triplet ratio (#245/#237).', ['sextuplet 6:4', 'reads "6"'], ['tuplet', 'sextuplet', 'stress', 'wip'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4', 'F4', 'G4', 'A4'], [6, 4]), rest('half')]),
  ]),
  treble('tuplet-septuplet', 'Tuplets', 'An eighth-note septuplet (7 in the space of 4). STRESS: non-triplet ratio (#245/#237).', ['septuplet 7:4', 'reads "7"'], ['tuplet', 'septuplet', 'stress', 'wip'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'], [7, 4]), rest('half')]),
  ]),

  // --- Tuplets (edge-case probes) ------------------------------------------------------
  // The corners NOT covered by the stress set above: non-triplet ratios on OTHER bases
  // (16th/quarter), mid-bar / beat-spanning placement, rests & chords INSIDE a non-triplet group,
  // a deeper compound-meter division (4:3), and a non-uniform (mixed-duration) tuplet — the case
  // most likely to collide with the model's uniform-member assumption (cf. isUniformTupletSelection).
  treble('tuplet-quintuplet-sixteenth', 'Tuplets', 'A sixteenth-note quintuplet (5:4) — quintuplet number over a primary + secondary beam. EDGE: non-triplet on a 16th base (#245/#237).', ['16th quintuplet', 'secondary beam under "5"'], ['tuplet', 'quintuplet', 'sixteenth', 'stress', 'edge'], [
    measure([...tupg('sixteenth', ['C5', 'D5', 'E5', 'F5', 'G5'], [5, 4]), rest('half'), rest('quarter')]),
  ]),
  treble('tuplet-quintuplet-quarter', 'Tuplets', 'A quarter-note quintuplet (5:4) filling the whole bar — an unbeamed quintuplet, wide bracket over five stems. EDGE (#245/#237).', ['quarter quintuplet', 'unbeamed, full-bar bracket'], ['tuplet', 'quintuplet', 'quarter', 'unbeamed', 'stress', 'edge'], [
    measure([...tupg('quarter', ['C4', 'D4', 'E4', 'F4', 'G4'], [5, 4])]),
  ]),
  treble('tuplet-sextuplet-sixteenth', 'Tuplets', 'A sixteenth-note sextuplet (6:4) — tests secondary-beam grouping (3+3 vs 2+2+2) under "6". EDGE (#245/#237).', ['16th sextuplet', 'secondary-beam grouping'], ['tuplet', 'sextuplet', 'sixteenth', 'stress', 'edge'], [
    measure([...tupg('sixteenth', ['C5', 'D5', 'E5', 'F5', 'G5', 'A5'], [6, 4]), rest('half'), rest('quarter')]),
  ]),
  treble('tuplet-midbar-quintuplet', 'Tuplets', 'A quarter note then an eighth quintuplet — the group starts on beat 2, not the barline. EDGE: non-bar-start placement.', ['quintuplet starting mid-bar', 'bracket offset from barline'], ['tuplet', 'quintuplet', 'placement', 'stress', 'edge'], [
    measure([q('C4'), ...tupg('eighth', ['D4', 'E4', 'F4', 'G4', 'A4'], [5, 4]), rest('quarter')]),
  ]),
  treble('tuplet-beat-spanning-triplet', 'Tuplets', 'An eighth, then an eighth triplet starting on the "and" — the triplet straddles the beat-1/2 boundary.', ['triplet crossing a beat boundary', 'off-beat tuplet start'], ['tuplet', 'triplet', 'placement', 'beam', 'edge'], [
    measure([e('C4'), ...tupg('eighth', ['D4', 'E4', 'F4']), e('G4'), rest('half')]),
  ]),
  treble('tuplet-quintuplet-with-rest', 'Tuplets', 'A quintuplet with a rest as its middle member — bracket spans the rest. EDGE: rest inside a non-triplet group.', ['rest inside a quintuplet', 'bracket over a rest member'], ['tuplet', 'quintuplet', 'rest', 'stress', 'edge'], [
    measure([...tupg('eighth', ['C4', 'D4', null, 'F4', 'G4'], [5, 4]), rest('half')]),
  ]),
  treble('tuplet-quintuplet-chords', 'Tuplets', 'A quintuplet of chords — shared stems within a non-triplet group. EDGE (#245/#237).', ['chords inside a quintuplet', 'bracket over chord stacks'], ['tuplet', 'quintuplet', 'chord', 'stress', 'edge'], [
    measure([...tupg('eighth', [['C4', 'E4'], ['D4', 'F4'], ['E4', 'G4'], ['F4', 'A4'], ['G4', 'B4']], [5, 4]), rest('half')]),
  ]),
  treble('tuplet-quadruplet-6-8', 'Tuplets', 'A quadruplet (4 in the space of 3) in 6/8 — a deeper compound-meter borrowed division. EDGE: 4:3 ratio (#245).', ['quadruplet 4:3', 'compound-meter borrowing'], ['tuplet', 'quadruplet', 'compound-meter', '6/8', 'stress', 'edge'], [
    measure([...tupg('eighth', ['C4', 'D4', 'E4', 'F4'], [4, 3]), rest('quarter', { dotted: true })]),
  ], '6/8'),
  treble('tuplet-quintuplet-stems-down', 'Tuplets', 'A high quintuplet (stems down, beam + bracket below). EDGE: non-triplet stem-direction / bracket placement.', ['quintuplet stems down', 'bracket below'], ['tuplet', 'quintuplet', 'stems-down', 'stress', 'edge'], [
    measure([...tupg('eighth', ['A5', 'G5', 'F5', 'E5', 'D5'], [5, 4]), rest('half')]),
  ]),
  treble('tuplet-mixed-duration-triplet', 'Tuplets', 'A quarter+eighth triplet ("3" over two notes of unequal length). EDGE: a NON-UNIFORM tuplet — most likely to collide with the uniform-member assumption.', ['mixed-duration triplet', 'quarter + eighth under "3"', 'non-uniform members'], ['tuplet', 'triplet', 'mixed-duration', 'stress', 'edge'], [
    measure([
      ev('quarter', [note('C4')], { tuplet: { ratio: [3, 2], groupSize: 2, position: 0 } }),
      ev('eighth', [note('E4')], { tuplet: { ratio: [3, 2], groupSize: 2, position: 1 } }),
      q('F4'),
      rest('half'),
    ]),
  ]),
];

/** Lookup by name (used by the gallery + targeted oracle assertions). */
export const fixtureByName = (name: string): VisualFixture => {
  const f = visualFixtures.find((x) => x.name === name);
  if (!f) throw new Error(`Unknown visual fixture: ${name}`);
  return f;
};

/** The distinct feature groups, in corpus order (used by the gallery to build sections). */
export const visualFeatures = (): string[] => {
  const seen: string[] = [];
  for (const f of visualFixtures) if (!seen.includes(f.feature)) seen.push(f.feature);
  return seen;
};
