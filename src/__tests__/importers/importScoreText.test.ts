/**
 * importScoreText / importScoreData — the shared entry points (ABC, MusicXML or the editor's
 * JSON as text; a compressed .mxl or any score file as bytes).
 */

import { detectImportFormat, importScoreData, importScoreText } from '@/importers';
import { generateJSON } from '@/exporters/jsonExporter';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { createDefaultScore } from '@/types';
import { mxl } from '../helpers/zip';

const MUSICXML =
  '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes><note><pitch><step>D</step><octave>3</octave></pitch><duration>2</duration><type>half</type></note></measure></part></score-partwise>';

describe('detectImportFormat', () => {
  it('reads an object literal as JSON, a tag as MusicXML and anything else as ABC', () => {
    expect(detectImportFormat('{"title":"x"}')).toBe('json');
    expect(detectImportFormat('  \n{')).toBe('json');
    expect(detectImportFormat(MUSICXML)).toBe('musicxml');
    expect(detectImportFormat('\uFEFF  <score-partwise/>')).toBe('musicxml');
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

  it('imports MusicXML text', () => {
    const result = importScoreText(MUSICXML);
    expect(result).toMatchObject({ ok: true, format: 'musicxml', warnings: [] });
    if (!result.ok) throw new Error(result.error);
    expect(result.score.keySignature).toBe('D');
    expect(result.score.timeSignature).toBe('2/4');
    expect(result.score.staves[0].clef).toBe('bass');
    expect(result.score.staves[0].measures[0].events[0].notes[0].pitch).toBe('D3');
  });

  it('reports a MusicXML failure without throwing', () => {
    expect(importScoreText('<score-partwise><part-list/></score-partwise>')).toMatchObject({
      ok: false,
      format: 'musicxml',
      error: expect.stringMatching(/No <part> elements/),
    });
    expect(importScoreText('<a><b></a>', 'musicxml')).toMatchObject({
      ok: false,
      format: 'musicxml',
      error: expect.stringMatching(/not well-formed XML/),
    });
  });

  it('honours an explicit format over detection', () => {
    expect(importScoreText('C D E F|', 'json')).toMatchObject({ ok: false, format: 'json' });
    expect(importScoreText('{"x":1}', 'abc').format).toBe('abc');
    expect(importScoreText(MUSICXML, 'abc').format).toBe('abc');
  });
});

describe('importScoreData', () => {
  it('passes text through to importScoreText', () => {
    expect(importScoreData('X:1\nT:Tune\nK:C\nC D E F|')).toMatchObject({
      ok: true,
      format: 'abc',
    });
    expect(importScoreData(MUSICXML, 'musicxml')).toMatchObject({ ok: true, format: 'musicxml' });
  });

  it('unpacks a compressed .mxl given as a Uint8Array or an ArrayBuffer', () => {
    const bytes = mxl(MUSICXML);
    const fromBytes = importScoreData(bytes);
    expect(fromBytes).toMatchObject({ ok: true, format: 'musicxml', warnings: [] });
    expect(fromBytes.ok && fromBytes.score.staves[0].measures[0].events[0].notes[0].pitch).toBe(
      'D3'
    );
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect(importScoreData(buffer as ArrayBuffer)).toMatchObject({ ok: true, format: 'musicxml' });
  });

  it('decodes other files from bytes and detects their format', () => {
    const abc = new Uint8Array(Buffer.from('X:1\nT:Bytes\nK:C\nC D E F|', 'utf8'));
    const result = importScoreData(abc);
    expect(result).toMatchObject({ ok: true, format: 'abc' });
    expect(result.ok && result.score.title).toBe('Bytes');
    const json = new Uint8Array(Buffer.from(generateJSON(createDefaultScore()), 'utf8'));
    expect(importScoreData(json)).toMatchObject({ ok: true, format: 'json' });
  });

  it('accepts a Node Buffer (a Uint8Array from another realm) and refuses other content', () => {
    const buffer = Buffer.from(MUSICXML, 'utf8');
    expect(buffer instanceof Uint8Array).toBe(false); // jsdom's Uint8Array is not Node's
    expect(importScoreData(buffer)).toMatchObject({ ok: true, format: 'musicxml' });
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    expect(importScoreData(view as unknown as Uint8Array)).toMatchObject({ ok: true });
    expect(importScoreData(undefined as unknown as string, 'abc')).toEqual({
      ok: false,
      format: 'abc',
      error: 'content must be text, an ArrayBuffer or a Uint8Array',
      warnings: [],
    });
    expect(importScoreData(42 as unknown as string)).toMatchObject({
      ok: false,
      format: 'musicxml',
    });
  });

  it('reports an archive it cannot read', () => {
    expect(importScoreData(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toMatchObject({
      ok: false,
      format: 'musicxml',
      error: expect.stringMatching(/not a readable .mxl archive/),
    });
    // An archive is MusicXML whatever format the caller named.
    const zipBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    expect(importScoreData(zipBytes, 'abc').format).toBe('musicxml');
  });

  it('round-trips the exporter through the bytes path', () => {
    const score = { ...createDefaultScore(), title: 'Exported' };
    const result = importScoreData(new Uint8Array(Buffer.from(generateMusicXML(score), 'utf8')));
    expect(result).toMatchObject({ ok: true, format: 'musicxml', warnings: [] });
    expect(result.ok && result.score.title).toBe('Exported');
    expect(result.ok && result.score.staves.map((s) => s.clef)).toEqual(['treble', 'bass']);
  });
});
