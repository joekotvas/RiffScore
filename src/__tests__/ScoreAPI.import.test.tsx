/**
 * ScoreAPI.import.test.tsx
 *
 * Tests for the `import()` API method: ABC and JSON text replace the score (undoably), with
 * structured feedback — `info` on a clean import, `warning` (IMPORT_WARNINGS) when parts of the
 * input could not be represented, `IMPORT_FAILED` (score untouched) on unparseable input.
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI, Result } from '../api.types';

const getAPI = (id: string): MusicEditorAPI => window.riffScore.get(id) as MusicEditorAPI;

const TWINKLE =
  'X:1\nT:Twinkle\nM:4/4\nL:1/4\nQ:1/4=100\nK:C\nC C G G | A A G2 | F F E E | D D C2 |]';

describe('ScoreAPI import()', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
    jest.restoreAllMocks();
  });

  const setup = (id: string) => {
    render(<RiffScore id={id} />);
    const api = getAPI(id);
    const results: Result[] = [];
    api.on('operation', (result: Result) => results.push(result));
    return { api, results, last: () => results[results.length - 1] };
  };

  test('imports ABC, replacing the score, and reports info', () => {
    const { api, last } = setup('import-abc');

    act(() => {
      api.import('abc', TWINKLE);
    });

    const score = api.getScore();
    expect(score.title).toBe('Twinkle');
    expect(score.bpm).toBe(100);
    expect(score.staves).toHaveLength(1);
    expect(score.staves[0].measures).toHaveLength(4);
    expect(score.staves[0].measures[0].events.map((e) => e.notes[0].pitch)).toEqual([
      'C4',
      'C4',
      'G4',
      'G4',
    ]);
    expect(last()).toMatchObject({
      ok: true,
      status: 'info',
      method: 'import',
      details: { format: 'abc', title: 'Twinkle', staves: 1, measures: 4, warnings: [] },
    });
  });

  test('is undoable and chainable', () => {
    const { api } = setup('import-undo');
    const before = api.getScore().title;

    act(() => {
      expect(api.import('abc', TWINKLE)).toBe(api);
    });
    expect(api.getScore().title).toBe('Twinkle');

    act(() => {
      api.undo();
    });
    expect(api.getScore().title).toBe(before);
  });

  test('reports a warning result listing what could not be represented', () => {
    const { api, last } = setup('import-warn');

    act(() => {
      api.import('abc', 'X:1\nK:G\n|: (3ABc d2 (A B) :|');
    });

    expect(api.getScore().staves[0].measures).toHaveLength(1);
    expect(last()).toMatchObject({
      ok: true,
      status: 'warning',
      method: 'import',
      code: 'IMPORT_WARNINGS',
    });
    expect(last().details?.warnings).toHaveLength(2);
    expect(last().details?.warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Repeat signs/),
        expect.stringMatching(/Slurs/),
      ])
    );
  });

  test('leaves the score untouched and reports IMPORT_FAILED on input with no music', () => {
    const { api, last } = setup('import-fail');
    const before = api.getScore();

    act(() => {
      api.import('abc', 'X:1\nT:Empty\nM:4/4\n');
    });

    expect(api.getScore()).toBe(before);
    expect(last()).toMatchObject({
      ok: false,
      status: 'error',
      method: 'import',
      code: 'IMPORT_FAILED',
      message: expect.stringMatching(/No music/),
    });
  });

  test('imports the JSON that export() produces', () => {
    const { api, last } = setup('import-json');
    act(() => {
      api.import('abc', TWINKLE);
    });
    const json = api.export('json');

    act(() => {
      api.reset('treble', 2);
    });
    expect(api.getScore().title).toBe('New Score');

    act(() => {
      api.import('json', json);
    });
    expect(api.getScore().title).toBe('Twinkle');
    expect(last()).toMatchObject({ ok: true, status: 'info', details: { format: 'json' } });
  });

  test('rejects malformed JSON with IMPORT_FAILED', () => {
    const { api, last } = setup('import-badjson');
    act(() => {
      api.import('json', '{"title": ');
    });
    expect(last()).toMatchObject({
      ok: false,
      code: 'IMPORT_FAILED',
      message: expect.stringMatching(/not valid JSON/),
    });
  });

  test('refuses an unsupported format with IMPORT_NOT_IMPLEMENTED', () => {
    const { api, last } = setup('import-format');
    act(() => {
      api.import('musicxml' as unknown as 'abc', '<score-partwise/>');
    });
    expect(last()).toMatchObject({
      ok: false,
      code: 'IMPORT_NOT_IMPLEMENTED',
      message: expect.stringMatching(/musicxml/),
    });
  });
});
