import { NOTE_TYPES, KEY_SIGNATURES } from '@/constants';
import { DEFAULT_SCORE_METADATA } from '@/config';
import {
  getActiveStaff,
  Score,
  Staff,
  Measure,
  ScoreEvent,
  ChordSymbol,
  ScoreMetadata,
} from '@/types';
import { isRestEvent, getNoteDuration } from '@/utils/core';
import { Note } from 'tonal';

// ============================================================================
// RHYTHM / DIVISIONS
// ============================================================================

/**
 * The base number of MusicXML <divisions> per quarter note for non-tuplet
 * content. NOTE_TYPES uses sixtyfourth=1 .. quarter=16, so a quarter note is
 * 16 internal quants. Using 16 divisions-per-quarter makes every plain and
 * dotted duration (down to a dotted 64th = 1.5 -> but see scaling below) an
 * integer once multiplied by the tuplet-driven scale factor.
 */
const BASE_DIVISIONS_PER_QUARTER = NOTE_TYPES.quarter.duration; // 16

/** Greatest common divisor. */
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Least common multiple. */
const lcm = (a: number, b: number): number => (a * b) / gcd(a, b);

/**
 * Collect the distinct "actual-notes" tuplet denominators present anywhere in
 * the score. For a triplet ratio [3, 2] the divisor that introduces a fraction
 * into getNoteDuration (base * normal / actual) is `actual` (= ratio[0] = 3).
 */
const collectTupletDivisors = (score: Score): number[] => {
  const divisors = new Set<number>();
  const staves = score.staves || [getActiveStaff(score)];
  for (const staff of staves) {
    for (const measure of staff.measures) {
      for (const event of measure.events) {
        if (event.tuplet) {
          const actual = event.tuplet.ratio[0];
          if (actual > 0) divisors.add(actual);
        }
      }
    }
  }
  return [...divisors];
};

/**
 * Compute a per-score <divisions> value (divisions per quarter note) such that
 * EVERY event duration in the score — plain, dotted, and tuplet — is an exact
 * positive integer number of divisions.
 *
 * divisions = BASE_DIVISIONS_PER_QUARTER * 2 * LCM(all tuplet actual-notes)
 *
 * - The factor 2 absorbs the 1.5 multiplier from dotted notes at the finest
 *   grid (a dotted 64th = 1.5 base quants), so dotted durations stay integers.
 * - The LCM of every tuplet's actual-notes count makes the division by
 *   `actual` in getNoteDuration exact for every tuplet present.
 */
const computeDivisions = (score: Score): number => {
  const divisors = collectTupletDivisors(score);
  const tupletLcm = divisors.reduce((acc, d) => lcm(acc, d), 1);
  // Factor of 2 guarantees dotted finest-grain (1.5 quant) durations are integers.
  return BASE_DIVISIONS_PER_QUARTER * 2 * tupletLcm;
};

/**
 * Convert an event's duration (in internal quants) to an integer number of
 * MusicXML <duration> divisions, given the per-score divisions value.
 *
 * scale = divisions / BASE_DIVISIONS_PER_QUARTER, applied to the exact rational
 * quant value (base * normal / actual * dotFactor). Because `divisions` is built
 * from 2 * LCM(actual), the result is always an exact integer.
 */
const eventDivisions = (event: ScoreEvent, divisions: number): number => {
  const scale = divisions / BASE_DIVISIONS_PER_QUARTER;
  const base = NOTE_TYPES[event.duration]?.duration ?? 0;
  // Use exact rational arithmetic, then scale — avoids float floor corruption.
  let numerator = base * scale;
  if (event.dotted) numerator *= 1.5;
  if (event.tuplet) {
    numerator = (numerator * event.tuplet.ratio[1]) / event.tuplet.ratio[0];
  }
  return Math.round(numerator);
};

// ============================================================================
// XML UTILITIES
// ============================================================================

/**
 * Escape special XML characters.
 */
const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

/**
 * Format date as YYYY-MM-DD.
 */
const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Export score metadata to MusicXML elements.
 */
