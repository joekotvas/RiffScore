/**
 * MusicXML Importer (#11)
 *
 * Parses a MusicXML document (partwise or timewise, any 1.x–4.x version) into a {@link Score}.
 * The dialect the MusicXML exporter writes (src/exporters/musicXmlExporter.ts) round-trips
 * losslessly; on top of that the importer accepts what notation apps (MuseScore, Finale,
 * Sibelius, Dorico) and converters write. Compressed .mxl containers are unpacked by mxl.ts
 * before the text reaches this module.
 *
 * Supported:
 *  - Header: work-title / movement-title / a title credit, composer and lyricist creators,
 *    rights (copyright).
 *  - Parts and staves: every <part>, in part-list order, with <staves>N</staves> staves each;
 *    one voice per staff (the first voice heard on it).
 *  - Attributes: divisions (also changing mid-part), key (fifths + mode), time (incl. compound
 *    beats), clefs (G2, F4, C3, C4; others map to the nearest with a warning).
 *  - Notes: pitch with alter, written value from <type> + <dot> (double dots, breves and other
 *    values the model lacks become tied notes), <time-modification> tuplets with or without
 *    <tuplet> notations, <chord/>, rests and whole-measure rests, ties (<tie>/<tied>), visible
 *    <accidental> glyphs as the note's display policy, <backup>/<forward> (gaps become rests).
 *  - Directions: <sound tempo> and <metronome> (the first tempo), <harmony> chord symbols.
 *  - A pickup bar (implicit or under-full) is inferred.
 *
 * Not representable in the score model, imported with a warning: repeats and endings, extra
 * voices on a staff, key/meter/tempo/clef changes after the first, slurs, articulations and
 * ornaments, dynamics, text directions, lyrics, grace and cue notes, unpitched notes (rests),
 * octave-transposing clefs and octave shifts (written pitches are kept).
 *
 * Every problem is reported through `warnings`; the parser fails outright only when the input
 * is not a MusicXML score at all. It never throws on malformed input.
 *
 * @tested src/__tests__/importers/musicXmlImporter.test.ts
 * @tested src/__tests__/importers/musicXmlRoundTrip.test.ts
 */

import { KEY_SIGNATURES, getMeasureCapacity } from '@/constants';
import type {
  AccidentalDisplay,
  ChordSymbol,
  ClefType,
  Measure,
  Note,
  Score,
  ScoreEvent,
  Staff,
} from '@/types';
import { chordId, eventId, measureId, noteId, staffId, tupletId } from '@/utils/id';
import { getNoteDuration } from '@/utils/core';
import { MeasureAccidentalState, keySignatureAltForLetter } from '@/utils/accidentalContext';
import { sumQuants } from '@/utils/tuplet';
import { clampBpm } from '@/utils/validation';
import { parseChord } from '@/services/ChordService';
import { quantizeChordAnchor } from '@/services/chord/ChordQuants';
import { createMetadata } from '@/services/MetadataService';
import { parseXml, xmlChild, xmlChildren, xmlNumber, xmlText, type XmlElement } from './xml';
import {
  ZERO,
  Warnings,
  addFrac,
  cmpFrac,
  decomposeQuants,
  dropDanglingTies,
  frac,
  fracFromDecimals,
  fracToNumber,
  gcd,
  keyNameForFifths,
  mulFrac,
  reportValidationWarnings,
  subFrac,
  type DurationPart,
  type Frac,
} from './importUtils';

// ============================================================================
// Public types
// ============================================================================

export interface MusicXmlImportSuccess {
  ok: true;
  score: Score;
  /** Anything that could not be imported faithfully, in human-readable form. */
  warnings: string[];
}

export interface MusicXmlImportFailure {
  ok: false;
  error: string;
  warnings: string[];
}

export type MusicXmlImportResult = MusicXmlImportSuccess | MusicXmlImportFailure;

// ============================================================================
// Note values, clefs, keys
// ============================================================================

/** Quants of each MusicXML <type>, exact (a 128th is half a quant). */
const TYPE_QUANTS: Record<string, Frac> = {
  maxima: frac(512, 1),
  long: frac(256, 1),
  breve: frac(128, 1),
  whole: frac(64, 1),
  half: frac(32, 1),
  quarter: frac(16, 1),
  eighth: frac(8, 1),
  '16th': frac(4, 1),
  '32nd': frac(2, 1),
  '64th': frac(1, 1),
  '128th': frac(1, 2),
  '256th': frac(1, 4),
  '512th': frac(1, 8),
  '1024th': frac(1, 16),
};

/** The quants of a written value (`type` with `dots` dots), or null for an unknown type. */
const writtenQuants = (type: string, dots: number): Frac | null => {
  const base = TYPE_QUANTS[type];
  if (!base) return null;
  const k = Math.pow(2, dots); // n dots multiply by (2^(n+1) − 1) / 2^n
  return mulFrac(base, frac(2 * k - 1, k));
};

const ALT_SUFFIX: Record<number, string> = { 2: '##', 1: '#', 0: '', [-1]: 'b', [-2]: 'bb' };
const clampAlt = (alt: number): number => Math.max(-2, Math.min(2, alt));

const CLEF_BY_SIGN_LINE: Record<string, ClefType> = {
  G2: 'treble',
  F4: 'bass',
  C3: 'alto',
  C4: 'tenor',
};
/** Clefs the model lacks, mapped to the staff-position-nearest one it has. */
const NEAREST_CLEF: Record<string, ClefType> = {
  G1: 'treble',
  F3: 'bass',
  F5: 'bass',
  C1: 'alto',
  C2: 'alto',
  C5: 'tenor',
};

