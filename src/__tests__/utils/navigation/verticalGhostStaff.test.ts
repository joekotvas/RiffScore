/**
 * QA #3/#11 (#242): moving a tuplet-fill ghost to ANOTHER staff over empty space must drop the
 * origin's reserved-slot anchor (eventId/CHORD/reservedIndex). Otherwise Enter would route into the
 * reserved-fill path that can't resolve the slot on the new staff (silent no-op / lost note), and the
 * ghost would render at x=0 (eventPositions miss).
 */
import { calculateVerticalNavigation } from '@/utils/navigation/vertical';
import { Score, PreviewNote, NavigationSelection } from '@/types';

const grandStaff = (): Score =>
  ({
    title: 'T',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      { id: 's0', clef: 'treble', keySignature: 'C', measures: [{ id: 'm0', events: [] }] },
      { id: 's1', clef: 'bass', keySignature: 'C', measures: [{ id: 'm1', events: [] }] },
    ],
  }) as unknown as Score;

// A tuplet-fill ghost anchored to reserved slot 'r' on staff 0.
const fillGhost: PreviewNote = {
  measureIndex: 0,
  staffIndex: 0,
  quant: 4,
  visualQuant: 4,
  pitch: 'E4',
  duration: 'eighth',
  dotted: false,
  mode: 'CHORD',
  index: 2,
  eventId: 'r',
  isRest: false,
};

const ghostSelection: NavigationSelection = {
  staffIndex: 0,
  measureIndex: null,
  eventId: null,
  noteId: null,
} as NavigationSelection;

describe('vertical nav of a tuplet-fill ghost across staves', () => {
  it('DOWN to an empty staff converts the fill ghost to a plain APPEND cursor (drops eventId)', () => {
    const r = calculateVerticalNavigation(grandStaff(), ghostSelection, 'down', 'eighth', false, fillGhost);
    expect(r?.previewNote).toBeTruthy();
    expect(r?.previewNote?.staffIndex).toBe(1);
    expect(r?.previewNote?.eventId).toBeUndefined(); // no stale reserved-slot anchor
    expect(r?.previewNote?.mode).toBe('APPEND');
    expect(r?.previewNote?.index).toBe(0);
  });
});
