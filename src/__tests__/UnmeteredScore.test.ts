import { parseABC } from '@/importers/abcImporter';
import { parseMusicXML } from '@/importers/musicXmlImporter';
import { generateABC } from '@/exporters/abcExporter';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { getMeasureCapacity } from '@/constants';
import { getMeasureTiming } from '@/services/MeasureTiming';
import { createTimeline } from '@/services/TimelineService';
import { createChordPlaybackEvents } from '@/engines/toneEngine';
import { calculateScoreLayout } from '@/engines/layout/scoreLayout';
import { validateScore } from '@/utils/validation';
import { SetTimeSignatureCommand } from '@/commands/SetTimeSignatureCommand';
import type { Score } from '@/types';

const fromABC = (music: string): Score => {
  const result = parseABC(`X:1\nM:none\nL:1/4\nQ:120\nK:C\n${music}`);
  if (!result.ok) throw new Error(result.error);
  expect(result.warnings).toEqual([]);
  return result.score;
};

describe('unmetered measures', () => {
  it('accepts more than eight beats in one measure and keeps finite timing and layout', () => {
    const score = fromABC('"C"C D E F G A B c d e | "G"G2 |]');
    expect(getMeasureCapacity(score.timeSignature)).toBe(Infinity);
    expect(score.staves[0].measures.map((m) => m.events.length)).toEqual([10, 1]);
    expect(score.staves[0].measures[0].isPickup).not.toBe(true);
    expect(validateScore(score).valid).toBe(true);
    expect(getMeasureTiming(score)).toEqual({ spans: [160, 32], starts: [0, 160], total: 192 });
    const timeline = createTimeline(score, 120);
    expect(timeline.at(-1)).toMatchObject({ time: 5, duration: 1, measureIndex: 1 });
    expect(
      createChordPlaybackEvents(score, 120).map(({ time, duration }) => ({ time, duration }))
    ).toEqual([
      { time: 0, duration: 5 },
      { time: 5, duration: 1 },
    ]);
    const layout = calculateScoreLayout(score);
    expect(Number.isFinite(layout.getX({ measure: 0, quant: 159 }))).toBe(true);
    expect(Number.isFinite(layout.getY.notes(160).top)).toBe(true);
  });

  it.each(['abc', 'musicxml'] as const)(
    'round-trips duration, rests and explicit bars through %s',
    (format) => {
      const score = fromABC('C D E F G A B c d e | z4 |]');
      const text = format === 'abc' ? generateABC(score, 120) : generateMusicXML(score);
      expect(text).not.toMatch(/Infinity|NaN|undefined/);
      const result = format === 'abc' ? parseABC(text) : parseMusicXML(text);
      if (!result.ok) throw new Error(result.error);
      expect(result.score.timeSignature).toBe('none');
      expect(getMeasureTiming(result.score)).toEqual(getMeasureTiming(score));
      expect(result.score.staves[0].measures.map((m) => m.events.length)).toEqual([10, 1]);
      expect(result.score.staves[0].measures[1].events[0].isRest).toBe(true);
    }
  );

  it('synchronizes an explicit barline to the longest staff, including empty staves', () => {
    const score = fromABC('C D E F G | A |]');
    const short = fromABC('C | D |]').staves[0];
    score.staves.push(short);
    expect(getMeasureTiming(score).starts).toEqual([0, 80]);
    const secondStaff = createTimeline(score, 120).filter((event) => event.staffIndex === 1);
    expect(secondStaff.map((event) => event.time)).toEqual([0, 2.5]);
    score.staves.forEach((staff) => {
      staff.measures[0].events = [];
    });
    expect(getMeasureTiming(score)).toEqual({ spans: [0, 16], starts: [0, 0], total: 16 });
  });

  it('can remove and restore a meter with undo without moving explicit chord anchors', () => {
    const score = fromABC('"C"C D | "G"G A |]');
    score.timeSignature = '4/4';
    const command = new SetTimeSignatureCommand('none');
    const free = command.execute(score);
    expect(free.staves[0].measures).toHaveLength(2);
    expect(free.chordTrack).toEqual(score.chordTrack);
    expect(command.undo(free)).toEqual(score);
    const metered = new SetTimeSignatureCommand('4/4').execute(fromABC('C D E F G A B c d e |]'));
    expect(metered.staves[0].measures).toHaveLength(3);
    expect(validateScore(metered).valid).toBe(true);
  });
});

it.each([1, 2])(
  'exports zero-length unmetered bars with %s staves without invalid rests',
  (staffCount) => {
    const score = fromABC('C | D |]');
    if (staffCount === 2) score.staves.push(fromABC('C | D |]').staves[0]);
    score.staves.forEach((staff) => {
      staff.measures[0].events = [];
    });
    const xml = generateMusicXML(score);
    expect(xml).not.toContain('<duration>0</duration>');
    const result = parseMusicXML(xml);
    if (!result.ok) throw new Error(result.error);
    expect(result.score.staves).toHaveLength(staffCount);
    expect(getMeasureTiming(result.score)).toEqual(getMeasureTiming(score));
    expect(result.score.staves[0].measures[0].events).toEqual([]);
  }
);

it('fills an empty unmetered staff only for the actual span of the other staff', () => {
  const score = fromABC('C D |]');
  const empty = fromABC('C |]').staves[0];
  empty.measures[0].events = [];
  score.staves.push(empty);
  const xml = generateMusicXML(score);
  expect(xml).toContain('<rest measure="yes"/>');
  const result = parseMusicXML(xml);
  if (!result.ok) throw new Error(result.error);
  expect(getMeasureTiming(result.score)).toEqual(getMeasureTiming(score));
  expect(result.score.staves[1].measures[0].events[0].isRest).toBe(true);
});