const readClef = (el: XmlElement, warnings: Warnings, where: string): ClefType => {
  const sign = xmlText(el, 'sign');
  const line = xmlNumber(el, 'line');
  const upper = sign.toUpperCase();
  const defaultLine = upper === 'G' ? 2 : upper === 'F' ? 4 : upper === 'C' ? 3 : '';
  const key = `${upper}${line ?? defaultLine}`;
  let clef = CLEF_BY_SIGN_LINE[key];
  if (!clef) {
    clef = NEAREST_CLEF[key] ?? 'treble';
    warnings.add(
      `clef:${key}`,
      `Unsupported clef "${sign}${line ?? ''}" was imported as ${clef}`,
      where
    );
  }
  if (xmlNumber(el, 'clef-octave-change')) {
    warnings.add(
      'clef-8',
      'Octave-transposing clefs were imported as plain clefs (written pitches kept)',
      where
    );
  }
  return clef;
};

const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

/** <time> → 'n/d', or null when it carries no usable meter (a warning is added when so). */
const readTime = (el: XmlElement, warnings: Warnings, where: string): string | null => {
  if (xmlChild(el, 'senza-misura')) {
    warnings.add('meter-free', 'Unmeasured music (senza misura) was imported in 4/4', where);
    return null;
  }
  const beats = xmlChildren(el, 'beats');
  const types = xmlChildren(el, 'beat-type');
  if (beats.length === 0 || types.length === 0) return null;
  const pairs = beats.map((b, i) => ({
    n: xmlText(b)
      .split('+')
      .reduce((sum, part) => sum + (parseInt(part, 10) || 0), 0),
    d: parseInt(xmlText(types[Math.min(i, types.length - 1)]), 10),
  }));
  if (pairs.some((p) => !(p.n > 0) || !(p.d > 0) || (p.d & (p.d - 1)) !== 0)) {
    warnings.add('meter-invalid', 'An unsupported time signature was imported as 4/4', where);
    return null;
  }
  if (pairs.length === 1) return `${pairs[0].n}/${pairs[0].d}`;
  const den = pairs.reduce((l, p) => lcm(l, p.d), 1);
  const num = pairs.reduce((sum, p) => sum + (p.n * den) / p.d, 0);
  return `${num}/${den}`;
};

/** <metronome> → quarter notes per minute, or null when it states no rate. */
const metronomeBpm = (el: XmlElement): number | null => {
  const unit = xmlText(el, 'beat-unit');
  const perMinute = xmlText(el, 'per-minute').match(/\d+(?:\.\d+)?/);
  if (!unit || !perMinute) return null;
  const beat = writtenQuants(unit, xmlChildren(el, 'beat-unit-dot').length);
  return beat ? (Number(perMinute[0]) * fracToNumber(beat)) / 16 : null;
};

const MINOR_MODES = new Set(['minor', 'aeolian', 'dorian', 'phrygian', 'locrian']);
/** Modes with no key of their own (the relative major/minor is used, with a warning). */
const MODE_LABELS: Record<string, string> = {
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
  locrian: 'Locrian',
};

const keyLabel = (name: string): string => KEY_SIGNATURES[name]?.label ?? name;

/** MusicXML <kind> → the chord-symbol suffix the chord parser reads. */
const KIND_SUFFIX: Record<string, string> = {
  major: '',
  minor: 'm',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'augmented-seventh': 'aug7',
  'half-diminished': 'm7b5',
  'major-minor': 'mmaj7',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'dominant-11th': '11',
  'major-11th': 'maj11',
  'minor-11th': 'm11',
  'dominant-13th': '13',
  'major-13th': 'maj13',
  'minor-13th': 'm13',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
};

const DYNAMICS_WARNING = 'Dynamics and hairpins are not supported and were ignored';
const NAVIGATION_WARNING =
  'Segno, coda and D.C./D.S. marks were ignored; the music was imported once, in order';
const DECORATIONS_WARNING =
  'Articulations, ornaments and other note decorations are not supported and were ignored';

// ============================================================================
// Raw events — what a part's measures contain, before voices are chosen
// ============================================================================

interface NoteSpec {
  pitch: string;
  letter: string;
  octave: number;
  alt: number;
  tied: boolean;
  /** A visible <accidental> element on the note, if any. */
  glyph: { parenthesized: boolean } | null;
  /** Decided while building the measure, against the score key and the bar's memory. */
  display?: AccidentalDisplay;
}

interface TimeModification {
  actual: number;
  normal: number;
  /** Quants of <normal-type> (with its dots), when the file states it. */
  normalQuants: Frac | null;
}

interface RawEvent {
  voice: string;
  staff: number;
  /** Position within the measure, in quants (exact). */
  start: Frac;
  /** Sounding length from <duration>, in quants (exact); 0 when absent. */
  duration: Frac;
  type: string | null;
  dots: number;
  timeMod: TimeModification | null;
  isRest: boolean;
  measureRest: boolean;
  notes: NoteSpec[];
  tupletStart: boolean;
  tupletStop: boolean;
}

interface RawMeasure {
  number: string;
  implicit: boolean;
  events: RawEvent[];
}

// ============================================================================
// Score-level state — key, meter, tempo, chords, warnings
// ============================================================================

class DocState {
  readonly warnings = new Warnings();
  key: { name: string; fifths: number } | null = null;
  time: string | null = null;
  bpm: number | null = null;
  private rawBpm: number | null = null;
  readonly chords: ChordSymbol[] = [];

