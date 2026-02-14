import { NOTE_TYPES } from '@/constants';
import { getActiveStaff, Score, ScoreEvent, Measure, Staff, Note, ChordSymbol } from '@/types';
import { isRestEvent, getNoteDuration } from '@/utils/core';

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
  // Extract letter and octave
  const match = pitch.match(/^([A-G])(#{1,2}|b{1,2})?(\d+)$/);
  if (!match) return 'C'; // Fallback

  const letter = match[1];
  const octave = parseInt(match[3], 10);

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
  const keySig = score.keySignature || 'C';

  // Build chord lookup map for O(1) access by (measure, quant)
  const chordLookup = buildChordLookup(score.chordTrack);

  // Header
  let abc = `X:1\nT:${score.title}\nM:${timeSig}\nL:1/4\nK:${keySig}\nQ:1/4=${bpm}\n`;

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

      measure.events.forEach((event: ScoreEvent) => {
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

        // Handle Tuplets
        if (event.tuplet && event.tuplet.position === 0) {
          prefix += `(${event.tuplet.ratio[0]}`;
        }

        if (isRestEvent(event)) {
          // Rest
          abc += `${prefix}z${durationString} `;
        } else {
          // Notes/Chords
          const formatNote = (n: Note) => {
            if (!n.pitch) return '';

            let acc = '';
            // 1. Check explicit property
            if (n.accidental === 'sharp') acc = '^';
            else if (n.accidental === 'flat') acc = '_';
            else if (n.accidental === 'natural') acc = '=';
            // Note: double-sharp and double-flat are not standard Note.accidental values
            // They would need to be parsed from the pitch string if needed

            // 2. Fallback: Check Pitch String
            // If no explicit accidental property, parse from "F#4", "Bb4", etc.
            if (!acc) {
              // Match accidentals: #, ##, b, bb anywhere in string
              if (n.pitch.includes('##')) acc = '^^';
              else if (n.pitch.includes('#')) acc = '^';
              else if (n.pitch.includes('bb')) acc = '__';
              else if (n.pitch.includes('b')) acc = '_'; // Note: Be careful with 'b' vs flat symbol if stored as unicode, but usually it's 'b'. Tonal uses 'b'.
            }

            const pitch = toAbcPitch(n.pitch, clef);
            const tie = n.tied ? '-' : '';
            return `${acc}${pitch}${tie}`;
          };

          if (event.notes.length > 1) {
            const chordContent = event.notes.map(formatNote).join('');
            abc += `${prefix}[${chordContent}]${durationString} `;
          } else {
            const noteContent = formatNote(event.notes[0]);
            abc += `${prefix}${noteContent}${durationString} `;
          }
        }

        // Advance local quant position for next event
        localQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
      });
      abc += '| ';
      if ((measureIndex + 1) % 4 === 0) abc += '\n';
    });
    abc += '\n'; // Newline after each voice/staff block
  });

  return abc;
};
