/**
 * ScoreAPI.navigation.test.tsx
 *
 * Comprehensive tests for API navigation methods.
 * Covers vertical navigation, boundary conditions, and edge cases.
 *
 * High-priority coverage gaps addressed:
 * - move('up'/'down') - cross-staff, chord traversal, cycling
 * - move('left'/'right') - boundary conditions
 * - selectById() - lookup by ID
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import type { Staff, DeepPartial, RiffScoreConfig } from '../types';

// Helper to get typed API
const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

// Helper to create staves for a grand staff score with notes for testing
const createGrandStaffStaves = (): Staff[] => [
  {
    id: 'treble-staff',
    clef: 'treble',
    keySignature: 'C',
    measures: [
      {
        id: 'm1-treble',
        events: [
          { id: 'e1-t', duration: 'quarter', dotted: false, notes: [{ id: 'n1-t', pitch: 'E5' }] },
          { id: 'e2-t', duration: 'quarter', dotted: false, notes: [{ id: 'n2-t', pitch: 'F5' }] },
        ],
      },
      {
        id: 'm2-treble',
        events: [
          { id: 'e3-t', duration: 'quarter', dotted: false, notes: [{ id: 'n3-t', pitch: 'G5' }] },
        ],
      },
    ],
  },
  {
    id: 'bass-staff',
    clef: 'bass',
    keySignature: 'C',
    measures: [
      {
        id: 'm1-bass',
        events: [
          { id: 'e1-b', duration: 'quarter', dotted: false, notes: [{ id: 'n1-b', pitch: 'C3' }] },
          { id: 'e2-b', duration: 'quarter', dotted: false, notes: [{ id: 'n2-b', pitch: 'D3' }] },
        ],
      },
      {
        id: 'm2-bass',
        events: [
          { id: 'e3-b', duration: 'quarter', dotted: false, notes: [{ id: 'n3-b', pitch: 'E3' }] },
        ],
      },
    ],
  },
];

// Helper to create a single-staff staves array
const createSingleStaffStaves = (): Staff[] => [
  {
    id: 'treble-staff',
    clef: 'treble',
    keySignature: 'C',
    measures: [
      {
        id: 'm1',
        events: [
          { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
          { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
        ],
      },
    ],
  },
];

// Helper to create a chord staves array
const createChordStaves = (): Staff[] => [
  {
    id: 'treble-staff',
    clef: 'treble',
    keySignature: 'C',
    measures: [
      {
        id: 'm1',
        events: [
          {
            id: 'chord-event',
            duration: 'quarter',
            dotted: false,
            notes: [
              { id: 'chord-n1', pitch: 'C4' }, // Bottom note
              { id: 'chord-n2', pitch: 'E4' }, // Middle note
              { id: 'chord-n3', pitch: 'G4' }, // Top note
            ],
          },
        ],
      },
    ],
  },
];

// Helper to create config from staves
const configWithStaves = (staves: Staff[]): DeepPartial<RiffScoreConfig> => ({
  score: { staves },
});

describe('Navigation - Horizontal Boundaries', () => {
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('move("left") at start of score stays at first event', () => {
    render(
      <RiffScore id="nav-left-boundary" config={configWithStaves(createSingleStaffStaves())} />
    );
    const api = getAPI('nav-left-boundary');

    // Select first event
    api.select(0, 0, 0);
    const initialSelection = api.getSelection();
    expect(initialSelection.eventId).toBe('e1');

    // Move left - should stay at first event
    api.move('left');
    const afterMove = api.getSelection();
    expect(afterMove.eventId).toBe('e1');
  });

  test('move("right") at end of measure enters ghost mode if space remains', () => {
    render(
      <RiffScore id="nav-right-measure" config={configWithStaves(createGrandStaffStaves())} />
    );
    const api = getAPI('nav-right-measure');

    // Select last event in first measure
    api.select(0, 0, 1);
    expect(api.getSelection().eventId).toBe('e2-t');

    // Move right - should enter ghost mode in current measure (because it's not full)
    api.move('right');
    const afterMove = api.getSelection();
    expect(afterMove.measureIndex).toBe(0);
    expect(afterMove.eventId).toBeNull();
  });

  test('move("right") at end of score enters ghost append mode', () => {
    render(
      <RiffScore id="nav-right-boundary" config={configWithStaves(createGrandStaffStaves())} />
    );
    const api = getAPI('nav-right-boundary');

    // Select last event in last measure (measure 2, event 0)
    api.select(1, 0, 0);
    expect(api.getSelection().eventId).toBe('e3-t');

    // Move right - should move to append position
    api.move('right');
    const afterMove = api.getSelection();
    expect(afterMove.eventId).toBeNull();
    expect(afterMove.measureIndex).toBe(1);
  });

  test('move returns this for chaining', () => {
    render(<RiffScore id="nav-chain" config={configWithStaves(createSingleStaffStaves())} />);
    const api = getAPI('nav-chain');

    api.select(0, 0, 0);
    const result = api.move('right');
    expect(result).toBe(api);
  });
});

describe('Navigation - tuplet-fill ghost stepping (#6)', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
  });
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('move("right") steps onto then PAST the fill ghost (no backward jump to the first member)', () => {
    render(<RiffScore id="nav-tuplet-ghost" />);
    const api = getAPI('nav-tuplet-ghost');
    const trip = (id: string, pitch: string, position: number) => ({
      id,
      duration: 'eighth',
      dotted: false,
      notes: [{ id: `${id}n`, pitch }],
      tuplet: { ratio: [3, 2] as [number, number], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
    });
    act(() => {
      api.loadScore({
        title: 'T',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [
          { id: 's0', clef: 'treble', keySignature: 'C', measures: [{ id: 'm0', events: [trip('t0', 'C4', 0), trip('t1', 'E4', 1), trip('t2', 'G4', 2)] }] },
        ],
      });
    });
    // → [C, E, reserved]
    act(() => {
      api.select(0, 0, 2);
      api.deleteSelected();
      api.select(0, 0, 1); // the last real member (E)
    });

    act(() => api.move('right')); // onto the tuplet-fill ghost
    expect(api.getSelection().eventId).toBeNull();

    act(() => api.move('right')); // PAST the group — must NOT jump back to the first member (t0)
    expect(api.getSelection().eventId).not.toBe('t0');
  });

  test('a persisted ghost is discarded when jump() moves the cursor to another (empty) bar', () => {
    render(<RiffScore id="nav-ghost-stale" />);
    const api = getAPI('nav-ghost-stale');
    const trip = (id: string, pitch: string, position: number) => ({
      id,
      duration: 'eighth',
      dotted: false,
      notes: [{ id: `${id}n`, pitch }],
      tuplet: { ratio: [3, 2] as [number, number], groupSize: 3, position, baseDuration: 'eighth', id: 'T' },
    });
    act(() => {
      api.loadScore({
        title: 'T',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [
          {
            id: 's0',
            clef: 'treble',
            keySignature: 'C',
            measures: [
              { id: 'm0', events: [trip('t0', 'C4', 0), trip('t1', 'E4', 1), trip('t2', 'G4', 2)] },
              { id: 'm1', events: [] }, // empty trailing bar — like the empties grand-staff padding creates
            ],
          },
        ],
      });
    });
    act(() => {
      api.select(0, 0, 2);
      api.deleteSelected(); // → m0 [C, E, reserved]
      api.select(0, 0, 1); // last real member (E) in m0
      api.move('right'); // onto m0's tuplet-fill ghost — ghostPreview now points at measure 0
    });
    expect(api.getSelection().eventId).toBeNull();

    // jump to the empty last bar m1 (also eventId:null). The stale m0 ghost must NOT survive: a move
    // from m1 has to act within m1, not navigate from the ghost's original bar (which would land in m0).
    act(() => api.jump('end-score'));
    expect(api.getSelection().measureIndex).toBe(1);
    act(() => api.move('right'));
    expect(api.getSelection().measureIndex).toBe(1); // with the stale-ghost bug this was 0
  });

  test('#9 jump("end-measure") lands on the last REAL member, not a trailing reserved slot', () => {
    render(<RiffScore id="nav-jump-reserved" />);
    const api = getAPI('nav-jump-reserved');
    act(() => {
      api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      api.select(0, 0, 0, 0).makeTuplet(3, 2);
      api.select(0, 0, 1, 0).deleteSelected(); // delete middle → trailing reserved slot
    });
    const events = api.getScore().staves[0].measures[0].events;
    const reservedIdx = events.findIndex((e) => e.reserved);
    expect(reservedIdx).toBeGreaterThanOrEqual(0); // there IS a trailing reserved slot

    act(() => api.jump('end-measure'));
    const sel = api.getSelection();
    const landed = events.find((e) => e.id === sel.eventId);
    expect(landed?.reserved).toBeFalsy(); // landed on a real member, not the blank slot
  });

  test('#265 Left from an append ghost past an incomplete tuplet lands on a real member, not the reserved slot', () => {
    render(<RiffScore id="nav-append-left-reserved" />);
    const api = getAPI('nav-append-left-reserved');
    act(() => {
      // [C-trip, E-trip, reserved] (16q) in 4/4 — followed by ~48q of free space.
      api.select(0).addNote('C4', 'eighth').addNote('D4', 'eighth').addNote('E4', 'eighth');
      api.select(0, 0, 0, 0).makeTuplet(3, 2);
      api.select(0, 0, 1, 0).deleteSelected(); // delete middle → trailing reserved slot
    });
    const events = api.getScore().staves[0].measures[0].events;
    expect(events.some((e) => e.reserved)).toBe(true);

    // Step right to the append ghost (past the tuplet), then Left — must NOT land on the reserved slot.
    act(() => {
      api.select(0, 0, 0, 0); // first real member
      api.move('right'); // onto the fill ghost
      api.move('right'); // onto the append ghost in the bar's free space
      api.move('left'); // back — should land on a real member, never the blank reserved slot
    });
    const sel = api.getSelection();
    const landed = api.getScore().staves[0].measures[0].events.find((e) => e.id === sel.eventId);
    // Either a ghost (eventId null) or a real event — but never the reserved placeholder.
    expect(landed?.reserved).toBeFalsy();
  });
});

describe('Navigation - Vertical (Cross-Staff)', () => {
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('move("down") switches from treble to bass staff', () => {
    render(<RiffScore id="nav-down-staff" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('nav-down-staff');

    // Select first event in treble staff
    api.select(0, 0, 0);
    expect(api.getSelection().staffIndex).toBe(0);
    expect(api.getSelection().eventId).toBe('e1-t');

    // Move down - should switch to bass staff
    api.move('down');
    const afterMove = api.getSelection();
    expect(afterMove.staffIndex).toBe(1);
    expect(afterMove.eventId).toBe('e1-b');
  });

  test('move("up") switches from bass to treble staff', () => {
    render(<RiffScore id="nav-up-staff" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('nav-up-staff');

    // Select first event in bass staff
    api.select(0, 1, 0);
    expect(api.getSelection().staffIndex).toBe(1);
    expect(api.getSelection().eventId).toBe('e1-b');

    // Move up - should switch to treble staff
    api.move('up');
    const afterMove = api.getSelection();
    expect(afterMove.staffIndex).toBe(0);
    expect(afterMove.eventId).toBe('e1-t');
  });

  test('move("down") at bottom staff cycles to top staff', () => {
    render(<RiffScore id="nav-down-cycle" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('nav-down-cycle');

    // Select event in bass staff (bottom)
    api.select(0, 1, 0);
    expect(api.getSelection().staffIndex).toBe(1);

    // Move down - should cycle to treble (top)
    api.move('down');
    const afterMove = api.getSelection();
    expect(afterMove.staffIndex).toBe(0);
  });

  test('move("up") at top staff cycles to bottom staff', () => {
    render(<RiffScore id="nav-up-cycle" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('nav-up-cycle');

    // Select event in treble staff (top)
    api.select(0, 0, 0);
    expect(api.getSelection().staffIndex).toBe(0);

    // Move up - should cycle to bass (bottom)
    api.move('up');
    const afterMove = api.getSelection();
    expect(afterMove.staffIndex).toBe(1);
  });

  test('move("up"/"down") is no-op on single-staff score', () => {
    render(
      <RiffScore id="nav-single-staff" config={configWithStaves(createSingleStaffStaves())} />
    );
    const api = getAPI('nav-single-staff');

    // Select first event
    api.select(0, 0, 0);
    const initialSelection = api.getSelection();

    // Move up - should be no-op
    api.move('up');
    expect(api.getSelection().staffIndex).toBe(initialSelection.staffIndex);
    expect(api.getSelection().eventId).toBe(initialSelection.eventId);

    // Move down - should be no-op
    api.move('down');
    expect(api.getSelection().staffIndex).toBe(initialSelection.staffIndex);
    expect(api.getSelection().eventId).toBe(initialSelection.eventId);
  });
});

describe('Navigation - Vertical (Chord Traversal)', () => {
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('move("up") within chord navigates to higher note', () => {
    render(<RiffScore id="nav-chord-up" config={configWithStaves(createChordStaves())} />);
    const api = getAPI('nav-chord-up');

    // Select bottom note of chord (C4)
    api.selectById('chord-event', 'chord-n1');
    expect(api.getSelection().noteId).toBe('chord-n1');

    // Move up - should go to middle note (E4)
    api.move('up');
    expect(api.getSelection().noteId).toBe('chord-n2');

    // Move up again - should go to top note (G4)
    api.move('up');
    expect(api.getSelection().noteId).toBe('chord-n3');
  });

  test('move("down") within chord navigates to lower note', () => {
    render(<RiffScore id="nav-chord-down" config={configWithStaves(createChordStaves())} />);
    const api = getAPI('nav-chord-down');

    // Select top note of chord (G4)
    api.selectById('chord-event', 'chord-n3');
    expect(api.getSelection().noteId).toBe('chord-n3');

    // Move down - should go to middle note (E4)
    api.move('down');
    expect(api.getSelection().noteId).toBe('chord-n2');

    // Move down again - should go to bottom note (C4)
    api.move('down');
    expect(api.getSelection().noteId).toBe('chord-n1');
  });

  test('move("up") at top of chord cycles staff (single staff = no-op)', () => {
    render(<RiffScore id="nav-chord-top" config={configWithStaves(createChordStaves())} />);
    const api = getAPI('nav-chord-top');

    // Select top note of chord
    api.selectById('chord-event', 'chord-n3');

    // Move up at top - single staff, should be no-op
    api.move('up');
    // Still on same chord
    expect(api.getSelection().eventId).toBe('chord-event');
  });

  test('move("down") to empty staff → enters ghost cursor/append mode', () => {
    // Create grand staff where bass clef (staff 1) is empty in measure 1
    const staves = createGrandStaffStaves();
    staves[1].measures[0].events = []; // Clear bass measure 1

    render(<RiffScore id="nav-v-ghost-enter" config={configWithStaves(staves)} />);
    const api = getAPI('nav-v-ghost-enter');

    // Select first event in treble staff
    api.select(0, 0, 0);
    expect(api.getSelection().eventId).toBe('e1-t');

    // Move down - should enter ghost cursor on bass staff
    act(() => {
      api.move('down');
    });
    const selection = api.getSelection();
    expect(selection.staffIndex).toBe(1);
    expect(selection.eventId).toBeNull(); // Ghost cursor
    expect(selection.measureIndex).toBeNull(); // API selection measureIndex is null for ghost cursors (in previewNote)
  });

  test('move("up") from empty staff → enters ghost cursor on top staff', () => {
    const staves = createGrandStaffStaves();
    staves[0].measures[0].events = []; // Clear treble measure 1

    render(<RiffScore id="nav-v-ghost-up" config={configWithStaves(staves)} />);
    const api = getAPI('nav-v-ghost-up');

    // Select first event in bass staff
    api.select(0, 1, 0);
    expect(api.getSelection().eventId).toBe('e1-b');

    // Move up - should enter ghost cursor on treble staff
    act(() => {
      api.move('up');
    });
    const selection = api.getSelection();
    expect(selection.staffIndex).toBe(0);
    expect(selection.eventId).toBeNull();
  });
});

describe('Navigation - selectById', () => {
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('selectById finds event by ID', () => {
    render(<RiffScore id="selectbyid-event" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('selectbyid-event');

    api.selectById('e2-t');
    const selection = api.getSelection();
    expect(selection.eventId).toBe('e2-t');
    expect(selection.measureIndex).toBe(0);
  });

  test('selectById finds event and note by ID', () => {
    render(<RiffScore id="selectbyid-note" config={configWithStaves(createChordStaves())} />);
    const api = getAPI('selectbyid-note');

    api.selectById('chord-event', 'chord-n2');
    const selection = api.getSelection();
    expect(selection.eventId).toBe('chord-event');
    expect(selection.noteId).toBe('chord-n2');
  });

  test('selectById with non-existent ID gracefully handles (no crash)', () => {
    render(
      <RiffScore id="selectbyid-missing" config={configWithStaves(createSingleStaffStaves())} />
    );
    const api = getAPI('selectbyid-missing');

    const initialSelection = api.getSelection();

    // Should not crash
    api.selectById('non-existent-id');

    // Selection should be unchanged
    expect(api.getSelection().eventId).toBe(initialSelection.eventId);
  });

  test('selectById returns this for chaining', () => {
    render(
      <RiffScore id="selectbyid-chain" config={configWithStaves(createSingleStaffStaves())} />
    );
    const api = getAPI('selectbyid-chain');

    const result = api.selectById('e1');
    expect(result).toBe(api);
  });
});

describe('Navigation - select() bounds (#QA)', () => {
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('out-of-range eventIndex on a non-empty measure reports EVENT_NOT_FOUND (not a false ok)', () => {
    render(<RiffScore id="select-oob-event" config={configWithStaves(createSingleStaffStaves())} />);
    const api = getAPI('select-oob-event');

    api.select(0, 0, 99); // measure 0 has 2 events
    expect(api.result.ok).toBe(false);
    expect(api.result.code).toBe('EVENT_NOT_FOUND');
  });

  test('out-of-range noteIndex reports NOTE_NOT_FOUND', () => {
    render(<RiffScore id="select-oob-note" config={configWithStaves(createSingleStaffStaves())} />);
    const api = getAPI('select-oob-note');

    api.select(0, 0, 0, 5); // event 0 exists, note index 5 does not
    expect(api.result.ok).toBe(false);
    expect(api.result.code).toBe('NOTE_NOT_FOUND');
  });

  test('a valid event index still selects (ok)', () => {
    render(<RiffScore id="select-valid" config={configWithStaves(createSingleStaffStaves())} />);
    const api = getAPI('select-valid');

    api.select(0, 0, 1);
    expect(api.result.ok).toBe(true);
    expect(api.getSelection().eventId).toBe('e2');
  });
});

describe('Navigation - jump() Edge Cases', () => {
  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  test('jump("start-score") selects first event in first measure', () => {
    render(<RiffScore id="jump-start" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('jump-start');

    // Start somewhere else
    api.select(1, 0, 0);
    expect(api.getSelection().measureIndex).toBe(1);

    // Jump to start
    api.jump('start-score');
    const selection = api.getSelection();
    expect(selection.measureIndex).toBe(0);
    expect(selection.eventId).toBe('e1-t');
  });

  test('jump("end-score") selects last event in last measure', () => {
    render(<RiffScore id="jump-end" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('jump-end');

    // Start at beginning
    api.select(0, 0, 0);

    // Jump to end
    api.jump('end-score');
    const selection = api.getSelection();
    expect(selection.measureIndex).toBe(1); // Second measure (index 1)
    expect(selection.eventId).toBe('e3-t');
  });

  test('jump("start-measure") stays in current measure', () => {
    render(
      <RiffScore id="jump-measure-start" config={configWithStaves(createGrandStaffStaves())} />
    );
    const api = getAPI('jump-measure-start');

    // Select second event in first measure
    api.select(0, 0, 1);
    expect(api.getSelection().eventId).toBe('e2-t');

    // Jump to start of measure
    api.jump('start-measure');
    const selection = api.getSelection();
    expect(selection.measureIndex).toBe(0);
    expect(selection.eventId).toBe('e1-t');
  });

  test('jump("end-measure") selects last event in current measure', () => {
    render(<RiffScore id="jump-measure-end" config={configWithStaves(createGrandStaffStaves())} />);
    const api = getAPI('jump-measure-end');

    // Select first event in first measure
    api.select(0, 0, 0);

    // Jump to end of measure
    api.jump('end-measure');
    const selection = api.getSelection();
    expect(selection.measureIndex).toBe(0);
    expect(selection.eventId).toBe('e2-t');
  });
});
