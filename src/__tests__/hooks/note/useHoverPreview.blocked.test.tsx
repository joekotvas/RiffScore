/**
 * #242: hovering a spot where the active note can't be placed marks the preview `blocked` (instead
 * of suppressing it). The ghost then renders greyed with an X and the footer shows the reason.
 *   - full tuplet insert gap → 'tuplet-full'
 *   - bar with no room        → 'measure-full'
 */
import { renderHook, act } from '@testing-library/react';
import { RefObject } from 'react';
import { useHoverPreview } from '@/hooks/note/useHoverPreview';
import { createDefaultScore, Score, ScoreEvent, PreviewNote } from '@/types';
import type { HitZone } from '@/engines/layout/types';

const scoreWith = (events: ScoreEvent[]): Score => {
  const s = createDefaultScore();
  s.timeSignature = '4/4';
  s.staves = [{ ...s.staves[0], measures: [{ id: 'm0', events }, { id: 'm1', events: [] }] }];
  return s;
};

const trip = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position: 0, baseDuration: 'eighth', id: 'T' },
});
const quarter = (id: string, pitch: string): ScoreEvent => ({
  id,
  duration: 'quarter',
  dotted: false,
  notes: [{ id: `${id}n`, pitch }],
});

const hoverPreview = (score: Score, hit: HitZone, activeDuration = 'eighth'): PreviewNote | null => {
  const setPreviewNote = jest.fn();
  const { result } = renderHook(() =>
    useHoverPreview({
      scoreRef: { current: score } as RefObject<Score>,
      setPreviewNote,
      activeDuration,
      isDotted: false,
      activeAccidental: null,
      currentQuantsPerMeasure: 64,
      inputMode: 'NOTE',
    })
  );
  act(() => result.current.handleMeasureHover(0, hit, 'C4', 0));
  const arg = setPreviewNote.mock.calls.at(-1)?.[0];
  return typeof arg === 'function' ? arg(null) : (arg ?? null);
};

describe('useHoverPreview blocked previews', () => {
  it('marks a full-tuplet insert gap as blocked: "tuplet-full" (not suppressed)', () => {
    const score = scoreWith([trip('a', 'C4'), trip('b', 'E4'), trip('c', 'G4')]);
    const preview = hoverPreview(score, { type: 'INSERT', index: 1, startX: 10, endX: 20 } as HitZone);
    expect(preview).not.toBeNull();
    expect(preview?.blocked).toBe('tuplet-full');
  });

  it('marks an insert into a FULL bar as blocked: "measure-full"', () => {
    const full = scoreWith([quarter('a', 'C4'), quarter('b', 'D4'), quarter('c', 'E4'), quarter('d', 'F4')]);
    const preview = hoverPreview(full, { type: 'INSERT', index: 2, startX: 10, endX: 20 } as HitZone, 'quarter');
    expect(preview?.blocked).toBe('measure-full');
  });

  it('marks APPEND on a full NON-last bar as blocked (does not silently vanish)', () => {
    const full = scoreWith([quarter('a', 'C4'), quarter('b', 'D4'), quarter('c', 'E4'), quarter('d', 'F4')]);
    const preview = hoverPreview(full, { type: 'APPEND', index: 4, startX: 90, endX: 110 } as HitZone, 'quarter');
    expect(preview?.blocked).toBe('measure-full');
  });

  it('an incomplete tuplet gap is NOT blocked (normal insert ghost)', () => {
    const score = scoreWith([
      trip('a', 'C4'),
      trip('b', 'E4'),
      { ...trip('r', 'X'), reserved: true, isRest: true, notes: [{ id: 'r-rest', pitch: null, isRest: true, reserved: true }] },
    ]);
    const preview = hoverPreview(score, { type: 'INSERT', index: 1, startX: 10, endX: 20 } as HitZone);
    expect(preview?.blocked).toBeUndefined();
  });
});
