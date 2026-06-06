/**
 * Export-time measure padding (#242 Stage E).
 *
 * Under-full measures (from shift-left delete) materialize trailing rests FOR EXPORT only;
 * pickups, empties, and full/tuplet bars are left alone; and reserved tuplet slots already
 * export as rests (so a tuplet bar is treated as full and never double-padded).
 */
import { padMeasureForExport } from '@/exporters/exportNormalize';
import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { DeleteEventCommand } from '@/commands/DeleteEventCommand';
import { sumQuants } from '@/utils/tuplet';
import { createDefaultScore, Measure, Score, ScoreEvent } from '@/types';

const trip = (id: string, pitch: string, position: number): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
});

const note = (id: string, duration: string): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: [{ id: `${id}n`, pitch: 'C4' }],
});
const measure = (events: ScoreEvent[], isPickup = false): Measure => ({ id: 'm', events, isPickup });

describe('padMeasureForExport', () => {
  it('pads an under-full bar to capacity with trailing rests', () => {
    const padded = padMeasureForExport(
      measure([note('a', 'quarter'), note('b', 'quarter'), note('c', 'quarter')]), // 48 of 64
      64
    );
    expect(padded.length).toBeGreaterThan(3);
    expect(sumQuants(padded).quants).toBe(64);
    expect(padded.slice(3).every((e) => e.isRest)).toBe(true); // the pad is rests
  });

  it('leaves a full bar untouched', () => {
    const events = [note('w', 'whole')];
    expect(padMeasureForExport(measure(events), 64)).toBe(events);
  });

  it('leaves a pickup bar untouched', () => {
    expect(padMeasureForExport(measure([note('a', 'quarter')], true), 64)).toHaveLength(1);
  });

  it('leaves an empty bar untouched (whole-rest handled elsewhere)', () => {
    expect(padMeasureForExport(measure([]), 64)).toHaveLength(0);
  });
});

describe('MusicXML export of shift-left content (#242)', () => {
  it('completes an under-full measure with a rest', () => {
    const score: Score = createDefaultScore();
    score.timeSignature = '4/4';
    score.staves = [
      { ...score.staves[0], measures: [{ id: 'm0', events: [note('a', 'quarter'), note('b', 'quarter')] }] },
    ];
    const xml = generateMusicXML(score);
    expect(xml).toContain('<rest'); // the 32-quant deficit is materialized as rest(s)
  });

  it('keeps the tuplet bracket balanced after deleting a member (reserved slot at the tail)', () => {
    const score: Score = createDefaultScore();
    score.timeSignature = '4/4';
    score.staves = [
      { ...score.staves[0], measures: [{ id: 'm0', events: [trip('t0', 'C5', 0), trip('t1', 'E5', 1), trip('t2', 'G5', 2)] }] },
    ];
    const after = new DeleteEventCommand(0, 't1').execute(score); // → [C5, G5, reserved]
    const xml = generateMusicXML(after);
    const starts = (xml.match(/<tuplet type="start"/g) || []).length;
    const stops = (xml.match(/<tuplet type="stop"/g) || []).length;
    expect(starts).toBe(stops); // balanced bracket (the reserved-rest tail emits the stop)
    expect(starts).toBe(1);
  });
});
