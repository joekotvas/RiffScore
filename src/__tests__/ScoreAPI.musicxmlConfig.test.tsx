/**
 * `config.score.musicxml` — declarative MusicXML import at mount.
 */

import { render } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';

const getAPI = (id: string): MusicEditorAPI => window.riffScore.get(id) as MusicEditorAPI;

const MUSICXML =
  '<score-partwise version="4.0"><work><work-title>From MusicXML</work-title></work><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="90"/></direction><note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note><note><pitch><step>A</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note></measure><measure number="2"><note><pitch><step>D</step><octave>5</octave></pitch><duration>3</duration><type>half</type><dot/></note></measure></part></score-partwise>';

describe('RiffScore config.score.musicxml', () => {
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

  test('renders the document as the initial score, taking title, key, meter and tempo from it', () => {
    render(
      <RiffScore
        id="musicxml-config"
        config={{ score: { title: 'Ignored', musicxml: MUSICXML } }}
      />
    );
    const score = getAPI('musicxml-config').getScore();
    expect(score.title).toBe('From MusicXML');
    expect(score.timeSignature).toBe('3/4');
    expect(score.keySignature).toBe('D');
    expect(score.bpm).toBe(90);
    expect(score.staves).toHaveLength(1);
    expect(score.staves[0].measures[0].events.map((e) => e.notes[0].pitch)).toEqual([
      'D4',
      'F#4',
      'A4',
    ]);
  });

  test('lets abc win when both are given', () => {
    render(
      <RiffScore
        id="musicxml-config-both"
        config={{ score: { abc: 'X:1\nT:From ABC\nK:C\nC4|', musicxml: MUSICXML } }}
      />
    );
    expect(getAPI('musicxml-config-both').getScore().title).toBe('From ABC');
  });

  test('falls back to the generator options when the MusicXML has no music', () => {
    render(
      <RiffScore
        id="musicxml-config-bad"
        config={{
          score: {
            staff: 'bass',
            measureCount: 3,
            musicxml: '<score-partwise><part-list/></score-partwise>',
          },
        }}
      />
    );
    const score = getAPI('musicxml-config-bad').getScore();
    expect(score.staves.map((s) => s.clef)).toEqual(['bass']);
    expect(score.staves[0].measures).toHaveLength(3);
    expect(jest.mocked(console.warn).mock.calls.flat().join(' ')).toMatch(/MusicXML import failed/);
  });
});
