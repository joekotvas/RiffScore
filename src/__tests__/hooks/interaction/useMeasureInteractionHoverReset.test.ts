/**
 * Regression: a notehead deleted WHILE hovered unmounts without firing its
 * onMouseLeave, so `isNoteHovered` (set true on hover via onNoteHover) would stay
 * stuck true. That froze the measure — handleMeasureMouseMove / handleMeasureClick
 * early-return on isNoteHovered and the renderer suppresses the hover preview — so a
 * just-emptied measure became ineditable (no hover preview, no click response),
 * while other measures kept working.
 *
 * Fix: useMeasureInteraction clears isNoteHovered whenever the measure's content
 * signature (event + note ids) changes, so a delete can't leave hover stuck.
 */

import { renderHook, act } from '@testing-library/react';
import { useMeasureInteraction } from '@/hooks/interaction/useMeasureInteraction';
import { Selection } from '@/types';

const selection: Selection = {
  staffIndex: 0,
  measureIndex: null,
  eventId: null,
  noteId: null,
  selectedNotes: [],
};

const baseParams = {
  hitZones: [],
  clef: 'treble',
  scale: 1,
  measureIndex: 0,
  isLast: false,
  previewNote: null,
  selection,
};

describe('useMeasureInteraction — stale note-hover reset', () => {
  it('clears isNoteHovered when the content signature changes (hovered note deleted)', () => {
    const { result, rerender } = renderHook(
      ({ sig }) => useMeasureInteraction({ ...baseParams, contentSignature: sig }),
      { initialProps: { sig: 'event_1:note_1' } }
    );

    // Hovering a notehead sets this true (ChordGroup -> onNoteHover(id)).
    act(() => result.current.setIsNoteHovered(true));
    expect(result.current.isNoteHovered).toBe(true);

    // Deleting the hovered note removes it from the measure -> signature changes.
    rerender({ sig: '' });
    expect(result.current.isNoteHovered).toBe(false);
  });

  it('keeps isNoteHovered while content is unchanged (normal hover is not disturbed)', () => {
    const { result, rerender } = renderHook(
      ({ sig }) => useMeasureInteraction({ ...baseParams, contentSignature: sig }),
      { initialProps: { sig: 'event_1:note_1' } }
    );

    act(() => result.current.setIsNoteHovered(true));
    expect(result.current.isNoteHovered).toBe(true);

    // An unrelated re-render with the same content must NOT clear the hover.
    rerender({ sig: 'event_1:note_1' });
    expect(result.current.isNoteHovered).toBe(true);
  });

  it('clears hover when a note is removed from a chord (event kept, note id gone)', () => {
    const { result, rerender } = renderHook(
      ({ sig }) => useMeasureInteraction({ ...baseParams, contentSignature: sig }),
      { initialProps: { sig: 'event_1:note_1|note_2' } }
    );

    act(() => result.current.setIsNoteHovered(true));
    expect(result.current.isNoteHovered).toBe(true);

    // One note deleted from the chord: same event id, fewer note ids.
    rerender({ sig: 'event_1:note_1' });
    expect(result.current.isNoteHovered).toBe(false);
  });
});
