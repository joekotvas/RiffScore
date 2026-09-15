/**
 * importScoreText — the shared text entry point (ABC or the editor's JSON).
 */

import { detectImportFormat, importScoreText } from '@/importers';
import { generateJSON } from '@/exporters/jsonExporter';
import { createDefaultScore } from '@/types';

describe('detectImportFormat', () => {
  it('reads an object literal as JSON and anything else as ABC', () => {
    expect(detectImportFormat('{"title":"x"}')).toBe('json');
    expect(detectImportFormat('  \n{')).toBe('json');
    expect(detectImportFormat('X:1\nK:C\nC|')).toBe('abc');
    expect(detectImportFormat('C D E F|')).toBe('abc');
    expect(detectImportFormat('')).toBe('abc');
  });
});

describe('importScoreText', () => {
  it('imports ABC', () => {
    const result = importScoreText('X:1\nT:Tune\nK:C\nC D E F|');
    expect(result).toMatchObject({ ok: true, format: 'abc', warnings: [] });
    expect(result.ok && result.score.title).toBe('Tune');
  });

  it('reports an ABC failure without throwing', () => {
    expect(importScoreText('X:1\nT:Nothing\n')).toMatchObject({
      ok: false,
      format: 'abc',
      error: expect.stringMatching(/No music/),
    });
  });

  it('imports the JSON the editor exports', () => {
    const score = createDefaultScore();
    const result = importScoreText(generateJSON(score));
    expect(result).toMatchObject({ ok: true, format: 'json', warnings: [] });
    expect(result.ok && result.score.staves.length).toBe(2);
  });

  it('rejects malformed JSON and JSON without staves', () => {
    expect(importScoreText('{"title": ')).toMatchObject({
      ok: false,
      format: 'json',
      error: expect.stringMatching(/not valid JSON/),
    });
    expect(importScoreText('{"title":"x"}')).toMatchObject({
      ok: false,
      format: 'json',
      error: 'missing or empty staves',
    });
    expect(importScoreText('{"title":"x","staves":[]}')).toMatchObject({
      ok: false,
      format: 'json',
    });
  });

  it('surfaces structural problems in JSON as warnings', () => {
    const score = createDefaultScore();
    score.staves[0].measures[0].events = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      duration: 'quarter',
      dotted: false,
      notes: [{ id: `n${i}`, pitch: 'C4' }],
    }));
    const result = importScoreText(JSON.stringify(score));
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.stringMatching(/Bar 1 \(staff 1\): overfull/)]);
  });

  it('honours an explicit format over detection', () => {
    expect(importScoreText('C D E F|', 'json')).toMatchObject({ ok: false, format: 'json' });
    expect(importScoreText('{"x":1}', 'abc').format).toBe('abc');
  });
});
