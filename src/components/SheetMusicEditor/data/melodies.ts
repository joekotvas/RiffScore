import { Melody } from '../types';

export const MELODIES: Melody[] = [
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    score: {
      title: "Twinkle, Twinkle, Little Star",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'C',
          measures: [
            // A Section
            {
              id: 1,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'C4' }] },
                { id: 102, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'C4' }] },
                { id: 103, duration: 'quarter', dotted: false, notes: [{ id: 3, pitch: 'G4' }] },
                { id: 104, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'G4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'A4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'A4' }] },
                { id: 203, duration: 'half', dotted: false, notes: [{ id: 7, pitch: 'G4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'F4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'F4' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'E4' }] },
                { id: 304, duration: 'quarter', dotted: false, notes: [{ id: 11, pitch: 'E4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'D4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 13, pitch: 'D4' }] },
                { id: 403, duration: 'half', dotted: false, notes: [{ id: 14, pitch: 'C4' }] }
              ]
            },
            // B Section
            {
              id: 5,
              events: [
                { id: 501, duration: 'quarter', dotted: false, notes: [{ id: 15, pitch: 'G4' }] },
                { id: 502, duration: 'quarter', dotted: false, notes: [{ id: 16, pitch: 'G4' }] },
                { id: 503, duration: 'quarter', dotted: false, notes: [{ id: 17, pitch: 'F4' }] },
                { id: 504, duration: 'quarter', dotted: false, notes: [{ id: 18, pitch: 'F4' }] }
              ]
            },
            {
              id: 6,
              events: [
                { id: 601, duration: 'quarter', dotted: false, notes: [{ id: 19, pitch: 'E4' }] },
                { id: 602, duration: 'quarter', dotted: false, notes: [{ id: 20, pitch: 'E4' }] },
                { id: 603, duration: 'half', dotted: false, notes: [{ id: 21, pitch: 'D4' }] }
              ]
            },
            {
              id: 7,
              events: [
                { id: 701, duration: 'quarter', dotted: false, notes: [{ id: 22, pitch: 'G4' }] },
                { id: 702, duration: 'quarter', dotted: false, notes: [{ id: 23, pitch: 'G4' }] },
                { id: 703, duration: 'quarter', dotted: false, notes: [{ id: 24, pitch: 'F4' }] },
                { id: 704, duration: 'quarter', dotted: false, notes: [{ id: 25, pitch: 'F4' }] }
              ]
            },
            {
              id: 8,
              events: [
                { id: 801, duration: 'quarter', dotted: false, notes: [{ id: 26, pitch: 'E4' }] },
                { id: 802, duration: 'quarter', dotted: false, notes: [{ id: 27, pitch: 'E4' }] },
                { id: 803, duration: 'half', dotted: false, notes: [{ id: 28, pitch: 'D4' }] }
              ]
            },
            // A Section Repeat
            {
              id: 9,
              events: [
                { id: 901, duration: 'quarter', dotted: false, notes: [{ id: 29, pitch: 'C4' }] },
                { id: 902, duration: 'quarter', dotted: false, notes: [{ id: 30, pitch: 'C4' }] },
                { id: 903, duration: 'quarter', dotted: false, notes: [{ id: 31, pitch: 'G4' }] },
                { id: 904, duration: 'quarter', dotted: false, notes: [{ id: 32, pitch: 'G4' }] }
              ]
            },
            {
              id: 10,
              events: [
                { id: 1001, duration: 'quarter', dotted: false, notes: [{ id: 33, pitch: 'A4' }] },
                { id: 1002, duration: 'quarter', dotted: false, notes: [{ id: 34, pitch: 'A4' }] },
                { id: 1003, duration: 'half', dotted: false, notes: [{ id: 35, pitch: 'G4' }] }
              ]
            },
            {
              id: 11,
              events: [
                { id: 1101, duration: 'quarter', dotted: false, notes: [{ id: 36, pitch: 'F4' }] },
                { id: 1102, duration: 'quarter', dotted: false, notes: [{ id: 37, pitch: 'F4' }] },
                { id: 1103, duration: 'quarter', dotted: false, notes: [{ id: 38, pitch: 'E4' }] },
                { id: 1104, duration: 'quarter', dotted: false, notes: [{ id: 39, pitch: 'E4' }] }
              ]
            },
            {
              id: 12,
              events: [
                { id: 1201, duration: 'quarter', dotted: false, notes: [{ id: 40, pitch: 'D4' }] },
                { id: 1202, duration: 'quarter', dotted: false, notes: [{ id: 41, pitch: 'D4' }] },
                { id: 1203, duration: 'half', dotted: false, notes: [{ id: 42, pitch: 'C4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'old_macdonald',
    title: 'Old Macdonald',
    score: {
      title: "Old Macdonald Had a Farm",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'G',
          measures: [
            {
              id: 1,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'G4' }] },
                { id: 102, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'G4' }] },
                { id: 103, duration: 'quarter', dotted: false, notes: [{ id: 3, pitch: 'G4' }] },
                { id: 104, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'D4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'E4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'E4' }] },
                { id: 203, duration: 'half', dotted: false, notes: [{ id: 7, pitch: 'D4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'B4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'B4' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'A4' }] },
                { id: 304, duration: 'quarter', dotted: false, notes: [{ id: 11, pitch: 'A4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'half', dotted: false, notes: [{ id: 12, pitch: 'G4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 13, pitch: 'D4' }] },
                { id: 403, duration: 'quarter', dotted: false, notes: [{ id: 14, pitch: 'D4' }] }
              ]
            },
            {
              id: 5,
              events: [
                { id: 501, duration: 'quarter', dotted: false, notes: [{ id: 15, pitch: 'G4' }] },
                { id: 502, duration: 'quarter', dotted: false, notes: [{ id: 16, pitch: 'G4' }] },
                { id: 503, duration: 'quarter', dotted: false, notes: [{ id: 17, pitch: 'G4' }] },
                { id: 504, duration: 'quarter', dotted: false, notes: [{ id: 18, pitch: 'D4' }] }
              ]
            },
            {
              id: 6,
              events: [
                { id: 601, duration: 'quarter', dotted: false, notes: [{ id: 19, pitch: 'E4' }] },
                { id: 602, duration: 'quarter', dotted: false, notes: [{ id: 20, pitch: 'E4' }] },
                { id: 603, duration: 'half', dotted: false, notes: [{ id: 21, pitch: 'D4' }] }
              ]
            },
            {
              id: 7,
              events: [
                { id: 701, duration: 'quarter', dotted: false, notes: [{ id: 22, pitch: 'B4' }] },
                { id: 702, duration: 'quarter', dotted: false, notes: [{ id: 23, pitch: 'B4' }] },
                { id: 703, duration: 'quarter', dotted: false, notes: [{ id: 24, pitch: 'A4' }] },
                { id: 704, duration: 'quarter', dotted: false, notes: [{ id: 25, pitch: 'A4' }] }
              ]
            },
            {
              id: 8,
              events: [
                { id: 801, duration: 'half', dotted: false, notes: [{ id: 26, pitch: 'G4' }] },
                { id: 802, duration: 'quarter', dotted: false, notes: [{ id: 27, pitch: 'D4' }] },
                { id: 803, duration: 'quarter', dotted: false, notes: [{ id: 28, pitch: 'D4' }] }
              ]
            },
            {
              id: 9,
              events: [
                { id: 901, duration: 'quarter', dotted: false, notes: [{ id: 29, pitch: 'G4' }] },
                { id: 902, duration: 'quarter', dotted: false, notes: [{ id: 30, pitch: 'G4' }] },
                { id: 903, duration: 'quarter', dotted: false, notes: [{ id: 31, pitch: 'G4' }] },
                { id: 904, duration: 'quarter', dotted: false, notes: [{ id: 32, pitch: 'G4' }] }
              ]
            },
            {
              id: 10,
              events: [
                { id: 1001, duration: 'quarter', dotted: false, notes: [{ id: 33, pitch: 'G4' }] },
                { id: 1002, duration: 'quarter', dotted: false, notes: [{ id: 34, pitch: 'G4' }] },
                { id: 1003, duration: 'half', dotted: false, notes: [{ id: 35, pitch: 'G4' }] }
              ]
            },
            {
              id: 11,
              events: [
                { id: 1101, duration: 'quarter', dotted: false, notes: [{ id: 36, pitch: 'G4' }] },
                { id: 1102, duration: 'quarter', dotted: false, notes: [{ id: 37, pitch: 'G4' }] },
                { id: 1103, duration: 'quarter', dotted: false, notes: [{ id: 38, pitch: 'G4' }] },
                { id: 1104, duration: 'quarter', dotted: false, notes: [{ id: 39, pitch: 'G4' }] }
              ]
            },
            {
              id: 12,
              events: [
                { id: 1201, duration: 'quarter', dotted: false, notes: [{ id: 40, pitch: 'G4' }] },
                { id: 1202, duration: 'quarter', dotted: false, notes: [{ id: 41, pitch: 'G4' }] },
                { id: 1203, duration: 'quarter', dotted: false, notes: [{ id: 42, pitch: 'G4' }] },
                { id: 1204, duration: 'quarter', dotted: false, notes: [{ id: 43, pitch: 'G4' }] }
              ]
            },
            {
              id: 13,
              events: [
                { id: 1301, duration: 'quarter', dotted: false, notes: [{ id: 44, pitch: 'G4' }] },
                { id: 1302, duration: 'quarter', dotted: false, notes: [{ id: 45, pitch: 'G4' }] },
                { id: 1303, duration: 'quarter', dotted: false, notes: [{ id: 46, pitch: 'G4' }] },
                { id: 1304, duration: 'quarter', dotted: false, notes: [{ id: 47, pitch: 'D4' }] }
              ]
            },
            {
              id: 14,
              events: [
                { id: 1401, duration: 'quarter', dotted: false, notes: [{ id: 48, pitch: 'E4' }] },
                { id: 1402, duration: 'quarter', dotted: false, notes: [{ id: 49, pitch: 'E4' }] },
                { id: 1403, duration: 'half', dotted: false, notes: [{ id: 50, pitch: 'D4' }] }
              ]
            },
            {
              id: 15,
              events: [
                { id: 1501, duration: 'quarter', dotted: false, notes: [{ id: 51, pitch: 'B4' }] },
                { id: 1502, duration: 'quarter', dotted: false, notes: [{ id: 52, pitch: 'B4' }] },
                { id: 1503, duration: 'quarter', dotted: false, notes: [{ id: 53, pitch: 'A4' }] },
                { id: 1504, duration: 'quarter', dotted: false, notes: [{ id: 54, pitch: 'A4' }] }
              ]
            },
            {
              id: 16,
              events: [
                { id: 1601, duration: 'whole', dotted: false, notes: [{ id: 55, pitch: 'G4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    score: {
      title: "Greensleeves",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '6/8',
          keySignature: 'C', // A minor
          measures: [
            {
              id: 1,
              isPickup: true,
              events: [
                { id: 101, duration: 'eighth', dotted: false, notes: [{ id: 1, pitch: 'A4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'C5' }] },
                { id: 202, duration: 'eighth', dotted: false, notes: [{ id: 3, pitch: 'D5' }] },
                { id: 203, duration: 'eighth', dotted: true, notes: [{ id: 4, pitch: 'E5' }] },
                { id: 204, duration: 'sixteenth', dotted: false, notes: [{ id: 5, pitch: 'F5' }] },
                { id: 205, duration: 'eighth', dotted: false, notes: [{ id: 6, pitch: 'E5' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 7, pitch: 'D5' }] },
                { id: 302, duration: 'eighth', dotted: false, notes: [{ id: 8, pitch: 'B4' }] },
                { id: 303, duration: 'eighth', dotted: true, notes: [{ id: 9, pitch: 'G4' }] },
                { id: 304, duration: 'sixteenth', dotted: false, notes: [{ id: 10, pitch: 'A4' }] },
                { id: 305, duration: 'eighth', dotted: false, notes: [{ id: 11, pitch: 'B4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'C5' }] },
                { id: 402, duration: 'eighth', dotted: false, notes: [{ id: 13, pitch: 'A4' }] },
                { id: 403, duration: 'eighth', dotted: true, notes: [{ id: 14, pitch: 'A4' }] },
                { id: 404, duration: 'sixteenth', dotted: false, notes: [{ id: 15, pitch: 'G#4' }] },
                { id: 405, duration: 'eighth', dotted: false, notes: [{ id: 16, pitch: 'A4' }] }
              ]
            },
            {
              id: 5,
              events: [
                { id: 501, duration: 'quarter', dotted: false, notes: [{ id: 17, pitch: 'B4' }] },
                { id: 502, duration: 'eighth', dotted: false, notes: [{ id: 18, pitch: 'G#4' }] },
                { id: 503, duration: 'quarter', dotted: false, notes: [{ id: 19, pitch: 'E4' }] },
                { id: 504, duration: 'eighth', dotted: false, notes: [{ id: 20, pitch: 'A4' }] }
              ]
            },
            {
              id: 6,
              events: [
                { id: 601, duration: 'quarter', dotted: false, notes: [{ id: 21, pitch: 'C5' }] },
                { id: 602, duration: 'eighth', dotted: false, notes: [{ id: 22, pitch: 'D5' }] },
                { id: 603, duration: 'eighth', dotted: true, notes: [{ id: 23, pitch: 'E5' }] },
                { id: 604, duration: 'sixteenth', dotted: false, notes: [{ id: 24, pitch: 'F5' }] },
                { id: 605, duration: 'eighth', dotted: false, notes: [{ id: 25, pitch: 'E5' }] }
              ]
            },
            {
              id: 7,
              events: [
                { id: 701, duration: 'quarter', dotted: false, notes: [{ id: 26, pitch: 'D5' }] },
                { id: 702, duration: 'eighth', dotted: false, notes: [{ id: 27, pitch: 'B4' }] },
                { id: 703, duration: 'eighth', dotted: true, notes: [{ id: 28, pitch: 'G4' }] },
                { id: 704, duration: 'sixteenth', dotted: false, notes: [{ id: 29, pitch: 'A4' }] },
                { id: 705, duration: 'eighth', dotted: false, notes: [{ id: 30, pitch: 'B4' }] }
              ]
            },
            {
              id: 8,
              events: [
                { id: 801, duration: 'quarter', dotted: false, notes: [{ id: 31, pitch: 'C5' }] },
                { id: 802, duration: 'eighth', dotted: false, notes: [{ id: 32, pitch: 'B4' }] },
                { id: 803, duration: 'eighth', dotted: true, notes: [{ id: 33, pitch: 'A4' }] },
                { id: 804, duration: 'sixteenth', dotted: false, notes: [{ id: 34, pitch: 'G#4' }] },
                { id: 805, duration: 'eighth', dotted: false, notes: [{ id: 35, pitch: 'G#4' }] }
              ]
            },
            {
              id: 9,
              events: [
                { id: 901, duration: 'quarter', dotted: true, notes: [{ id: 36, pitch: 'A4' }] },
                { id: 902, duration: 'quarter', dotted: true, notes: [{ id: 37, pitch: 'A4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'amazing_grace',
    title: 'Amazing Grace',
    score: {
      title: "Amazing Grace",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '3/4',
          keySignature: 'G',
          measures: [
            {
              id: 1,
              isPickup: true,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'D4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'half', dotted: false, notes: [{ id: 2, pitch: 'G4' }] },
                { id: 202, duration: 'eighth', dotted: false, notes: [{ id: 3, pitch: 'B4' }] },
                { id: 203, duration: 'eighth', dotted: false, notes: [{ id: 4, pitch: 'G4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'half', dotted: false, notes: [{ id: 5, pitch: 'B4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'A4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'half', dotted: false, notes: [{ id: 7, pitch: 'G4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'E4' }] }
              ]
            },
            {
              id: 5,
              events: [
                { id: 501, duration: 'half', dotted: false, notes: [{ id: 9, pitch: 'D4' }] },
                { id: 502, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'D4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'oh_susanna',
    title: 'Oh! Susanna',
    score: {
      title: "Oh! Susanna",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'D',
          measures: [
            {
              id: 1,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'D4' }] },
                { id: 102, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'E4' }] },
                { id: 103, duration: 'quarter', dotted: false, notes: [{ id: 3, pitch: 'F#4' }] },
                { id: 104, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'A4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'A4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'B4' }] },
                { id: 203, duration: 'quarter', dotted: false, notes: [{ id: 7, pitch: 'A4' }] },
                { id: 204, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'F#4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'D4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'E4' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 11, pitch: 'F#4' }] },
                { id: 304, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'F#4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: false, notes: [{ id: 13, pitch: 'E4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 14, pitch: 'D4' }] },
                { id: 403, duration: 'half', dotted: false, notes: [{ id: 15, pitch: 'E4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'loch_lomond',
    title: 'Loch Lomond',
    score: {
      title: "Loch Lomond",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'F',
          measures: [
            {
              id: 1,
              isPickup: true,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'C4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'F4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 3, pitch: 'F4' }] },
                { id: 203, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'A4' }] },
                { id: 204, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'C5' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'D5' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 7, pitch: 'C5' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'A4' }] },
                { id: 304, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'G4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'F4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 11, pitch: 'G4' }] },
                { id: 403, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'A4' }] },
                { id: 404, duration: 'quarter', dotted: false, notes: [{ id: 13, pitch: 'C5' }] }
              ]
            },
            {
              id: 5,
              events: [
                { id: 501, duration: 'quarter', dotted: false, notes: [{ id: 14, pitch: 'A4' }] },
                { id: 502, duration: 'quarter', dotted: false, notes: [{ id: 15, pitch: 'G4' }] },
                { id: 503, duration: 'half', dotted: false, notes: [{ id: 16, pitch: 'F4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'auld_lang_syne',
    title: 'Auld Lang Syne',
    score: {
      title: "Auld Lang Syne",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'F',
          measures: [
            {
              id: 1,
              isPickup: true,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'C4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: true, notes: [{ id: 2, pitch: 'F4' }] },
                { id: 202, duration: 'eighth', dotted: false, notes: [{ id: 3, pitch: 'E4' }] },
                { id: 203, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'F4' }] },
                { id: 204, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'A4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: true, notes: [{ id: 6, pitch: 'G4' }] },
                { id: 302, duration: 'eighth', dotted: false, notes: [{ id: 7, pitch: 'F4' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'G4' }] },
                { id: 304, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'A4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: true, notes: [{ id: 10, pitch: 'F4' }] },
                { id: 402, duration: 'eighth', dotted: false, notes: [{ id: 11, pitch: 'E4' }] },
                { id: 403, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'F4' }] },
                { id: 404, duration: 'quarter', dotted: false, notes: [{ id: 13, pitch: 'A4' }] }
              ]
            },
            {
              id: 5,
              events: [
                { id: 501, duration: 'half', dotted: false, notes: [{ id: 14, pitch: 'D5' }] },
                { id: 502, duration: 'quarter', dotted: false, notes: [{ id: 15, pitch: 'D5' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'el_condor_pasa',
    title: 'El Cóndor Pasa',
    score: {
      title: "El Cóndor Pasa",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'G', // E minor
          measures: [
            {
              id: 1,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'E4' }] },
                { id: 102, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'G4' }] },
                { id: 103, duration: 'quarter', dotted: false, notes: [{ id: 3, pitch: 'B4' }] },
                { id: 104, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'B4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'half', dotted: false, notes: [{ id: 5, pitch: 'B4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'A4' }] },
                { id: 203, duration: 'quarter', dotted: false, notes: [{ id: 7, pitch: 'G4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'half', dotted: false, notes: [{ id: 8, pitch: 'E4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'G4' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'A4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'half', dotted: false, notes: [{ id: 11, pitch: 'B4' }] },
                { id: 402, duration: 'half', dotted: false, notes: [{ id: 12, pitch: 'B4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'frere_jacques',
    title: 'Frère Jacques',
    score: {
      title: "Frère Jacques",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'C',
          measures: [
            {
              id: 1,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'C4' }] },
                { id: 102, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'D4' }] },
                { id: 103, duration: 'quarter', dotted: false, notes: [{ id: 3, pitch: 'E4' }] },
                { id: 104, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'C4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'C4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 6, pitch: 'D4' }] },
                { id: 203, duration: 'quarter', dotted: false, notes: [{ id: 7, pitch: 'E4' }] },
                { id: 204, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'C4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'E4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'F4' }] },
                { id: 303, duration: 'half', dotted: false, notes: [{ id: 11, pitch: 'G4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'E4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 13, pitch: 'F4' }] },
                { id: 403, duration: 'half', dotted: false, notes: [{ id: 14, pitch: 'G4' }] }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: 'sakura',
    title: 'Sakura',
    score: {
      title: "Sakura",
      staves: [
        {
          id: 1,
          clef: 'treble',
          timeSignature: '4/4',
          keySignature: 'C', // A minor
          measures: [
            {
              id: 1,
              events: [
                { id: 101, duration: 'quarter', dotted: false, notes: [{ id: 1, pitch: 'A4' }] },
                { id: 102, duration: 'quarter', dotted: false, notes: [{ id: 2, pitch: 'A4' }] },
                { id: 103, duration: 'half', dotted: false, notes: [{ id: 3, pitch: 'B4' }] }
              ]
            },
            {
              id: 2,
              events: [
                { id: 201, duration: 'quarter', dotted: false, notes: [{ id: 4, pitch: 'A4' }] },
                { id: 202, duration: 'quarter', dotted: false, notes: [{ id: 5, pitch: 'A4' }] },
                { id: 203, duration: 'half', dotted: false, notes: [{ id: 6, pitch: 'B4' }] }
              ]
            },
            {
              id: 3,
              events: [
                { id: 301, duration: 'quarter', dotted: false, notes: [{ id: 7, pitch: 'A4' }] },
                { id: 302, duration: 'quarter', dotted: false, notes: [{ id: 8, pitch: 'B4' }] },
                { id: 303, duration: 'quarter', dotted: false, notes: [{ id: 9, pitch: 'C5' }] },
                { id: 304, duration: 'quarter', dotted: false, notes: [{ id: 10, pitch: 'B4' }] }
              ]
            },
            {
              id: 4,
              events: [
                { id: 401, duration: 'quarter', dotted: false, notes: [{ id: 11, pitch: 'A4' }] },
                { id: 402, duration: 'quarter', dotted: false, notes: [{ id: 12, pitch: 'B4' }] },
                { id: 403, duration: 'half', dotted: false, notes: [{ id: 13, pitch: 'A4' }] }
              ]
            }
          ]
        }
      ]
    }
  }
];
