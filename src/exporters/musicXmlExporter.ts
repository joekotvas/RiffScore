import { NOTE_TYPES, KEY_SIGNATURES, TIME_SIGNATURES } from '@/constants';
import { getActiveStaff, Score, Staff, Measure, ScoreEvent, ChordSymbol } from '@/types';
import { isRestEvent, getNoteDuration } from '@/utils/core';

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

export const generateMusicXML = (score: Score) => {
  // Phase 2: Iterate over all staves
  const staves = score.staves || [getActiveStaff(score)];
  const timeSig = score.timeSignature || '4/4';
  const quantsPerMeasure = TIME_SIGNATURES[timeSig] || 64;

  // Build chord map indexed by global quant position (only for first part)
  const chordMap = new Map<number, ChordSymbol>();
  if (score.chordTrack) {
    for (const chord of score.chordTrack) {
      chordMap.set(chord.quant, chord);
    }
  }

  // Calculate Key Signature Fifths (Global)
  const keySigData = KEY_SIGNATURES[score.keySignature || 'C'];
  let fifths = 0;
  if (keySigData) {
    fifths = keySigData.type === 'sharp' ? keySigData.count : -keySigData.count;
  }

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list>`;

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
      <divisions>16</divisions>
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
          const globalQuant = mIndex * quantsPerMeasure + localQuant;
          const chord = chordMap.get(globalQuant);
          if (chord) {
            xml += generateHarmonyElement(chord);
          }
        }
        let duration = NOTE_TYPES[event.duration].duration;
        if (event.dotted) duration = duration * 1.5;

        // Tuplet Duration Scaling
        if (event.tuplet) {
          duration = Math.floor((duration * event.tuplet.ratio[1]) / event.tuplet.ratio[0]);
        }

        const xmlType = NOTE_TYPES[event.duration].xmlType;

        if (isRestEvent(event)) {
          // REST
          xml += `
    <note>
      <rest/>
      <duration>${duration}</duration>
      <type>${xmlType}</type>
      ${event.dotted ? '<dot/>' : ''}
    </note>`;
        } else {
          // NOTES / CHORDS
          event.notes.forEach((note: ScoreEvent['notes'][number], nIndex: number) => {
            // Skip notes without a valid pitch (e.g., unpitched percussion)
            if (!note.pitch) {
              return;
            }

            const isChord = nIndex > 0;
            const step = note.pitch.charAt(0);
            const octave = note.pitch.slice(-1);

            let accidentalTag = '';
            if (note.accidental) {
              const acc =
                note.accidental === 'natural'
                  ? 'natural'
                  : note.accidental === 'sharp'
                    ? 'sharp'
                    : note.accidental === 'flat'
                      ? 'flat'
                      : '';
              if (acc) accidentalTag = `<accidental>${acc}</accidental>`;
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

            // Tuplet Logic
            let timeModTag = '';
            let tupletNotations = '';
            if (event.tuplet) {
              timeModTag = `
      <time-modification>
        <actual-notes>${event.tuplet.groupSize}</actual-notes>
        <normal-notes>${event.tuplet.ratio[1]}</normal-notes>
      </time-modification>`;

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

            xml += `
    <note>
      ${isChord ? '<chord/>' : ''}
      <pitch>
        <step>${step}</step>
        <octave>${octave}</octave>
      </pitch>
      <duration>${duration}</duration>
      <type>${xmlType}</type>
      ${accidentalTag}
      ${timeModTag}
      ${event.dotted ? '<dot/>' : ''}
      ${tieTags}
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
