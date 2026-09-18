import { act, render } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import type { Score, Staff } from '../types';

const setup = () => {
  render(<RiffScore id="navigation-context" />);
  return window.riffScore.get('navigation-context') as MusicEditorAPI;
};

const scoreWithStaves = (timeSignature = '4/4', count = 3): Score => ({
  title: 'Navigation context',
  timeSignature,
  keySignature: 'C',
  bpm: 120,
  staves: Array.from(
    { length: count },
    (_, s): Staff => ({
      id: `s${s}`,
      clef: s === 0 ? 'treble' : s === 1 ? 'bass' : 'alto',
      keySignature: 'C',
      measures: Array.from({ length: 2 }, (_, m) => ({ id: `s${s}m${m}`, events: [] })),
    })
  ),
});

const expectValidSelection = (api: MusicEditorAPI, staffIndex: number) => {
  const sel = api.getSelection();
  expect(sel.staffIndex).toBe(staffIndex);
  expect(sel.measureIndex).not.toBeNull();
  const event = api
    .getScore()
    .staves[
      staffIndex
    ].measures[sel.measureIndex!].events.find((candidate) => candidate.id === sel.eventId);
  expect(event).toBeDefined();
  expect(event!.notes.some((note) => note.id === sel.noteId)).toBe(true);
  expect(sel.selectedNotes).toEqual([
    { staffIndex, measureIndex: sel.measureIndex, eventId: sel.eventId, noteId: sel.noteId },
  ]);
};

beforeEach(() => {
  Element.prototype.scrollTo = jest.fn();
});
afterEach(() => {
  window.riffScore.instances.clear();
  window.riffScore.active = null;
});

