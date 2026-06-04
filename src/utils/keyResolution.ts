/**
 * keyResolution - Mode-aware key signature resolver.
 *
 * SINGLE source of truth for turning a stored key descriptor (e.g. 'G', 'Bb',
 * 'Em', 'Abm') into its tonic, mode, diatonic scale, and accidental signature.
 *
 * Why this exists: the core theory path historically called
 * `Key.majorKey('Em')`, whose `.scale` is `[]` (Tonal treats a minor-key string
 * as an invalid major root). Every diatonicity decision against that empty scale
 * silently failed, so all 15 minor keys were broken end-to-end (redundant
 * accidentals on render + naturals on entry). The chord module already solved
 * this with `Key.minorKey(root).natural.scale`; this module promotes that fix to
 * a shared, mode-aware resolver routed through every key-theory consumer.
 *
 * The NATURAL minor scale is the correct basis for *signature* decisions: the
 * raised 6th/7th of harmonic/melodic minor are genuinely chromatic and SHOULD
 * print accidentals, so they must not be treated as diatonic.
 *
 * @tested src/__tests__/theory/minorKeys.test.ts
 */

import { Key } from 'tonal';

export type KeyMode = 'major' | 'minor';

export interface ResolvedKey {
  /** The tonic note name without any mode suffix, e.g. 'E' for 'Em'. */
  tonic: string;
  /** Resolved mode. */
  mode: KeyMode;
  /**
   * The diatonic scale used for signature/diatonicity decisions.
   * Major -> Ionian; minor -> natural minor (Aeolian).
   * Pitch classes only, e.g. ['E','F#','G','A','B','C','D'].
   */
  scale: string[];
  /**
   * Number of accidentals in the signature (signed: negative = flats,
   * positive = sharps), matching Tonal's `Key.*.alteration`.
   */
  alteration: number;
}

/**
 * Parse a stored key descriptor into its tonic and mode.
 *
 * Minor keys are stored with a trailing 'm' (e.g. 'Em', 'Abm'); major keys are
 * stored as the bare root (e.g. 'C', 'Bb', 'F#'). A trailing 'maj' is treated
 * as major (and the 'maj' stripped) so values like 'Cmaj' do not parse as minor.
 *
 * @example parseKey('Em')  -> { tonic: 'E',  mode: 'minor' }
 * @example parseKey('Bb')  -> { tonic: 'Bb', mode: 'major' }
 * @example parseKey('F#m') -> { tonic: 'F#', mode: 'minor' }
 */
export const parseKey = (key: string): { tonic: string; mode: KeyMode } => {
  const trimmed = (key ?? '').trim();
  if (!trimmed) return { tonic: 'C', mode: 'major' };

  // Strip an explicit 'maj' suffix (it is major, not minor despite containing 'm').
  if (/maj$/i.test(trimmed)) {
    return { tonic: trimmed.replace(/maj$/i, ''), mode: 'major' };
  }

  // A trailing lowercase 'm' that is NOT part of 'maj' denotes a minor key.
  if (/m$/.test(trimmed)) {
    return { tonic: trimmed.slice(0, -1), mode: 'minor' };
  }

  return { tonic: trimmed, mode: 'major' };
};

/**
 * Resolve a stored key descriptor to its tonic, mode, diatonic scale, and
 * accidental count. Falls back to C major for unresolvable input rather than
 * throwing, so callers never crash on malformed keys.
 *
 * @example resolveKey('Em') -> scale = ['E','F#','G','A','B','C','D'], alteration = 1
 * @example resolveKey('Dm') -> scale = ['D','E','F','G','A','Bb','C'], alteration = -1
 */
export const resolveKey = (key: string): ResolvedKey => {
  const { tonic, mode } = parseKey(key);

  if (mode === 'minor') {
    const mk = Key.minorKey(tonic);
    const scale = [...mk.natural.scale];
    // Guard against an unresolvable tonic (empty scale) -> treat as A minor / C major.
    if (scale.length === 7) {
      return { tonic, mode: 'minor', scale, alteration: mk.alteration };
    }
  } else {
    const mj = Key.majorKey(tonic);
    const scale = [...mj.scale];
    if (scale.length === 7) {
      return { tonic, mode: 'major', scale, alteration: mj.alteration };
    }
  }

  // Fallback: C major.
  return { tonic: 'C', mode: 'major', scale: [...Key.majorKey('C').scale], alteration: 0 };
};

/**
 * Returns the diatonic scale (pitch classes) for signature/diatonicity
 * decisions. Mode-aware: natural minor for minor keys, Ionian for major.
 *
 * This is the single function callers should use anywhere they previously
 * reached for `Key.majorKey(key).scale`.
 */
export const getEffectiveScale = (key: string): string[] => resolveKey(key).scale;

/**
 * Signed accidental count for a key (negative flats, positive sharps).
 */
export const getEffectiveAlteration = (key: string): number => resolveKey(key).alteration;
