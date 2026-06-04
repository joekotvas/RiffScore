/**
 * Comprehensive Rendering Tests
 *
 * Renders a score containing a beamed pair, a triplet, and a rest through the real
 * ScoreEditor pipeline and asserts FIRST-PRINCIPLES engraving facts about the resulting
 * SVG. It uses the Verify-infra geometry + SMuFL helpers to read structured facts
 * (notehead glyph codepoints and positions, beam polygons, the tuplet number, the rest
 * glyph) rather than merely confirming render() did not throw.
 *
 * History: this file previously asserted NOTHING — its body ended with the comment
 * "If we got here without error, success?". It was rewritten as part of the correctness
 * effort (Verify-infra lane) to assert real musical/geometric correctness.
 *
 * @see ScoreEditor
 */

/*
 * This file verifies SVG ENGRAVING GEOMETRY (notehead glyph codepoints/positions, beam
 * polygons, the tuplet number, the rest glyph). Those SVG elements have no ARIA roles or
 * accessible text, so Testing Library's role/text queries cannot reach them — direct
 * node/container access is required and intentional here. The testing-library/no-node-
 * access and no-container rules are therefore disabled for this file; all other
 * testing-library rules remain in force.
 */
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from 'react';
import { render } from '@testing-library/react';
import { ThemeProvider } from '@/context/ThemeContext';
import ScoreEditor from '@components/Layout/ScoreEditor';
import { Score, ScoreEvent } from '@/types';
import { noteheads, beams } from './helpers/geometry';
import { codepointFor } from './helpers/glyphs/smuflRegistry';

// Create a score with a beamed pair, a triplet, and a rest to force rendering of all
// Measure sub-components (Beam, TupletBracket, Rest, Note).  The notes ascend
// C4 < D4 < E4 < F4 < G4 so the rendered notehead Y-positions must DESCEND (higher
// pitch -> smaller y), an engraving invariant we assert independently of the engine.
const createComplexScore = (): Score => {
  const beamedNotes: ScoreEvent[] = [
    { id: 'e1', duration: 'eighth', isRest: false, dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
    { id: 'e2', duration: 'eighth', isRest: false, dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
  ];

  const tupletNotes: ScoreEvent[] = [
    { id: 't1', duration: 'eighth', dotted: false, isRest: false, notes: [{ id: 'tn1', pitch: 'E4' }], tuplet: { ratio: [3, 2], groupSize: 3, position: 0 } },
    { id: 't2', duration: 'eighth', dotted: false, isRest: false, notes: [{ id: 'tn2', pitch: 'F4' }], tuplet: { ratio: [3, 2], groupSize: 3, position: 1 } },
    { id: 't3', duration: 'eighth', dotted: false, isRest: false, notes: [{ id: 'tn3', pitch: 'G4' }], tuplet: { ratio: [3, 2], groupSize: 3, position: 2 } },
  ];

  const restEvent: ScoreEvent = { id: 'r1', duration: 'quarter', isRest: true, dotted: false, notes: [] };

  return {
    title: 'Complex Render Test',
    bpm: 120,
    timeSignature: '4/4',
    keySignature: 'C',
    staves: [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'C',
        measures: [{ id: 'm1', events: [...beamedNotes, ...tupletNotes, restEvent] }],
      },
    ],
  };
};

// Mock the audio engine to avoid WebAudio errors
jest.mock('../engines/toneEngine', () => ({
  playNote: jest.fn(),
  setInstrument: jest.fn(),
  isSamplerLoaded: jest.fn(() => false),
  InstrumentType: {},
}));

describe('Comprehensive Rendering Test', () => {
  function renderScore() {
    const score = createComplexScore();
    return render(
      <ThemeProvider>
        <ScoreEditor initialData={score} />
      </ThemeProvider>
    );
  }

  it('renders all five eighth notes as BLACK noteheads (E0A4), never half/whole', () => {
    const { container } = renderScore();
    const heads = noteheads(container);

    // Five eighth notes -> five noteheads.
    expect(heads).toHaveLength(5);

    // Every notehead must be the BLACK glyph: an eighth note drawn with the half
    // (E0A3) or whole (E0A2) head would be musically wrong but visually near-identical.
    const black = codepointFor('noteheadBlack'); // 'e0a4', from the SMuFL spec registry
    for (const head of heads) {
      expect(head.codepoint).toBe(black);
    }
    expect(heads.map((h) => h.codepoint)).not.toContain(codepointFor('noteheadHalf'));
    expect(heads.map((h) => h.codepoint)).not.toContain(codepointFor('noteheadWhole'));
  });

  it('positions noteheads left-to-right and by pitch contour (ascending pitch -> descending Y)', () => {
    const { container } = renderScore();
    const heads = noteheads(container); // C4 D4 E4 F4 G4 in event order

    // Sequential horizontal layout: each notehead is strictly right of the previous.
    for (let i = 1; i < heads.length; i++) {
      expect(heads[i].x).toBeGreaterThan(heads[i - 1].x);
    }

    // Ascending pitches => strictly descending Y (SVG y grows downward, higher pitch
    // sits higher on the staff). This is the engraving invariant for a rising line.
    for (let i = 1; i < heads.length; i++) {
      expect(heads[i].y).toBeLessThan(heads[i - 1].y);
    }
  });

  it('draws beam polygons for the beamed eighth notes', () => {
    const { container } = renderScore();
    // Scope to the score canvas so toolbar icon polygons are excluded; beams are
    // rendered as filled <polygon> elements (Beam.tsx). The beamed pair and the triplet
    // are eighths, so at least one beam polygon must be present inside the canvas, each
    // with a real (>= 3 vertices) quadrilateral.
    const canvas = container.querySelector('[data-testid="score-canvas-container"]');
    expect(canvas).not.toBeNull();
    const beamFacts = beams(canvas as Element);
    expect(beamFacts.length).toBeGreaterThan(0);
    for (const beam of beamFacts) {
      expect(beam.points.length).toBeGreaterThanOrEqual(3); // a polygon needs >= 3 vertices
    }
  });

  it('renders the triplet bracket with the number 3', () => {
    const { container } = renderScore();
    const bracket = container.querySelector('.tuplet-bracket');
    expect(bracket).not.toBeNull();
    // The tuplet label must read "3" for a 3:2 triplet — not the raw ratio or a blank.
    const label = bracket!.querySelector('text');
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe('3');
  });

  it('renders the quarter rest with the quarter-rest glyph (E4E5)', () => {
    const { container } = renderScore();
    const restGroup = container.querySelector('.Rest');
    expect(restGroup).not.toBeNull();
    const restGlyph = restGroup!.querySelector('text');
    expect(restGlyph).not.toBeNull();
    expect(restGlyph!.textContent!.codePointAt(0)!.toString(16)).toBe(codepointFor('restQuarter'));
  });
});