  applyKey(el: XmlElement, where: string): void {
    if (xmlChild(el, 'key-step')) {
      this.warnings.add(
        'key-nontraditional',
        'Non-traditional key signatures are not supported; C major was used',
        where
      );
      return;
    }
    const fifthsRaw = xmlNumber(el, 'fifths');
    if (fifthsRaw === null) return;
    const fifths = Math.round(fifthsRaw);
    const mode = (xmlText(el, 'mode') || 'major').toLowerCase();
    const name = keyNameForFifths(fifths, MINOR_MODES.has(mode));
    if (this.key === null) {
      this.key = { name, fifths };
      if (MODE_LABELS[mode]) {
        this.warnings.add(
          `mode:${mode}`,
          `${MODE_LABELS[mode]} mode has no equivalent key; imported as ${keyLabel(name)} (same key signature)`,
          where
        );
      } else if (!['major', 'minor', 'ionian', 'aeolian', 'none'].includes(mode)) {
        this.warnings.add(`mode:${mode}`, `Unknown mode "${mode}" was treated as major`, where);
      }
    } else if (this.key.fifths !== fifths) {
      this.warnings.add(
        'key-change',
        `Only one key signature per score is supported; the key signature stays ${keyLabel(this.key.name)} and notes that differ carry explicit accidentals`,
        where
      );
    }
  }

  applyTime(el: XmlElement, where: string): void {
    const ts = readTime(el, this.warnings, where);
    if (!ts) return;
    if (this.time === null) this.time = ts;
    else if (ts !== this.time) {
      this.warnings.add(
        'meter-change',
        `Meter changes inside the score are not supported; the score stays in ${this.time}`,
        where
      );
    }
  }

  setTempo(bpm: number, where: string): void {
    if (this.rawBpm !== null) {
      if (Math.abs(bpm - this.rawBpm) > 0.5) {
        this.warnings.add(
          'tempo-change',
          'Tempo changes inside the score are not supported; the first tempo was kept',
          where
        );
      }
      return;
    }
    this.rawBpm = bpm;
    const clamped = clampBpm(bpm);
    if (clamped !== bpm) {
      this.warnings.add(
        'tempo-clamp',
        `Tempo ${Math.round(bpm)} BPM is out of range; clamped to ${clamped}`,
        where
      );
    }
    this.bpm = clamped;
  }

  /** <harmony> at `at` quants into measure `measureIndex` → a chord-track entry. */
  addHarmony(el: XmlElement, measureIndex: number, at: Frac, where: string): void {
    const w = this.warnings;
    const root = xmlChild(el, 'root');
    if (!root) {
      if (xmlChild(el, 'function') || xmlChild(el, 'numeral')) {
        w.add('harmony-function', 'Functional (Roman numeral) chord symbols were ignored', where);
      }
      return;
    }
    const rootStep = xmlText(root, 'root-step').toUpperCase();
    if (!/^[A-G]$/.test(rootStep)) {
      w.add('harmony-malformed', 'A chord symbol without a readable root was ignored', where);
      return;
    }
    const rootAlter = clampAlt(Math.round(xmlNumber(root, 'root-alter') ?? 0));
    const kindEl = xmlChild(el, 'kind');
    const kind = xmlText(kindEl) || 'major';
    if (kind === 'none') return; // "N.C." — the chord track has no entry for silence
    let suffix = KIND_SUFFIX[kind];
    if (suffix === undefined) {
      const kindText = kindEl?.attrs.text?.trim();
      if (!kindText) {
        w.add(
          `harmony-kind:${kind}`,
          `Chord kind "${kind}" is not supported; the chord symbol was dropped`,
          where
        );
        return;
      }
      suffix = kindText;
    }
    for (const degree of xmlChildren(el, 'degree')) {
      const value = xmlNumber(degree, 'degree-value');
      if (value === null) continue;
      const alter = Math.round(xmlNumber(degree, 'degree-alter') ?? 0);
      const type = xmlText(degree, 'degree-type') || 'add';
      const sign = alter > 0 ? '#'.repeat(Math.min(alter, 2)) : 'b'.repeat(Math.min(-alter, 2));
      if (type === 'add') suffix += sign ? `${sign}${value}` : `add${value}`;
      else if (type === 'alter') suffix += `${sign}${value}`;
      // 'subtract' has no symbol-level spelling; the remaining tones are kept.
    }
    const bass = xmlChild(el, 'bass');
    const bassStep = xmlText(bass, 'bass-step').toUpperCase();
    const bassPart = /^[A-G]$/.test(bassStep)
      ? `/${bassStep}${ALT_SUFFIX[clampAlt(Math.round(xmlNumber(bass, 'bass-alter') ?? 0))]}`
      : '';
    const symbol = `${rootStep}${ALT_SUFFIX[rootAlter]}${suffix}${bassPart}`;
    const parsed = parseChord(symbol, this.key?.name ?? 'C');
    if (!parsed.ok) {
      w.add(`chord:${symbol}`, `Unrecognized chord symbol "${symbol}" was ignored`, where);
      return;
    }
    const quant = quantizeChordAnchor(Math.max(0, fracToNumber(at)));
    // Two parts may carry the same symbol at the same beat: keep the first.
    if (this.chords.some((c) => c.measure === measureIndex && c.quant === quant)) return;
    this.chords.push({ id: chordId(), measure: measureIndex, quant, symbol: parsed.symbol });
  }
}

