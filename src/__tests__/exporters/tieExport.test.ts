/**
 * Tie export balance (#242 Lane E).
 *
 * Export must never emit an unbalanced tie. A note whose tie has no same-pitch successor (deleted
 * target, different pitch, end-of-staff) emits NO <tie type="start"/> (MusicXML) and no '-' token
 * (ABC); a valid tie emits a balanced start+stop.
 *
 * @see src/exporters/musicXmlExporter.ts, src/exporters/abcExporter.ts (findTieTarget gate)
 */
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { generateABC } from '@/exporters/abcExporter';
import { createDefaultScore, Score, ScoreEvent } from '@/types';

const q = (id: string, pitch: string | null, tied = false): ScoreEvent =>
  pitch === null
    ? { id, duration: 'quarter', dotted: false, isRest: true, notes: [{ id: `${id}n`, pitch: null, isRest: true }] }
    : { id, duration: 'quarter', dotted: false, notes: [{ id: `${id}n`, pitch, tied }] };

const scoreOf = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }] }];
  return s;
};

const count = (s: string, re: RegExp) => (s.match(re) || []).length;
const abcBody = (s: Score) =>
  generateABC(s, 120)
    .split('\n')
    .filter((l) => l.includes('|'))
    .join(' ');

describe('MusicXML tie balance', () => {
  it('suppresses a dangling tie (tied note followed by a rest) — no orphan start', () => {
    const xml = generateMusicXML(scoreOf([q('a', 'C4', true), q('r', null), q('c', 'E4'), q('d', 'F4')]));
    expect(count(xml, /<tie type="start"/g)).toBe(count(xml, /<tie type="stop"/g));
    expect(count(xml, /<tie type="start"/g)).toBe(0);
  });

  it('suppresses a tie to a different pitch', () => {
    const xml = generateMusicXML(scoreOf([q('a', 'C4', true), q('b', 'D4'), q('c', 'E4'), q('d', 'F4')]));
    expect(count(xml, /<tie type="start"/g)).toBe(0);
  });

  it('suppresses a tie on the very last note of the staff', () => {
    const xml = generateMusicXML(scoreOf([q('a', 'C4'), q('b', 'C4'), q('c', 'C4'), q('d', 'C4', true)]));
    expect(count(xml, /<tie type="start"/g)).toBe(count(xml, /<tie type="stop"/g));
    expect(count(xml, /<tie type="start"/g)).toBe(0);
  });

  it('emits a balanced start+stop for a valid tie', () => {
    const xml = generateMusicXML(scoreOf([q('a', 'C4', true), q('b', 'C4'), q('c', 'E4'), q('d', 'F4')]));
    expect(count(xml, /<tie type="start"/g)).toBe(1);
    expect(count(xml, /<tie type="stop"/g)).toBe(1);
  });
});

describe('ABC tie suppression', () => {
  it('emits no tie hyphen for a dangling tie', () => {
    expect(abcBody(scoreOf([q('a', 'C4', true), q('r', null), q('c', 'E4'), q('d', 'F4')]))).not.toContain('-');
  });

  it('emits a tie hyphen for a valid tie', () => {
    expect(abcBody(scoreOf([q('a', 'C4', true), q('b', 'C4'), q('c', 'E4'), q('d', 'F4')]))).toContain('-');
  });
});
