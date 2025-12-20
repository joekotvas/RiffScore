/**
 * Shared fixtures for SelectAllCommand tests
 * @see Issue #99
 */

import type { Score } from '../../types';

/**
 * Standard test score with known structure:
 * Staff 0 (Treble): Measure 0 (3 notes in 2 events), Measure 1 (1 note)
 * Staff 1 (Bass): Measure 0 (1 note), Measure 1 (1 note)
 * Total: 6 notes
 */
export function createTestScore(): Score {
  return {
    title: 'Test Score',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-0',
        clef: 'treble',
        measures: [
          {
            id: 'measure-0-0',
            events: [
              {
                id: 'event-0-0-0',
                notes: [
                  { id: 'note-1', pitch: 'C4', duration: 'quarter' },
                  { id: 'note-2', pitch: 'E4', duration: 'quarter' },
                ],
                duration: 'quarter',
                quant: 0,
                isRest: false,
              },
              {
                id: 'event-0-0-1',
                notes: [{ id: 'note-3', pitch: 'D4', duration: 'quarter' }],
                duration: 'quarter',
                quant: 24,
                isRest: false,
              },
            ],
          },
          {
            id: 'measure-0-1',
            events: [
              {
                id: 'event-0-1-0',
                notes: [{ id: 'note-4', pitch: 'E4', duration: 'half' }],
                duration: 'half',
                quant: 0,
                isRest: false,
              },
            ],
          },
        ],
      },
      {
        id: 'staff-1',
        clef: 'bass',
        measures: [
          {
            id: 'measure-1-0',
            events: [
              {
                id: 'event-1-0-0',
                notes: [{ id: 'note-5', pitch: 'C3', duration: 'quarter' }],
                duration: 'quarter',
                quant: 0,
                isRest: false,
              },
            ],
          },
          {
            id: 'measure-1-1',
            events: [
              {
                id: 'event-1-1-0',
                notes: [{ id: 'note-6', pitch: 'D3', duration: 'quarter' }],
                duration: 'quarter',
                quant: 0,
                isRest: false,
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Score with rests to test rest handling */
export function createScoreWithRests(): Score {
  return {
    title: 'Rest Score',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-0',
        clef: 'treble',
        measures: [
          {
            id: 'measure-0-0',
            events: [
              {
                id: 'event-note',
                notes: [{ id: 'note-1', pitch: 'C4', duration: 'quarter' }],
                duration: 'quarter',
                quant: 0,
                isRest: false,
              },
              {
                id: 'event-rest',
                notes: [],
                duration: 'quarter',
                quant: 24,
                isRest: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

/** Single staff score for testing without cross-staff complexity */
export function createSingleStaffScore(): Score {
  return {
    title: 'Single Staff',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-0',
        clef: 'treble',
        measures: [
          {
            id: 'measure-0-0',
            events: [
              {
                id: 'event-0-0-0',
                notes: [{ id: 'note-1', pitch: 'C4', duration: 'quarter' }],
                duration: 'quarter',
                quant: 0,
                isRest: false,
              },
            ],
          },
          {
            id: 'measure-0-1',
            events: [
              {
                id: 'event-0-1-0',
                notes: [{ id: 'note-2', pitch: 'D4', duration: 'quarter' }],
                duration: 'quarter',
                quant: 0,
                isRest: false,
              },
            ],
          },
        ],
      },
    ],
  };
}