// ============================================================================
// Part reader — one <part> → raw measures, clefs and staff count
// ============================================================================

class PartReader {
  private divisions = 1;
  staffCount = 1;
  readonly clefs = new Map<number, ClefType>();
  readonly measures: RawMeasure[] = [];
  /** The last note read in the current measure; a following <chord/> note joins it. */
  private lastNote: RawEvent | null = null;

  constructor(
    private readonly doc: DocState,
    readonly label: string
  ) {}

  /** A <duration>/<offset> value in the part's current divisions → quants. */
  private toQuants(divisions: number | null): Frac {
    if (divisions === null || !(divisions > 0)) return ZERO;
    return fracFromDecimals(divisions * 16, this.divisions);
  }

  readMeasure(el: XmlElement, index: number): void {
    const number = el.attrs.number ?? String(index + 1);
    const where = `bar ${number}`;
    const measure: RawMeasure = { number, implicit: el.attrs.implicit === 'yes', events: [] };
    let cursor = ZERO;
    this.lastNote = null;
    for (const child of el.children) {
      switch (child.name) {
        case 'attributes':
          this.readAttributes(child, where);
          break;
        case 'note':
          cursor = this.readNote(child, cursor, measure, where);
          break;
        case 'backup': {
          const back = this.toQuants(xmlNumber(child, 'duration'));
          cursor = cmpFrac(back, cursor) > 0 ? ZERO : subFrac(cursor, back);
          this.lastNote = null;
          break;
        }
        case 'forward':
          cursor = addFrac(cursor, this.toQuants(xmlNumber(child, 'duration')));
          this.lastNote = null;
          break;
        case 'direction':
          this.readDirection(child, where);
          break;
        case 'sound':
          this.readSound(child, where);
          break;
        case 'harmony':
          this.doc.addHarmony(
            child,
            index,
            addFrac(cursor, this.toQuants(xmlNumber(child, 'offset'))),
            where
          );
          break;
        case 'barline':
          this.readBarline(child, where);
          break;
        default:
          break; // print, figured-bass, grouping, link, bookmark, listening
      }
    }
    this.measures.push(measure);
  }

  private readAttributes(el: XmlElement, where: string): void {
    const w = this.doc.warnings;
    const divisions = xmlNumber(el, 'divisions');
    if (divisions !== null && divisions > 0) this.divisions = divisions;
    const staves = xmlNumber(el, 'staves');
    if (staves !== null && staves > this.staffCount) this.staffCount = Math.round(staves);
    for (const key of xmlChildren(el, 'key')) this.doc.applyKey(key, where);
    for (const time of xmlChildren(el, 'time')) this.doc.applyTime(time, where);
    for (const clefEl of xmlChildren(el, 'clef')) {
      const n = Math.max(1, Math.round(Number(clefEl.attrs.number ?? '1')) || 1);
      const clef = readClef(clefEl, w, where);
      const existing = this.clefs.get(n);
      if (existing === undefined) this.clefs.set(n, clef);
      else if (existing !== clef) {
        w.add(
          'clef-change',
          'Clef changes inside the score are not supported; each staff keeps its first clef',
          where
        );
      }
      if (n > this.staffCount) this.staffCount = n;
    }
  }

  /** Read a <note>; returns the cursor after it. */
  private readNote(el: XmlElement, cursor: Frac, measure: RawMeasure, where: string): Frac {
    const w = this.doc.warnings;
    if (xmlChild(el, 'grace')) {
      w.add('grace', 'Grace notes are not supported and were ignored', where);
      return cursor;
    }
    const isChord = xmlChild(el, 'chord') !== undefined;
    const duration = this.toQuants(xmlNumber(el, 'duration'));
    const advanced = isChord ? cursor : addFrac(cursor, duration);
    if (xmlChild(el, 'cue')) {
      w.add('cue', 'Cue notes were ignored', where);
      this.lastNote = null;
      return advanced;
    }
    if (xmlChild(el, 'lyric')) w.add('lyrics', 'Lyrics are not supported and were ignored', where);

    let tupletStart = false;
    let tupletStop = false;
    let tied = xmlChildren(el, 'tie').some((t) => t.attrs.type === 'start');
    for (const notations of xmlChildren(el, 'notations')) {
      for (const item of notations.children) {
        switch (item.name) {
          case 'tied':
            if (item.attrs.type === 'start') tied = true;
            break;
          case 'tuplet':
            if (Number(item.attrs.number ?? '1') > 1) {
              w.add(
                'tuplet-nested',
                'Nested tuplets are not supported; only the combined ratio was kept',
                where
              );
            } else if (item.attrs.type === 'start') tupletStart = true;
            else if (item.attrs.type === 'stop') tupletStop = true;
            break;
          case 'slur':
            w.add('slurs', 'Slurs are not supported and were ignored', where);
            break;
          case 'dynamics':
            w.add('dynamics', DYNAMICS_WARNING, where);
            break;
          case 'articulations':
          case 'ornaments':
          case 'technical':
          case 'fermata':
          case 'arpeggiate':
          case 'non-arpeggiate':
          case 'glissando':
          case 'slide':
          case 'accidental-mark':
          case 'other-notation':
            w.add('decorations', DECORATIONS_WARNING, where);
            break;
          default:
            break;
        }
      }
    }

    const staff = Math.max(1, Math.round(xmlNumber(el, 'staff') ?? 1));
    if (staff > this.staffCount) this.staffCount = staff;

    const restEl = xmlChild(el, 'rest');
    let spec: NoteSpec | null = null;
    if (!restEl) {
      if (xmlChild(el, 'unpitched')) {
        w.add('unpitched', 'Unpitched (percussion) notes were imported as rests', where);
      } else {
        spec = this.noteSpec(el, tied, where);
      }
    }

    if (isChord) {
      if (spec && this.lastNote && !this.lastNote.isRest) this.lastNote.notes.push(spec);
      else if (spec)
        w.add('chord-orphan', 'A chord note with nothing to attach to was ignored', where);
      return cursor; // chord members share the first note's position and length
    }

    const type = xmlText(el, 'type') || null;
    const event: RawEvent = {
      voice: xmlText(el, 'voice') || '1',
      staff,
      start: cursor,
      duration,
      type,
      dots: xmlChildren(el, 'dot').length,
      timeMod: this.readTimeModification(xmlChild(el, 'time-modification'), where),
      isRest: spec === null,
      measureRest: restEl?.attrs.measure === 'yes',
      notes: spec ? [spec] : [],
      tupletStart,
      tupletStop,
    };
    measure.events.push(event);
    this.lastNote = event;
    return advanced;
  }

