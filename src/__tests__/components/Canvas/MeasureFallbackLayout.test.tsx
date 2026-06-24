import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@/context/ThemeContext';
import Measure from '@/components/Canvas/Measure';
import { CONFIG } from '@/config';
import { createDefaultSelection, ScoreEvent } from '@/types';

const eighths = (count: number): ScoreEvent[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `e${i}`,
    duration: 'eighth',
    dotted: false,
    notes: [{ id: `n${i}`, pitch: 'B4' }],
  }));

describe('Measure fallback layout', () => {
  it('uses the real time signature for stretched fallback beaming (#245)', () => {
    const interaction = {
      selection: createDefaultSelection(),
      previewNote: null,
      activeDuration: 'quarter',
      isDotted: false,
      modifierHeld: false,
      isDragging: false,
      onAddNote: jest.fn(),
      onSelectNote: jest.fn(),
      onDragStart: jest.fn(),
      onHover: jest.fn(),
    };

    const { container } = render(
      <ThemeProvider>
        <svg>
          <Measure
            measureIndex={0}
            measureData={{ id: 'm0', events: eighths(6) }}
            startX={0}
            isLast
            stretchFactor={1.2}
            layout={{
              scale: 1,
              baseY: CONFIG.baseY,
              clef: 'treble',
              keySignature: 'C',
              timeSignature: '6/8',
              staffIndex: 0,
              verticalOffset: 0,
            }}
            interaction={interaction}
          />
        </svg>
      </ThemeProvider>
    );

    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    expect(container.querySelectorAll('.beam-group')).toHaveLength(2);
  });
});
