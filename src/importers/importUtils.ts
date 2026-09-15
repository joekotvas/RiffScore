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

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/** A normalized fraction (lowest terms, positive denominator). Integer inputs only. */
export const frac = (n: number, d: number): Frac => {
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
  let scale = 1;
  while (
    scale < 1e6 &&
    (!Number.isInteger(n * scale) || !Number.isInteger(d * scale)) &&
    Number.isFinite(n * scale) &&
    Number.isFinite(d * scale)
  ) {
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

export const ONE: Frac = { n: 1, d: 1 };
export const ZERO: Frac = { n: 0, d: 1 };

/** Internal quant grid: 64 quants per whole note. */
export const WHOLE_QUANTS = 64;

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

/** A quant count as one note when possible, else the greedy largest-first breakdown (tied). */
export const decomposeQuants = (quants: number): DurationPart[] => {
  const single = SINGLE_DURATIONS[quants];
  if (single) return [single];
  return getBreakdownOfQuants(quants).map((p) => ({ duration: p.duration, dotted: p.dotted }));
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
  let f = fifths;
  // Beyond 7 accidentals a key is theoretical; its only notation is the enharmonic twin.
  while (f > 7) f -= 12;
  while (f < -7) f += 12;
  const match = Object.entries(KEY_FIFTHS).find(
    ([name, v]) => v === f && (KEY_SIGNATURES[name].mode === 'minor') === minor
  );
  return match ? match[0] : 'C';
};

// ============================================================================
// Post-parse clean-up
// ============================================================================

/** An under-full first bar followed by more music is an anacrusis: flag it as a pickup. */
export const inferPickup = (measures: Measure[], capacity: number): void => {
  const first = measures[0];
  if (measures.length > 1 && first && first.events.length > 0) {
    const { quants, partialTuplet } = sumQuants(first.events);
    if (!partialTuplet && quants < capacity - 1e-6) first.isPickup = true;
  }
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
