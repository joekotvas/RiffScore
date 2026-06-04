/**
 * ABC Exporter — Accidental cancellation, header order, tuplets, ties
 * (first-principles).
 *
 * These tests assert REAL ABC semantics:
 *  - Measure-local accidental persistence: once an accidental is written it
 *    holds to the barline; a repeated altered note is NOT re-marked; a natural
 *    ('=') is required to cancel; state resets at the next barline. (Verified by
 *    inspecting the emitted token stream, not by mirroring the implementation.)
 *  - Q: (tempo) must precede K: (key) because K: is the LAST tune-header field.
 *  - Tuplet ratios use the explicit (p:q:r form so non-triplet ratios are right.
 *  - Tie hyphens follow the complete note token (pitch+duration), not before it.
 *  - Double accidentals come from the pitch spelling ('^^' / '__').
 */

import { generateABC } from '@/exporters/abcExporter';
import { Score, ScoreEvent } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The body line for voice 1 (everything after the V:1 header up to newline). */
const getVoiceBody = (abc: string): string => {
  const lines = abc.split('\n');
  const vIndex = lines.findIndex((l) => l.startsWith('V:1'));
  expect(vIndex).toBeGreaterThanOrEqual(0);
  // The body is the next non-empty line(s) until the next V: or end.
  const body: string[] = [];
  for (let i = vIndex + 1; i < lines.length; i++) {
    if (lines[i].startsWith('V:')) break;
    if (lines[i].trim() === '') continue;
    body.push(lines[i]);
  }
  return body.join(' ');
};

const quarter = (id: string, pitch: string, tied = false): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch, tied }],
});

const buildScore = (
  events: ScoreEvent[],
  keySignature = 'C',
  timeSignature = '4/4'
): Score => ({
  title: 'T',
  timeSignature,
  keySignature,
  bpm: 120,
  staves: [
    {
      id: 's1',
      clef: 'treble',
      keySignature,
      measures: [{ id: 'm1', events }],
    },
  ],
});

const buildMultiMeasureScore = (
  measures: ScoreEvent[][],
  keySignature = 'C'
): Score => ({
  title: 'T',
  timeSignature: '4/4',
  keySignature,
  bpm: 120,
  staves: [
    {
      id: 's1',
      clef: 'treble',
      keySignature,
      measures: measures.map((events, i) => ({ id: `m${i}`, events })),
    },
  ],
});

// ===========================================================================
// Header field order: Q: before K:
// ===========================================================================

describe('ABC header order (Q: precedes K:)', () => {
  it('emits the Q: tempo field before the K: key field', () => {
    const abc = generateABC(buildScore([quarter('e1', 'C4')]), 132);
    const qIndex = abc.indexOf('Q:1/4=132');
    const kIndex = abc.indexOf('\nK:');
    expect(qIndex).toBeGreaterThanOrEqual(0);
    expect(kIndex).toBeGreaterThanOrEqual(0);
    expect(qIndex).toBeLessThan(kIndex);
  });

  it('places K: as the final header field (immediately before the voice/body)', () => {
    const abc = generateABC(buildScore([quarter('e1', 'C4')]), 120);
    const lines = abc.split('\n');
    const kLineIndex = lines.findIndex((l) => l.startsWith('K:'));
    // Everything before K: is a header field; the line after K: starts the body.
    const headerFieldPattern = /^[A-Za-z]:/;
    for (let i = 0; i < kLineIndex; i++) {
      expect(lines[i]).toMatch(headerFieldPattern);
    }
    // The line after K: must NOT be a bare tune-header field like M:/L:/Q:.
    expect(lines[kLineIndex + 1]).not.toMatch(/^(M:|L:|Q:|T:|C:)/);
  });
});

// ===========================================================================
// Measure-local accidental cancellation
// ===========================================================================

describe('ABC measure-local accidental persistence and cancellation', () => {
  it('does NOT re-mark an altered note repeated within the same measure', () => {
    // C#4, C#4, C#4 in C major: the first carries '^', the rest are bare 'C'.
    const abc = generateABC(
      buildScore([quarter('e1', 'C#4'), quarter('e2', 'C#4'), quarter('e3', 'C#4'), quarter('e4', 'C#4')]),
      120
    );
    const body = getVoiceBody(abc);
    // Exactly one sharp glyph in the bar.
    const sharps = body.match(/\^/g) || [];
    expect(sharps).toHaveLength(1);
    // The first token is sharped; the later same-pitch notes are bare.
    expect(body).toMatch(/^\^C\b/);
  });

  it('emits a natural (=) to cancel a prior accidental within the measure', () => {
    // C#4 then C4 (natural) in the same C-major measure: '^C' then '=C'.
    const abc = generateABC(buildScore([quarter('e1', 'C#4'), quarter('e2', 'C4')]), 120);
    const body = getVoiceBody(abc);
    expect(body).toContain('^C');
    expect(body).toContain('=C');
    // The natural appears after the sharp.
    expect(body.indexOf('^C')).toBeLessThan(body.indexOf('=C'));
  });

  it('cancels a key-signature accidental with a natural and re-marks on return', () => {
    // In G major (F is sharp): F4(nat), F#4, F#4, F4(nat).
    // Expect: =F  ^F  F  =F  (cancel, re-sharp, hold, cancel).
    const abc = generateABC(
      buildScore(
        [quarter('e1', 'F4'), quarter('e2', 'F#4'), quarter('e3', 'F#4'), quarter('e4', 'F4')],
        'G'
      ),
      120
    );
    const body = getVoiceBody(abc);
    // Token sequence within the first measure.
    const measure = body.split('|')[0];
    const tokens = measure.trim().split(/\s+/).filter(Boolean);
    expect(tokens).toEqual(['=F', '^F', 'F', '=F']);
  });

  it('resets accidental state at the barline (new measure re-cancels key sig)', () => {
    // G major. Measure 1: F4 natural -> '=F'. Measure 2: F4 natural -> '=F' AGAIN.
    const abc = generateABC(
      buildMultiMeasureScore([[quarter('e1', 'F4')], [quarter('e2', 'F4')]], 'G'),
      120
    );
    const body = getVoiceBody(abc);
    const naturals = body.match(/=F/g) || [];
    expect(naturals).toHaveLength(2);
  });

  it('does NOT print an accidental for a note that matches the key signature', () => {
    // G major: F#4 is diatonic, so no glyph should be emitted for it.
    const abc = generateABC(buildScore([quarter('e1', 'F#4')], 'G'), 120);
    const body = getVoiceBody(abc);
    const measure = body.split('|')[0].trim();
    // Just the bare letter (uppercase F since octave 4), no ^ or =.
    expect(measure).toMatch(/^F\b/);
    expect(measure).not.toContain('^');
    expect(measure).not.toContain('=');
  });

  it('tracks accidentals per octave (F5 not cancelled by an F4 natural)', () => {
    // G major: F4 natural ('=F'), then F#5 (diatonic in the upper octave -> bare 'f').
    const abc = generateABC(buildScore([quarter('e1', 'F4'), quarter('e2', 'F#5')], 'G'), 120);
    const body = getVoiceBody(abc);
    expect(body).toContain('=F'); // lower octave naturalised
    // Upper-octave F#5 stays diatonic: lowercase f with no accidental glyph.
    expect(body).toMatch(/\bf\b/);
  });
});