  private noteSpec(el: XmlElement, tied: boolean, where: string): NoteSpec | null {
    const w = this.doc.warnings;
    const pitchEl = xmlChild(el, 'pitch');
    const step = xmlText(pitchEl, 'step').toUpperCase();
    const octave = xmlNumber(pitchEl, 'octave');
    if (!pitchEl || !/^[A-G]$/.test(step) || octave === null || !Number.isInteger(octave)) {
      w.add('note-malformed', 'Notes without a readable pitch were imported as rests', where);
      return null;
    }
    const alterRaw = xmlNumber(pitchEl, 'alter') ?? 0;
    let alt = Math.round(alterRaw);
    if (alt !== alterRaw) {
      w.add('microtone', 'Microtonal alterations were rounded to the nearest semitone', where);
    }
    if (alt !== clampAlt(alt)) {
      w.add('alter-range', 'Alterations beyond a double sharp or flat were clamped', where);
      alt = clampAlt(alt);
    }
    const accidental = xmlChild(el, 'accidental');
    return {
      pitch: `${step}${ALT_SUFFIX[alt]}${octave}`,
      letter: step,
      octave,
      alt,
      tied,
      glyph: accidental
        ? {
            parenthesized:
              accidental.attrs.parentheses === 'yes' || accidental.attrs.bracket === 'yes',
          }
        : null,
    };
  }

  private readTimeModification(el: XmlElement | undefined, where: string): TimeModification | null {
    if (!el) return null;
    const actual = xmlNumber(el, 'actual-notes');
    const normal = xmlNumber(el, 'normal-notes');
    if (
      actual === null ||
      normal === null ||
      !Number.isInteger(actual) ||
      !Number.isInteger(normal) ||
      actual < 1 ||
      normal < 1
    ) {
      this.doc.warnings.add('time-mod', 'A malformed <time-modification> was ignored', where);
      return null;
    }
    const normalType = xmlText(el, 'normal-type');
    return {
      actual,
      normal,
      normalQuants: normalType
        ? writtenQuants(normalType, xmlChildren(el, 'normal-dot').length)
        : null,
    };
  }

  private readDirection(el: XmlElement, where: string): void {
    const w = this.doc.warnings;
    const sound = xmlChild(el, 'sound');
    const items = xmlChildren(el, 'direction-type').flatMap((dt) => dt.children);
    let tempoHere = sound?.attrs.tempo !== undefined;
    for (const item of items) {
      if (item.name !== 'metronome') continue;
      const bpm = metronomeBpm(item);
      if (bpm !== null) {
        this.doc.setTempo(bpm, where);
        tempoHere = true;
      }
    }
    for (const item of items) {
      switch (item.name) {
        case 'metronome':
          break;
        case 'words':
        case 'rehearsal':
        case 'symbol':
          // A label beside a tempo mark ("Allegro") is that tempo's text, not a lost direction.
          if (!tempoHere) {
            w.add('text', 'Text directions (expressions, rehearsal marks) were ignored', where);
          }
          break;
        case 'dynamics':
        case 'wedge':
          w.add('dynamics', DYNAMICS_WARNING, where);
          break;
        case 'segno':
        case 'coda':
          w.add('navigation', NAVIGATION_WARNING, where);
          break;
        case 'octave-shift':
          w.add(
            'octave-shift',
            'Octave shifts (8va/8vb) were ignored; written pitches were kept',
            where
          );
          break;
        default:
          w.add('directions', 'Other directions (pedal marks, brackets, …) were ignored', where);
          break;
      }
    }
    if (sound) this.readSound(sound, where);
  }

  private readSound(el: XmlElement, where: string): void {
    const tempo = Number(el.attrs.tempo);
    if (el.attrs.tempo !== undefined && Number.isFinite(tempo) && tempo > 0) {
      this.doc.setTempo(tempo, where);
    }
    if (['dacapo', 'dalsegno', 'fine', 'tocoda', 'segno', 'coda'].some((a) => a in el.attrs)) {
      this.doc.warnings.add('navigation', NAVIGATION_WARNING, where);
    }
  }

