import { NOTE_TYPES, KEY_SIGNATURES, getMeasureCapacity } from '@/constants';
import { DEFAULT_SCORE_METADATA } from '@/config';
import { padMeasureForExport } from './exportNormalize';
import {
  getActiveStaff,
  Score,
  ScoreEvent,
  Measure,
  Staff,
  Note,
  ChordSymbol,
  ScoreMetadata,
} from '@/types';
import { isRestEvent, getNoteDuration } from '@/utils/core';
import { hasTieTarget } from '@/utils/ties';
import { Note as TonalNote } from 'tonal';
import { canonicalizeKeySignature } from '@/utils/keyResolution';
import { MeasureAccidentalState, keySignatureAltForLetter } from '@/utils/accidentalContext';

/**
 * Convert an internal key string ('C', 'G', 'Bb', 'F#', 'Em', 'Dm') to a valid
 * ABC K: field value. Internal minor keys carry an 'm' suffix; ABC accepts the
 * bare letter form (e.g. 'Em', 'Dm') directly. Unknown keys fall back to 'C'.
 */
const abcKeySignature = (keySig: string): string => {
  return KEY_SIGNATURES[keySig] ? keySig : 'C';
};

/**
 * Maps an alteration to its ABC accidental token. 0 is a cancelling natural.
 */
const abcAccidentalToken = (alt: number): string => {
  switch (alt) {
    case 2:
      return '^^';
    case 1:
      return '^';
    case -1:
      return '_';
    case -2:
      return '__';
    case 0:
    default:
      return '='; // natural cancels a prior sharp/flat (key sig or earlier note)
  }
};

/**
 * Export score metadata to ABC header fields.
 */
const exportMetadata = (metadata: ScoreMetadata): string[] => {
  const lines: string[] = [];

  // T: - Title (required)
  lines.push(`T:${metadata.title}`);

  // C: - Composer (optional)
  if (metadata.composer) {
    lines.push(`C:${metadata.composer}`);
  }

  // Z: - Transcription (used for lyricist)
  if (metadata.lyricist) {
    lines.push(`Z:Lyricist: ${metadata.lyricist}`);
  }

  // N: - Notes (used for copyright)
  if (metadata.copyright) {
    lines.push(`N:${metadata.copyright}`);
  }

  return lines;
};

/**
 * Builds a nested lookup map from (measure, quant) to chord symbol.
 * This allows O(1) lookup when rendering events.
 */
const buildChordLookup = (
  chordTrack: ChordSymbol[] | undefined
): Map<number, Map<number, string>> => {
  const lookup = new Map<number, Map<number, string>>();
  if (!chordTrack) return lookup;

  for (const chord of chordTrack) {
    if (!lookup.has(chord.measure)) {
      lookup.set(chord.measure, new Map<number, string>());
    }
    lookup.get(chord.measure)!.set(chord.quant, chord.symbol);
  }
  return lookup;
};

// ABC notation pitch mapping - Algorithmic
const toAbcPitch = (pitch: string, _clef: string = 'treble'): string => {
  // Parse via Tonal (the same parser formatNote uses) rather than a hand-rolled
  // regex, so every spelling Tonal accepts — including 'x' double-sharps (Fx4) and
  // double-flats — yields the correct letter+octave instead of falling back to 'C'.
  const n = TonalNote.get(pitch);
  if (n.empty || !n.letter || n.oct == null) return 'C'; // Fallback

  const letter = n.letter;
  const octave = n.oct;

  // ABC Logic:
  // C4 (Middle C) -> C
  // c (C5) -> c
  // c' (C6) -> c'
  // C, (C3) -> C,

  let abcPitch = '';

  if (octave >= 5) {
    abcPitch = letter.toLowerCase();
    if (octave > 5) {
      abcPitch += "'".repeat(octave - 5);
    }
  } else {
    abcPitch = letter.toUpperCase();
    if (octave < 4) {
      abcPitch += ','.repeat(4 - octave);
    }
  }

  return abcPitch;
};

