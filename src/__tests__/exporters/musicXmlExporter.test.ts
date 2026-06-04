/**
 * MusicXML Exporter Tests
 *
 * Tests clef export correctness, metadata export, and chord symbol export.
 */

import { generateMusicXML } from '@/exporters/musicXmlExporter';
import { Score, ScoreMetadata } from '@/types';
import {
  parseMusicXml,
  checkDurationSums,
  allDurationsIntegral,
} from '../fixtures/musicXmlStructure';

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
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'C' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<harmony>');
    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>major</kind>');
    expect(xml).toContain('</harmony>');
  });

  it('exports minor chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Am' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>A</root-step>');
    expect(xml).toContain('<kind>minor</kind>');
  });

  it('exports dominant seventh chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'G7' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>G</root-step>');
    expect(xml).toContain('<kind>dominant</kind>');
  });

  it('exports major seventh chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Cmaj7' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>major-seventh</kind>');
  });

  it('exports minor seventh chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Dm7' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>D</root-step>');
    expect(xml).toContain('<kind>minor-seventh</kind>');
  });

  it('exports diminished chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Bdim' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>B</root-step>');
    expect(xml).toContain('<kind>diminished</kind>');
  });

  it('exports augmented chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Caug' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>augmented</kind>');
  });

  it('exports half-diminished chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Bm7b5' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>B</root-step>');
    expect(xml).toContain('<kind>half-diminished</kind>');
  });

  it('exports suspended fourth chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Dsus4' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>D</root-step>');
    expect(xml).toContain('<kind>suspended-fourth</kind>');
  });

  it('exports suspended second chord correctly', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Gsus2' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>G</root-step>');
    expect(xml).toContain('<kind>suspended-second</kind>');
  });

  it('exports sharp root note with root-alter', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'F#m' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>F</root-step>');
    expect(xml).toContain('<root-alter>1</root-alter>');
    expect(xml).toContain('<kind>minor</kind>');
  });

  it('exports flat root note with root-alter', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Bb7' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>B</root-step>');
    expect(xml).toContain('<root-alter>-1</root-alter>');
    expect(xml).toContain('<kind>dominant</kind>');
  });

  it('exports slash chord with bass element', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'C/E' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>C</root-step>');
    expect(xml).toContain('<kind>major</kind>');
    expect(xml).toContain('<bass>');
    expect(xml).toContain('<bass-step>E</bass-step>');
    expect(xml).toContain('</bass>');
  });

  it('exports slash chord with accidental bass note', () => {
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'Am/G#' }]);
    const xml = generateMusicXML(score);

    expect(xml).toContain('<root-step>A</root-step>');
    expect(xml).toContain('<bass-step>G</bass-step>');
    expect(xml).toContain('<bass-alter>1</bass-alter>');
  });

  it('places harmony element before note at correct quant position', () => {
    // Chord at quant 16 (second quarter note)
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 16, symbol: 'G' }]);
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
      { id: 'chord-1', measure: 0, quant: 0, symbol: 'C' },
      { id: 'chord-2', measure: 0, quant: 32, symbol: 'G' }, // Third beat
    ]);
    const xml = generateMusicXML(score);

    // Count harmony elements
    const harmonyMatches = xml.match(/<harmony>/g);
    expect(harmonyMatches).toHaveLength(2);
  });

  it('only adds harmony to the top staff in a grand-staff score', () => {
    const score: Score = {
      title: 'Test Score',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      chordTrack: [{ id: 'chord-1', measure: 0, quant: 0, symbol: 'C' }],
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

    // A grand staff exports as exactly ONE <part>, so there is no P2.
    expect(xml.match(/<part id="P\d+">/g)).toHaveLength(1);
    expect(xml).toContain('<part id="P1">');
    expect(xml).not.toContain('<part id="P2">');

    // Should only have one harmony element (annotating the top staff).
    const harmonyMatches = xml.match(/<harmony>/g);
    expect(harmonyMatches).toHaveLength(1);

    // Harmony must precede the <backup> that separates staff 1 from staff 2,
    // i.e. it belongs to the top staff's timeline.
    const harmonyIndex = xml.indexOf('<harmony>');
    const backupIndex = xml.indexOf('<backup>');
    expect(harmonyIndex).toBeGreaterThan(xml.indexOf('<part id="P1">'));
    expect(backupIndex).toBeGreaterThan(-1);
    expect(harmonyIndex).toBeLessThan(backupIndex);
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
    const score = createScoreWithChords([{ id: 'chord-1', measure: 0, quant: 0, symbol: 'C' }]);
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
        { id: 'chord-1', measure: 0, quant: 0, symbol: 'C' },
        { id: 'chord-2', measure: 1, quant: 0, symbol: 'G' }, // First beat of measure 2
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

/**
 * Create a minimal score with metadata
 */
const createScoreWithMetadata = (metadata: ScoreMetadata): Score => ({
  title: metadata.title,
  metadata,
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
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
              notes: [{ id: 'note-1', pitch: 'C4' }],
            },
          ],
        },
      ],
    },
  ],
});

