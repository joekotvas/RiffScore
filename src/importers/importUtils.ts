/**
 * Helpers shared by the score importers (ABC, MusicXML): exact fractions for note lengths,
 * deduplicated warnings, quant decomposition into notatable values, key naming from a fifths
 * count, and the clean-up every importer performs once its staves are built (pickup inference,
 * dangling ties, validation warnings).
 *
 * @tested src/__tests__/importers/abcImporter.test.ts
 * @tested src/__tests__/importers/musicXmlImporter.test.ts
 */

import { KEY_SIGNATURES } from '@/constants';
import type { Measure, Score, Staff } from '@/types';
import { getBreakdownOfQuants } from '@/utils/core';
import { measureId } from '@/utils/id';
import { hasTieTarget } from '@/utils/ties';
import { sumQuants } from '@/utils/tuplet';
import { validateScore } from '@/utils/validation';
import { toDisplayMeasureNumber } from '@/utils/measureIndex';

// ============================================================================
// Rational helpers — note lengths are exact fractions until quantized
// ============================================================================

export interface Frac {
  n: number;
  d: number;
}

export const ONE: Frac = { n: 1, d: 1 };
export const ZERO: Frac = { n: 0, d: 1 };

/** Greatest common divisor (iterative Euclid; 1 for a non-finite operand so callers never loop). */
export const gcd = (a: number, b: number): number => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
};

export const lcm = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : (a * b) / gcd(a, b));

/**
 * A normalized fraction (lowest terms, positive denominator). Integer inputs only; a non-finite
 * term or a zero denominator (only reachable from hostile input) yields zero.
 */
export const frac = (n: number, d: number): Frac => {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return ZERO;
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
};

/**
 * A fraction from decimal inputs (`1.5 / 0.25`): both terms are scaled to integers first, so
 * sloppy MusicXML `<duration>`/`<divisions>` decimals still yield an exact ratio.
 */
export const fracFromDecimals = (n: number, d: number): Frac => {
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return ZERO;
  let scale = 1;
  while (scale < 1e6 && (!Number.isInteger(n * scale) || !Number.isInteger(d * scale))) {
    scale *= 10;
  }
  return frac(Math.round(n * scale), Math.round(d * scale));
};

export const mulFrac = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
export const addFrac = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const subFrac = (a: Frac, b: Frac): Frac => frac(a.n * b.d - b.n * a.d, a.d * b.d);
/** Sign of a − b. */
export const cmpFrac = (a: Frac, b: Frac): number => Math.sign(a.n * b.d - b.n * a.d);
export const fracToNumber = (a: Frac): number => a.n / a.d;

/** Internal quant grid: 64 quants per whole note. */
export const WHOLE_QUANTS = 64;

/** Longest length any one written note or rest can take: 64 whole notes. Longer is hostile input. */
export const MAX_QUANTS = WHOLE_QUANTS * 64;

/**
 * Own-property lookup for tables indexed by document text. `table['constructor']` would find
 * `Object.prototype.constructor`, so a file naming a note type or chord kind after a prototype
 * member must miss instead of getting a function back.
 */
export const own = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

/** Pitch-spelling suffix of an alteration: 'C' + ALT_SUFFIX[1] + '4' → 'C#4'. */
export const ALT_SUFFIX: Record<number, string> = { 2: '##', 1: '#', 0: '', [-1]: 'b', [-2]: 'bb' };

/** The model spells at most a double sharp or flat. */
export const clampAlt = (alt: number): number => Math.max(-2, Math.min(2, alt));

// ============================================================================
// Warnings — deduplicated by category so a tune full of slurs yields one line
// ============================================================================

export class Warnings {
  private entries = new Map<string, { message: string; count: number; where: string }>();

  /**
   * Record a problem. `where` locates the first occurrence: a source line number (ABC) or a
   * label such as `"bar 12"` (MusicXML); omit it when the problem has no single location.
   */
  add(key: string, message: string, where: number | string = ''): void {
    const existing = this.entries.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    const label = typeof where === 'number' ? (where > 0 ? `line ${where}` : '') : where;
    this.entries.set(key, { message, count: 1, where: label });
  }

  list(): string[] {
    return [...this.entries.values()].map(({ message, count, where }) => {
      const location = where
        ? count > 1
          ? `${count} occurrences, first at ${where}`
          : where
        : count > 1
          ? `${count} occurrences`
          : '';
      return location ? `${message} (${location})` : message;
    });
  }
}

// ============================================================================
// Duration quantization
// ============================================================================

export interface DurationPart {
  duration: string;
  dotted: boolean;
}

/** Quant values a single (possibly dotted) note can notate. */
export const SINGLE_DURATIONS: Record<number, DurationPart> = {
  96: { duration: 'whole', dotted: true },
  64: { duration: 'whole', dotted: false },
  48: { duration: 'half', dotted: true },
  32: { duration: 'half', dotted: false },
  24: { duration: 'quarter', dotted: true },
  16: { duration: 'quarter', dotted: false },
  12: { duration: 'eighth', dotted: true },
  8: { duration: 'eighth', dotted: false },
  6: { duration: 'sixteenth', dotted: true },
  4: { duration: 'sixteenth', dotted: false },
  3: { duration: 'thirtysecond', dotted: true },
  2: { duration: 'thirtysecond', dotted: false },
  1: { duration: 'sixtyfourth', dotted: false },
};

/**
 * A quant count as one note when possible, else the greedy largest-first breakdown (tied). The
 * count is clamped to {@link MAX_QUANTS} so a hostile length cannot allocate without bound.
 */
