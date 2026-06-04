/**
 * Transpose lossless-undo property tests (contract C3).
 *
 * FIRST-PRINCIPLES INVARIANT under test:
 *   For ANY selection and ANY transpose amount (including amounts that clamp
 *   out of the piano range and therefore no-op on execute), the round-trip
 *   `undo(execute(score)) DEEP-EQUALS score` — exactly, for every note FIELD,
 *   not just pitch. And `execute(undo(execute(score)))` reproduces the
 *   transposed result (redo).
 *
 * These assertions are independent of the transpose SPELLING logic on purpose:
 * undo must be exact state restoration regardless of how/whether execute spelled
 * or clamped a note. The old undo() re-transposed inversely, which corrupts a
 * note that no-op-clamped at the range boundary and drifts enharmonic spelling.
 *
 * Property coverage is achieved with a seeded deterministic PRNG (no external
 * dependency) over hundreds of randomized scores / selections / amounts.
 */

import { TransposeSelectionCommand } from '@/commands/TransposeSelectionCommand';
import { ChromaticTransposeCommand } from '@/commands/ChromaticTransposeCommand';
import { getMidi } from '@/services/MusicService';
import { Score, Staff, Measure, ScoreEvent, Note, Selection, SelectedNote } from '@/types';
import { PIANO_RANGE } from '@/constants';

// Deep clone that works in the jsdom test env (no global structuredClone).
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic so failures are reproducible.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
const randInt = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

// A varied alphabet of real SPN pitches across the piano, deliberately
// including sharps, flats, naturals at the same letter, and double accidentals
// so that any field-dropping or spelling drift on undo is detectable.
const PITCH_ALPHABET = [
  'A0',
  'C1',
  'E2',
  'F#2',
  'Bb2',
  'C3',
  'C#3',
  'Db3',
  'D3',
  'E3',
  'F3',
  'G3',
  'A3',
  'B3',
  'C4',
  'C#4',
  'Db4',
  'D4',
  'Eb4',
  'E4',
  'F4',
  'F#4',
  'Gb4',
  'G4',
  'G#4',
  'A4',
  'Bb4',
  'B4',
  'B#4',
  'Cb5',
  'Fx4', // F double-sharp (Tonal SPN), sounds G4
  'C5',
  'D5',
  'E5',
  'F#5',
  'G5',
  'A5',
  'C6',
  'C7',
  'C8',
];

const DURATIONS = ['whole', 'half', 'quarter', 'eighth', 'sixteenth'];

let idCounter = 0;
const uid = (prefix: string) => `${prefix}-${idCounter++}`;

/** Build a randomized note with all optional fields exercised. */
function randomNote(rng: () => number): Note {
  const isRest = rng() < 0.15;
  const note: Note = {
    id: uid('n'),
    pitch: isRest ? null : pick(rng, PITCH_ALPHABET),
  };
  if (isRest) note.isRest = true;
  // Exercise optional fields so deep-equality catches any dropped field.
  if (rng() < 0.4) note.accidental = pick(rng, ['sharp', 'flat', 'natural', null] as const);
  if (rng() < 0.3) note.tied = rng() < 0.5;
  return note;
}

/** Build a randomized event (single note, chord, or rest). */
function randomEvent(rng: () => number): ScoreEvent {
  const isRest = rng() < 0.15;
  const event: ScoreEvent = {
    id: uid('e'),
    duration: pick(rng, DURATIONS),
    dotted: rng() < 0.3,
    notes: [],
  };
  if (isRest) {
    event.isRest = true;
    event.notes = [{ id: uid('n'), pitch: null, isRest: true }];
  } else {
    const noteCount = randInt(rng, 1, 3); // up to triad chords
    for (let i = 0; i < noteCount; i++) event.notes.push(randomNote(rng));
  }
  if (rng() < 0.2) event.chord = pick(rng, ['C', 'G7', 'Am', null]);
  return event;
}

function randomMeasure(rng: () => number): Measure {
  const eventCount = randInt(rng, 1, 4);
  const events: ScoreEvent[] = [];
  for (let i = 0; i < eventCount; i++) events.push(randomEvent(rng));
  return { id: uid('m'), events };
}

function randomStaff(rng: () => number, clef: Staff['clef']): Staff {
  const measureCount = randInt(rng, 1, 3);
  const measures: Measure[] = [];
  for (let i = 0; i < measureCount; i++) measures.push(randomMeasure(rng));
  return {
    id: uid('staff'),
    clef,
    keySignature: pick(rng, ['C', 'G', 'F', 'Bb', 'D', 'Eb', 'A']),
    measures,
  };
}