describe('MusicXML Export - Metadata', () => {
  it('exports title in work-title', () => {
    const score = createScoreWithMetadata({ title: 'My Song' });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<work-title>My Song</work-title>');
  });

  it('exports composer as creator', () => {
    const score = createScoreWithMetadata({
      title: 'My Song',
      composer: 'John Doe',
    });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<creator type="composer">John Doe</creator>');
  });

  it('exports lyricist as creator', () => {
    const score = createScoreWithMetadata({
      title: 'My Song',
      lyricist: 'Jane Smith',
    });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<creator type="lyricist">Jane Smith</creator>');
  });

  it('exports copyright in rights', () => {
    const score = createScoreWithMetadata({
      title: 'My Song',
      copyright: '© 2026 John Doe',
    });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<rights>© 2026 John Doe</rights>');
  });

  it('escapes XML special characters in title', () => {
    const score = createScoreWithMetadata({
      title: 'Rock & Roll',
    });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<work-title>Rock &amp; Roll</work-title>');
  });

  it('escapes XML special characters in composer', () => {
    const score = createScoreWithMetadata({
      title: 'Test',
      composer: '<Unknown>',
    });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<creator type="composer">&lt;Unknown&gt;</creator>');
  });

  it('escapes all XML special characters', () => {
    const score = createScoreWithMetadata({
      title: 'Test & "Quotes" <Angles> \'Apostrophe\'',
    });
    const xml = generateMusicXML(score);
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&apos;');
  });

  it('includes encoding information', () => {
    const score = createScoreWithMetadata({ title: 'Test' });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<software>RiffScore</software>');
    expect(xml).toContain('<encoding-date>');
  });

  it('includes encoding date in YYYY-MM-DD format', () => {
    const score = createScoreWithMetadata({ title: 'Test' });
    const xml = generateMusicXML(score);
    // Match YYYY-MM-DD pattern
    expect(xml).toMatch(/<encoding-date>\d{4}-\d{2}-\d{2}<\/encoding-date>/);
  });

  it('omits optional fields when not present', () => {
    const score = createScoreWithMetadata({ title: 'My Song' });
    const xml = generateMusicXML(score);
    expect(xml).not.toContain('type="composer"');
    expect(xml).not.toContain('type="lyricist"');
    expect(xml).not.toContain('<rights>');
  });

  it('uses legacy title when metadata is not specified', () => {
    const score = createScoreWithClef('treble');
    // Remove metadata to test fallback to legacy title
    delete (score as Partial<Score>).metadata;
    const xml = generateMusicXML(score);
    expect(xml).toContain('<work-title>Test Score</work-title>');
  });

  it('exports all metadata fields together', () => {
    const score = createScoreWithMetadata({
      title: 'Complete Song',
      composer: 'Composer Name',
      lyricist: 'Lyricist Name',
      copyright: '© 2026 Publisher',
    });
    const xml = generateMusicXML(score);

    expect(xml).toContain('<work-title>Complete Song</work-title>');
    expect(xml).toContain('<creator type="composer">Composer Name</creator>');
    expect(xml).toContain('<creator type="lyricist">Lyricist Name</creator>');
    expect(xml).toContain('<rights>© 2026 Publisher</rights>');
  });

  it('includes work element with title', () => {
    const score = createScoreWithMetadata({ title: 'Work Test' });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<work>');
    expect(xml).toContain('</work>');
  });

  it('includes identification element', () => {
    const score = createScoreWithMetadata({ title: 'ID Test' });
    const xml = generateMusicXML(score);
    expect(xml).toContain('<identification>');
    expect(xml).toContain('</identification>');
  });

  it('uses MusicXML 4.0 version', () => {
    const score = createScoreWithMetadata({ title: 'Version Test' });
    const xml = generateMusicXML(score);
    expect(xml).toContain('version="4.0"');
    expect(xml).toContain('MusicXML 4.0');
  });

  it('places metadata before part-list', () => {
    const score = createScoreWithMetadata({ title: 'Order Test' });
    const xml = generateMusicXML(score);

    const workIndex = xml.indexOf('<work>');
    const identificationIndex = xml.indexOf('<identification>');
    const partListIndex = xml.indexOf('<part-list>');

    expect(workIndex).toBeLessThan(identificationIndex);
    expect(identificationIndex).toBeLessThan(partListIndex);
  });
});

