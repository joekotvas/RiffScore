/**
 * ABC Notation Importer (#10)
 *
 * Parses a tune written in ABC notation into a {@link Score}. The dialect the ABC exporter
 * writes (src/exporters/abcExporter.ts) round-trips losslessly; on top of that the importer
 * accepts the idioms of hand-written and archive tunes (The Session, abcnotation.com, …).
 *
 * Supported (ABC 2.1 subset):
 *  - Header fields: X: (ignored), T: (title), C: (composer), Z:Lyricist: (lyricist), N: (a
 *    copyright notice), M: (meter, incl. C and C|), L: (unit note length), Q: (tempo),
 *    K: (key with modes, clef= and octave=), V: (voice declarations with clef= / octave=).
 *  - Body: notes with accidentals (^ ^^ _ __ =) and octave marks (, '), note lengths
 *    (2, 3/2, /, //, /4, …), broken rhythm (> <), rests (z, x, multi-bar Z), chords ([CEG]),
 *    ties (-), tuplets ((3, (p:q, (p:q:r), every bar-line form, inline fields ([K:] [M:]
 *    [L:] [V:] [Q:]), chord symbols ("Am7"), voice switches (V:), comments (%), line
 *    continuation (\), ABC-style measure-local accidental persistence.
 *  - A pickup (anacrusis) is inferred from an under-full first bar.
 *
 * Not representable in the score model, imported with a warning: repeats and endings (the music
 * is taken once, as written), slurs, grace notes, decorations, lyrics, text annotations, voice
 * overlays (&), mid-tune key/meter/tempo changes, octave-transposing clefs.
 *
 * Every problem is reported through `warnings`; the parser fails outright only when the input
 * contains no music at all. It never throws on malformed input.
 *
 * @tested src/__tests__/importers/abcImporter.test.ts
 * @tested src/__tests__/importers/abcRoundTrip.test.ts
 * @tested src/__tests__/importers/abcOracle.test.ts
 */

import { Key } from 'tonal';
import { KEY_SIGNATURES, getMeasureCapacity } from '@/constants';
import type { ChordSymbol, ClefType, Measure, Note, Score, ScoreEvent, Staff } from '@/types';
import { chordId, eventId, measureId, noteId, staffId, tupletId } from '@/utils/id';
import { getNoteDuration } from '@/utils/core';
import { keySignatureAltForLetter } from '@/utils/accidentalContext';
import { clampBpm } from '@/utils/validation';
import { parseChord } from '@/services/ChordService';
import { quantizeChordAnchor } from '@/services/chord/ChordQuants';
import { createMetadata } from '@/services/MetadataService';
import {
  ALT_SUFFIX,
  ONE,
  WHOLE_QUANTS,
  Warnings,
  decomposeQuants,
  dropDanglingTies,
  frac,
  inferPickup,
  keyNameForFifths,
  mulFrac,
  padStavesToParity,
  reportValidationWarnings,
  type Frac,
} from './importUtils';

// ============================================================================
// Public types
// ============================================================================

export interface AbcImportSuccess {
  ok: true;
  score: Score;
  /** Anything that could not be imported faithfully, in human-readable form. */
  warnings: string[];
}

export interface AbcImportFailure {
  ok: false;
  error: string;
  warnings: string[];
}

export type AbcImportResult = AbcImportSuccess | AbcImportFailure;

// ============================================================================
// Header field parsers
// ============================================================================

/** M: → internal 'n/d' time signature, or null when unsupported. */
const parseMeter = (raw: string): string | null => {
  const v = raw.trim();
  if (v === 'C') return '4/4';
  if (v === 'C|') return '2/2';
  const m = v.match(/^\(?(\d+(?:\+\d+)*)\)?\/(\d+)$/);
  if (!m) return null;
  const num = m[1].split('+').reduce((sum, part) => sum + parseInt(part, 10), 0);
  const den = parseInt(m[2], 10);
  // Real meters have a positive numerator and a power-of-two denominator.
  if (num <= 0 || den <= 0 || (den & (den - 1)) !== 0) return null;
  return `${num}/${den}`;
};

