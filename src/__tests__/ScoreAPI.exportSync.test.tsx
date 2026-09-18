import { act, render } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import type { Score } from '../types';
import { importScoreData } from '../importers';

const setup = () => {
  render(<RiffScore id="export-sync" />);
  return window.riffScore.get('export-sync') as MusicEditorAPI;
};
const formats = ['json', 'abc', 'musicxml'] as const;
const pitches = (score: Score) =>
  score.staves.map((staff) =>
    staff.measures.flatMap((measure) =>
      measure.events.flatMap((event) => event.notes.map((n) => n.pitch).filter(Boolean))
    )
  );

// Parse actual output, rather than checking only that a serializer returned a nonempty string.
const readExport = (api: MusicEditorAPI, format: (typeof formats)[number]) => {
  const live = api.getScore();
  const before = JSON.stringify(live);
  const output = api.export(format);
  expect(api.result).toMatchObject({ ok: true, method: 'export' });
  const imported = importScoreData(output, format);
  if (!imported.ok) throw new Error(imported.error);
  expect(api.getScore()).toBe(live);
  expect(JSON.stringify(live)).toBe(before);
  expect(pitches(imported.score)).toEqual(pitches(live));
  return imported.score;
};

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
});
afterEach(() => {
  window.riffScore.instances.clear();
  window.riffScore.active = null;
});

describe('#323 exports read synchronous engine state', () => {
  test.each(formats)(
    '%s includes same-turn multistaff edits, metadata, tempo and harmony',
    (format) => {
      const api = setup();
      act(() => {
        api.reset('grand', 1).select(0, 0).addNote('C4', 'whole');
        api.select(0, 1).addNote('C3', 'whole');
        api
          .setTitle('Immediate')
          .setComposer('API regression')
          .setBpm(91)
          .addChord({ measure: 0, quant: 0 }, 'C7');
        const exported = readExport(api, format);
        expect(exported.metadata?.title ?? exported.title).toBe('Immediate');
        expect(exported.metadata?.composer).toBe('API regression');
        expect(exported.bpm).toBe(91);
        expect(exported.chordTrack?.map((chord) => chord.symbol)).toEqual(['C7']);
      });
    }
  );

  test.each(formats)('%s follows edit/delete and undo/redo without adding history', (format) => {
    const api = setup();
    act(() => api.reset('treble', 1).select(0).addNote('C4'));
    act(() => {
      api.select(0, 0, 0).setPitch('D4');
      expect(pitches(readExport(api, format))).toEqual([['D4']]);
      api.undo();
      expect(pitches(readExport(api, format))).toEqual([['C4']]);
      api.redo();
      expect(pitches(readExport(api, format))).toEqual([['D4']]);
      api.select(0, 0, 0).deleteSelected();
      // Empty notation imports may refuse a score with no music; JSON remains exact.
      const output = api.export(format);
      if (format === 'json') expect(JSON.parse(output)).toEqual(api.getScore());
      else if (format === 'abc') expect(output).not.toMatch(/\bD\b/);
      else expect(output).not.toContain('<pitch>');
      api.undo();
      expect(pitches(readExport(api, format))).toEqual([['D4']]);
    });
  });

  test.each(formats)(
    '%s follows load and every supported import format in the same turn',
    (format) => {
      const api = setup();
      const loaded: Score = {
        title: 'Loaded',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 84,
        staves: [
          {
            id: 'loaded-staff',
            clef: 'treble',
            keySignature: 'C',
            measures: [
              {
                id: 'loaded-bar',
                events: [
                  {
                    id: 'loaded-event',
                    duration: 'whole',
                    dotted: false,
                    notes: [{ id: 'loaded-note', pitch: 'F4' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      act(() => {
        api.loadScore(loaded);
        expect(readExport(api, format).title).toBe('Loaded');
        api.import('abc', 'X:1\nT:Imported\nM:4/4\nL:1/4\nQ:1/4=99\nK:C\nG4 |]');
        expect(pitches(readExport(api, format))).toEqual([['G4']]);
        api.import('json', JSON.stringify(loaded));
        expect(pitches(readExport(api, format))).toEqual([['F4']]);
        api.import(
          'musicxml',
          '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>A</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>'
        );
        expect(pitches(readExport(api, format))).toEqual([['A4']]);
      });
    }
  );

  test.each(formats)(
    '%s sees open/committed transactions and rollback without changing history',
    (format) => {
      const api = setup();
      act(() => api.reset('treble', 1).select(0).addNote('C4'));
      act(() => {
        api.beginTransaction().addNote('D4').addNote('E4');
        expect(pitches(readExport(api, format))).toEqual([['C4', 'D4', 'E4']]);
        api.commitTransaction('Phrase');
        readExport(api, format);
        api.undo();
        expect(pitches(readExport(api, format))).toEqual([['C4']]);
        api.redo();
        expect(pitches(readExport(api, format))).toEqual([['C4', 'D4', 'E4']]);
        api.beginTransaction().setTitle('Rolled back');
        const pending = readExport(api, format);
        expect(pending.metadata?.title ?? pending.title).toBe('Rolled back');
        api.rollbackTransaction();
        expect(readExport(api, format).metadata?.title).not.toBe('Rolled back');
      });
    }
  );
});
