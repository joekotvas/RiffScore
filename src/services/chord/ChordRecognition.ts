import { Chord, Note } from 'tonal';
import type { ChordRecognitionConfig, ChordSymbol, Score } from '@/types';
import { getNoteDuration, isReservedSlot } from '@/utils/core';
import { quantizeChordAnchor } from './ChordQuants';

/** Recognize exact pitch-class sets, ignoring octave doublings. No missing tones are invented.
 * Prefer ordinary chords to altered alternatives, and sevenths to ambiguous sixth chords.
 * Input order never affects the result: the sounding bass determines inversion spelling. */
export const recognizeChord = (pitches: string[], includeBass = false): string | null => {
  const notes = pitches
    .map((pitch) => Note.get(pitch))
    .filter((note) => !note.empty && note.midi !== null)
    .sort((a, b) => a.midi! - b.midi! || a.name.localeCompare(b.name));
  if (new Set(notes.map((note) => note.chroma)).size < 3) return null;
  const candidates = Chord.detect(notes.map((note) => note.name));
  const rank = (symbol: string): number => {
    const chord = Chord.get(symbol.split('/')[0]);
    const alias = chord.aliases[0] ?? '';
    return (alias.match(/[b#]\d/g)?.length ?? 0) * 10 + (alias === '6' || alias === 'm6' ? 1 : 0);
  };
  candidates.sort((a, b) => rank(a) - rank(b));
  const candidate = candidates[0];
  if (!candidate) return null;
  const [base, bass] = candidate.split('/');
  const chord = Chord.get(base);
  // Keep the detector's full extension/alterations; generic input normalization can be lossy.
  const suffix = (chord.aliases[0] ?? '').replace(/^M(?=add|$)/, '');
  return `${chord.tonic}${suffix}${includeBass && bass ? `/${bass}` : ''}`;
};

/** Rebuild a recognized track at event onsets. IDs follow events through inserts and undo.
 * Rests, reserved tuplet slots, dyads and unrecognized clusters have no inferred symbol. */
export const recognizeScoreChords = (score: Score, config?: ChordRecognitionConfig): Score => {
  if (!config?.enabled) return score;
  const staffIndex = config.staffIndex ?? 0;
  const staff =
    Number.isInteger(staffIndex) && staffIndex >= 0 ? score.staves[staffIndex] : undefined;
  const chordTrack: ChordSymbol[] = [];
  staff?.measures.forEach((measure, measureIndex) => {
    let quant = 0;
    measure.events.forEach((event) => {
      const pitches =
        event.isRest || isReservedSlot(event)
          ? []
          : event.notes
              .filter((note) => !note.isRest && !note.reserved && note.pitch)
              .map((note) => note.pitch!);
      const symbol = recognizeChord(pitches, config.includeBass);
      if (symbol)
        chordTrack.push({
          id: `recognized:${staff.id}:${event.id}`,
          measure: measureIndex,
          quant: quantizeChordAnchor(quant),
          symbol,
        });
      quant += getNoteDuration(event.duration, event.dotted, event.tuplet);
    });
  });
  const previous = score.chordTrack ?? [];
  if (
    previous.length === chordTrack.length &&
    previous.every((chord, index) => {
      const next = chordTrack[index];
      return (
        chord.id === next.id &&
        chord.measure === next.measure &&
        chord.quant === next.quant &&
        chord.symbol === next.symbol
      );
    })
  )
    return score;
  return { ...score, chordTrack };
};