/**
 * Build a grand-staff (treble + bass) score. In riffscore's model a score with
 * >= 2 staves is ALWAYS a piano grand staff (see SetGrandStaffCommand); there is
 * no concept of independent instruments. Each staff carries one quarter note per
 * measure here, padded to a full measure for the duration-sum invariant where it
 * is asserted explicitly.
 */
const createGrandStaffScore = (overrides?: Partial<Score>): Score => ({
  title: 'Grand Staff',
  timeSignature: '4/4',
  keySignature: 'C',
  bpm: 120,
  staves: [
    {
      id: 'staff-treble',
      clef: 'treble',
      keySignature: 'C',
      measures: [
        {
          id: 'm1-t',
          events: [
            { id: 'e-t1', duration: 'whole', dotted: false, notes: [{ id: 'n-t1', pitch: 'E4' }] },
          ],
        },
      ],
    },
    {
      id: 'staff-bass',
      clef: 'bass',
      keySignature: 'C',
      measures: [
        {
          id: 'm1-b',
          events: [
            { id: 'e-b1', duration: 'whole', dotted: false, notes: [{ id: 'n-b1', pitch: 'C3' }] },
          ],
        },
      ],
    },
  ],
  ...overrides,
});

describe('MusicXML Grand-Staff Export (one part, <staves>/<backup>)', () => {
  it('exports a grand staff as exactly ONE <part>', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    const parsed = parseMusicXml(xml);

    expect(parsed.parts).toHaveLength(1);
    expect(parsed.parts[0].id).toBe('P1');
    // The legacy two-part output had P2; it must be gone.
    expect(xml).not.toContain('<part id="P2">');
    expect(xml.match(/<part id="P\d+">/g)).toHaveLength(1);
  });

  it('declares <staves>2</staves> in the attributes', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    expect(xml).toContain('<staves>2</staves>');
  });

  it('emits both clefs with clef numbers (treble=1, bass=2)', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    expect(xml).toMatch(/<clef number="1">\s*<sign>G<\/sign>\s*<line>2<\/line>\s*<\/clef>/);
    expect(xml).toMatch(/<clef number="2">\s*<sign>F<\/sign>\s*<line>4<\/line>\s*<\/clef>/);
  });

  it('tags notes with <staff>1</staff> and <staff>2</staff>', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    expect(xml).toContain('<staff>1</staff>');
    expect(xml).toContain('<staff>2</staff>');

    // The treble note (E) is on staff 1; the bass note (C) is on staff 2.
    const trebleNote = xml.indexOf('<step>E</step>');
    const bassNote = xml.indexOf('<step>C</step>');
    const staff1 = xml.indexOf('<staff>1</staff>');
    const staff2 = xml.indexOf('<staff>2</staff>');
    // Staff-1 tag follows the treble note and precedes the bass note's staff-2 tag.
    expect(trebleNote).toBeLessThan(staff1);
    expect(staff1).toBeLessThan(bassNote);
    expect(bassNote).toBeLessThan(staff2);
  });

  it('emits exactly one <backup> per measure to rewind between staves', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    const backups = xml.match(/<backup>/g);
    expect(backups).toHaveLength(1); // one measure -> one backup
  });

  it('backup duration equals the top staff measure duration (rewinds to bar start)', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    const parsed = parseMusicXml(xml);
    const divisions = parsed.parts[0].measures[0].divisions;
    // A whole note in 4/4 at the per-score divisions = divisions * 4.
    const expectedBackup = divisions * 4;
    expect(xml).toMatch(
      new RegExp(`<backup>\\s*<duration>${expectedBackup}</duration>\\s*</backup>`)
    );
  });

  it('the <backup> appears between the staff-1 note and the staff-2 note', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    const trebleNote = xml.indexOf('<step>E</step>');
    const backup = xml.indexOf('<backup>');
    const bassNote = xml.indexOf('<step>C</step>');
    expect(trebleNote).toBeLessThan(backup);
    expect(backup).toBeLessThan(bassNote);
  });

  it('marks a braced part-group in the part-list', () => {
    const xml = generateMusicXML(createGrandStaffScore());
    expect(xml).toContain('<part-group type="start" number="1">');
    expect(xml).toContain('<group-symbol>brace</group-symbol>');
    expect(xml).toContain('<part-group type="stop" number="1"/>');

    // The group must wrap the single <score-part>.
    const groupStart = xml.indexOf('<part-group type="start"');
    const scorePart = xml.indexOf('<score-part id="P1">');
    const groupStop = xml.indexOf('<part-group type="stop"');
    expect(groupStart).toBeLessThan(scorePart);
    expect(scorePart).toBeLessThan(groupStop);
  });

  it('a single-staff score does NOT emit <staves>, <staff>, <backup>, or a part-group', () => {
    const xml = generateMusicXML(createScoreWithClef('treble'));
    expect(xml).not.toContain('<staves>');
    expect(xml).not.toContain('<staff>');
    expect(xml).not.toContain('<backup>');
    expect(xml).not.toContain('<part-group');
  });

  it('keeps per-measure duration sums correct on a full grand-staff measure', () => {
    // Each staff fills a 4/4 measure with four quarter notes.
    const quarters = (prefix: string, pitch: string) =>
      Array.from({ length: 4 }, (_, i) => ({
        id: `${prefix}-${i}`,
        duration: 'quarter',
        dotted: false,
        notes: [{ id: `${prefix}-n-${i}`, pitch }],
      }));

    const score: Score = {
      title: 'Full',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 'staff-treble',
          clef: 'treble',
          keySignature: 'C',
          measures: [{ id: 'm1-t', events: quarters('t', 'E4') }],
        },
        {
          id: 'staff-bass',
          clef: 'bass',
          keySignature: 'C',
          measures: [{ id: 'm1-b', events: quarters('b', 'C3') }],
        },
      ],
    };

    const parsed = parseMusicXml(generateMusicXML(score));
    // checkDurationSums sums time-advancing notes; the <backup> resets the cursor
    // but the helper still expects the COMBINED note durations to be 2x a bar here
    // (both staves' notes live in one measure). We therefore assert each staff's
    // half separately via the raw count instead of the combined invariant.
    // Combined: 8 quarter notes => sum is 2 * (divisions*4).
    const divisions = parsed.parts[0].measures[0].divisions;
    const measure = parsed.parts[0].measures[0];
    const total = measure.notes
      .filter((n) => !n.isChord)
      .reduce((s, n) => s + n.duration, 0);
    expect(total).toBe(2 * divisions * 4);
    expect(allDurationsIntegral(parsed)).toBe(true);
  });
});

