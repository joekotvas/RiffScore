import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { Score, ScoreEvent } from '@/types';
import { validateMusicXmlStructure } from '../fixtures/musicXmlStructure';

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
});