function randomScore(rng: () => number): Score {
  const staffCount = randInt(rng, 1, 2);
  const staves: Staff[] = [];
  for (let i = 0; i < staffCount; i++) {
    staves.push(randomStaff(rng, i === 0 ? 'treble' : 'bass'));
  }
  return {
    title: 'Random',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves,
  };
}

/** Flatten every (staffIndex, measureIndex, event, note) coordinate of a score. */
function allNoteCoords(score: Score): SelectedNote[] {
  const coords: SelectedNote[] = [];
  score.staves.forEach((staff, staffIndex) => {
    staff.measures.forEach((measure, measureIndex) => {
      measure.events.forEach((event) => {
        event.notes.forEach((note) => {
          coords.push({ staffIndex, measureIndex, eventId: event.id, noteId: note.id });
        });
      });
    });
  });
  return coords;
}

/**
 * Pick a random selection shape that the commands understand:
 *  - multi-note (selectedNotes populated)
 *  - single note (eventId + noteId)
 *  - whole event (eventId, noteId null)
 *  - whole measure (eventId null) — TransposeSelectionCommand only
 */
function randomSelection(rng: () => number, score: Score, allowMeasure: boolean): Selection {
  const coords = allNoteCoords(score);
  const base: Selection = {
    staffIndex: 0,
    measureIndex: null,
    eventId: null,
    noteId: null,
    selectedNotes: [],
  };
  if (coords.length === 0) return base;

  const mode = randInt(rng, 0, allowMeasure ? 3 : 2);

  if (mode === 0) {
    // Multi-note: a random non-empty subset of all coordinates.
    const subset = coords.filter(() => rng() < 0.5);
    const chosen = subset.length > 0 ? subset : [pick(rng, coords)];
    const primary = chosen[0];
    return {
      ...base,
      staffIndex: primary.staffIndex,
      measureIndex: primary.measureIndex,
      eventId: primary.eventId,
      noteId: primary.noteId,
      selectedNotes: chosen,
    };
  }

  const anchor = pick(rng, coords);
  if (mode === 1) {
    // Single specific note
    return {
      ...base,
      staffIndex: anchor.staffIndex,
      measureIndex: anchor.measureIndex,
      eventId: anchor.eventId,
      noteId: anchor.noteId,
    };
  }
  if (mode === 2) {
    // Whole event
    return {
      ...base,
      staffIndex: anchor.staffIndex,
      measureIndex: anchor.measureIndex,
      eventId: anchor.eventId,
      noteId: null,
    };
  }
  // Whole measure
  return {
    ...base,
    staffIndex: anchor.staffIndex,
    measureIndex: anchor.measureIndex,
    eventId: null,
    noteId: null,
  };
}