/** L: → unit note length as a fraction of a whole note. */
const parseUnitLength = (raw: string): Frac | null => {
  const m = raw.trim().match(/^(\d+)(?:\/(\d+))?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const d = m[2] ? parseInt(m[2], 10) : 1;
  if (n <= 0 || d <= 0) return null;
  return frac(n, d);
};

/** ABC 2.1 default unit length: 1/16 when the meter is shorter than 3/4, else 1/8. */
const defaultUnitLength = (timeSignature: string): Frac => {
  const [n, d] = timeSignature.split('/').map(Number);
  return n / d < 0.75 ? frac(1, 16) : frac(1, 8);
};

/** The beat a bare `Q:120` counts: the dotted quarter in compound meters, else one denominator unit. */
const beatLength = (timeSignature: string): Frac => {
  const [n, d] = timeSignature.split('/').map(Number);
  return d === 8 && n % 3 === 0 ? frac(3, 8) : frac(1, d);
};

/**
 * Q: → quarter-notes per minute (the score's `bpm` unit), unclamped, or null when unparseable.
 * Handles `1/4=120`, `3/8=100`, compound beats (`1/4 3/8=40`, summed), a leading "Allegro"
 * label, and the bare `Q:120` form (beats of the meter's beat length).
 */
const parseTempo = (raw: string, timeSignature: string): number | null => {
  const v = raw.replace(/"[^"]*"/g, ' ').trim();
  if (!v) return null;
  const explicit = v.match(/^((?:\d+\/\d+\s*)+)=\s*(\d+(?:\.\d+)?)$/);
  if (explicit) {
    const beat = explicit[1]
      .trim()
      .split(/\s+/)
      .reduce((sum, f) => {
        const [n, d] = f.split('/').map(Number);
        return sum + n / d;
      }, 0);
    return Number(explicit[2]) * beat * 4;
  }
  const bare = v.match(/^=?\s*(\d+(?:\.\d+)?)$/);
  if (bare) {
    const beat = beatLength(timeSignature);
    return (Number(bare[1]) * beat.n * 4) / beat.d;
  }
  return null;
};

// --- Key signatures --------------------------------------------------------

/** Fifths offset of each mode relative to the major (Ionian) scale on the same tonic. */
const MODE_FIFTHS: Record<string, number> = {
  maj: 0,
  ion: 0,
  lyd: 1,
  mix: -1,
  dor: -2,
  min: -3,
  aeo: -3,
  phr: -4,
  loc: -5,
};

const MODE_LABELS: Record<string, string> = {
  ion: 'Ionian',
  lyd: 'Lydian',
  mix: 'Mixolydian',
  dor: 'Dorian',
  aeo: 'Aeolian',
  phr: 'Phrygian',
  loc: 'Locrian',
};

/** Modes whose character is minor: imported with the relative minor's key name. */
const MINOR_MODES = new Set(['min', 'aeo', 'dor', 'phr', 'loc']);

interface VoiceProps {
  clef: ClefType | null;
  octave: number | null;
}

interface ParsedKey extends VoiceProps {
  keySignature: string;
}

const CLEF_NAMES: Record<string, ClefType> = {
  treble: 'treble',
  g2: 'treble',
  bass: 'bass',
  f4: 'bass',
  alto: 'alto',
  c3: 'alto',
  tenor: 'tenor',
  c4: 'tenor',
};

/** A clef name with an optional ±8/±15 transposition suffix, or null if it is not a clef name. */
const parseClefName = (raw: string): { clef: ClefType; transposing: boolean } | null => {
  const m = raw.match(/^([A-Za-z]+\d?)([+-](?:8|15))?$/);
  if (!m) return null;
  const clef = CLEF_NAMES[m[1].toLowerCase()];
  return clef ? { clef, transposing: !!m[2] } : null;
};

/**
 * Voice/key properties: `clef=bass`, a bare clef name, `octave=-1`. Every other property
 * (name=, sname=, middle=, transpose=, stem=, …) is display- or playback-only and is ignored.
 */
const parseVoiceProps = (raw: string, warnings: Warnings, line: number): VoiceProps => {
  const props: VoiceProps = { clef: null, octave: null };
  const re = /(\w+)=("[^"]*"|\S+)|(\S+)/g;
  let m: RegExpExecArray | null;
  const applyClef = (value: string, strict: boolean) => {
    const parsed = parseClefName(value);
    if (!parsed) {
      if (strict) {
        warnings.add(`clef:${value}`, `Unsupported clef "${value}" was imported as treble`, line);
        props.clef = 'treble';
      }
      return;
    }
    props.clef = parsed.clef;
    if (parsed.transposing) {
      warnings.add(
        `clef-8:${value}`,
        `Octave-transposing clef "${value}" was imported as a plain ${parsed.clef} clef (written pitches kept)`,
        line
      );
    }
  };
  while ((m = re.exec(raw))) {
    if (m[1]) {
      const key = m[1].toLowerCase();
      const value = m[2].replace(/^"|"$/g, '');
      if (key === 'clef') applyClef(value, true);
      else if (key === 'octave') {
        const octave = parseInt(value, 10);
        if (Number.isFinite(octave)) props.octave = octave;
      }
    } else {
      applyClef(m[3], false);
    }
  }
  return props;
};

/**
 * K: → the internal key descriptor plus any clef/octave properties.
 *
 * Major and minor keys keep their spelling when it is one of the 15 canonical signatures
 * (`K:F#` stays 'F#', `K:Ebm` stays 'Ebm'). Modes have no equivalent in the score model, so
 * they are imported with the key that carries the same signature: major for Lydian and
 * Mixolydian, the relative minor for Dorian, Phrygian, Aeolian and Locrian. The pitch-class set
 * (and therefore every accidental decision) is identical either way.
 */
const parseKeyField = (raw: string, warnings: Warnings, line: number): ParsedKey => {
  let rest = raw.trim();
  let keySignature = 'C';

  const special = rest.match(/^(none|hp)(?![A-Za-z])/i);
  const firstWord = rest.split(/\s+/)[0] ?? '';
  // `K:clef=bass`, `K:bass`: a clef with no key — the tonic letter must not be read from "bass".
  const clefOnly =
    /^(clef|octave|middle|transpose|stafflines|t|m)=/i.test(firstWord) ||
    parseClefName(firstWord) !== null;
  if (rest === '' || clefOnly) {
    // K: with no key value — no key signature (properties, if any, are read below).
  } else if (special) {
    rest = rest.slice(special[0].length);
    if (special[1].toLowerCase() === 'hp') {
      keySignature = 'D';
      warnings.add('key-hp', 'Highland-pipe key (K:HP) was imported as D major', line);
    }
  } else {
    const m = rest.match(/^([A-Ga-g])([#b]?)([A-Za-z]*)/);
    if (!m) {
      warnings.add(
        'key-unknown',
        `Unrecognized key "K:${raw.trim()}" was imported as C major`,
        line
      );
    } else {
      rest = rest.slice(m[0].length);
      let modeWord = m[3];
      if (!modeWord) {
        // `K:A minor`, `K:D Mixolydian` — the mode may follow after whitespace.
        const spaced = rest.match(/^\s+([A-Za-z]{3,})/);
        if (spaced && MODE_FIFTHS[spaced[1].slice(0, 3).toLowerCase()] !== undefined) {
          modeWord = spaced[1];
          rest = rest.slice(spaced[0].length);
        }
      }
      const tonic = `${m[1].toUpperCase()}${m[2]}`;
      let mode = modeWord === 'm' ? 'min' : modeWord ? modeWord.slice(0, 3).toLowerCase() : 'maj';
      if (MODE_FIFTHS[mode] === undefined) {
        warnings.add(
          `mode:${modeWord}`,
          `Unknown mode "${modeWord}" in "K:${raw.trim()}" was treated as major`,
          line
        );
        mode = 'maj';
      }
      const minor = MINOR_MODES.has(mode);
      const spelled = `${tonic}${minor ? 'm' : ''}`;
      if ((mode === 'maj' || mode === 'min') && KEY_SIGNATURES[spelled]) {
        keySignature = spelled;
      } else {
        const base = Key.majorKey(tonic).alteration;
        keySignature = Number.isFinite(base)
          ? keyNameForFifths(base + MODE_FIFTHS[mode], minor)
          : 'C';
        if (MODE_LABELS[mode]) {
          const label = KEY_SIGNATURES[keySignature]?.label ?? keySignature;
          warnings.add(
            `mode-map:${tonic}${mode}`,
            `${tonic} ${MODE_LABELS[mode]} has no equivalent key; imported as ${label} (same key signature)`,
            line
          );
        }
      }
    }
  }

  if (/(^|\s)(exp|[_^=]+[A-Ga-g])(?=\s|$)/.test(rest)) {
    warnings.add(
      'key-accidentals',
      'Explicit key-signature accidentals (K: … exp) were ignored',
      line
    );
  }
  const props = parseVoiceProps(
    rest.replace(/(^|\s)(exp|[_^=]+[A-Ga-g])(?=\s|$)/g, ' '),
    warnings,
    line
  );
  return { keySignature, clef: props.clef, octave: props.octave };
};

// ============================================================================
// Tokenizer — one logical line of tune-body music → tokens
// ============================================================================

interface TokPitch {
  letter: string;
  /** Explicit accidental (-2..+2), or null when the note carries none. */
  acc: number | null;
  octave: number;
  tied: boolean;
}

type Token =
  | { t: 'note'; pitches: TokPitch[]; len: Frac; line: number }
  | { t: 'rest'; len: Frac; line: number }
  | { t: 'multiRest'; count: number; line: number }
  | { t: 'bar'; text: string; line: number }
  | { t: 'tuplet'; p: number; q: number | null; r: number | null; line: number }
  | { t: 'broken'; dir: '>' | '<'; count: number; line: number }
  | { t: 'chordSymbol'; symbol: string; line: number }
  | { t: 'field'; key: string; value: string; line: number }
  | { t: 'overlay'; line: number };

type NoteToken = Extract<Token, { t: 'note' }>;

const ACCIDENTAL_VALUES: Record<string, number> = { '^^': 2, '^': 1, '=': 0, _: -1, __: -2 };

/** Single-character ornament/articulation shorthands (ABC 2.1 §4.14). */
const SHORTHAND_DECORATIONS = new Set(['.', '~', 'H', 'L', 'M', 'O', 'P', 'S', 'T', 'u', 'v']);

const NOTE_RE = /([_^=]+)?([A-Ga-g])([,']*)/y;
const LENGTH_RE = /(\d+)?(\/+)?(\d+)?/y;
const BAR_RE = /(?:\[\|\]|\[\||\|\]|::|:\||\|:|\|)+/y;
const ENDING_RE = /\d+(?:[,-]\d+)*/y;
const TUPLET_RE = /\((\d+)(?::(\d*))?(?::(\d*))?/y;
const INLINE_FIELD_RE = /\[([A-Za-z]):([^\]]*)\]/y;
const MULTI_REST_RE = /[ZX](\d+)?/y;

const DECORATION_WARNING = 'Ornaments and articulations are not supported and were ignored';

const tokenizeMusicLine = (s: string, line: number, warnings: Warnings): Token[] => {
  const tokens: Token[] = [];
  const len = s.length;
  let pos = 0;
  let lastNote: NoteToken | null = null;

  /** A note length at `pos` (`2`, `3/2`, `/`, `//`, `/4`, …); empty → 1. */
  const readLength = (): Frac => {
    LENGTH_RE.lastIndex = pos;
    const m = LENGTH_RE.exec(s);
    if (!m || m[0].length === 0) return ONE;
    pos = LENGTH_RE.lastIndex;
    const num = m[1] ? parseInt(m[1], 10) : 1;
    // '/' halves, '//' quarters; a number after the slashes is the explicit divisor.
    const den = m[2] ? (m[3] ? parseInt(m[3], 10) : 2) * Math.pow(2, m[2].length - 1) : 1;
    return frac(Math.max(num, 1), Math.max(den, 1));
  };

  /** Accidentals + letter + octave marks at `pos`, or null if there is no note here. */
  const readPitch = (): TokPitch | null => {
    NOTE_RE.lastIndex = pos;
    const m = NOTE_RE.exec(s);
    if (!m) return null;
    pos = NOTE_RE.lastIndex;
    let acc: number | null = null;
    if (m[1]) {
      acc = ACCIDENTAL_VALUES[m[1]] ?? null;
      if (acc === null) {
        warnings.add(`acc:${m[1]}`, `Unrecognized accidental "${m[1]}" was ignored`, line);
      }
    }
    const letter = m[2].toUpperCase();
    let octave = m[2] === letter ? 4 : 5;
    for (const mark of m[3]) octave += mark === ',' ? -1 : 1;
    return { letter, acc, octave, tied: false };
  };

  /** Skip a `!…!` / `+…+` decoration; a lone `!` (old-style line break) is just dropped. */
  const skipDecoration = (delimiter: string): void => {
    const end = s.indexOf(delimiter, pos + 1);
    if (end === -1) {
      pos += 1;
      return;
    }
    warnings.add('decorations', DECORATION_WARNING, line);
    pos = end + 1;
  };

  const readChord = (): void => {
    pos += 1; // '['
    const pitches: TokPitch[] = [];
    let inner: Frac | null = null;
    let closed = false;
    while (pos < len) {
      const c = s[pos];
      if (c === ']') {
        pos += 1;
        closed = true;
        break;
      }
      if (c === ' ' || c === '\t') {
        pos += 1;
        continue;
      }
      if (SHORTHAND_DECORATIONS.has(c)) {
        warnings.add('decorations', DECORATION_WARNING, line);
        pos += 1;
        continue;
      }
      if (c === '!' || c === '+') {
        skipDecoration(c);
        continue;
      }
      const pitch = readPitch();
      if (!pitch) {
        warnings.add(`unknown:${c}`, `Unrecognized character "${c}" was ignored`, line);
        pos += 1;
        continue;
      }
      const l = readLength();
      if (inner === null) inner = l; // the chord's length is that of its first note
      if (s[pos] === '-') {
        pitch.tied = true;
        pos += 1;
      }
      pitches.push(pitch);
    }
    if (!closed) warnings.add('chord-open', 'Unterminated chord bracket "["', line);
    const outer = readLength();
    if (s[pos] === '-') {
      pos += 1;
      pitches.forEach((p) => (p.tied = true));
    }
    if (pitches.length === 0) {
      warnings.add('chord-empty', 'An empty chord "[]" was ignored', line);
      return;
    }
    const tok: NoteToken = { t: 'note', pitches, len: mulFrac(inner ?? ONE, outer), line };
    tokens.push(tok);
    lastNote = tok;
  };

  while (pos < len) {
    const ch = s[pos];

    if (ch === ' ' || ch === '\t' || ch === '`' || ch === '$' || ch === ')' || ch === '}') {
      pos += 1;
      continue;
    }

    if (ch === '"') {
      const end = s.indexOf('"', pos + 1);
      const text = end === -1 ? s.slice(pos + 1) : s.slice(pos + 1, end);
      pos = end === -1 ? len : end + 1;
      if (end === -1) warnings.add('quote', 'Unterminated quotation mark', line);
      if (/^[\^_<>@]/.test(text)) {
        warnings.add('annotations', 'Text annotations were ignored', line);
      } else if (text.trim()) {
        tokens.push({ t: 'chordSymbol', symbol: text.trim(), line });
      }
      continue;
    }

    if (ch === '!' || ch === '+') {
      skipDecoration(ch);
      continue;
    }

    if (ch === '{') {
      const end = s.indexOf('}', pos + 1);
      warnings.add('grace', 'Grace notes are not supported and were ignored', line);
      pos = end === -1 ? len : end + 1;
      continue;
    }

    if (ch === '(') {
      TUPLET_RE.lastIndex = pos;
      const m = TUPLET_RE.exec(s);
      if (m) {
        pos = TUPLET_RE.lastIndex;
        tokens.push({
          t: 'tuplet',
          p: parseInt(m[1], 10),
          q: m[2] ? parseInt(m[2], 10) : null,
          r: m[3] ? parseInt(m[3], 10) : null,
          line,
        });
        continue;
      }
      warnings.add('slurs', 'Slurs are not supported and were ignored', line);
      pos += 1;
      continue;
    }

    if (ch === '[' && s[pos + 1] !== '|') {
      INLINE_FIELD_RE.lastIndex = pos;
      const field = INLINE_FIELD_RE.exec(s);
      if (field) {
        pos = INLINE_FIELD_RE.lastIndex;
        tokens.push({ t: 'field', key: field[1], value: field[2].trim(), line });
        lastNote = null;
        continue;
      }
      ENDING_RE.lastIndex = pos + 1;
      if (ENDING_RE.exec(s)) {
        pos = ENDING_RE.lastIndex;
        warnings.add(
          'endings',
          'Repeat endings (|1, |2 …) are not supported; every bar was imported in sequence',
          line
        );
        continue;
      }
      readChord();
      continue;
    }

    BAR_RE.lastIndex = pos;
    const bar = BAR_RE.exec(s);
    if (bar) {
      pos = BAR_RE.lastIndex;
      tokens.push({ t: 'bar', text: bar[0], line });
      lastNote = null;
      ENDING_RE.lastIndex = pos;
      if (ENDING_RE.exec(s)) {
        pos = ENDING_RE.lastIndex;
        warnings.add(
          'endings',
          'Repeat endings (|1, |2 …) are not supported; every bar was imported in sequence',
          line
        );
      }
      continue;
    }

    if (ch === '&') {
      warnings.add(
        'overlay',
        'Voice overlays (&) are not supported; the overlaid notes were ignored',
        line
      );
      tokens.push({ t: 'overlay', line });
      pos += 1;
      continue;
    }

    if (ch === '>' || ch === '<') {
      let count = 0;
      while (s[pos] === ch) {
        count += 1;
        pos += 1;
      }
      tokens.push({ t: 'broken', dir: ch, count, line });
      continue;
    }

    if (ch === '-') {
      if (lastNote) lastNote.pitches.forEach((p) => (p.tied = true));
      pos += 1;
      continue;
    }

    if (ch === 'z' || ch === 'x') {
      pos += 1;
      tokens.push({ t: 'rest', len: readLength(), line });
      lastNote = null;
      continue;
    }

    if (ch === 'Z' || ch === 'X') {
      MULTI_REST_RE.lastIndex = pos;
      const m = MULTI_REST_RE.exec(s)!;
      pos = MULTI_REST_RE.lastIndex;
      tokens.push({ t: 'multiRest', count: m[1] ? parseInt(m[1], 10) : 1, line });
      lastNote = null;
      continue;
    }

    if (ch === 'y') {
      pos += 1;
      readLength();
      continue;
    }

    if (SHORTHAND_DECORATIONS.has(ch)) {
      warnings.add('decorations', DECORATION_WARNING, line);
      pos += 1;
      continue;
    }

    const pitch = readPitch();
    if (pitch) {
      const l = readLength();
      if (s[pos] === '-') {
        pitch.tied = true;
        pos += 1;
      }
      const tok: NoteToken = { t: 'note', pitches: [pitch], len: l, line };
      tokens.push(tok);
      lastNote = tok;
      continue;
    }

    warnings.add(`unknown:${ch}`, `Unrecognized character "${ch}" was ignored`, line);
    pos += 1;
  }

  return tokens;
};

/**
 * Broken rhythm: `A>B` lengthens A by half and halves B (`>>` = double dot, …); `<` mirrors it.
 * Resolved on the token stream so the notes carry their final lengths before quantization.
 */
const applyBrokenRhythm = (tokens: Token[], warnings: Warnings): Token[] => {
  const out: Token[] = [];
  const isDurational = (t: Token): t is Extract<Token, { t: 'note' | 'rest' }> =>
    t.t === 'note' || t.t === 'rest';
  const isBoundary = (t: Token) => t.t === 'bar' || t.t === 'field' || t.t === 'overlay';

  tokens.forEach((tok, i) => {
    if (tok.t !== 'broken') {
      out.push(tok);
      return;
    }
    let prev: Extract<Token, { t: 'note' | 'rest' }> | null = null;
    for (let j = out.length - 1; j >= 0; j--) {
      const c = out[j];
      if (isDurational(c)) {
        prev = c;
        break;
      }
      if (isBoundary(c)) break;
    }
    let next: Extract<Token, { t: 'note' | 'rest' }> | null = null;
    for (let j = i + 1; j < tokens.length; j++) {
      const c = tokens[j];
      if (isDurational(c)) {
        next = c;
        break;
      }
      if (isBoundary(c) || c.t === 'broken') break;
    }
    if (!prev || !next) {
      warnings.add(
        'broken',
        'A broken-rhythm sign (> or <) without a note on each side was ignored',
        tok.line
      );
      return;
    }
    const k = Math.pow(2, tok.count);
    const longer = frac(2 * k - 1, k);
    const shorter = frac(1, k);
    const [a, b] = tok.dir === '>' ? [longer, shorter] : [shorter, longer];
    prev.len = mulFrac(prev.len, a);
    next.len = mulFrac(next.len, b);
  });

  return out;
};

// ============================================================================
// Duration quantization
// ============================================================================

/** ABC's default `q` for `(p` when it is omitted (ABC 2.1 §4.13). */
const defaultTupletQ = (p: number, timeSignature: string): number => {
  switch (p) {
    case 2:
      return 3;
    case 3:
      return 2;
    case 4:
      return 3;
    case 6:
      return 2;
    case 8:
      return 3;
    default: {
      const [n, d] = timeSignature.split('/').map(Number);
      const compound = d === 8 && n % 3 === 0 && n > 3;
      return compound ? 3 : 2;
    }
  }
};

// ============================================================================
// Tune builder — tokens → Score
// ============================================================================

interface TupletState {
  ratio: [number, number];
  groupSize: number;
  /** Tokens (notes/rests/chords) still expected in the group. */
  remaining: number;
  id: string;
  baseDuration: string | null;
  members: ScoreEvent[];
  line: number;
}

interface VoiceState {
  id: string;
  clef: ClefType | null;
  octave: number | null;
  /** Key used to resolve this voice's accidentals (may differ from the score key after a K: change). */
  key: string;
  unit: Frac;
  measures: Measure[];
  /** Events of the bar being filled. */
  events: ScoreEvent[];
  localQuant: number;
  /** Measure-local accidental memory, keyed by letter+octave. */
  ledger: Map<string, number>;
  /**
   * Alterations carried over the bar line by a tie: they apply to the tied note that opens the
   * next bar and to nothing after it (standard engraving; abcjs reads it the same way).
   */
  carried: Map<string, number>;
  /** Alterations of the notes in the most recent event that are tied onward (feeds `carried`). */
  tiedOnward: Map<string, number>;
  tuplet: TupletState | null;
  pendingChords: { symbol: string; line: number }[];
  /** Whether a chord symbol was anchored inside the bar being filled. */
  barHasChord: boolean;
  skipUntilBar: boolean;
}

class TuneBuilder {
  readonly warnings = new Warnings();

  private title: string | null = null;
  private composer: string | null = null;
  private lyricist: string | null = null;
  private copyright: string | null = null;

  private meter: string | null = null;
  private headerUnit: Frac | null = null;
  private unit: Frac = frac(1, 8);
  private bpm: number | null = null;
  private key: string | null = null;
  private defaultClef: ClefType | null = null;
  private defaultOctave: number | null = null;

  private voices: VoiceState[] = [];
  private current: VoiceState | null = null;
  private chords: ChordSymbol[] = [];
  private bodyStarted = false;

  // --- Header -----------------------------------------------------------------

  headerField(key: string, rawValue: string, line: number): void {
    const value = rawValue.trim();
    switch (key) {
      case 'T':
        if (this.title === null) this.title = value;
        break;
      case 'C':
        if (this.composer === null && value) this.composer = value;
        break;
      case 'Z': {
        // The exporter writes the lyricist as "Z:Lyricist: Name"; other Z: (transcriber) lines are not metadata.
        const m = value.match(/^lyricist\s*:\s*(.+)$/i);
        if (m && this.lyricist === null) this.lyricist = m[1].trim();
        break;
      }
      case 'N':
        // N: is free-form notes; only a line that reads as a copyright notice becomes one.
        if (this.copyright === null && /©|\(c\)|copyright|all rights reserved/i.test(value)) {
          this.copyright = value;
        }
        break;
      case 'M': {
        const ts = parseMeter(value);
        if (ts) this.meter = ts;
        else
          this.warnings.add(
            `meter:${value}`,
            `Unsupported meter "M:${value}" was imported as 4/4`,
            line
          );
        break;
      }
      case 'L': {
        const unit = parseUnitLength(value);
        if (unit) this.headerUnit = unit;
        else
          this.warnings.add(
            `unit:${value}`,
            `Unsupported unit note length "L:${value}" was ignored`,
            line
          );
        break;
      }
      case 'Q':
        this.setTempo(value, line, false);
        break;
      case 'K': {
        const parsed = parseKeyField(value, this.warnings, line);
        this.key = parsed.keySignature;
        if (parsed.clef) this.defaultClef = parsed.clef;
        if (parsed.octave !== null) this.defaultOctave = parsed.octave;
        break;
      }
      case 'V':
        this.declareVoice(value, line);
        break;
      case 'w':
      case 'W':
        this.warnings.add('lyrics', 'Lyrics are not supported and were ignored', line);
        break;
      case 'P':
        this.warnings.add('parts', 'Part markers (P:) are not supported and were ignored', line);
        break;
      default:
        break; // X:, R:, S:, O:, H:, B:, D:, F:, G:, A:, I:, U:, m:, … carry nothing the model stores
    }
  }

  /** The K: field ends the header: fix the meter, key and unit length every voice starts from. */
  startBody(): void {
    if (this.bodyStarted) return;
    this.bodyStarted = true;
    this.meter ??= '4/4';
    this.key ??= 'C';
    this.unit = this.headerUnit ?? defaultUnitLength(this.meter);
    this.voices.forEach((v) => {
      v.key = this.key!;
      v.unit = this.unit;
    });
    this.current = this.voices[0] ?? this.createVoice('1');
  }

  // --- Body -------------------------------------------------------------------

  consume(tokens: Token[]): void {
    for (const tok of tokens) this.token(tok);
  }

  private token(tok: Token): void {
    if (tok.t === 'field') {
      this.bodyField(tok.key, tok.value, tok.line);
      return;
    }
    const voice = this.current!;
    if (voice.skipUntilBar && tok.t !== 'bar') return;
    switch (tok.t) {
      case 'note':
        this.note(voice, tok);
        break;
      case 'rest':
        this.rest(voice, tok);
        break;
      case 'multiRest':
        this.multiRest(voice, tok.count);
        break;
      case 'bar':
        this.bar(voice, tok.text, tok.line);
        break;
      case 'tuplet':
        this.tuplet(voice, tok);
        break;
      case 'chordSymbol':
        voice.pendingChords.push({ symbol: tok.symbol, line: tok.line });
        break;
      case 'overlay':
        voice.skipUntilBar = true;
        break;
      case 'broken':
        break; // resolved on the token stream before it gets here
    }
  }

  bodyField(key: string, value: string, line: number): void {
    const voice = this.current!;
    switch (key) {
      case 'K': {
        const parsed = parseKeyField(value, this.warnings, line);
        if (parsed.clef) voice.clef = parsed.clef;
        if (parsed.octave !== null) voice.octave = parsed.octave;
        if (parsed.keySignature !== voice.key) {
          if (this.anyMusic()) {
            this.warnings.add(
              'key-change',
              `Key changes inside the tune are not supported; the key signature stays ${KEY_SIGNATURES[this.key!]?.label ?? this.key} and later notes carry explicit accidentals`,
              line
            );
          } else {
            this.key = parsed.keySignature;
            this.voices.forEach((v) => (v.key = parsed.keySignature));
          }
          voice.key = parsed.keySignature;
        }
        break;
      }
      case 'M': {
        const ts = parseMeter(value);
        if (!ts) {
          this.warnings.add(`meter:${value}`, `Unsupported meter "M:${value}" was ignored`, line);
          break;
        }
        if (ts === this.meter) break;
        // Before the first bar closes an inline meter is a pickup-bar meter (the exporter writes
        // `[M:1/4]` for an anacrusis); the pickup itself is inferred from the bar's length.
        if (voice.measures.length === 0) break;
        this.warnings.add(
          'meter-change',
          `Meter changes inside the tune are not supported; the score stays in ${this.meter}`,
          line
        );
        break;
      }
      case 'L': {
        const unit = parseUnitLength(value);
        if (unit) voice.unit = unit;
        else
          this.warnings.add(
            `unit:${value}`,
            `Unsupported unit note length "L:${value}" was ignored`,
            line
          );
        break;
      }
      case 'Q':
        this.setTempo(value, line, true);
        break;
      case 'V':
        this.current = this.declareVoice(value, line);
        break;
      case 'w':
      case 'W':
        this.warnings.add('lyrics', 'Lyrics are not supported and were ignored', line);
        break;
      case 'P':
        this.warnings.add('parts', 'Part markers (P:) are not supported and were ignored', line);
        break;
      default:
        break; // T: (subtitle), I:, r:, … are ignored
    }
  }

  private setTempo(value: string, line: number, inBody: boolean): void {
    if (!value.replace(/"[^"]*"/g, '').trim()) return; // `Q:"Allegro"`: a label, no tempo
    if (inBody && this.bpm !== null) {
      this.warnings.add('tempo-change', 'Tempo changes inside the tune are not supported', line);
      return;
    }
    const bpm = parseTempo(value, this.meter ?? '4/4');
    if (bpm === null) {
      this.warnings.add(`tempo:${value}`, `Unrecognized tempo "Q:${value}" was ignored`, line);
      return;
    }
    const clamped = clampBpm(bpm);
    if (clamped !== bpm) {
      this.warnings.add(
        'tempo-clamp',
        `Tempo ${Math.round(bpm)} BPM is out of range; clamped to ${clamped}`,
        line
      );
    }
    this.bpm = clamped;
  }

  private anyMusic(): boolean {
    return this.voices.some((v) => v.measures.length > 0 || v.events.length > 0);
  }

  private createVoice(id: string): VoiceState {
    const voice: VoiceState = {
      id,
      clef: null,
      octave: null,
      key: this.key ?? 'C',
      unit: this.unit,
      measures: [],
      events: [],
      localQuant: 0,
      ledger: new Map(),
      carried: new Map(),
      tiedOnward: new Map(),
      tuplet: null,
      pendingChords: [],
      barHasChord: false,
      skipUntilBar: false,
    };
    this.voices.push(voice);
    return voice;
  }

  /** `V:` — find or create the voice and apply its clef/octave properties. */
  private declareVoice(value: string, line: number): VoiceState {
    const m = value.match(/^("[^"]*"|\S+)\s*(.*)$/);
    const id = m ? m[1].replace(/^"|"$/g, '') : '1';
    const voice = this.voices.find((v) => v.id === id) ?? this.createVoice(id);
    const props = parseVoiceProps(m ? m[2] : '', this.warnings, line);
    if (props.clef) voice.clef = props.clef;
    if (props.octave !== null) voice.octave = props.octave;
    return voice;
  }

  // --- Notes ------------------------------------------------------------------

  /** Whole-note fraction → quants; lengths off the 64th grid are rounded with a warning. */
  private quantsFor(voice: VoiceState, len: Frac, line: number): number {
    const whole = mulFrac(len, voice.unit);
    const exact = (WHOLE_QUANTS * whole.n) / whole.d;
    const quants = Math.max(1, Math.round(exact));
    if (Math.abs(exact - quants) > 1e-9) {
      this.warnings.add(
        `length:${len.n}/${len.d}:${voice.unit.n}/${voice.unit.d}`,
        `Note length ${len.n}/${len.d} (with L:${voice.unit.n}/${voice.unit.d}) is not on the 64th-note grid; rounded`,
        line
      );
    }
    return quants;
  }

  /**
   * ABC accidental rules: an explicit sign, else the bar's memory for this letter+octave, else an
   * alteration a tie carried over the bar line, else the key signature.
   */
  private resolvePitch(
    voice: VoiceState,
    p: TokPitch
  ): { pitch: string; forced: boolean; slot: string; alt: number } {
    const octave = p.octave + (voice.octave ?? this.defaultOctave ?? 0);
    const slot = `${p.letter}${octave}`;
    const keyAlt = keySignatureAltForLetter(p.letter, voice.key);
    const inEffect = voice.ledger.has(slot)
      ? voice.ledger.get(slot)!
      : voice.carried.has(slot)
        ? voice.carried.get(slot)!
        : keyAlt;
    const alt = p.acc ?? inEffect;
    if (p.acc !== null) voice.ledger.set(slot, alt);
    return {
      pitch: `${p.letter}${ALT_SUFFIX[alt] ?? ''}${octave}`,
      // A written accidental that changes nothing is a courtesy/forced glyph: keep it visible.
      forced: p.acc !== null && p.acc === inEffect,
      slot,
      alt,
    };
  }

  private note(voice: VoiceState, tok: NoteToken): void {
    const resolved = tok.pitches.map((p) => ({ ...this.resolvePitch(voice, p), tied: p.tied }));
    // A carried alteration serves the note that opens the bar only.
    voice.carried.clear();
    voice.tiedOnward = new Map(resolved.filter((r) => r.tied).map((r) => [r.slot, r.alt]));
    const parts = decomposeQuants(this.quantsFor(voice, tok.len, tok.line));
    parts.forEach((part, k) => {
      const splitTie = k < parts.length - 1; // parts of one written note are tied together
      const notes: Note[] = resolved.map((r) => {
        const note: Note = { id: noteId(), pitch: r.pitch };
        if (r.tied || splitTie) note.tied = true;
        if (r.forced) note.accidentalDisplay = 'show';
        return note;
      });
      this.emit(
        voice,
        { id: eventId(), duration: part.duration, dotted: part.dotted, notes },
        k === 0
      );
    });
    this.countTupletMember(voice);
  }

  private rest(voice: VoiceState, tok: Extract<Token, { t: 'rest' }>): void {
    voice.carried.clear();
    voice.tiedOnward = new Map();
    const parts = decomposeQuants(this.quantsFor(voice, tok.len, tok.line));
    parts.forEach((part, k) => {
      const id = eventId();
      this.emit(
        voice,
        {
          id,
          duration: part.duration,
          dotted: part.dotted,
          isRest: true,
          notes: [{ id: `${id}-rest`, pitch: null, isRest: true }],
        },
        k === 0
      );
    });
    this.countTupletMember(voice);
  }

  private emit(voice: VoiceState, event: ScoreEvent, first: boolean): void {
    this.attachTuplet(voice, event);
    if (first) this.attachChords(voice);
    voice.events.push(event);
    voice.localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
  }

  private attachChords(voice: VoiceState): void {
    if (voice.pendingChords.length === 0) return;
    const measure = voice.measures.length;
    const quant = quantizeChordAnchor(voice.localQuant);
    for (const { symbol, line } of voice.pendingChords) {
      const parsed = parseChord(symbol, this.key ?? 'C');
      if (!parsed.ok) {
        this.warnings.add(
          `chord:${symbol}`,
          `Unrecognized chord symbol "${symbol}" was ignored`,
          line
        );
        continue;
      }
      // Two voices may carry the same symbol at the same beat (or a bar may repeat one): keep the first.
      if (this.chords.some((c) => c.measure === measure && c.quant === quant)) continue;
      this.chords.push({ id: chordId(), measure, quant, symbol: parsed.symbol });
      voice.barHasChord = true;
    }
    voice.pendingChords = [];
  }

  // --- Tuplets ----------------------------------------------------------------

  private tuplet(voice: VoiceState, tok: Extract<Token, { t: 'tuplet' }>): void {
    if (tok.p < 2) {
      this.warnings.add(`tuplet:${tok.p}`, `Invalid tuplet "(${tok.p}" was ignored`, tok.line);
      return;
    }
    if (voice.tuplet) {
      this.warnings.add(
        'tuplet-nested',
        'Nested or overlapping tuplets are not supported; the inner one was ignored',
        tok.line
      );
      return;
    }
    const q = tok.q ?? defaultTupletQ(tok.p, this.meter ?? '4/4');
    const r = tok.r ?? tok.p;
    voice.tuplet = {
      ratio: [tok.p, q],
      groupSize: r,
      remaining: r,
      id: tupletId(),
      baseDuration: null,
      members: [],
      line: tok.line,
    };
  }

  private attachTuplet(voice: VoiceState, event: ScoreEvent): void {
    const t = voice.tuplet;
    if (!t) return;
    if (t.baseDuration === null) t.baseDuration = event.duration;
    event.tuplet = {
      ratio: t.ratio,
      groupSize: t.groupSize,
      position: t.members.length,
      baseDuration: t.baseDuration,
      id: t.id,
    };
    t.members.push(event);
  }

  private countTupletMember(voice: VoiceState): void {
    const t = voice.tuplet;
    if (!t) return;
    t.remaining -= 1;
    if (t.remaining <= 0) this.finishTuplet(voice, false);
  }

  private finishTuplet(voice: VoiceState, atBarLine: boolean): void {
    const t = voice.tuplet;
    if (!t) return;
    voice.tuplet = null;
    if (t.members.length === 0) return;
    if (atBarLine) {
      // A truncated group has a fractional footprint the model can never make valid; the notes
      // are worth more than the bracket, so keep them as plain notes.
      t.members.forEach((m) => delete m.tuplet);
      this.warnings.add(
        'tuplet-short',
        `A tuplet "(${t.ratio[0]}" reached a bar line before all its notes; its notes were imported without the tuplet`,
        t.line
      );
      return;
    }
    if (t.members.length !== t.groupSize) {
      // A member written as a length that needs two tied notes adds a member; keep the group coherent.
      t.members.forEach((m) => (m.tuplet!.groupSize = t.members.length));
      this.warnings.add(
        'tuplet-split',
        `A tuplet note had to be split into tied notes; the tuplet now spans ${t.members.length} notes`,
        t.line
      );
    }
  }

  // --- Bars -------------------------------------------------------------------

  private bar(voice: VoiceState, text: string, line: number): void {
    voice.skipUntilBar = false;
    this.finishTuplet(voice, true);
    this.closeMeasure(voice);
    if (text.includes(':')) {
      this.warnings.add(
        'repeats',
        'Repeat signs are not supported; the music was imported once, as written',
        line
      );
    }
  }

  private closeMeasure(voice: VoiceState): void {
    // Consecutive bar lines ("|: A B :|" then "|: …" on the next line, a leading "|:") never
    // open an empty bar; an intentionally empty bar is written with rests or Z.
    if (voice.events.length === 0) return;
    // A lone whole-note rest is the engraver's "rest for the bar" in any meter (`z4` with L:1/4
    // in 3/4 is not an over-full bar; abcjs reads it the same way). The model's empty bar is
    // exactly that, and it is what the exporter writes an empty bar back as. A chord symbol
    // needs an event to anchor to, so a rest carrying one stays explicit.
    const [only] = voice.events;
    const wholeBarRest =
      voice.events.length === 1 &&
      !!only.isRest &&
      only.duration === 'whole' &&
      !only.dotted &&
      !only.tuplet &&
      !voice.barHasChord;
    voice.measures.push({ id: measureId(), events: wholeBarRest ? [] : voice.events });
    voice.events = [];
    voice.localQuant = 0;
    voice.barHasChord = false;
    voice.ledger.clear();
    voice.carried = voice.tiedOnward;
    voice.tiedOnward = new Map();
  }

  private multiRest(voice: VoiceState, count: number): void {
    this.finishTuplet(voice, true);
    if (voice.events.length > 0) this.closeMeasure(voice);
    for (let i = 0; i < Math.max(1, count); i++) {
      voice.measures.push({ id: measureId(), events: [] });
    }
    voice.carried.clear();
  }

  // --- Assembly ---------------------------------------------------------------

  finish(): AbcImportResult {
    this.startBody();
    for (const voice of this.voices) {
      this.finishTuplet(voice, true);
      if (voice.events.length > 0) this.closeMeasure(voice);
      if (voice.pendingChords.length > 0) {
        this.warnings.add(
          'chord-trailing',
          'A chord symbol with no note after it was dropped',
          voice.pendingChords[0].line
        );
      }
    }

    const voices = this.voices.filter((v) => v.measures.length > 0);
    if (voices.length === 0) {
      return {
        ok: false,
        error: 'No music found in the ABC input',
        warnings: this.warnings.list(),
      };
    }

    const timeSignature = this.meter ?? '4/4';
    const keySignature = this.key ?? 'C';
    const capacity = getMeasureCapacity(timeSignature);

    const staves: Staff[] = voices.map((v) => ({
      id: staffId(),
      clef: v.clef ?? this.defaultClef ?? 'treble',
      keySignature,
      measures: v.measures,
    }));
    padStavesToParity(
      staves,
      voices.map((v) => `Voice ${v.id}`),
      this.warnings,
      'voice'
    );
    inferPickup(staves, capacity);

    dropDanglingTies(staves, this.warnings);

    const title = this.title || 'Untitled';
    const score: Score = {
      title,
      timeSignature,
      keySignature,
      bpm: this.bpm ?? 120,
      staves,
      chordTrack: this.chords.sort((a, b) => a.measure - b.measure || a.quant - b.quant),
      metadata: createMetadata({
        title,
        composer: this.composer ?? undefined,
        lyricist: this.lyricist ?? undefined,
        copyright: this.copyright ?? undefined,
      }),
    };

    reportValidationWarnings(score, this.warnings);

    return { ok: true, score, warnings: this.warnings.list() };
  }
}

// ============================================================================
// Line pre-processing
// ============================================================================

interface LogicalLine {
  text: string;
  line: number;
}

/** Strip a `%` comment (not inside a "quoted" string, not escaped as `\%`). */
const stripComment = (line: string): string => {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === '%' && !inQuote && line[i - 1] !== '\\') return line.slice(0, i);
  }
  return line;
};

/** Comment-stripped lines with `\` continuations joined, each tagged with its first source line. */
const splitLogicalLines = (input: string): LogicalLine[] => {
  const out: LogicalLine[] = [];
  let pending: LogicalLine | null = null;
  input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((rawLine, index) => {
      const stripped = stripComment(rawLine).replace(/\s+$/, '');
      const continues = stripped.endsWith('\\');
      const text = continues ? stripped.slice(0, -1) : stripped;
      if (pending) pending.text += text;
      else pending = { text, line: index + 1 };
      if (!continues) {
        out.push(pending);
        pending = null;
      }
    });
  if (pending) out.push(pending);
  return out;
};

// ============================================================================
// Entry point
// ============================================================================

const FIELD_LINE_RE = /^([A-Za-z]):(.*)$/;

/**
 * Parse ABC notation into a {@link Score}.
 *
 * Accepts a complete tune (header + body), a file with several tunes (the first is imported), or
 * a bare fragment such as `C D E F | G A B c` (defaults: 4/4, L:1/8, C major). Never throws:
 * unsupported or malformed input is reported in `warnings`, and `ok: false` is returned only when
 * there is no music at all.
 */
export const parseABC = (input: string): AbcImportResult => {
  const builder = new TuneBuilder();
  const lines = splitLogicalLines(typeof input === 'string' ? input : '');

  let start = lines.findIndex((l) => /^X:/.test(l.text));
  if (start === -1) start = 0;

  let inBody = false;
  for (let i = start; i < lines.length; i++) {
    const { text, line } = lines[i];
    if (i > start && /^X:/.test(text)) {
      builder.warnings.add(
        'multi-tune',
        'The input contains more than one tune; only the first was imported',
        line
      );
      break;
    }
    if (text.trim() === '') continue;

    const field = FIELD_LINE_RE.exec(text);
    if (field && !inBody) {
      builder.headerField(field[1], field[2], line);
      if (field[1] === 'K') {
        inBody = true;
        builder.startBody();
      }
      continue;
    }
    if (!inBody) {
      // Music with no K: line — a bare fragment.
      inBody = true;
      builder.startBody();
    }
    if (field) {
      builder.bodyField(field[1], field[2].trim(), line);
      continue;
    }
    builder.consume(
      applyBrokenRhythm(tokenizeMusicLine(text, line, builder.warnings), builder.warnings)
    );
  }

  return builder.finish();
};
