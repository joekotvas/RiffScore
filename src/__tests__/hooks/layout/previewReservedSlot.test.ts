/**
 * Preview over a reserved tuplet slot (#242 user bug): hovering the freed space yields a CHORD-mode
 * preview (it's an EVENT hit zone), but the slot is empty space, not a note to stack onto. The
 * ghost must be a STANDALONE note (length 1) — so it draws a stem instead of looking like a lone
 * notehead — and committing fills the slot.
 *
 * @see src/hooks/layout/usePreviewRender.ts, src/components/Canvas/GhostPreview.tsx
 */
import { renderHook } from '@testing-library/react';
import { usePreviewRender } from '@/hooks/layout/usePreviewRender';
import { PreviewNote, ScoreEvent } from '@/types';

const trip = (id: string, pitch: string | null, position: number, extra: Partial<ScoreEvent> = {}): ScoreEvent => ({
  id,
  duration: 'eighth',
  dotted: false,
  notes: pitch === null ? [{ id: `${id}n`, pitch: null, isRest: true }] : [{ id: `${id}n`, pitch }],
  tuplet: { ratio: [3, 2], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
  ...extra,
});

const events: ScoreEvent[] = [
  trip('t0', 'C4', 0),
  trip('t1', 'G4', 1),
  trip('res', null, 2, { reserved: true, isRest: true }),
];
const eventPositions = { t0: 10, t1: 30, res: 50 };

const preview = (index: number): PreviewNote => ({
  measureIndex: 0,
  staffIndex: 0,
  quant: 0,
  visualQuant: 0,
  pitch: 'A4',
  duration: 'eighth',
  dotted: false,
  mode: 'CHORD',
  index,
  isRest: false,
  source: 'hover',
});

const run = (index: number) =>
  renderHook(() =>
    usePreviewRender({
      previewNote: preview(index),
      events,
      measureIndex: 0,
      isLast: true,
      clef: 'treble',
      hitZones: [],
      eventPositions,
      totalWidth: 200,
      selectedNotes: [],
    })
  ).result.current;

describe('usePreviewRender over a reserved tuplet slot', () => {
  it('previews a STANDALONE note over a reserved slot (no chord-stack onto blank space)', () => {
    const r = run(2); // index 2 = the reserved slot
    expect(r?.chordNotes).toHaveLength(1); // GhostPreview draws a stem when CHORD + length 1
    expect(r?.x).toBe(eventPositions.res);
  });

  it('still chord-stacks (length 2) when previewing over a REAL note', () => {
    const r = run(1); // index 1 = G4, a real note
    expect(r?.chordNotes).toHaveLength(2); // existing note + preview → real chord stack (no own stem)
  });
});
