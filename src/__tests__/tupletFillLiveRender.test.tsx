/* eslint-disable testing-library/no-container, testing-library/no-node-access */
/**
 * Regression (user bug, round 2): filling a reserved tuplet slot on a MOUNTED editor must render
 * the note. Unlike extractFacts (fresh mount of the final score), this dispatches delete+fill on a
 * live RiffScore and inspects THAT instance's DOM — closer to the interactive flow where the note
 * "disappears on click".
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
import { extractFactsFromCanvas } from './helpers/visual';
import { createDefaultScore, Score, ScoreEvent } from '@/types';

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

const noteheadCount = (container: HTMLElement): number => {
  const canvas = container.querySelector('[data-testid="score-canvas-container"]');
  return canvas ? extractFactsFromCanvas(canvas).noteheads.length : -1;
};

describe('filling a reserved tuplet slot renders on a live editor', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
  });
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  it('shows 3 noteheads after delete-middle then fill the reserved slot', () => {
    const { container } = render(<RiffScore id="live-fill" />);
    const api = getAPI('live-fill');

    act(() => api.loadScore(tripScore()));
    act(() => {
      api.select(0, 0, 1);
      api.deleteSelected();
    });
    act(() => {
      api.select(0, 0, 2); // the reserved slot
      api.addNote('A4');
    });

    // Model is [C4, G4, A4]; all three must render.
    expect(api.getScore().staves[0].measures[0].events.map((e) => e.notes[0].pitch)).toEqual(['C4', 'G4', 'A4']);
    expect(noteheadCount(container)).toBe(3);
  });
});
