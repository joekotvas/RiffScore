/**
 * MusicXML Exporter Tests
 *
 * Tests clef export correctness for all clef types.
 */

import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { Score } from '@/types';

/**
 * Create a minimal score with the specified clef
 */
const createScoreWithClef = (clef: string): Score => ({
  title: 'Test Score',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-1',
      clef: clef as 'treble' | 'bass' | 'alto' | 'tenor' | 'grand',
      keySignature: 'C',
      measures: [
        {
          id: 'measure-1',
          events: [
            {
              id: 'event-1',
              duration: 'quarter',
              dotted: false,
              notes: [{ id: 'note-1', pitch: 'C4' }],
            },
          ],
        },
      ],
    },
  ],
});

describe('MusicXML Clef Export', () => {
  it.each([
    ['treble', 'G', '2'],
    ['bass', 'F', '4'],
    ['alto', 'C', '3'],
    ['tenor', 'C', '4'],
  ])('exports %s clef with sign=%s, line=%s', (clef, expectedSign, expectedLine) => {
    const score = createScoreWithClef(clef);
    const xml = generateMusicXML(score);

    expect(xml).toContain(`<sign>${expectedSign}</sign>`);
    expect(xml).toContain(`<line>${expectedLine}</line>`);
  });

  it('exports valid XML structure', () => {
    const score = createScoreWithClef('treble');
    const xml = generateMusicXML(score);

    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<score-partwise');
    expect(xml).toContain('</score-partwise>');
  });

  describe('exception paths', () => {
    it('defaults unknown clef to treble (G on line 2)', () => {
      const score = createScoreWithClef('unknown' as string);
      const xml = generateMusicXML(score);

      expect(xml).toContain('<sign>G</sign>');
      expect(xml).toContain('<line>2</line>');
    });

    it('handles empty measures array', () => {
      const score: Score = {
        ...createScoreWithClef('treble'),
        staves: [
          {
            id: 'staff-1',
            clef: 'treble',
            keySignature: 'C',
            measures: [],
          },
        ],
      };
      const xml = generateMusicXML(score);

      expect(xml).toContain('<score-partwise');
      expect(xml).toContain('</score-partwise>');
    });

    it('handles missing clef property (defaults to treble)', () => {
      const score = createScoreWithClef('treble');
      // Test fallback when clef is undefined
      (score.staves[0] as { clef?: string }).clef = undefined;
      const xml = generateMusicXML(score);

      expect(xml).toContain('<sign>G</sign>');
      expect(xml).toContain('<line>2</line>');
    });

    it('skips notes with null pitch without errors', () => {
      const score: Score = {
        ...createScoreWithClef('treble'),
        staves: [
          {
            id: 'staff-1',
            clef: 'treble',
            keySignature: 'C',
            measures: [
              {
                id: 'measure-1',
                events: [
                  {
                    id: 'event-1',
                    duration: 'quarter',
                    dotted: false,
                    notes: [
                      { id: 'note-1', pitch: null },
                      { id: 'note-2', pitch: 'D4' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      // Should not throw and should export the valid note
      const xml = generateMusicXML(score);

      expect(xml).toContain('<score-partwise');
      expect(xml).toContain('<step>D</step>');
      expect(xml).toContain('<octave>4</octave>');
    });
  });
});

describe('MusicXML Chord Symbol Export', () => {
  /**
   * Create a score with chord symbols in the chord track
   */
  const createScoreWithChords = (
    chordTrack: Score['chordTrack'],
    events: Score['staves'][0]['measures'][0]['events'] = [
      { id: 'e1', duration: 'quarter', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
      { id: 'e2', duration: 'quarter', dotted: false, notes: [{ id: 'n2', pitch: 'E4' }] },
      { id: 'e3', duration: 'quarter', dotted: false, notes: [{ id: 'n3', pitch: 'G4' }] },
      { id: 'e4', duration: 'quarter', dotted: false, notes: [{ id: 'n4', pitch: 'C5' }] },
    ]
  ): Score => ({
    title: 'Test Score',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    chordTrack,
    staves: [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'C',
        measures: [{ id: 'measure-1', events }],
      },
    ],
  });

  it('exports basic major chord as harmony element', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'C' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<harmony>');
    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>major</kind>');
    expect(xml).toContain('</harmony>');
  });

  it('exports minor chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Am' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>A</root-step>');
    expect(xml).toContain('<kind>minor</kind>');
  });

  it('exports dominant seventh chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'G7' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>G</root-step>');
    expect(xml).toContain('<kind>dominant</kind>');
  });

  it('exports major seventh chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Cmaj7' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>major-seventh</kind>');
  });

  it('exports minor seventh chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Dm7' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>D</root-step>');
    expect(xml).toContain('<kind>minor-seventh</kind>');
  });

  it('exports diminished chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Bdim' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>B</root-step>');
    expect(xml).toContain('<kind>diminished</kind>');
  });

  it('exports augmented chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Caug' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>augmented</kind>');
  });

  it('exports half-diminished chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Bm7b5' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>B</root-step>');
    expect(xml).toContain('<kind>half-diminished</kind>');
  });

  it('exports suspended fourth chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Dsus4' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>D</root-step>');
    expect(xml).toContain('<kind>suspended-fourth</kind>');
  });

  it('exports suspended second chord correctly', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Gsus2' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>G</root-step>');
    expect(xml).toContain('<kind>suspended-second</kind>');
  });

  it('exports sharp root note with root-alter', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'F#m' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>F</root-step>');
    expect(xml).toContain('<root-alter>1</root-alter>');
    expect(xml).toContain('<kind>minor</kind>');
  });

  it('exports flat root note with root-alter', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Bb7' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>B</root-step>');
    expect(xml).toContain('<root-alter>-1</root-alter>');
    expect(xml).toContain('<kind>dominant</kind>');
  });

  it('exports slash chord with bass element', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'C/E' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>major</kind>');
    expect(xml).toContain('<bass>');
    expect(xml).toContain('<bass-step>E</bass-step>');
    expect(xml).toContain('</bass>');
  });

  it('exports slash chord with accidental bass note', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'Am/G#' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>A</root-step>');
    expect(xml).toContain('<bass-step>G</bass-step>');
    expect(xml).toContain('<bass-alter>1</bass-alter>');
  });

  it('places harmony element before note at correct quant position', () => {
    // Chord at quant 16 (second quarter note)
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 16, symbol: 'G' },
    ]);
    const xml = generateMusicXML(score);

    // Harmony should appear in the XML
    expect(xml).toContain('<harmony>');

    // Check that harmony appears before the second note
    const harmonyIndex = xml.indexOf('<harmony>');
    const secondNoteIndex = xml.indexOf('<step>E</step>'); // E4 is the second note
    expect(harmonyIndex).toBeLessThan(secondNoteIndex);
  });

  it('exports multiple chords at different positions', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'C' },
      { id: 'chord-2', quant: 32, symbol: 'G' }, // Third beat
    ]);
    const xml = generateMusicXML(score);

    // Count harmony elements
    const harmonyMatches = xml.match(/<harmony>/g);
    expect(harmonyMatches).toHaveLength(2);
  });

  it('only adds harmony to first part in multi-staff score', () => {
    const score: Score = {
      title: 'Test Score',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      chordTrack: [{ id: 'chord-1', quant: 0, symbol: 'C' }],
      staves: [
        {
          id: 'staff-1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'measure-1',
              events: [
                { id: 'e1', duration: 'whole', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
              ],
            },
          ],
        },
        {
          id: 'staff-2',
          clef: 'bass',
          keySignature: 'C',
          measures: [
            {
              id: 'measure-2',
              events: [
                { id: 'e2', duration: 'whole', dotted: false, notes: [{ id: 'n2', pitch: 'C3' }] },
              ],
            },
          ],
        },
      ],
    };
    const xml = generateMusicXML(score);

    // Should only have one harmony element (in the first part)
    const harmonyMatches = xml.match(/<harmony>/g);
    expect(harmonyMatches).toHaveLength(1);

    // Harmony should be in part P1
    const p1Index = xml.indexOf('<part id="P1">');
    const p2Index = xml.indexOf('<part id="P2">');
    const harmonyIndex = xml.indexOf('<harmony>');

    expect(harmonyIndex).toBeGreaterThan(p1Index);
    expect(harmonyIndex).toBeLessThan(p2Index);
  });

  it('handles score without chord track', () => {
    const score = createScoreWithChords(undefined);
    const xml = generateMusicXML(score);

    expect(xml).not.toContain('<harmony>');
    expect(xml).toContain('<score-partwise');
  });

  it('handles empty chord track', () => {
    const score = createScoreWithChords([]);
    const xml = generateMusicXML(score);

    expect(xml).not.toContain('<harmony>');
    expect(xml).toContain('<score-partwise');
  });

  it('omits root-alter when root has no accidental', () => {
    const score = createScoreWithChords([
      { id: 'chord-1', quant: 0, symbol: 'C' },
    ]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).not.toContain('<root-alter>0</root-alter>');
  });

  it('exports chord at correct position across measures', () => {
    // 4/4 time = 64 quants per measure
    // Chord at quant 64 = first beat of measure 2
    const score: Score = {
      title: 'Test Score',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      chordTrack: [
        { id: 'chord-1', quant: 0, symbol: 'C' },
        { id: 'chord-2', quant: 64, symbol: 'G' }, // First beat of measure 2
      ],
      staves: [
        {
          id: 'staff-1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'measure-1',
              events: [
                { id: 'e1', duration: 'whole', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
              ],
            },
            {
              id: 'measure-2',
              events: [
                { id: 'e2', duration: 'whole', dotted: false, notes: [{ id: 'n2', pitch: 'G4' }] },
              ],
            },
          ],
        },
      ],
    };
    const xml = generateMusicXML(score);

    // Should have two harmony elements
    const harmonyMatches = xml.match(/<harmony>/g);
    expect(harmonyMatches).toHaveLength(2);

    // Second harmony (G) should appear in measure 2
    const measure2Index = xml.indexOf('<measure number="2">');
    const secondHarmonyIndex = xml.lastIndexOf('<harmony>');
    expect(secondHarmonyIndex).toBeGreaterThan(measure2Index);
  });
});