export const decomposeQuants = (quants: number): DurationPart[] => {
  if (!Number.isFinite(quants) || quants < 1) return [];
  const clamped = Math.min(Math.round(quants), MAX_QUANTS);
  const single = SINGLE_DURATIONS[clamped];
  if (single) return [single];
  return getBreakdownOfQuants(clamped).map((p) => ({ duration: p.duration, dotted: p.dotted }));
};

// ============================================================================
// Key signatures
// ============================================================================

/** Signed accidental count of every canonical key: 'G' → 1, 'Bb' → -2, 'Em' → 1. */
export const KEY_FIFTHS: Record<string, number> = Object.fromEntries(
  Object.entries(KEY_SIGNATURES).map(([name, sig]) => [
    name,
    sig.type === 'flat' ? -sig.count : sig.count,
  ])
);

/** The canonical key name carrying `fifths` accidentals, major or (relative) minor. */
export const keyNameForFifths = (fifths: number, minor: boolean): string => {
  if (!Number.isFinite(fifths)) return 'C';
  // Beyond 7 accidentals a key is theoretical; its only notation is the enharmonic twin.
  let f = Math.round(fifths) % 12;
  if (f > 7) f -= 12;
  if (f < -7) f += 12;
  const match = Object.entries(KEY_FIFTHS).find(
    ([name, v]) => v === f && (KEY_SIGNATURES[name].mode === 'minor') === minor
  );
  return match ? match[0] : 'C';
};

// ============================================================================
// Post-parse clean-up
// ============================================================================

/**
 * An under-full first bar followed by more music is an anacrusis. A pickup is a property of the
 * bar, not of one staff: every staff's first bar must be under-full or empty, and at least one
 * must hold music — or the file must mark the bar as a pickup (`markedAsPickup`) — for the flag
 * to be set, on every staff at once.
 */
export const inferPickup = (staves: Staff[], capacity: number, markedAsPickup = false): void => {
  const firsts = staves.map((s) => s.measures[0]).filter((m): m is Measure => m !== undefined);
  if (firsts.length === 0 || staves.some((s) => s.measures.length < 2)) return;
  const underFull = firsts.every((m) => {
    if (m.events.length === 0) return true;
    const { quants, partialTuplet } = sumQuants(m.events);
    return !partialTuplet && quants < capacity - 1e-6;
  });
  if (underFull && (markedAsPickup || firsts.some((m) => m.events.length > 0))) {
    firsts.forEach((m) => (m.isPickup = true));
  }
};

/**
 * Grand-staff parity: every staff must have the same number of bars. Shorter staves are padded
 * with empty bars (one warning each, naming the staff by `labels[i]` and its peers by
 * `noun`). Returns the bar count.
 */
export const padStavesToParity = (
  staves: Staff[],
  labels: string[],
  warnings: Warnings,
  noun = 'staff'
): number => {
  const barCount = Math.max(0, ...staves.map((s) => s.measures.length));
  staves.forEach((staff, i) => {
    if (staff.measures.length === barCount) return;
    warnings.add(
      `pad:${i}`,
      `${labels[i]} has ${staff.measures.length} bars where another ${noun} has ${barCount}; it was padded with empty bars`
    );
    while (staff.measures.length < barCount) staff.measures.push({ id: measureId(), events: [] });
  });
  return barCount;
};

/** A tie only means something when the very next event has the same pitch; drop the rest. */
export const dropDanglingTies = (staves: Staff[], warnings: Warnings): void => {
  for (const staff of staves) {
    staff.measures.forEach((measure, measureIndex) => {
      measure.events.forEach((event, eventIndex) => {
        for (const note of event.notes) {
          if (!note.tied) continue;
          if (
            !note.pitch ||
            !hasTieTarget(staff.measures, { measureIndex, eventIndex, pitch: note.pitch })
          ) {
            delete note.tied;
            warnings.add('tie-dangling', 'Ties with no matching note to tie to were dropped');
          }
        }
      });
    });
  }
};

/**
 * Report over-full bars and incomplete tuplets: one line per bar for the first few problems,
 * then a count — a 4000-bar import must not produce a 4000-line warning list. Staff-level
 * (parity) errors are skipped; the importers pad their staves to the same length beforehand.
 */
export const reportValidationWarnings = (score: Score, warnings: Warnings): void => {
  const MAX_BAR_WARNINGS = 8;
  const multiStaff = score.staves.length > 1;
  const overflow: Record<string, number> = {};
  let listed = 0;
  for (const error of validateScore(score).errors) {
    if (error.measureIndex < 0) continue;
    const overfull = error.reason.startsWith('overfull');
    if (listed >= MAX_BAR_WARNINGS) {
      const kind = overfull ? 'overfull' : 'incomplete';
      overflow[kind] = (overflow[kind] ?? 0) + 1;
      continue;
    }
    listed += 1;
    const where = `Bar ${toDisplayMeasureNumber(error.measureIndex)}${multiStaff ? ` (staff ${error.staffIndex + 1})` : ''}`;
    const what = overfull
      ? `holds more than a full bar ${error.reason.replace(/^overfull\s*/, '')}`
      : 'contains an incomplete tuplet';
    warnings.add(`validation:${error.staffIndex}:${error.measureIndex}`, `${where} ${what}`);
  }
  if (overflow.overfull) {
    warnings.add(
      'validation:more-overfull',
      `${overflow.overfull} more bars hold more than a full bar`
    );
  }
  if (overflow.incomplete) {
    warnings.add(
      'validation:more-incomplete',
      `${overflow.incomplete} more bars contain an incomplete tuplet`
    );
  }
};
