/**
 * Reserved tuplet slot rendering (#242 Lane C).
 *
 * A reserved placeholder slot must occupy its space (so the tuplet keeps its span) but draw
 * NO rest glyph — unlike an explicitly-entered tuplet rest, which does render. Verified via the
 * jsdom fact net (glyph codepoints).
 */

// Mock the audio engine to avoid WebAudio errors under jsdom (as the other render tests do).
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { extractFacts } from '../helpers/visual';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';
import { FillReservedSlotCommand } from '@/commands/FillReservedSlotCommand';

const EIGHTH_REST = 'e4e6'; // SMuFL restEighth, lowercase hex (RESTS.eighth = )

const member = (
  id: string,
  pitch: string | null,
  position: number,
  extra: Partial<ScoreEvent> = {}
): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: pitch ? [{ id: `${id}n`, pitch }] : [{ id: `${id}n`, pitch: null, isRest: true }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
  ...extra,
});

const tripletScore = (middle: ScoreEvent): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [
    {
      ...s.staves[0],
      measures: [{ id: 'm0', events: [member('t0', 'C4', 0), middle, member('t2', 'G4', 2)] }],
    },
  ];
  return s;
};

describe('reserved tuplet slot rendering', () => {
  it('draws NO rest glyph for a reserved slot (but keeps the two real noteheads)', () => {
    const facts = extractFacts(tripletScore(member('t1', null, 1, { reserved: true, isRest: true })));
    expect(facts.glyphCodepoints).not.toContain(EIGHTH_REST);
    expect(facts.noteheads).toHaveLength(2); // the two real notes still render
  });

  it('DOES draw a rest glyph for an explicitly-entered tuplet rest (control)', () => {
    const facts = extractFacts(tripletScore(member('t1', null, 1, { isRest: true })));
    expect(facts.glyphCodepoints).toContain(EIGHTH_REST);
  });

  it('renders a notehead for a note that FILLED a reserved slot (delete member → fill)', () => {
    let score = tripletScore(member('t1', 'E4', 1)); // [C4, E4, G4] triplet
    score = new DeleteEventCommand(0, 't1').execute(score); // → [C4, G4, reserved]
    const slot = score.staves[0].measures[0].events.find((e) => e.reserved)!;
    score = new FillReservedSlotCommand(0, slot.id, { id: 'fn', pitch: 'A4' }).execute(score);
    const facts = extractFacts(score);
    // C4, G4, and the freshly-filled A4 must ALL render (the bug: the filled note is invisible).
    expect(facts.noteheads).toHaveLength(3);
  });
});