const exportMetadataToXML = (metadata: ScoreMetadata): string => {
  let xml = '';

  // <work> element
  xml += '  <work>\n';
  xml += `    <work-title>${escapeXml(metadata.title)}</work-title>\n`;
  xml += '  </work>\n';

  // <identification> element
  xml += '  <identification>\n';

  // Composer
  if (metadata.composer) {
    xml += `    <creator type="composer">${escapeXml(metadata.composer)}</creator>\n`;
  }

  // Lyricist
  if (metadata.lyricist) {
    xml += `    <creator type="lyricist">${escapeXml(metadata.lyricist)}</creator>\n`;
  }

  // Copyright
  if (metadata.copyright) {
    xml += `    <rights>${escapeXml(metadata.copyright)}</rights>\n`;
  }

  // Encoding info
  xml += '    <encoding>\n';
  xml += '      <software>RiffScore</software>\n';
  xml += `      <encoding-date>${formatDate(new Date())}</encoding-date>\n`;
  xml += '    </encoding>\n';

  xml += '  </identification>\n';

  return xml;
};

// ============================================================================
// CHORD SYMBOL TO MUSICXML HARMONY MAPPING
// ============================================================================

/**
 * Maps chord quality suffixes to MusicXML <kind> values.
 */
const CHORD_KIND_MAP: Record<string, string> = {
  '': 'major',
  m: 'minor',
  '7': 'dominant',
  maj7: 'major-seventh',
  m7: 'minor-seventh',
  dim: 'diminished',
  aug: 'augmented',
  dim7: 'diminished-seventh',
  m7b5: 'half-diminished',
  sus4: 'suspended-fourth',
  sus2: 'suspended-second',
};

/**
 * Parse a chord symbol into MusicXML harmony components.
 * Returns null if the chord cannot be parsed.
 */