  private readBarline(el: XmlElement, where: string): void {
    const w = this.doc.warnings;
    if (xmlChild(el, 'repeat')) {
      w.add(
        'repeats',
        'Repeat signs are not supported; the music was imported once, as written',
        where
      );
    }
    if (xmlChild(el, 'ending')) {
      w.add(
        'endings',
        'Repeat endings (1., 2. …) are not supported; every bar was imported in sequence',
        where
      );
    }
    if (xmlChild(el, 'segno') || xmlChild(el, 'coda'))
      w.add('navigation', NAVIGATION_WARNING, where);
    if (xmlChild(el, 'fermata')) w.add('decorations', DECORATIONS_WARNING, where);
  }
}

// ============================================================================
// Measure builder — one staff's kept voice → model events
// ============================================================================

interface BuildContext {
  capacity: number;
  key: string;
  warnings: Warnings;
  /**
   * A chord symbol anchors in this bar of the top staff (the staff chord symbols attach to):
   * a lone rest must stay explicit to carry it.
   */
  hasChord: boolean;
}

interface Resolved {
  /** Written length in quants (an integer; off-grid values are rounded with a warning). */
  quants: number;
  tuplet: TimeModification | null;
}

/** The written value of an event, reconciling <type>/<dot> with <duration>. */
const resolveWritten = (
  ev: RawEvent,
  capacity: number,
  warnings: Warnings,
  where: string
): Resolved | null => {
  const roundQuants = (q: Frac): number => {
    const exact = fracToNumber(q);
    const quants = Math.max(1, Math.round(exact));
    if (Math.abs(exact - quants) > 1e-9) {
      warnings.add(
        'grid',
        'Some note lengths were not on the 64th-note grid and were rounded',
        where
      );
    }
    return quants;
  };
  const written = ev.type ? writtenQuants(ev.type, ev.dots) : null;
  if (ev.type && !written) {
    warnings.add(
      `type:${ev.type}`,
      `Unknown note type "${ev.type}"; the duration was used instead`,
      where
    );
  }
  if (ev.measureRest && !ev.timeMod) {
    return { quants: ev.duration.n > 0 ? roundQuants(ev.duration) : capacity, tuplet: null };
  }
  if (ev.timeMod) {
    // Inside a tuplet the written value is what the model stores; the ratio restores the sound.
    const base = written ?? mulFrac(ev.duration, frac(ev.timeMod.actual, ev.timeMod.normal));
    if (base.n <= 0) return null;
    return { quants: roundQuants(base), tuplet: ev.timeMod };
  }
  if (written) {
    if (ev.duration.n === 0 || cmpFrac(written, ev.duration) === 0) {
      return { quants: roundQuants(written), tuplet: null };
    }
    // The two disagree without a tuplet ratio to explain it: the sounding length wins when it
    // is notatable, since it is what keeps the bar's timeline intact.
    warnings.add(
      'duration-mismatch',
      "Some notes' written values disagreed with their durations; the durations were used",
      where
    );
    return { quants: roundQuants(ev.duration), tuplet: null };
  }
  if (ev.duration.n <= 0) {
    warnings.add('note-empty', 'Notes with neither a type nor a duration were ignored', where);
    return null;
  }
  return { quants: roundQuants(ev.duration), tuplet: null };
};

interface TupletGroup {
  actual: number;
  normal: number;
  /** Quants of the note the ratio is "in the time of"; the completion test needs it. */
  unit: Frac | null;
  members: ScoreEvent[];
  writtenSum: number;
  /** Opened by a <tuplet type="start"/>: only a stop (or a ratio change) closes it. */
  byNotation: boolean;
  where: string;
}

const restEvent = (part: DurationPart): ScoreEvent => {
  const id = eventId();
  return {
    id,
    duration: part.duration,
    dotted: part.dotted,
    isRest: true,
    notes: [{ id: `${id}-rest`, pitch: null, isRest: true }],
  };
};