describe('Transpose lossless undo (contract C3)', () => {
  beforeEach(() => {
    idCounter = 0;
  });

  describe('TransposeSelectionCommand', () => {
    test('execute → undo is deep-equal to original for random selections and amounts (incl. clamping)', () => {
      const rng = makeRng(0xc0ffee);
      const ITERATIONS = 400;
      for (let i = 0; i < ITERATIONS; i++) {
        const score = randomScore(rng);
        const original = clone(score);
        const selection = randomSelection(rng, score, /* allowMeasure */ true);
        // Amounts span well beyond the piano range so many iterations clamp/no-op.
        const steps = randInt(rng, -60, 60);

        const cmd = new TransposeSelectionCommand(selection, steps, 'C');
        const transposed = cmd.execute(score);
        const undone = cmd.undo(transposed);

        expect(undone).toEqual(original);
        // The command must not mutate its input score in place.
        expect(score).toEqual(original);
      }
    });

    test('execute → undo → execute reproduces the transposed result (redo)', () => {
      const rng = makeRng(0xbeef);
      const ITERATIONS = 200;
      for (let i = 0; i < ITERATIONS; i++) {
        const score = randomScore(rng);
        const selection = randomSelection(rng, score, true);
        const steps = randInt(rng, -24, 24);

        const cmd = new TransposeSelectionCommand(selection, steps, 'C');
        const firstExecute = cmd.execute(score);
        const undone = cmd.undo(firstExecute);
        const redo = cmd.execute(undone);

        expect(redo).toEqual(firstExecute);
      }
    });

    test('BOUNDARY: top-of-range note + clamping amount → undo restores original (old code corrupts here)', () => {
      // C8 is PIANO_RANGE.max. A diatonic up-step from C8 clamps (no-op on
      // execute). The OLD inverse-re-transpose undo would step DOWN from C8 to
      // ~B7, corrupting a note that execute never moved.
      const note: Note = { id: 'n1', pitch: PIANO_RANGE.max, accidental: null };
      const event: ScoreEvent = { id: 'e1', duration: 'quarter', dotted: false, notes: [note] };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [event] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };

      const cmd = new TransposeSelectionCommand(selection, 7, 'C'); // up an octave-ish; clamps
      const transposed = cmd.execute(score);
      // Sanity: execute genuinely no-op'd the pitch (it was already at the ceiling).
      expect(transposed.staves[0].measures[0].events[0].notes[0].pitch).toBe(PIANO_RANGE.max);

      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
    });

    test('BOUNDARY: bottom-of-range note + clamping amount → undo restores original', () => {
      const note: Note = { id: 'n1', pitch: PIANO_RANGE.min, accidental: null };
      const event: ScoreEvent = { id: 'e1', duration: 'quarter', dotted: false, notes: [note] };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [event] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };

      const cmd = new TransposeSelectionCommand(selection, -7, 'C');
      const transposed = cmd.execute(score);
      expect(transposed.staves[0].measures[0].events[0].notes[0].pitch).toBe(PIANO_RANGE.min);

      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
    });

    test('LOSSLESS SPELLING: an altered note round-trips with its exact spelling (no enharmonic drift)', () => {
      // F#4: a diatonic down/up then undo must return EXACTLY 'F#4', not 'Gb4'
      // and not 'F4' (the documented data-loss bug).
      const note: Note = { id: 'n1', pitch: 'F#4', accidental: 'sharp', tied: true };
      const event: ScoreEvent = { id: 'e1', duration: 'eighth', dotted: true, notes: [note] };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'G',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'G', measures: [{ id: 'm1', events: [event] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };

      // A non-clamping move so execute actually changes the pitch, then undo.
      const cmd = new TransposeSelectionCommand(selection, 2, 'G');
      const transposed = cmd.execute(score);
      expect(transposed.staves[0].measures[0].events[0].notes[0].pitch).not.toBe('F#4');

      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
      // Explicit field-level assertion of the previously-lost data.
      const restored = undone.staves[0].measures[0].events[0].notes[0];
      expect(restored.pitch).toBe('F#4');
      expect(restored.accidental).toBe('sharp');
      expect(restored.tied).toBe(true);
    });

    test('CHORD with mixed clamping: one note clamps, others move; undo restores all exactly', () => {
      // A chord where the top note is at the ceiling (clamps) and lower notes
      // move. The whole-event transpose must be perfectly reversible.
      const notes: Note[] = [
        { id: 'n1', pitch: 'C4' },
        { id: 'n2', pitch: 'E4' },
        { id: 'n3', pitch: PIANO_RANGE.max }, // clamps on up-move
      ];
      const event: ScoreEvent = { id: 'e1', duration: 'quarter', dotted: false, notes };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [event] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: null, // whole event (chord)
        selectedNotes: [],
      };

      const cmd = new TransposeSelectionCommand(selection, 2, 'C');
      const transposed = cmd.execute(score);
      const transposedNotes = transposed.staves[0].measures[0].events[0].notes;
      // Top note clamped (still at ceiling); lower notes moved.
      expect(transposedNotes[2].pitch).toBe(PIANO_RANGE.max);
      expect(transposedNotes[0].pitch).not.toBe('C4');

      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
    });
  });

  describe('ChromaticTransposeCommand', () => {
    test('execute → undo is deep-equal to original for random selections and amounts (incl. clamping)', () => {
      const rng = makeRng(0x1234abcd);
      const ITERATIONS = 400;
      for (let i = 0; i < ITERATIONS; i++) {
        const score = randomScore(rng);
        const original = clone(score);
        // Chromatic command supports note / event / multi-note (no whole-measure).
        const selection = randomSelection(rng, score, /* allowMeasure */ false);
        const semitones = randInt(rng, -130, 130); // spans beyond the 88-key range

        const cmd = new ChromaticTransposeCommand(selection, semitones);
        const transposed = cmd.execute(score);
        const undone = cmd.undo(transposed);

        expect(undone).toEqual(original);
        expect(score).toEqual(original);
      }
    });

    test('execute → undo → execute reproduces the transposed result (redo)', () => {
      const rng = makeRng(0x55aa);
      const ITERATIONS = 200;
      for (let i = 0; i < ITERATIONS; i++) {
        const score = randomScore(rng);
        const selection = randomSelection(rng, score, false);
        const semitones = randInt(rng, -24, 24);

        const cmd = new ChromaticTransposeCommand(selection, semitones);
        const firstExecute = cmd.execute(score);
        const undone = cmd.undo(firstExecute);
        const redo = cmd.execute(undone);

        expect(redo).toEqual(firstExecute);
      }
    });

    test('BOUNDARY: top-of-range note + clamping semitones → undo restores original', () => {
      const note: Note = { id: 'n1', pitch: PIANO_RANGE.max, accidental: null };
      const event: ScoreEvent = { id: 'e1', duration: 'quarter', dotted: false, notes: [note] };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [event] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };

      const cmd = new ChromaticTransposeCommand(selection, 3); // up: above C8, clamps
      const transposed = cmd.execute(score);
      // Sanity: execute genuinely no-op'd (above range → returns original pitch).
      expect(transposed.staves[0].measures[0].events[0].notes[0].pitch).toBe(PIANO_RANGE.max);

      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
    });

    test('NO ENHARMONIC EXPLOSION on undo: +1 then undo returns the exact original spelling', () => {
      // Independent of how execute spells +1 (Db/C#), undo must restore 'C4'
      // verbatim — never an accumulated multi-flat or a drifted spelling.
      const note: Note = { id: 'n1', pitch: 'C4' };
      const event: ScoreEvent = { id: 'e1', duration: 'quarter', dotted: false, notes: [note] };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [event] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };

      const cmd = new ChromaticTransposeCommand(selection, 1);
      const transposed = cmd.execute(score);
      const restoredPitch = transposed.staves[0].measures[0].events[0].notes[0].pitch!;
      // Sanity: it sounds a semitone higher than C4.
      expect(getMidi(restoredPitch)).toBe(getMidi('C4') + 1);

      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
      expect(undone.staves[0].measures[0].events[0].notes[0].pitch).toBe('C4');
    });

    test('rest events are untouched and undo is a no-op-equal round-trip', () => {
      const restEvent: ScoreEvent = {
        id: 'r1',
        isRest: true,
        duration: 'quarter',
        dotted: false,
        notes: [{ id: 'rn1', pitch: null, isRest: true }],
      };
      const score: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [restEvent] }] }],
      };
      const original = clone(score);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'r1',
        noteId: null,
        selectedNotes: [],
      };

      const cmd = new ChromaticTransposeCommand(selection, 5);
      const transposed = cmd.execute(score);
      expect(transposed).toEqual(original); // nothing to transpose
      const undone = cmd.undo(transposed);
      expect(undone).toEqual(original);
    });
  });

  describe('snapshot is refreshed per execute (sequential commands)', () => {
    test('two different transpose commands undo independently and correctly', () => {
      const note: Note = { id: 'n1', pitch: 'C4' };
      const event: ScoreEvent = { id: 'e1', duration: 'quarter', dotted: false, notes: [note] };
      const score0: Score = {
        title: 't',
        timeSignature: '4/4',
        keySignature: 'C',
        bpm: 120,
        staves: [{ id: 's1', clef: 'treble', keySignature: 'C', measures: [{ id: 'm1', events: [event] }] }],
      };
      const snap0 = clone(score0);
      const selection: Selection = {
        staffIndex: 0,
        measureIndex: 0,
        eventId: 'e1',
        noteId: 'n1',
        selectedNotes: [],
      };

      const cmdA = new ChromaticTransposeCommand(selection, 2); // C4 -> D4
      const score1 = cmdA.execute(score0);
      const snap1 = clone(score1);

      const cmdB = new ChromaticTransposeCommand(selection, 5); // D4 -> G4
      const score2 = cmdB.execute(score1);

      // Undo B returns to state after A; undo A returns to the very start.
      const afterUndoB = cmdB.undo(score2);
      expect(afterUndoB).toEqual(snap1);

      const afterUndoA = cmdA.undo(afterUndoB);
      expect(afterUndoA).toEqual(snap0);
    });
  });
});
