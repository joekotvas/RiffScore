/**
 * Vertical layout: staff extents, lyric bands and content-aware staff offsets.
 */
import {
  calculateMeasureExtent,
  calculateStaffOffsets,
  lyricBandHeight,
  lyricLineBaseline,
  unionExtents,
  EMPTY_STAFF_EXTENT,
} from '@/engines/layout/vertical';
import { calculateMeasureLayout } from '@/engines/layout/measure';
import { calculateBeamingGroups } from '@/engines/layout/beaming';
import { calculateTupletBrackets } from '@/engines/layout/tuplets';
import { getOffsetForPitch } from '@/engines/layout/positioning';
import { CONFIG } from '@/config';
import { BEAMING, LYRICS, STAFF_DISTANCE, STAFF_HEIGHT, STEM, TUPLET } from '@/constants';
import type { ScoreEvent } from '@/types';

const SPACE = CONFIG.lineHeight;
const off = (p: string, clef = 'treble') => getOffsetForPitch(p, clef); // relative to the top line

const ev = (
  id: string,
  duration: string,
  pitches: string[],
  extra: Partial<ScoreEvent> = {}
): ScoreEvent => ({
  id,
  duration,
  dotted: false,
  notes: pitches.map((p, i) => ({ id: `${id}n${i}`, pitch: p })),
  ...extra,
});

const extentOf = (events: ScoreEvent[], clef = 'treble', timeSignature = '4/4') => {
  const relative = calculateMeasureLayout(events, undefined, clef);
  const beams = calculateBeamingGroups(events, relative.eventPositions, clef, timeSignature);
  const tuplets = calculateTupletBrackets(
    relative.processedEvents,
    relative.eventPositions,
    clef,
    beams
  );
  return { extent: calculateMeasureExtent(relative, beams, tuplets), beams };
};

describe('calculateMeasureExtent', () => {
  test('an empty measure is the bare staff', () => {
    expect(extentOf([]).extent).toEqual(EMPTY_STAFF_EXTENT);
  });

  test('a whole note inside the staff adds only its head', () => {
    const { extent } = extentOf([ev('e1', 'whole', ['B4'])]);
    expect(extent).toEqual(EMPTY_STAFF_EXTENT);
  });

  test('an unbeamed quarter reaches a standard stem past its head', () => {
    // C4 (first ledger line below): head bottom at 60 + 6; stem up ends at 60 - 44 (inside the staff).
    // D5's down-stem ends at 12 + 44 = 56, inside the C4 head's reach.
    const { extent } = extentOf([
      ev('e1', 'quarter', ['C4']),
      ev('e2', 'half', ['D5']),
      ev('e3', 'quarter', ['A5']),
    ]);
    expect(extent.bottom).toBeCloseTo(off('C4') + SPACE / 2, 6);
    // A5 stems down: head at -12, stem to -12 + 44 = 32 (inside); head top at -12 - 6.
    expect(extent.top).toBeCloseTo(off('A5') - SPACE / 2, 6);
  });

  test('a beamed group reaches its beam edge', () => {
    // D5 C6 F5 C4 stems down: the beam sits below C4 (shortened stem) plus half the thickness.
    const events = ['D5', 'C6', 'F5', 'C4'].map((p, i) => ev(`e${i}`, 'eighth', [p]));
    const { extent, beams } = extentOf([...events, ev('h', 'half', ['B4'])]);
    expect(beams[0].direction).toBe('down');
    const beamBottom =
      Math.max(beams[0].startY, beams[0].endY) + BEAMING.THICKNESS / 2 - CONFIG.baseY;
    expect(extent.bottom).toBeCloseTo(beamBottom, 6);
    expect(extent.bottom).toBeGreaterThan(off('C4') + STEM.BEAMED_SHORT_LENGTHS.default - 1);
    expect(extent.top).toBeCloseTo(off('C6') - SPACE / 2, 6); // C6 head, beam is below
  });

  test('a tuplet bracket adds its hook and number', () => {
    const trip = ['A5', 'G5', 'F5'].map((p, i) =>
      ev(`t${i}`, 'eighth', [p], { tuplet: { ratio: [3, 2], groupSize: 3, position: i } })
    );
    const { extent } = extentOf([...trip, ev('q', 'quarter', ['B4']), ev('h', 'half', ['B4'])]);
    // High triplet: stems down, beam below, bracket below the beam with its number below that.
    expect(extent.bottom).toBeGreaterThan(STAFF_HEIGHT + TUPLET.NUMBER_OFFSET_DOWN);
  });

  test('rests do not extend the staff', () => {
    const { extent } = extentOf([
      { id: 'r', duration: 'whole', dotted: false, isRest: true, notes: [] },
    ]);
    expect(extent).toEqual(EMPTY_STAFF_EXTENT);
  });

  test('union takes the outermost of each side', () => {
    expect(
      unionExtents([
        { top: -10, bottom: 50 },
        { top: -4, bottom: 90 },
      ])
    ).toEqual({ top: -10, bottom: 90 });
    expect(unionExtents([])).toEqual(EMPTY_STAFF_EXTENT);
  });
});

