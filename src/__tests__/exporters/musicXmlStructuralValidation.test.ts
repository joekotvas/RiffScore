import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { Score, ScoreEvent } from '@/types';
import {
  validateMusicXmlStructure,
  allDurationsIntegral,
  parseMusicXml,
  checkTupletNotationPlacement,
} from '../fixtures/musicXmlStructure';

const q = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const representativeSingleStaffScore = (): Score => ({
  title: 'Structural',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'm1',
          events: [
            {
              id: 'chord',
              duration: 'quarter',
              dotted: false,
              notes: [
                { id: 'c', pitch: 'C4' },
                { id: 'e', pitch: 'E4' },
              ],
            },
            q('d', 'D4'),
            q('e', 'E4'),
            q('f', 'F4'),
          ],
        },
      ],
    },
  ],
});

const representativeGrandStaffScore = (): Score => ({
  title: 'Structural Grand',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'treble',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        { id: 'm1-t', events: [q('t1', 'C4'), q('t2', 'D4'), q('t3', 'E4'), q('t4', 'F4')] },
      ],
    },
    {
      id: 'bass',
      clef: 'bass',
      keySignature: 'C',
      measures: [
        { id: 'm1-b', events: [q('b1', 'C3'), q('b2', 'D3'), q('b3', 'E3'), q('b4', 'F3')] },
      ],
    },
  ],
});

const tripletEighth = (
  id: string,
  position: number,
  notes: ScoreEvent['notes']
): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T1' },
  notes,
});

// A 4/4 bar whose first beat is an eighth-note triplet — with the FIRST triplet member a
// chord — followed by three quarters. This exercises the defect class the structural
// validator exists for, end-to-end through generateMusicXML (not against hand-authored
// XML): content-derived <divisions> must keep the triplet <duration>s integral and summing
// to the bar (the old Math.floor bug summed to 15/16 of a beat), and the tuplet bracket
// must appear once on the primary note only — never duplicated on the chord member (M3 #245).
const representativeTupletScore = (): Score => ({
  title: 'Structural Tuplet',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'm1',
          events: [
            tripletEighth('tr0', 0, [
              { id: 'tr0c', pitch: 'C4' },
              { id: 'tr0e', pitch: 'E4' },
            ]),
            tripletEighth('tr1', 1, [{ id: 'tr1n', pitch: 'D4' }]),
            tripletEighth('tr2', 2, [{ id: 'tr2n', pitch: 'E4' }]),
            q('q2', 'F4'),
            q('q3', 'G4'),
            q('q4', 'A4'),
          ],
        },
      ],
    },
  ],
});

describe('MusicXML structural validator on real exporter output', () => {
  it('accepts a representative single-staff export with a chord event', () => {
    expect(validateMusicXmlStructure(generateMusicXML(representativeSingleStaffScore()))).toEqual(
      []
    );
  });

  it('accepts a representative grand-staff export with staff tags and backups', () => {
    expect(validateMusicXmlStructure(generateMusicXML(representativeGrandStaffScore()))).toEqual(
      []
    );
  });

  it('accepts a tuplet-containing export with integral durations that sum to the bar', () => {
    const xml = generateMusicXML(representativeTupletScore());
    expect(validateMusicXmlStructure(xml)).toEqual([]);
    // Guards the headline corruption class: every <duration> is a positive integer
    // (no Math.floor truncation) once <divisions> is content-derived.
    expect(allDurationsIntegral(parseMusicXml(xml))).toBe(true);
  });

  it('emits the tuplet bracket once on the primary note, never on a chord member', () => {
    const xml = generateMusicXML(representativeTupletScore());
    // Exactly one start + one stop bracket for the single triplet group — not dropped
    // because the primary note is a chord, and not duplicated onto the chord member.
    expect((xml.match(/<tuplet type="start"/g) ?? []).length).toBe(1);
    expect((xml.match(/<tuplet type="stop"/g) ?? []).length).toBe(1);
    expect(checkTupletNotationPlacement(parseMusicXml(xml))).toEqual([]);
  });
});