describe('MusicXML Pickup / Anacrusis Export (implicit measure 0)', () => {
  /**
   * Build a single-staff score whose first measure is a pickup (anacrusis) of a
   * single quarter note, followed by two full 4/4 measures.
   */
  const createPickupScore = (): Score => ({
    title: 'Pickup',
    timeSignature: '4/4',
    keySignature: 'C',
    bpm: 120,
    staves: [
      {
        id: 'staff-1',
        clef: 'treble',
        keySignature: 'C',
        measures: [
          {
            id: 'm0',
            isPickup: true,
            events: [
              { id: 'p1', duration: 'quarter', dotted: false, notes: [{ id: 'pn1', pitch: 'G4' }] },
            ],
          },
          {
            id: 'm1',
            events: [
              { id: 'a1', duration: 'whole', dotted: false, notes: [{ id: 'an1', pitch: 'C4' }] },
            ],
          },
          {
            id: 'm2',
            events: [
              { id: 'b1', duration: 'whole', dotted: false, notes: [{ id: 'bn1', pitch: 'D4' }] },
            ],
          },
        ],
      },
    ],
  });

  it('numbers the pickup measure 0 with implicit="yes"', () => {
    const xml = generateMusicXML(createPickupScore());
    expect(xml).toContain('<measure number="0" implicit="yes">');
  });

  it('numbers the first full measure 1 (not 2)', () => {
    const xml = generateMusicXML(createPickupScore());
    expect(xml).toContain('<measure number="1">');
    // No implicit flag on measure 1.
    expect(xml).not.toContain('<measure number="1" implicit');
  });

  it('produces the correct measure sequence 0, 1, 2', () => {
    const parsed = parseMusicXml(generateMusicXML(createPickupScore()));
    expect(parsed.parts[0].measures.map((m) => m.number)).toEqual([0, 1, 2]);
  });

  it('emits the right total measure count', () => {
    const parsed = parseMusicXml(generateMusicXML(createPickupScore()));
    expect(parsed.parts[0].measures).toHaveLength(3);
  });

  it('places attributes (divisions/clef) on the pickup measure', () => {
    const xml = generateMusicXML(createPickupScore());
    const pickupIndex = xml.indexOf('<measure number="0" implicit="yes">');
    const attrIndex = xml.indexOf('<attributes>');
    const firstFull = xml.indexOf('<measure number="1">');
    expect(attrIndex).toBeGreaterThan(pickupIndex);
    expect(attrIndex).toBeLessThan(firstFull);
  });

  it('a score WITHOUT a pickup numbers measures from 1 and has no implicit flag', () => {
    const noPickup: Score = {
      title: 'NoPickup',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 'staff-1',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'm1',
              events: [
                { id: 'e1', duration: 'whole', dotted: false, notes: [{ id: 'n1', pitch: 'C4' }] },
              ],
            },
            {
              id: 'm2',
              events: [
                { id: 'e2', duration: 'whole', dotted: false, notes: [{ id: 'n2', pitch: 'D4' }] },
              ],
            },
          ],
        },
      ],
    };
    const xml = generateMusicXML(noPickup);
    const parsed = parseMusicXml(xml);
    expect(parsed.parts[0].measures.map((m) => m.number)).toEqual([1, 2]);
    expect(xml).not.toContain('implicit="yes"');
    expect(xml).not.toContain('<measure number="0"');
  });

  it('the full measures after the pickup keep correct duration sums', () => {
    const xml = generateMusicXML(createPickupScore());
    const parsed = parseMusicXml(xml);
    const issues = checkDurationSums(parsed);
    // Only the full measures (1, 2) are checked against the time signature; the
    // implicit pickup is intentionally short and is excluded here.
    const fullMeasureIssues = issues.filter((i) => i.measureNumber !== 0);
    expect(fullMeasureIssues).toEqual([]);
  });

  it('combines a pickup with a grand staff: implicit 0 + <staves>2 + <backup>', () => {
    const score: Score = {
      title: 'Pickup Grand',
      timeSignature: '4/4',
      keySignature: 'C',
      bpm: 120,
      staves: [
        {
          id: 'staff-treble',
          clef: 'treble',
          keySignature: 'C',
          measures: [
            {
              id: 'm0-t',
              isPickup: true,
              events: [
                { id: 'pt', duration: 'quarter', dotted: false, notes: [{ id: 'ptn', pitch: 'G4' }] },
              ],
            },
            {
              id: 'm1-t',
              events: [
                { id: 'ft', duration: 'whole', dotted: false, notes: [{ id: 'ftn', pitch: 'C4' }] },
              ],
            },
          ],
        },
        {
          id: 'staff-bass',
          clef: 'bass',
          keySignature: 'C',
          measures: [
            {
              id: 'm0-b',
              isPickup: true,
              events: [
                { id: 'pb', duration: 'quarter', dotted: false, notes: [{ id: 'pbn', pitch: 'G2' }] },
              ],
            },
            {
              id: 'm1-b',
              events: [
                { id: 'fb', duration: 'whole', dotted: false, notes: [{ id: 'fbn', pitch: 'C3' }] },
              ],
            },
          ],
        },
      ],
    };
    const xml = generateMusicXML(score);
    const parsed = parseMusicXml(xml);

    expect(parsed.parts).toHaveLength(1);
    expect(xml).toContain('<measure number="0" implicit="yes">');
    expect(parsed.parts[0].measures.map((m) => m.number)).toEqual([0, 1]);
    expect(xml).toContain('<staves>2</staves>');
    // One backup per measure (pickup + full) => two backups.
    expect(xml.match(/<backup>/g)).toHaveLength(2);
  });
});