// ===========================================================================
// Double accidentals from the pitch spelling
// ===========================================================================

describe('ABC double accidentals derive from the pitch', () => {
  it('emits ^^ for a double sharp (G##4 -> ^^G)', () => {
    const abc = generateABC(buildScore([quarter('e1', 'G##4')]), 120);
    const body = getVoiceBody(abc);
    expect(body).toContain('^^G');
  });

  it('emits __ for a double flat (Bbb4 -> __B)', () => {
    const abc = generateABC(buildScore([quarter('e1', 'Bbb4')]), 120);
    const body = getVoiceBody(abc);
    expect(body).toContain('__B');
  });
});

// ===========================================================================
// Tuplets: explicit (p:q:r form
// ===========================================================================

describe('ABC tuplet ratios use the explicit (p:q:r form', () => {
  const tupletScore = (ratio: [number, number], groupSize: number, baseDuration: string): Score => {
    const events: ScoreEvent[] = [];
    for (let i = 0; i < groupSize; i++) {
      events.push({
        id: `t${i}`,
        duration: baseDuration,
        dotted: false,
        notes: [{ id: `t${i}n`, pitch: 'C5' }],
        tuplet: { ratio, groupSize, position: i, baseDuration },
      });
    }
    return buildScore(events);
  };

  it('emits (3:2:3 for an eighth-note triplet', () => {
    const abc = generateABC(tupletScore([3, 2], 3, 'eighth'), 120);
    expect(getVoiceBody(abc)).toContain('(3:2:3');
  });

  it('emits (5:4:5 for a quintuplet (not the bare (5 shorthand, which means 5-in-2)', () => {
    const abc = generateABC(tupletScore([5, 4], 5, 'eighth'), 120);
    const body = getVoiceBody(abc);
    expect(body).toContain('(5:4:5');
    // Guard against the old bug: a bare "(5" without the explicit ratio.
    expect(body).not.toMatch(/\(5(?![:0-9])/);
  });

  it('emits the tuplet marker only once, on the first member', () => {
    const abc = generateABC(tupletScore([3, 2], 3, 'eighth'), 120);
    const markers = getVoiceBody(abc).match(/\(3:2:3/g) || [];
    expect(markers).toHaveLength(1);
  });
});

// ===========================================================================
// Ties: hyphen after the complete note token
// ===========================================================================

describe('ABC tie hyphen follows the note token (pitch + duration)', () => {
  it('places the tie hyphen after a single note duration (C-major C4 half tied)', () => {
    const score = buildScore([
      { id: 'e1', duration: 'half', dotted: false, notes: [{ id: 'n1', pitch: 'C4', tied: true }] },
      { id: 'e2', duration: 'half', dotted: false, notes: [{ id: 'n2', pitch: 'C4' }] },
    ]);
    const abc = generateABC(score, 120);
    const body = getVoiceBody(abc);
    // half note under L:1/4 is 'C2'; tied -> 'C2-' (hyphen AFTER the duration).
    expect(body).toContain('C2-');
    // The malformed form 'C-2' must not appear.
    expect(body).not.toContain('C-2');
  });

  it('places the tie hyphen after the chord bracket + duration', () => {
    const score = buildScore([
      {
        id: 'e1',
        duration: 'half',
        dotted: false,
        notes: [
          { id: 'n1', pitch: 'C4', tied: true },
          { id: 'n2', pitch: 'E4', tied: true },
        ],
      },
      {
        id: 'e2',
        duration: 'half',
        dotted: false,
        notes: [
          { id: 'n3', pitch: 'C4' },
          { id: 'n4', pitch: 'E4' },
        ],
      },
    ]);
    const abc = generateABC(score, 120);
    const body = getVoiceBody(abc);
    expect(body).toMatch(/\[CE\]2-/);
  });
});

// ===========================================================================
// Final barline
// ===========================================================================

describe('ABC final barline', () => {
  it('ends the tune body with a final barline |]', () => {
    const abc = generateABC(buildScore([quarter('e1', 'C4')]), 120);
    const body = getVoiceBody(abc);
    expect(body.trim().endsWith('|]')).toBe(true);
  });
});