const parseChordForMusicXML = (
  symbol: string
): { root: string; alter: number; kind: string; bass?: { step: string; alter: number } } | null => {
  // Handle slash chords (e.g., "C/E")
  let chordPart = symbol;
  let bassPart: string | null = null;

  if (symbol.includes('/')) {
    const parts = symbol.split('/');
    chordPart = parts[0];
    bassPart = parts[1] || null;
  }

  // Extract root note (letter + optional accidental)
  const rootMatch = chordPart.match(/^([A-G])([#b]?)/);
  if (!rootMatch) return null;

  const rootStep = rootMatch[1];
  const rootAccidental = rootMatch[2];
  const rootAlter = rootAccidental === '#' ? 1 : rootAccidental === 'b' ? -1 : 0;

  // Extract quality/kind from the rest of the symbol
  const qualityPart = chordPart.slice(rootMatch[0].length);

  // Find the matching kind (try longer suffixes first)
  const sortedKinds = Object.keys(CHORD_KIND_MAP).sort((a, b) => b.length - a.length);
  let kind = 'major';
  for (const suffix of sortedKinds) {
    if (suffix && qualityPart.startsWith(suffix)) {
      kind = CHORD_KIND_MAP[suffix];
      break;
    }
  }
  // If no suffix matched but qualityPart is empty, it's major
  if (qualityPart === '') {
    kind = 'major';
  }

  const result: {
    root: string;
    alter: number;
    kind: string;
    bass?: { step: string; alter: number };
  } = {
    root: rootStep,
    alter: rootAlter,
    kind,
  };

  // Parse bass note if present
  if (bassPart) {
    const bassMatch = bassPart.match(/^([A-G])([#b]?)/);
    if (bassMatch) {
      const bassStep = bassMatch[1];
      const bassAccidental = bassMatch[2];
      const bassAlter = bassAccidental === '#' ? 1 : bassAccidental === 'b' ? -1 : 0;
      result.bass = { step: bassStep, alter: bassAlter };
    }
  }

  return result;
};

/**
 * Generate MusicXML <harmony> element for a chord symbol.
 */
const generateHarmonyElement = (chord: ChordSymbol): string => {
  const parsed = parseChordForMusicXML(chord.symbol);
  if (!parsed) return '';

  let xml = `
    <harmony>
      <root>
        <root-step>${parsed.root}</root-step>${
          parsed.alter !== 0
            ? `
        <root-alter>${parsed.alter}</root-alter>`
            : ''
        }
      </root>
      <kind>${parsed.kind}</kind>`;

  if (parsed.bass) {
    xml += `
      <bass>
        <bass-step>${parsed.bass.step}</bass-step>${
          parsed.bass.alter !== 0
            ? `
        <bass-alter>${parsed.bass.alter}</bass-alter>`
            : ''
        }
      </bass>`;
  }

  xml += `
    </harmony>`;

  return xml;
};

export const generateMusicXML = (score: Score): string => {
  // Phase 2: Iterate over all staves
  const staves = score.staves || [getActiveStaff(score)];
  const timeSig = score.timeSignature || '4/4';

  // Per-score <divisions>: derived from tuplet content so every duration is an
  // exact integer number of divisions (no floor/truncation of tuplet rhythm).
  const divisions = computeDivisions(score);

  // Use metadata with fallback to defaults, then fall back to legacy title field
  const metadata: ScoreMetadata = score.metadata ?? {
    ...DEFAULT_SCORE_METADATA,
    title: score.title,
  };

  // Build chord map indexed by (measure, quant) position (only for first part)
  const chordMap = new Map<number, Map<number, ChordSymbol>>();
  if (score.chordTrack) {
    for (const chord of score.chordTrack) {
      if (!chordMap.has(chord.measure)) {
        chordMap.set(chord.measure, new Map<number, ChordSymbol>());
      }
      chordMap.get(chord.measure)!.set(chord.quant, chord);
    }
  }

  // Calculate Key Signature Fifths (Global)
  const keySigData = KEY_SIGNATURES[score.keySignature || 'C'];
  let fifths = 0;
  if (keySigData) {
    fifths = keySigData.type === 'sharp' ? keySigData.count : -keySigData.count;
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
`;

  // Metadata
  xml += exportMetadataToXML(metadata);

  xml += `  <part-list>`;

  // Generate Part List
  staves.forEach((_, index) => {
    const id = index + 1;
    xml += `
    <score-part id="P${id}">
      <part-name>Staff ${id}</part-name>
    </score-part>`;
  });

  xml += `
  </part-list>`;

  // Generate Parts
  staves.forEach((staff: Staff, staffIndex: number) => {
    const partId = `P${staffIndex + 1}`;
    const clef = staff.clef || 'treble';

    // Clef logic - C-clef for alto/tenor
    const getClefSign = (c: string) => {
      switch (c) {
        case 'bass':
          return 'F';
        case 'alto':
        case 'tenor':
          return 'C';
        default:
          return 'G';
      }
    };
    const getClefLine = (c: string) => {
      switch (c) {
        case 'bass':
          return '4';
        case 'alto':
          return '3';
        case 'tenor':
          return '4';
        default:
          return '2';
      }
    };
    const clefSign = getClefSign(clef);
    const clefLine = getClefLine(clef);

    // Track active ties specific to this part
    const activeTies = new Set<string>();

    xml += `
  <part id="${partId}">`;

    staff.measures.forEach((measure: Measure, mIndex: number) => {
      xml += `\n    <measure number="${mIndex + 1}">`;

      // Attributes appear on first measure
      if (mIndex === 0) {
        xml += `
    <attributes>
      <divisions>${divisions}</divisions>
      <key>
        <fifths>${fifths}</fifths>
      </key>
      <time>
        <beats>${timeSig.split('/')[0]}</beats>
        <beat-type>${timeSig.split('/')[1]}</beat-type>
      </time>
      <clef>
        <sign>${clefSign}</sign>
        <line>${clefLine}</line>
      </clef>
    </attributes>`;
      }

      // Track local quant position within measure (for chord placement in first part)
      let localQuant = 0;

      // Render Events sequentially
      measure.events.forEach((event: ScoreEvent) => {
        // Insert harmony element before note if chord exists at this position (first part only)
        if (staffIndex === 0) {
          const measureChords = chordMap.get(mIndex);
          const chord = measureChords?.get(localQuant);
          if (chord) {
            xml += generateHarmonyElement(chord);
          }
        }
        // Exact integer <duration> in per-score divisions (no float floor).
        const duration = eventDivisions(event, divisions);

        const xmlType = NOTE_TYPES[event.duration].xmlType;

        // <time-modification> is shared by every note in a tuplet event.
        // actual-notes / normal-notes come from the tuplet ratio [actual, normal];
        // normal-type is the note value the tuplet is "in the time of" (the base
        // duration of the tuplet members).
        let timeModTag = '';
        if (event.tuplet) {
          const [actual, normal] = event.tuplet.ratio;
          const normalType =
            NOTE_TYPES[event.tuplet.baseDuration ?? event.duration]?.xmlType ?? xmlType;
          timeModTag = `
      <time-modification>
        <actual-notes>${actual}</actual-notes>
        <normal-notes>${normal}</normal-notes>
        <normal-type>${normalType}</normal-type>
      </time-modification>`;
        }

        if (isRestEvent(event)) {
          // REST — DTD order: <rest/> <duration> <type> <dot> <time-modification>
          xml += `
    <note>
      <rest/>
      <duration>${duration}</duration>
      <type>${xmlType}</type>
      ${event.dotted ? '<dot/>' : ''}
      ${timeModTag}
    </note>`;
        } else {
          // NOTES / CHORDS
          event.notes.forEach((note: ScoreEvent['notes'][number], nIndex: number) => {
            // Skip notes without a valid pitch (e.g., unpitched percussion)
            if (!note.pitch) {
              return;
            }

            const isChord = nIndex > 0;

            // PITCH is the single source of truth (contract C1).
            // step / octave / alter are all derived from the SPN spelling via Tonal.
            const parsed = Note.get(note.pitch);
            const step = parsed.letter || note.pitch.charAt(0);
            // oct may be undefined for malformed input; fall back to trailing
            // digits, then to 4 (a sane default octave) if even that fails.
            const fallbackOct = parseInt(note.pitch.replace(/[^0-9-]/g, ''), 10);
            const octave = parsed.oct ?? (Number.isFinite(fallbackOct) ? fallbackOct : 4);
            // <alter> is the SOUNDING alteration derived from pitch spelling
            // (-1 flat, +1 sharp, +-2 double). Emitted ALWAYS when nonzero,
            // independent of whether a visible accidental glyph is shown.
            const alter = Number.isFinite(parsed.alt) ? parsed.alt : 0;
            const alterTag = alter !== 0 ? `\n        <alter>${alter}</alter>` : '';

            // <accidental> is the VISIBLE glyph. It is derived from the same
            // pitch spelling (never the legacy note.accidental field, which is a
            // derived mirror). A double sharp/flat maps to the MusicXML token.
            const accidentalName =
              alter === 2
                ? 'double-sharp'
                : alter === 1
                  ? 'sharp'
                  : alter === -1
                    ? 'flat'
                    : alter === -2
                      ? 'flat-flat'
                      : '';
            // Show the glyph only when the note carries an explicit accidental
            // request (legacy field) OR when the pitch is altered. We always
            // include it for altered pitches so the visible spelling matches the
            // sounding pitch; naturals are emitted only on explicit request.
            let accidentalTag = '';
            if (accidentalName) {
              accidentalTag = `<accidental>${accidentalName}</accidental>`;
            } else if (note.accidental === 'natural') {
              accidentalTag = `<accidental>natural</accidental>`;
            }

            // Tie Logic
            let tieTags = '';
            let tiedNotations = '';
            const pitchKey = note.pitch;

            if (activeTies.has(pitchKey)) {
              tieTags += '<tie type="stop"/>';
              tiedNotations += '<tied type="stop"/>';
            }

            if (note.tied) {
              tieTags += '<tie type="start"/>';
              tiedNotations += '<tied type="start"/>';
              activeTies.add(pitchKey);
            } else {
              if (activeTies.has(pitchKey)) {
                activeTies.delete(pitchKey);
              }
            }

            if (tiedNotations) {
              tiedNotations = `<notations>${tiedNotations}</notations>`;
            }

            // Tuplet bracket notations (start/stop) — separate from time-modification.
            let tupletNotations = '';
            if (event.tuplet) {
              if (event.tuplet.position === 0) {
                const tupTag = '<tuplet type="start" bracket="yes"/>';
                if (tiedNotations) {
                  tupletNotations = tupTag;
                } else {
                  tupletNotations = `<notations>${tupTag}</notations>`;
                }
              } else if (event.tuplet.position === event.tuplet.groupSize - 1) {
                const tupTag = '<tuplet type="stop"/>';
                if (tiedNotations) {
                  tupletNotations = tupTag;
                } else {
                  tupletNotations = `<notations>${tupTag}</notations>`;
                }
              }
            }

            // Merge notations
            let finalNotations = tiedNotations;
            if (tupletNotations) {
              if (finalNotations) {
                const content = tupletNotations
                  .replace('<notations>', '')
                  .replace('</notations>', '');
                finalNotations = finalNotations.replace('</notations>', `${content}</notations>`);
              } else {
                finalNotations = tupletNotations;
              }
            }

            // DTD child order for <note>:
            //   (chord?) pitch duration tie* type dot* accidental time-modification notations
            xml += `
    <note>
      ${isChord ? '<chord/>' : ''}
      <pitch>
        <step>${step}</step>${alterTag}
        <octave>${octave}</octave>
      </pitch>
      <duration>${duration}</duration>
      ${tieTags}
      <type>${xmlType}</type>
      ${event.dotted ? '<dot/>' : ''}
      ${accidentalTag}
      ${timeModTag}
      ${finalNotations}
    </note>`;
          });
        }

        // Advance quant position for chord placement tracking
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      });
      xml += `\n    </measure>`;
    });
    xml += `\n  </part>`;
  });

  xml += `\n</score-partwise>`;
  return xml;
};