describe('lyric band', () => {
  test('no lines reserve nothing; each extra line adds one line height', () => {
    expect(lyricBandHeight(0)).toBe(0);
    expect(lyricBandHeight(1)).toBe(LYRICS.GAP_ABOVE + LYRICS.ASCENT + LYRICS.DESCENT);
    expect(lyricBandHeight(3) - lyricBandHeight(1)).toBe(2 * LYRICS.LINE_HEIGHT);
  });

  test('the first baseline under a bare staff is about 1.8 spaces below the bottom line', () => {
    const baseline = lyricLineBaseline(STAFF_HEIGHT, 0);
    expect((baseline - STAFF_HEIGHT) / SPACE).toBeCloseTo(1.83, 1);
    expect(lyricLineBaseline(STAFF_HEIGHT, 1) - baseline).toBe(LYRICS.LINE_HEIGHT);
  });

  test('lines move down under ledger notes or beams, never up', () => {
    expect(lyricLineBaseline(90, 0)).toBe(90 + LYRICS.GAP_ABOVE + LYRICS.ASCENT);
    expect(lyricLineBaseline(20, 0)).toBe(lyricLineBaseline(STAFF_HEIGHT, 0));
  });
});

describe('calculateStaffOffsets', () => {
  test('bare staves keep the default distance', () => {
    const v = calculateStaffOffsets([EMPTY_STAFF_EXTENT, EMPTY_STAFF_EXTENT]);
    expect(v.offsets).toEqual([0, CONFIG.staffSpacing]);
    expect(v.top).toBe(0);
    expect(v.bottom).toBe(CONFIG.staffSpacing + STAFF_HEIGHT);
  });

  test('content that fits in the gap does not move the lower staff', () => {
    // Upper reaches 40 px below its bottom line, lower 20 px above its top line: 88 + 12 + 20 = 120.
    const v = calculateStaffOffsets([
      { top: 0, bottom: 88 },
      { top: -20, bottom: 48 },
    ]);
    expect(v.offsets[1]).toBe(CONFIG.staffSpacing);
  });

  test('content that would touch opens the gap by exactly the shortfall', () => {
    const v = calculateStaffOffsets([
      { top: 0, bottom: 100 },
      { top: -30, bottom: 48 },
    ]);
    expect(v.offsets[1]).toBe(100 + STAFF_DISTANCE.MIN_CLEARANCE + 30);
    expect(v.offsets[1]).toBeGreaterThan(CONFIG.staffSpacing);
  });

  test('a lyric band on the upper staff pushes the lower staff down', () => {
    // Upper staff already past the default distance (110 + 12 > 120), so the band shows in full.
    const bare = calculateStaffOffsets([{ top: 0, bottom: 110 }, EMPTY_STAFF_EXTENT]);
    const withLyrics = calculateStaffOffsets([{ top: 0, bottom: 110 }, EMPTY_STAFF_EXTENT], [2, 0]);
    expect(withLyrics.offsets[1] - bare.offsets[1]).toBe(lyricBandHeight(2));
    expect(withLyrics.lyricBands).toEqual([lyricBandHeight(2), 0]);
  });

  test('a lyric band on the last staff extends the bottom, not the offsets', () => {
    const v = calculateStaffOffsets([EMPTY_STAFF_EXTENT, EMPTY_STAFF_EXTENT], [0, 1]);
    expect(v.offsets).toEqual([0, CONFIG.staffSpacing]);
    expect(v.bottom).toBe(CONFIG.staffSpacing + STAFF_HEIGHT + lyricBandHeight(1));
  });

  test('top reports ink above the first staff; three staves chain', () => {
    const v = calculateStaffOffsets([
      { top: -40, bottom: 48 },
      { top: 0, bottom: 110 },
      { top: -50, bottom: 48 },
    ]);
    expect(v.top).toBe(-40);
    expect(v.offsets).toEqual([0, CONFIG.staffSpacing, CONFIG.staffSpacing + 110 + 12 + 50]);
  });

  test('empty input', () => {
    expect(calculateStaffOffsets([])).toEqual({ offsets: [], top: 0, bottom: 0, lyricBands: [] });
  });
});