describe('#322 horizontal navigation context', () => {
  test.each([0, 1, 2])('both directions retain staff %i and matching IDs', (staffIndex) => {
    const api = setup();
    act(() => {
      api.loadScore(scoreWithStaves()).select(0, staffIndex).addNote('C4').addNote('D4');
      api.select(0, staffIndex, 0).move('right');
      expectValidSelection(api, staffIndex);
      expect(api.getSelection().eventId).toBe(
        api.getScore().staves[staffIndex].measures[0].events[1].id
      );
      api.move('left');
      expectValidSelection(api, staffIndex);
      expect(api.getSelection().eventId).toBe(
        api.getScore().staves[staffIndex].measures[0].events[0].id
      );
    });
  });

  test.each([false, true])(
    'bass chord entry preserves treble (render between calls: %s)',
    (renderBetween) => {
      const api = setup();
      act(() => api.reset('grand', 2).select(0, 0).addNote('G5', 'whole'));
      const treble = JSON.stringify(api.getScore().staves[0]);
      const addBass = () => api.select(0, 1).addNote('C3', 'half');
      if (renderBetween) act(addBass);
      act(() => {
        if (!renderBetween) addBass();
        api.move('left').addTone('E3');
        expect(api.ok).toBe(true);
        expectValidSelection(api, 1);
        expect(
          api.getScore().staves[1].measures[0].events[0].notes.map((note) => note.pitch)
        ).toEqual(['C3', 'E3']);
        expect(JSON.stringify(api.getScore().staves[0])).toBe(treble);
      });
    }
  );

  test.each(['4/4', '3/4', '6/8', '7/8'])(
    'full %s bars advance and return on every staff',
    (meter) => {
      const api = setup();
      const [beats, unit] = meter.split('/').map(Number);
      const eighths = (beats * 8) / unit;
      act(() => {
        api.loadScore(scoreWithStaves(meter));
        for (let staff = 0; staff < 3; staff++) {
          api.select(0, staff);
          for (let i = 0; i < eighths; i++) api.addNote('C4', 'eighth');
          api.select(1, staff).addNote('D4', 'quarter');
          api.select(0, staff, eighths - 1).move('right');
          expectValidSelection(api, staff);
          expect(api.getSelection().measureIndex).toBe(1);
          api.move('left');
          expectValidSelection(api, staff);
          expect(api.getSelection().measureIndex).toBe(0);
          expect(api.getSelection().eventId).toBe(
            api.getScore().staves[staff].measures[0].events[eighths - 1].id
          );
        }
      });
    }
  );

  test('an empty next measure becomes an append cursor on the same custom staff', () => {
    const api = setup();
    act(() => {
      api.loadScore(scoreWithStaves('3/4')).select(0, 2);
      api.addNote('C4').addNote('D4').addNote('E4').select(0, 2, 2).move('right');
      expect(api.getSelection()).toMatchObject({
        staffIndex: 2,
        measureIndex: 1,
        eventId: null,
        selectedNotes: [],
      });
      api.addNote('F4');
      expect(api.getScore().staves[2].measures[1].events[0].notes[0].pitch).toBe('F4');
      expect(api.getScore().staves[0].measures[1].events).toEqual([]);
    });
  });

  test('pickup append movement retains the keyboard navigator’s editable free-space behavior', () => {
    const api = setup();
    const score = scoreWithStaves('3/4');
    score.staves.forEach((staff, s) => {
      staff.measures[0] = {
        id: `pickup-${s}`,
        isPickup: true,
        events: [
          {
            id: `pickup-event-${s}`,
            duration: 'quarter',
            dotted: false,
            notes: [{ id: `pickup-note-${s}`, pitch: 'C4' }],
          },
        ],
      };
    });
    act(() => {
      api.loadScore(score).select(0, 2, 0).move('right');
      expect(api.getSelection()).toMatchObject({ staffIndex: 2, measureIndex: 0, eventId: null });
      api.move('left');
      expectValidSelection(api, 2);
    });
  });

  test('bass tuplet-fill ghosts keep staff and rest input mode through both directions', () => {
    const api = setup();
    act(() => {
      api
        .reset('grand', 2)
        .select(0, 1)
        .addNote('C3', 'eighth')
        .addNote('D3', 'eighth')
        .addNote('E3', 'eighth');
      api.select(0, 1, 0).makeTuplet(3, 2).select(0, 1, 2).deleteSelected();
      api.select(0, 1, 1).setInputMode('rest').move('right');
      expect(api.getSelection()).toMatchObject({ staffIndex: 1, measureIndex: 0, eventId: null });
      expect(api.result.details?.previewNote).toMatchObject({ staffIndex: 1, isRest: true });
      api.move('left');
      expectValidSelection(api, 1);
      api.move('right').move('right');
      expect(api.getSelection()).toMatchObject({ staffIndex: 1, measureIndex: 0, eventId: null });
      api.move('left');
      expectValidSelection(api, 1);
    });
  });

  test('eight-bar piano chord-building recipe works without explicit bass re-selection', () => {
    const api = setup();
    act(() => {
      api.reset('grand', 8).beginTransaction();
      for (let bar = 0; bar < 8; bar++) {
        api.select(bar, 0).addNote('G4').addNote('A4').addNote('B4').addNote('D5');
        api
          .select(bar, 1)
          .addNote('C3', 'half')
          .move('left')
          .addTone('E3')
          .move('right')
          .addRest('half');
      }
      api.commitTransaction('Piano study');
      expect(api.hasError).toBe(false);
      const [treble, bass] = api.getScore().staves;
      expect(treble.measures).toHaveLength(8);
      expect(bass.measures).toHaveLength(8);
      for (let bar = 0; bar < 8; bar++) {
        expect(treble.measures[bar].events.map((e) => e.notes[0].pitch)).toEqual([
          'G4',
          'A4',
          'B4',
          'D5',
        ]);
        expect(bass.measures[bar].events[0].notes.map((n) => n.pitch)).toEqual(['C3', 'E3']);
        expect(bass.measures[bar].events[1]).toMatchObject({ isRest: true, duration: 'half' });
      }
    });
  });
});