const buildMeasure = (raw: RawEvent[], m: RawMeasure, ctx: BuildContext): Measure => {
  const { capacity, key, warnings } = ctx;
  const where = `bar ${m.number}`;
  const events: ScoreEvent[] = [];
  if (raw.length === 0) return { id: measureId(), events };

  // A lone whole-bar rest is the model's empty bar — unless a chord symbol needs it as an anchor.
  const only = raw.length === 1 ? raw[0] : null;
  if (
    only &&
    only.isRest &&
    !ctx.hasChord &&
    (only.measureRest ||
      (only.type === 'whole' && only.dots === 0 && !only.timeMod) ||
      (only.type === null && cmpFrac(only.duration, frac(capacity, 1)) === 0))
  ) {
    return { id: measureId(), events };
  }

  const accidentals = new MeasureAccidentalState();
  let end = ZERO; // where the last kept event ends, in the file's own timing
  let group: TupletGroup | null = null;

  const closeGroup = (): void => {
    if (!group) return;
    const g = group;
    group = null;
    const footprint = g.members.reduce(
      (sum, e) => addFrac(sum, frac(getNoteDuration(e.duration, e.dotted) * g.normal, g.actual)),
      ZERO
    );
    if (g.members.length > 0 && footprint.d === 1) {
      const id = tupletId();
      const baseDuration = g.members[0].duration;
      g.members.forEach((e, position) => {
        e.tuplet = {
          ratio: [g.actual, g.normal],
          groupSize: g.members.length,
          position,
          baseDuration,
          id,
        };
      });
      return;
    }
    // A fractional footprint can never tile a bar; the notes are worth more than the bracket.
    warnings.add(
      'tuplet-incomplete',
      'A tuplet did not add up to a whole number of beats (its bracket was probably cut off); its notes were imported without the tuplet',
      g.where
    );
  };

  for (const ev of raw) {
    const gap = fracToNumber(subFrac(ev.start, end));
    if (gap <= -0.5) {
      warnings.add(
        'overlap',
        'Notes that overlap an earlier note in the same voice were dropped',
        where
      );
      continue;
    }
    if (gap >= 0.5) {
      // Time the voice skips over (<forward>, or another voice's notes) sounds as a rest.
      closeGroup();
      const restQuants = Math.round(gap);
      if (Math.abs(gap - restQuants) > 1e-9) {
        warnings.add(
          'grid',
          'Some note positions were not on the 64th-note grid and were rounded',
          where
        );
      }
      decomposeQuants(restQuants).forEach((part) => events.push(restEvent(part)));
    }
    const evEnd = addFrac(ev.start, ev.duration);
    if (cmpFrac(evEnd, end) > 0) end = evEnd;

    const resolved = resolveWritten(ev, capacity, warnings, where);
    if (!resolved) continue;

    // The visible-accidental policy, decided once per written note against the bar's memory.
    for (const spec of ev.notes) {
      const keyAlt = keySignatureAltForLetter(spec.letter, key);
      const auto = accidentals.resolve(spec.letter, spec.octave, spec.alt, keyAlt, 'auto');
      if (spec.glyph)
        spec.display = spec.glyph.parenthesized ? 'courtesy' : auto ? undefined : 'show';
    }

    if (resolved.tuplet) {
      const tm = resolved.tuplet;
      if (group && (group.actual !== tm.actual || group.normal !== tm.normal || ev.tupletStart)) {
        closeGroup();
      }
      if (!group) {
        group = {
          actual: tm.actual,
          normal: tm.normal,
          unit: tm.normalQuants ?? (ev.type ? writtenQuants(ev.type, ev.dots) : null),
          members: [],
          writtenSum: 0,
          byNotation: ev.tupletStart,
          where,
        };
      }
    } else {
      closeGroup();
    }

    const parts = decomposeQuants(resolved.quants);
    parts.forEach((part, k) => {
      let event: ScoreEvent;
      if (ev.isRest) {
        event = restEvent(part);
      } else {
        const splitTie = k < parts.length - 1; // parts of one written note are tied together
        event = {
          id: eventId(),
          duration: part.duration,
          dotted: part.dotted,
          notes: ev.notes.map((spec) => {
            const note: Note = { id: noteId(), pitch: spec.pitch };
            if (spec.tied || splitTie) note.tied = true;
            if (k === 0 && spec.display) note.accidentalDisplay = spec.display;
            return note;
          }),
        };
      }
      events.push(event);
      if (group) {
        group.members.push(event);
        group.writtenSum += getNoteDuration(part.duration, part.dotted);
      }
    });

    if (group) {
      if (ev.tupletStop) closeGroup();
      else if (
        !group.byNotation &&
        group.unit &&
        group.writtenSum >= group.actual * fracToNumber(group.unit) - 1e-9
      ) {
        // No bracket notations in this file: the group is complete once it spans its ratio.
        closeGroup();
      }
    }
  }
  closeGroup();
  return { id: measureId(), events };
};

// ============================================================================
// Document structure
// ============================================================================

/** Regroup a timewise document (measures containing parts) as partwise (parts containing measures). */
const timewiseToPartwise = (root: XmlElement): XmlElement => {
  const parts = new Map<string, XmlElement>();
  for (const measure of xmlChildren(root, 'measure')) {
    for (const part of xmlChildren(measure, 'part')) {
      const id = part.attrs.id ?? '';
      let target = parts.get(id);
      if (!target) {
        target = { name: 'part', attrs: { id }, children: [], text: '' };
        parts.set(id, target);
      }
      target.children.push({
        name: 'measure',
        attrs: measure.attrs,
        children: part.children,
        text: '',
      });
    }
  }
  return {
    name: 'score-partwise',
    attrs: root.attrs,
    children: [...root.children.filter((c) => c.name !== 'measure'), ...parts.values()],
    text: root.text,
  };
};

const collapseWhitespace = (s: string): string => s.replace(/\s+/g, ' ').trim();

const readTitle = (root: XmlElement): string =>
  collapseWhitespace(xmlText(xmlChild(root, 'work'), 'work-title')) ||
  collapseWhitespace(xmlText(root, 'movement-title')) ||
  collapseWhitespace(
    xmlChildren(root, 'credit')
      .filter((c) =>
        xmlChildren(c, 'credit-type').some((t) => xmlText(t).toLowerCase() === 'title')
      )
      .map((c) =>
        xmlChildren(c, 'credit-words')
          .map((w) => xmlText(w))
          .join(' ')
      )
      .find((t) => t.trim() !== '') ?? ''
  ) ||
  'Untitled';

// ============================================================================
// Entry point
// ============================================================================

/**
 * Parse a MusicXML document into a {@link Score}.
 *
 * Accepts partwise and timewise documents of any MusicXML version. Never throws: unsupported or
 * malformed content is reported in `warnings`, and `ok: false` is returned only when the input
 * is not a MusicXML score at all (not well-formed, another root element, or no parts).
 */
