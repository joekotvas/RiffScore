/**
 * MusicXML — measure-local accidental context (Phase 1.5 seam fix).
 *
 * Before the fix the MusicXML exporter emitted <accidental> for EVERY altered
 * pitch (no key-signature suppression, no measure memory) and only emitted a
 * cancelling natural via the forbidden legacy `note.accidental` field — so its
 * visible engraving disagreed with both the on-screen renderer and the ABC
 * exporter. These tests assert MusicXML now follows standard engraving context,
 * while <alter> (the SOUNDING pitch) is still emitted unconditionally.
 *
 * Also wires the previously-orphaned checkDurationSums oracle to the REAL
 * generateMusicXML output (it had only been run against hand-built fixtures).
 */

import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { Score, ScoreEvent } from '@/types';
import { parseMusicXml, checkDurationSums, allDurationsIntegral } from '../fixtures/musicXmlStructure';

const note = (id: string, pitch: string) => ({ id, pitch });

const scoreOf = (events: ScoreEvent[], keySignature = 'C', timeSignature = '4/4'): Score => ({
  title: 'T',
  timeSignature,
  keySignature,
  bpm: 120,
  staves: [{ id: 's1', clef: 'treble', keySignature, measures: [{ id: 'm1', events }] }],
});

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [note(`${id}n`, pitch)],
});

const noteBlocks = (xml: string): string[] =>
  [...xml.matchAll(/<note>([\s\S]*?)<\/note>/g)].map((m) => m[1]);

describe('MusicXML <accidental> follows measure/key context (matches render + ABC)', () => {
  it('suppresses a repeated accidental within the measure (measure memory)', () => {
    // Two F#4 in one measure, C major: only the FIRST shows the sharp glyph,
    // but BOTH carry the sounding <alter>1</alter>.
    const xml = generateMusicXML(scoreOf([q('e1', 'F#4'), q('e2', 'F#4')]));
    const blocks = noteBlocks(xml).filter((b) => b.includes('<step>F</step>'));
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toContain('<accidental>sharp</accidental>');
    expect(blocks[1]).not.toContain('<accidental>');
    expect(blocks[0]).toContain('<alter>1</alter>');
    expect(blocks[1]).toContain('<alter>1</alter>');
  });

  it('suppresses a key-signature-implied accidental but keeps <alter>', () => {
    // F#4 in G major: the key signature already sharps F, so NO glyph — but the
    // sounding alteration must still be present.
    const xml = generateMusicXML(scoreOf([q('e1', 'F#4')], 'G'));
    const block = noteBlocks(xml).find((b) => b.includes('<step>F</step>'))!;
    expect(block).not.toContain('<accidental>');
    expect(block).toContain('<alter>1</alter>');
  });

  it('emits a natural to cancel a prior accidental in the measure', () => {
    // F#4 then F4 (C major): the F4 must show a natural to cancel the earlier sharp.
    const xml = generateMusicXML(scoreOf([q('e1', 'F#4'), q('e2', 'F4')]));
    const blocks = noteBlocks(xml).filter((b) => b.includes('<step>F</step>'));
    expect(blocks[0]).toContain('<accidental>sharp</accidental>');
    expect(blocks[1]).toContain('<accidental>natural</accidental>');
    expect(blocks[1]).not.toContain('<alter>'); // F natural has no <alter>
  });

  it('emits a natural to cancel the key signature', () => {
    // F4 in G major: must show a natural to cancel the key sharp.
    const xml = generateMusicXML(scoreOf([q('e1', 'F4')], 'G'));
    const block = noteBlocks(xml).find((b) => b.includes('<step>F</step>'))!;
    expect(block).toContain('<accidental>natural</accidental>');
  });

  it('still shows a genuinely new accidental in a key that does not imply it', () => {
    // C#4 in C major: nothing implies it, so the sharp must show.
    const xml = generateMusicXML(scoreOf([q('e1', 'C#4')]));
    const block = noteBlocks(xml).find((b) => b.includes('<step>C</step>'))!;
    expect(block).toContain('<accidental>sharp</accidental>');
    expect(block).toContain('<alter>1</alter>');
  });
});

describe('checkDurationSums oracle wired to real generateMusicXML output', () => {
  it('reports no violations for a complete 4/4 measure', () => {
    const xml = generateMusicXML(scoreOf([q('e1', 'C4'), q('e2', 'D4'), q('e3', 'E4'), q('e4', 'F4')]));
    expect(checkDurationSums(parseMusicXml(xml))).toEqual([]);
  });

  it('emits only positive-integer durations for a triplet (no floor-to-zero)', () => {
    // An eighth-note triplet group (3 in the time of 2) fills exactly one quarter
    // beat; in 1/4 it is a complete measure.
    const trip = (id: string, pitch: string, position: number): ScoreEvent => ({
      id,
      duration: 'eighth',
      dotted: false,
      notes: [note(`${id}n`, pitch)],
      tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth' },
    });
    const xml = generateMusicXML(
      scoreOf([trip('t0', 'C4', 0), trip('t1', 'D4', 1), trip('t2', 'E4', 2)], 'C', '1/4')
    );
    const parsed = parseMusicXml(xml);
    expect(allDurationsIntegral(parsed)).toBe(true);
    expect(checkDurationSums(parsed)).toEqual([]);
  });
});
