import { renderHook } from '@testing-library/react';
import type { ScoreLayout } from '../engines/layout/types';
import type { Selection, PreviewNote } from '../types';
import { useAutoScroll } from '../hooks/layout/useAutoScroll';

const scrollTo = jest.fn();
const container = {
  clientWidth: 240,
  scrollWidth: 1800,
  scrollLeft: 0,
  scrollTo,
} as unknown as HTMLDivElement;
const layout = {
  staves: [{ measures: [{ x: 500, events: { event: { localX: 40 } } }] }],
  getX: Object.assign(() => 80, { measureOrigin: () => 500 }),
} as unknown as ScoreLayout;
const selection = { measureIndex: 0, staffIndex: 0, eventId: 'event' } as Selection;
const idle = { measureIndex: null, quant: null, duration: 0 };
const base = {
  containerRef: { current: container },
  layout,
  selection,
  playbackPosition: idle,
  previewNote: null,
  scale: 2,
  originX: 100,
};
beforeEach(() => {
  scrollTo.mockClear();
});

test('selection follows actual engraving with origin, scale and a viewport-relative margin', () => {
  renderHook(() => useAutoScroll(base));
  expect(scrollTo).toHaveBeenCalledWith({ left: 700, behavior: expect.any(String) });
});
test('disabled and zero-width hosts do not scroll', () => {
  renderHook(() => useAutoScroll({ ...base, enabled: false }));
  renderHook(() =>
    useAutoScroll({
      ...base,
      containerRef: { current: { ...container, clientWidth: 0 } as HTMLDivElement },
    })
  );
  expect(scrollTo).not.toHaveBeenCalled();
});
test('playback and keyboard previews use the canonical quant position', () => {
  renderHook(() =>
    useAutoScroll({
      ...base,
      selection: { ...selection, eventId: null },
      playbackPosition: { measureIndex: 0, quant: 16, duration: 0 },
    })
  );
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 780, behavior: expect.any(String) });
  scrollTo.mockClear();
  renderHook(() =>
    useAutoScroll({
      ...base,
      selection: { ...selection, eventId: null },
      previewNote: { measureIndex: 0, visualQuant: 16, source: 'keyboard' } as PreviewNote,
    })
  );
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 780, behavior: expect.any(String) });
});
test('mouse previews never cause scrolling', () => {
  renderHook(() =>
    useAutoScroll({
      ...base,
      selection: { ...selection, eventId: null },
      previewNote: { measureIndex: 0, visualQuant: 16, source: 'mouse' } as PreviewNote,
    })
  );
  expect(scrollTo).not.toHaveBeenCalled();
});

test('reduced motion uses immediate scrolling and clamps to the available extent', () => {
  const original = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: true }),
  });
  renderHook(() => useAutoScroll({ ...base, scale: 20 }));
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 1560, behavior: 'auto' });
  if (original) Object.defineProperty(window, 'matchMedia', original);
  else Reflect.deleteProperty(window, 'matchMedia');
});

test('selected chord symbols follow their measure and quant without an event selection', () => {
  renderHook(() =>
    useAutoScroll({
      ...base,
      chordTrack: [{ id: 'chord', measure: 0, quant: 32, symbol: 'C' }],
      selection: { ...selection, measureIndex: null, eventId: null, chordId: 'chord' },
    })
  );
  expect(scrollTo).toHaveBeenLastCalledWith({ left: 780, behavior: expect.any(String) });
});