export const parseMusicXML = (input: string): MusicXmlImportResult => {
  const doc = new DocState();
  const fail = (error: string): MusicXmlImportFailure => ({
    ok: false,
    error,
    warnings: doc.warnings.list(),
  });

  const xml = parseXml(typeof input === 'string' ? input : '');
  if (!xml.ok) return fail(`not well-formed XML: ${xml.error}`);
  let root = xml.root;
  if (root.name === 'score-timewise') root = timewiseToPartwise(root);
  else if (root.name === 'opus')
    return fail('MusicXML opus files (collections of scores) are not supported');
  else if (root.name !== 'score-partwise') {
    return fail(`not a MusicXML score (the root element is <${root.name}>, not <score-partwise>)`);
  }

  // --- Header ---------------------------------------------------------------
  const title = readTitle(root);
  const identification = xmlChild(root, 'identification');
  let composer: string | undefined;
  let lyricist: string | undefined;
  for (const creator of xmlChildren(identification, 'creator')) {
    const type = (creator.attrs.type ?? '').toLowerCase();
    const name = collapseWhitespace(xmlText(creator));
    if (!name) continue;
    if ((type === 'composer' || type === '') && composer === undefined) composer = name;
    else if ((type === 'lyricist' || type === 'poet') && lyricist === undefined) lyricist = name;
  }
  const copyright = collapseWhitespace(xmlText(identification, 'rights')) || undefined;

  // --- Parts, in part-list order ---------------------------------------------
  const partElements = xmlChildren(root, 'part');
  const listed = xmlChildren(xmlChild(root, 'part-list'), 'score-part').map((sp) => ({
    id: sp.attrs.id ?? '',
    name: collapseWhitespace(xmlText(sp, 'part-name')),
  }));
  const ordered: { el: XmlElement; name: string }[] = [];
  for (const { id, name } of listed) {
    const el = partElements.find((p) => p.attrs.id === id);
    if (el && !ordered.some((o) => o.el === el)) ordered.push({ el, name });
  }
  for (const el of partElements) {
    if (!ordered.some((o) => o.el === el)) ordered.push({ el, name: '' });
  }
  if (ordered.length === 0) return fail('No <part> elements found in the MusicXML input');

  const readers = ordered.map(({ el, name }, index) => {
    const label = name ? `Part "${name}"` : `Part ${el.attrs.id || index + 1}`;
    const reader = new PartReader(doc, label);
    xmlChildren(el, 'measure').forEach((measure, index) => reader.readMeasure(measure, index));
    return reader;
  });

  // --- Staves ---------------------------------------------------------------
  const timeSignature = doc.time ?? '4/4';
  const keySignature = doc.key?.name ?? 'C';
  const capacity = getMeasureCapacity(timeSignature);
  const chordBars = new Set(doc.chords.map((c) => c.measure));

  const staves: Staff[] = [];
  const labels: string[] = [];
  for (const reader of readers) {
    for (let n = 1; n <= reader.staffCount; n++) {
      const label =
        readers.length > 1
          ? `${reader.label}${reader.staffCount > 1 ? `, staff ${n}` : ''}`
          : reader.staffCount > 1
            ? `Staff ${n}`
            : 'The staff';
      // The model holds one voice per staff: keep the first voice heard on it.
      let voice: string | null = null;
      let extraVoices = false;
      for (const m of reader.measures) {
        for (const ev of m.events) {
          if (ev.staff !== n) continue;
          if (voice === null) voice = ev.voice;
          else if (ev.voice !== voice) extraVoices = true;
        }
      }
      if (extraVoices) {
        doc.warnings.add(
          `voices:${label}`,
          `${label} has more than one voice; only voice ${voice} was imported (the editor holds one voice per staff)`
        );
      }
      const isTopStaff = staves.length === 0;
      const measures = reader.measures.map((m, index) =>
        buildMeasure(
          m.events
            .filter((ev) => ev.staff === n && ev.voice === voice)
            .sort((a, b) => cmpFrac(a.start, b.start)),
          m,
          {
            capacity,
            key: keySignature,
            warnings: doc.warnings,
            hasChord: isTopStaff && chordBars.has(index),
          }
        )
      );
      staves.push({ id: staffId(), clef: reader.clefs.get(n) ?? 'treble', keySignature, measures });
      labels.push(label);
    }
  }

  const barCount = Math.max(0, ...staves.map((s) => s.measures.length));
  if (barCount === 0) return fail('No music found in the MusicXML input');

  // Grand-staff parity: every staff must have the same number of bars.
  staves.forEach((staff, i) => {
    if (staff.measures.length === barCount) return;
    doc.warnings.add(
      `pad:${i}`,
      `${labels[i]} has ${staff.measures.length} bars where another has ${barCount}; it was padded with empty bars`
    );
    while (staff.measures.length < barCount) staff.measures.push({ id: measureId(), events: [] });
  });

  // An under-full first bar (in every staff) followed by more music is an anacrusis.
  if (barCount > 1) {
    const firsts = staves.map((s) => s.measures[0]);
    const underFull = firsts.every((m) => {
      if (m.events.length === 0) return true;
      const { quants, partialTuplet } = sumQuants(m.events);
      return !partialTuplet && quants < capacity - 1e-6;
    });
    if (underFull && firsts.some((m) => m.events.length > 0)) {
      firsts.forEach((m) => (m.isPickup = true));
    }
  }

  dropDanglingTies(staves, doc.warnings);

  const score: Score = {
    title,
    timeSignature,
    keySignature,
    bpm: doc.bpm ?? 120,
    staves,
    chordTrack: doc.chords
      .filter((c) => c.measure < barCount)
      .sort((a, b) => a.measure - b.measure || a.quant - b.quant),
    metadata: createMetadata({ title, composer, lyricist, copyright }),
  };
  reportValidationWarnings(score, doc.warnings);
  return { ok: true, score, warnings: doc.warnings.list() };
};
