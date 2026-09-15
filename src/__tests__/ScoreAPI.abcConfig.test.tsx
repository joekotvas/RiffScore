/**
 * `config.score.abc` — declarative ABC import at mount.
 */

import { render } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';

const getAPI = (id: string): MusicEditorAPI => window.riffScore.get(id) as MusicEditorAPI;

describe('RiffScore config.score.abc', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
    jest.restoreAllMocks();
  });

  test('renders the tune as the initial score, taking title, key, meter and tempo from the ABC', () => {
    render(
      <RiffScore
        id="abc-config"
        config={{
          score: {
            title: 'Ignored',
            abc: 'X:1\nT:From ABC\nM:3/4\nL:1/4\nQ:1/4=90\nK:D\nD F A | d3 |',
          },
        }}
      />
    );
    const score = getAPI('abc-config').getScore();
    expect(score.title).toBe('From ABC');
    expect(score.timeSignature).toBe('3/4');
    expect(score.keySignature).toBe('D');
    expect(score.bpm).toBe(90);
    expect(score.staves[0].measures[0].events.map((e) => e.notes[0].pitch)).toEqual([
      'D4',
      'F#4',
      'A4',
    ]);
  });

  test('falls back to the generator options when the ABC has no music', () => {
    render(
      <RiffScore
        id="abc-config-bad"
        config={{ score: { staff: 'bass', measureCount: 3, abc: 'X:1\nT:Nothing\n' } }}
      />
    );
    const score = getAPI('abc-config-bad').getScore();
    expect(score.staves.map((s) => s.clef)).toEqual(['bass']);
    expect(score.staves[0].measures).toHaveLength(3);
    expect(jest.mocked(console.warn).mock.calls.flat().join(' ')).toMatch(/ABC import failed/);
  });
});