export const generateABC = (score: Score, bpm: number): string => {
  // Phase 2: Iterate over all staves
  const staves = score.staves || [getActiveStaff(score)]; // Fallback for safety
  const timeSig = score.timeSignature || '4/4';
  // Canonicalize so a theoretical flat-minor spelling (Db/Gb/Cb minor) emits its
  // representable enharmonic K: field (C#m/F#m/Bm) and drives measure-local
  // accidentals correctly, instead of falling back to C. Feeds both the K: field
  // and keySignatureAltForLetter below so they can never disagree.
  const keySig = canonicalizeKeySignature(score.keySignature || 'C');

  // Build chord lookup map for O(1) access by (measure, quant)
  const chordLookup = buildChordLookup(score.chordTrack);

  // Use metadata with fallback to defaults, then fall back to legacy title field
  const metadata: ScoreMetadata = score.metadata ?? {
    ...DEFAULT_SCORE_METADATA,
    title: score.title,
  };

  // Header
  // Per the ABC standard the K: (key) field is the LAST field of the tune
  // header and signals the start of the tune body. Tempo (Q:) must therefore
  // precede it. Field order: X, T, C/Z/N, M, L, Q, then K last.
  const lines: string[] = [];
  lines.push('X:1');
  lines.push(...exportMetadata(metadata));
  lines.push(`M:${timeSig}`);
  lines.push('L:1/4');
  lines.push(`Q:1/4=${bpm}`);
  lines.push(`K:${abcKeySignature(keySig)}`);
  let abc = lines.join('\n') + '\n';

  // Staves definition if multiple
  if (staves.length > 1) {
    abc += `%%staves {${staves.map((_, i) => i + 1).join(' ')}}\n`;
  }

  staves.forEach((staff: Staff, staffIndex: number) => {
    const clef = staff.clef || 'treble';
    // ABC notation supports: treble, bass, alto, tenor
    const getAbcClef = (c: string) => {
      switch (c) {
        case 'bass':
          return 'bass';
        case 'alto':
          return 'alto';
        case 'tenor':
          return 'tenor';
        default:
          return 'treble';
      }
    };
    const abcClef = getAbcClef(clef);
    const voiceId = staffIndex + 1;

    // Only include chord symbols on the first staff/voice
    const includeChords = staffIndex === 0;

    // Voice Header
    abc += `V:${voiceId} clef=${abcClef}\n`;

    staff.measures.forEach((measure: Measure, measureIndex: number) => {
      // Track local quant position within the measure
      let localQuant = 0;

      // Measure-local accidental ledger: accidentals persist to the barline and
      // are cancelled with '='; reset for every new measure.
      const accidentalState = new MeasureAccidentalState();

      // Pad an under-full bar with trailing rests for valid output (#242); never mutates state.
      padMeasureForExport(measure, getMeasureCapacity(timeSig)).forEach((event: ScoreEvent, eventIndex: number) => {
        // Calculate Duration
        let durationString = '';
        const base = NOTE_TYPES[event.duration]?.abcDuration || '';

        if (event.dotted) {
          // Handle dotted durations explicitly
          switch (event.duration) {
            case 'whole':
              durationString = '6';
              break;
            case 'half':
              durationString = '3';
              break;
            case 'quarter':
              durationString = '3/2';
              break;
            case 'eighth':
              durationString = '3/4';
              break;
            case 'sixteenth':
              durationString = '3/8';
              break;
            case 'thirtysecond':
              durationString = '3/16';
              break;
            case 'sixtyfourth':
              durationString = '3/32';
              break;
            default:
              durationString = base;
          }
        } else {
          durationString = base;
        }

        let prefix = '';

        // Add chord annotation if present at this position (first staff only)
        if (includeChords) {
          const measureChords = chordLookup.get(measureIndex);
          const chordSymbol = measureChords?.get(localQuant);
          if (chordSymbol) {
            prefix += `"${chordSymbol}"`;
          }
        }

        // Handle Tuplets. Use the explicit (p:q:r form so non-triplet ratios
        // export correctly: (5:4:5 = 5 notes in the time of 4, for 5 notes.
        // The bare (5 shorthand would mean "5 in the time of 2", which is wrong.
        if (event.tuplet && event.tuplet.position === 0) {
          const [actual, normal] = event.tuplet.ratio;
          prefix += `(${actual}:${normal}:${event.tuplet.groupSize}`;
        }

        if (isRestEvent(event)) {
          // Rest
          abc += `${prefix}z${durationString} `;
        } else {
          // Notes/Chords.
          // The accidental prefix is derived from the PITCH spelling (contract
          // C1) together with the key signature and the measure-local ledger.
          const formatNote = (n: Note) => {
            if (!n.pitch) return '';

            // Derive sounding alteration + letter/octave from the SPN spelling.
            const parsed = TonalNote.get(n.pitch);
            const letter = parsed.letter || n.pitch.charAt(0);
            const fallbackOct = parseInt(n.pitch.replace(/[^0-9-]/g, ''), 10);
            const octave = parsed.oct ?? (Number.isFinite(fallbackOct) ? fallbackOct : 4);
            const alt = Number.isFinite(parsed.alt) ? parsed.alt : 0;

            // The note's display policy (#236) can force or hide the glyph.
            // In ABC the accidental token IS what conveys the pitch (there is no
            // structural <alter>), so 'hide' cannot suppress it without silently
            // turning e.g. C#4 into C-natural — we therefore fall back to 'auto'
            // for 'hide' (best-effort: the policy is not honored, but the sounding
            // pitch is never lost). 'courtesy' has no standard ABC parenthesized
            // form, so it degrades to a plain forced accidental.
            const abcDisplay = n.accidentalDisplay === 'hide' ? 'auto' : n.accidentalDisplay;
            const keyAlt = keySignatureAltForLetter(letter, keySig);
            const decision = accidentalState.resolve(letter, octave, alt, keyAlt, abcDisplay);
            const acc = decision === null ? '' : abcAccidentalToken(decision.alt);

            const pitch = toAbcPitch(n.pitch, clef);
            return `${acc}${pitch}`;
          };

          // Ties: in ABC the hyphen follows the complete note token (pitch +
          // duration), e.g. C2- or [CEG]2-. A single-note event is tied when its
          // note is tied; a chord event is tied when any of its notes is tied.
          // Lane E: emit the tie hyphen only when a tied note actually resolves to a same-pitch
          // successor. ABC has one tie token per event, so partial chord ties flatten to a single
          // '-' (an accepted ABC-spec limitation, not a regression).
          const tieResolves = (n: Note) =>
            !!n.tied &&
            n.pitch != null &&
            hasTieTarget(staff.measures, { measureIndex, eventIndex, pitch: n.pitch });
          if (event.notes.length > 1) {
            const chordContent = event.notes.map(formatNote).join('');
            const tie = event.notes.some(tieResolves) ? '-' : '';
            abc += `${prefix}[${chordContent}]${durationString}${tie} `;
          } else {
            const note = event.notes[0];
            const noteContent = formatNote(note);
            const tie = note && tieResolves(note) ? '-' : '';
            abc += `${prefix}${noteContent}${durationString}${tie} `;
          }
        }

        // Advance local quant position for next event
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      });
      // Barline. The final measure of the voice gets a final barline '|]'.
      const isLastMeasure = measureIndex === staff.measures.length - 1;
      abc += isLastMeasure ? '|]' : '| ';
      if ((measureIndex + 1) % 4 === 0) abc += '\n';
    });
    abc += '\n'; // Newline after each voice/staff block
  });

  return abc;
};
