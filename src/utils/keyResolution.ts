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

import { Key, Note, Midi } from 'tonal';

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

/**
 * The largest accidental count any standard key signature can carry: 7 sharps
 * (C# major) or 7 flats (Cb major). Beyond this a key is "theoretical" — it
 * cannot be drawn on a 5-line staff, expressed as MusicXML `<fifths>` (±7), or
 * written as an ABC `K:` field, and is only ever notated by its enharmonic twin.
 */
const MAX_SIGNATURE_ACCIDENTALS = 7;

/**
 * Canonicalize a key descriptor to a representable, first-class spelling.
 *
 * The 15 canonical keys cover every pitch class within ±7 accidentals. The
 * theoretical flat-minor spellings carry far more — Db minor is 8 flats, Gb
 * minor 9, Cb minor 10 — so they have no drawable signature and no valid
 * `<fifths>`/`K:`. Their only real notation is the enharmonic equivalent inside
 * the canonical set (Db minor → C# minor, Gb minor → F# minor, Cb minor →
 * B minor). This respells the tonic enharmonically when — and ONLY when — the
 * key is out of representable range, so canonical keys pass through verbatim
 * (e.g. 'F#' stays 'F#', never flips to the equally-valid 'Gb').
 *
 * Normalizing the stored key at the load boundary keeps every downstream
 * consumer consistent: the header glyphs ({@link KEY_SIGNATURES}), the inline
 * accidental resolver ({@link resolveKey}), and both exporters all then operate
 * on the same first-class key. The sounding pitches are untouched — only the key
 * label/signature is respelled.
 *
 * @returns A descriptor that resolves within ±7 accidentals; falls back to 'C'
 *   only if even the enharmonic respelling is unrepresentable (no real key is).
 */
export const canonicalizeKeySignature = (key: string): string => {
  // In-range keys are already canonical — return verbatim so a valid flat/sharp
  // spelling is never gratuitously flipped.
  if (Math.abs(resolveKey(key).alteration) <= MAX_SIGNATURE_ACCIDENTALS) return key;

  // Out of range: respell the tonic enharmonically (Db → C#, Gb → F#, Cb → B)
  // and re-form the descriptor, preserving the mode suffix.
  const { tonic, mode } = parseKey(key);
  const respelled = `${Note.enharmonic(tonic)}${mode === 'minor' ? 'm' : ''}`;
  if (Math.abs(resolveKey(respelled).alteration) <= MAX_SIGNATURE_ACCIDENTALS) return respelled;

  return 'C';
};

/**
 * Find the octave at which a pitch class lands on a given MIDI number, then
 * return the fully-spelled pitch. The octave MUST be derived from MIDI rather
 * than copied from the source pitch string: at the C boundary a flat/sharp pc
 * (e.g. `Cb`/`B#`) belongs to the adjacent octave, so naive string concatenation
 * lands an octave off.
 */
const pitchClassAtMidi = (pc: string, midi: number): string => {
  const base = Math.floor(midi / 12) - 1;
  for (const oct of [base - 1, base, base + 1]) {
    if (Note.midi(`${pc}${oct}`) === midi) return `${pc}${oct}`;
  }
  // Should not happen for the diatonic pcs we feed in; fall back to a valid spelling.
  return Midi.midiToNoteName(midi);
};

/**
 * Choose the conventional spelling for a sounding pitch in a given key (#239).
 *
 * This is the key-aware enharmonic policy shared by chromatic transposition (and
 * any future caller that needs to spell an absolute pitch). It NEVER changes the
 * sounding pitch — `Note.midi(spellPitchInKey(p, k)) === Note.midi(p)` always —
 * it only chooses how the pitch is written, killing the double/triple-accidental
 * explosion that raw `Note.transpose` produces (e.g. E♭ +1 → F♭ → G𝄫 → …).
 *
 * Policy (agreed for #239):
 *  1. If the target pitch class is diatonic in the key, use the key's diatonic
 *     spelling (e.g. raising to the 4th in D major → C♯, never D♭).
 *  2. Otherwise spell it with at most one accidental, preferring a natural where
 *     one exists (so a semitone below C reads B, not C♭), and breaking the
 *     remaining black-key tie by DIRECTION via `prefer`: ascending transposition
 *     passes `'sharp'`, descending passes `'flat'`.
 *
 * @param target - a pitch string (e.g. 'Ebb4') or a MIDI number
 * @param keySignature - internal key descriptor (e.g. 'C', 'Bb', 'F#', 'Em')
 * @param prefer - tie-break for an out-of-key black key ('sharp' for up, 'flat' for down)
 * @returns the spelled pitch with octave, or the input unchanged if unparseable
 */
export const spellPitchInKey = (
  target: string | number,
  keySignature: string,
  prefer: 'sharp' | 'flat' = 'sharp'
): string => {
  const midi = typeof target === 'number' ? target : Note.midi(target);
  if (midi == null) return typeof target === 'string' ? target : '';

  const chroma = ((midi % 12) + 12) % 12;

  // 1. In-key: use the key's own diatonic spelling for this pitch class.
  const scale = getEffectiveScale(keySignature);
  for (const pc of scale) {
    if (Note.chroma(pc) === chroma) return pitchClassAtMidi(pc, midi);
  }

  // 2. Out-of-key: Tonal's midiToNoteName always yields <= 1 accidental and a
  //    natural for white keys (in both modes), so naturals win automatically;
  //    the sharp/flat tie for a black key is broken by direction.
  return Midi.midiToNoteName(midi, { sharps: prefer === 'sharp' });
};
