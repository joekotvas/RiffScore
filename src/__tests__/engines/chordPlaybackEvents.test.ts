/**
 * createChordPlaybackEvents — chord-track → playable-event conversion.
 *
 * This is the pure (Tone.js-free) machinery that turns a score's chordTrack into
 * scheduled accompaniment. It is the substance behind the api.play() chord-parity
 * promise (M1): the API routes through scheduleScorePlayback, which calls this to
 * produce the chord voicings that actually sound. Pinning timing/duration/velocity
 * here guarantees "chords play" means more than "a function was called".
 *
 * Timing reference (4/4 @ 120bpm): quantsPerMeasure = 64, secondsPerQuant =
 * (60/120)/16 = 0.03125s, so one full measure = 64 * 0.03125 = 2.0s.
 */

import { createChordPlaybackEvents } from '@/engines/toneEngine';
import { createDefaultScore, Score, ChordSymbol } from '@/types';
import { getChordVoicing } from '@/services/ChordService';

const SECONDS_PER_QUANT = 60 / 120 / 16; // 0.03125 at the default 120 bpm

const scoreWithChords = (chordTrack: ChordSymbol[]): Score => ({
  ...createDefaultScore(),
  chordTrack,
});

const chord = (id: string, measure: number, quant: number, symbol: string): ChordSymbol => ({
  id,
  measure,
  quant,
  symbol,
});

describe('createChordPlaybackEvents', () => {
  it('returns no events when there is no chord track', () => {
    expect(createChordPlaybackEvents(createDefaultScore(), 120)).toEqual([]);
    expect(createChordPlaybackEvents(scoreWithChords([]), 120)).toEqual([]);
  });

  it('emits one event per chord with the voicing, symbol, and normalized velocity', () => {
    const score = scoreWithChords([chord('c1', 0, 0, 'C')]);
    const events = createChordPlaybackEvents(score, 120, 50);

    expect(events).toHaveLength(1);
    const [e] = events;
    expect(e.symbol).toBe('C');
    expect(e.notes).toEqual(getChordVoicing('C')); // ['C3','E3','G4']
    expect(e.notes.length).toBeGreaterThan(0);
    expect(e.velocity).toBeCloseTo(50 / 127); // MIDI velocity normalized to 0-1
    // A lone chord at the measure start sounds from t=0 to the end of its measure.
    expect(e.time).toBeCloseTo(0);
    expect(e.duration).toBeCloseTo(64 * SECONDS_PER_QUANT); // 2.0s
  });

  it('ends a chord exactly where the next chord in the same measure begins', () => {
    const score = scoreWithChords([chord('c1', 0, 0, 'C'), chord('c2', 0, 32, 'G')]);
    const events = createChordPlaybackEvents(score, 120, 50);

    expect(events).toHaveLength(2);
    const [first, second] = events;
    expect(first.duration).toBeCloseTo(32 * SECONDS_PER_QUANT); // 1.0s, truncated at the next chord
    expect(second.time).toBeCloseTo(32 * SECONDS_PER_QUANT); // starts where the first ended
    expect(second.duration).toBeCloseTo(32 * SECONDS_PER_QUANT); // 1.0s, to end of measure
    // Contiguous, no gap or overlap.
    expect(second.time).toBeCloseTo(first.time + first.duration);
  });

  it('caps a chord at its own measure end when the next chord is in a later measure', () => {
    // Chord A in measure 0; the next chord is not until measure 1. A must NOT bleed
    // across the barline to reach it — it ends at its own measure end, leaving the
    // gap before B silent. (Exercises the "next chord in a later measure" branch.)
    const score = scoreWithChords([chord('c1', 0, 0, 'C'), chord('c2', 1, 32, 'G')]);
    const events = createChordPlaybackEvents(score, 120, 50);

    expect(events).toHaveLength(2);
    const [first, second] = events;
    // A: t=0, capped at end of measure 0 (64 quants = 2.0s), not extended to B at 3.0s.
    expect(first.time).toBeCloseTo(0);
    expect(first.duration).toBeCloseTo(64 * SECONDS_PER_QUANT); // 2.0s
    // B: starts at m1 q32 (global quant 96 = 3.0s), runs to the end of the 2-measure score.
    expect(second.time).toBeCloseTo(96 * SECONDS_PER_QUANT); // 3.0s
    expect(second.duration).toBeCloseTo(32 * SECONDS_PER_QUANT); // 1.0s
  });

  it('places chords in later measures at the correct global time offset', () => {
    const score = scoreWithChords([chord('c1', 1, 0, 'Am')]);
    const events = createChordPlaybackEvents(score, 120, 50);

    expect(events).toHaveLength(1);
    // Measure 1 starts at global quant 64 -> 2.0s; runs to end of the (2-measure) score.
    expect(events[0].time).toBeCloseTo(64 * SECONDS_PER_QUANT); // 2.0s
    expect(events[0].duration).toBeCloseTo(64 * SECONDS_PER_QUANT); // 2.0s
  });

  it('scales velocity with the supplied value', () => {
    const score = scoreWithChords([chord('c1', 0, 0, 'C')]);
    expect(createChordPlaybackEvents(score, 120, 100)[0].velocity).toBeCloseTo(100 / 127);
    expect(createChordPlaybackEvents(score, 120, 0)[0].velocity).toBeCloseTo(0);
  });

  it('skips chord symbols with no resolvable voicing instead of emitting silent events', () => {
    const score = scoreWithChords([chord('c1', 0, 0, 'not-a-chord'), chord('c2', 0, 32, 'C')]);
    const events = createChordPlaybackEvents(score, 120, 50);

    expect(events).toHaveLength(1);
    expect(events[0].symbol).toBe('C');
  });

  it('skips zero-duration chords (two chords stacked at the same position)', () => {
    const score = scoreWithChords([chord('c1', 0, 0, 'C'), chord('c2', 0, 0, 'G')]);
    const events = createChordPlaybackEvents(score, 120, 50);

    // The first chord has zero duration (next chord is at the same quant) and is
    // dropped; the second sounds to the end of the measure.
    expect(events).toHaveLength(1);
    expect(events[0].symbol).toBe('G');
    expect(events[0].duration).toBeCloseTo(64 * SECONDS_PER_QUANT);
  });

  it('respects time signature for measure length (3/4)', () => {
    const score: Score = { ...scoreWithChords([chord('c1', 0, 0, 'C')]), timeSignature: '3/4' };
    const events = createChordPlaybackEvents(score, 120, 50);

    // 3/4 = 48 quants per measure -> 48 * 0.03125 = 1.5s.
    expect(events[0].duration).toBeCloseTo(48 * SECONDS_PER_QUANT);
  });
});
