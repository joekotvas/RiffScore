/**
 * Regression (user bug): note input after deleting a tuplet member must keep the group coherent.
 *
 * Deleting a tuplet member leaves a reserved slot and (in the UI) re-anchors the selection onto a
 * surviving SIBLING member. Typing a pitch there previously ran a duration-based overwrite, which
 * dropped the tuplet and ate the reserved slot, leaving an orphaned single-member group (groupSize
 * 3, one member) that renders broken / "invisible". Entry onto any tuplet member must instead set
 * that member at the tuplet's fixed rhythm — the group stays intact.
 *
 * @see src/commands/FillReservedSlotCommand.ts, src/hooks/note/useNoteEntry.ts, src/hooks/api/entry.ts
 */
jest.mock('@/engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

import { render, act } from '@testing-library/react';
import { RiffScore } from '@/RiffScore';
import type { MusicEditorAPI } from '@/api.types';
import { createDefaultScore, Score, ScoreEvent } from '@/types';
import { sumQuants } from '@/utils/tuplet';
import { extractFacts } from './helpers/visual';

const getAPI = (id: string): MusicEditorAPI => window.riffScore.get(id) as MusicEditorAPI;

const trip = (id: string, pitch: string, position: number): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
});

const tripScore = (): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events: [trip('t0', 'C4', 0), trip('t1', 'E4', 1), trip('t2', 'G4', 2)] }] }];
  return s;
};
const eventsOf = (s: Score) => s.staves[0].measures[0].events;

describe('note entry onto a tuplet member after deleting one (user bug)', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
  });
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  it('replaces the member pitch and keeps the tuplet coherent (no orphaned group)', () => {
    render(<RiffScore id="bug" />);
    const api = getAPI('bug');

    act(() => { api.loadScore(tripScore()); });
    act(() => { api.select(0, 0, 1); }); // select the middle member E4
    act(() => { api.deleteSelected(); }); // → [C4, G4, reserved]
    // The UI re-anchors onto the surviving sibling (now index 1); mimic that, then type a pitch.
    act(() => { api.select(0, 0, 1); });
    act(() => { api.addNote('A4', 'eighth'); });

    const events = eventsOf(api.getScore());
    // Group stays intact: 3 members, all same tuplet, with the typed pitch replacing the sibling.
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.tuplet?.id === 'T')).toBe(true);
    expect(events.map((e) => e.notes[0].pitch)).toEqual(['C4', 'A4', null]);
    expect(events[2].reserved).toBe(true);
    // Coherent footprint (no partial/orphaned tuplet).
    expect(sumQuants(events).partialTuplet).toBe(false);
  });

  it('renders both real noteheads (filled member is NOT invisible)', () => {
    render(<RiffScore id="bug2" />);
    const api = getAPI('bug2');
    act(() => { api.loadScore(tripScore()); });
    act(() => { api.select(0, 0, 1); });
    act(() => { api.deleteSelected(); });
    act(() => { api.select(0, 0, 1); });
    act(() => { api.addNote('A4', 'eighth'); });

    expect(extractFacts(api.getScore()).noteheads).toHaveLength(2); // C4 + A4 (reserved draws nothing)
  });
});
