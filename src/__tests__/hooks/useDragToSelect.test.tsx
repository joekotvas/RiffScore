/**
 * useDragToSelect (lasso) — hook-level contract.
 *
 * Covers the page-aware options added for page view (explicit svg + page filtering), the
 * ignore list for interactive targets, and the focus handling around preventDefault(): the
 * hook must blur an open inline editor itself because preventDefault() suppresses the
 * browser's default focus change (regression: title/chord inputs never committed on click-away).
 */

import React, { useRef } from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { useDragToSelect } from '@/hooks/interaction/useDragToSelect';

type NotePos = Parameters<typeof useDragToSelect>[0]['notePositions'][number];

const note = (overrides: Partial<NotePos> = {}): NotePos => ({
  x: 10,
  y: 10,
  width: 20,
  height: 20,
  pageIndex: null,
  staffIndex: 0,
  measureIndex: 0,
  eventId: 'e',
  noteId: 'n',
  ...overrides,
});

function Harness({
  notePositions,
  onSelectionComplete,
  pageIndex,
}: {
  notePositions: NotePos[];
  onSelectionComplete: jest.Mock;
  pageIndex?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { handleMouseDown, isDragging, selectionRect } = useDragToSelect({
    svgRef,
    notePositions,
    onSelectionComplete,
    scale: 1,
  });

  return (
    <div>
      <input data-testid="editor-input" />
      <svg
        ref={svgRef}
        data-testid="svg"
        onMouseDown={(e) =>
          handleMouseDown(
            e,
            pageIndex === undefined ? undefined : { svgElement: svgRef.current, pageIndex }
          )
        }
      >
        <rect data-testid="background" width={400} height={400} />
        <rect data-testid="note-hit" data-note-hit-area="true" width={10} height={10} />
        <g className="riff-ChordTrack">
          <rect data-testid="chord-track" width={10} height={10} />
        </g>
        {isDragging && selectionRect && <rect data-testid="rect" {...selectionRect} />}
      </svg>
    </div>
  );
}

// jsdom reports a zero bounding rect, so client coordinates are svg coordinates here.
const drag = (target: Element, from: [number, number], to: [number, number]) => {
  fireEvent.mouseDown(target, { clientX: from[0], clientY: from[1] });
  fireEvent.mouseMove(document, { clientX: to[0], clientY: to[1] });
};

describe('useDragToSelect', () => {
  it('starts a drag from empty space and reports the notes inside the rectangle on mouseup', () => {
    const onSelectionComplete = jest.fn();
    render(<Harness notePositions={[note()]} onSelectionComplete={onSelectionComplete} />);

    drag(screen.getByTestId('background'), [0, 0], [50, 50]);
    expect(screen.getByTestId('rect')).toHaveAttribute('width', '50');

    fireEvent.mouseUp(document);
    expect(onSelectionComplete).toHaveBeenCalledWith(
      [{ staffIndex: 0, measureIndex: 0, eventId: 'e', noteId: 'n' }],
      false
    );
    expect(screen.queryByTestId('rect')).toBeNull();
  });

  it('restricts the selection to the page the drag started on', () => {
    const onSelectionComplete = jest.fn();
    render(
      <Harness
        notePositions={[
          note({ pageIndex: 0, eventId: 'p0' }),
          note({ pageIndex: 1, eventId: 'p1' }),
        ]}
        onSelectionComplete={onSelectionComplete}
        pageIndex={1}
      />
    );

    drag(screen.getByTestId('background'), [0, 0], [50, 50]);
    fireEvent.mouseUp(document);

    expect(onSelectionComplete).toHaveBeenCalledTimes(1);
    expect(onSelectionComplete.mock.calls[0][0].map((n: NotePos) => n.eventId)).toEqual(['p1']);
  });

  it.each([['note-hit'], ['chord-track']])('does not start from %s', (testId) => {
    const onSelectionComplete = jest.fn();
    render(<Harness notePositions={[note()]} onSelectionComplete={onSelectionComplete} />);

    drag(screen.getByTestId(testId), [0, 0], [50, 50]);
    expect(screen.queryByTestId('rect')).toBeNull();

    fireEvent.mouseUp(document);
    expect(onSelectionComplete).not.toHaveBeenCalled();
  });

  it('blurs a focused text input before preventing the default focus change', () => {
    render(<Harness notePositions={[note()]} onSelectionComplete={jest.fn()} />);
    const input = screen.getByTestId('editor-input');
    input.focus();
    // eslint-disable-next-line testing-library/no-node-access -- focus is the subject under test
    expect(document.activeElement).toBe(input);

    const notPrevented = fireEvent.mouseDown(screen.getByTestId('background'), {
      clientX: 0,
      clientY: 0,
    });

    expect(notPrevented).toBe(false); // preventDefault() was called
    // eslint-disable-next-line testing-library/no-node-access -- focus is the subject under test
    expect(document.activeElement).not.toBe(input);
  });
});
