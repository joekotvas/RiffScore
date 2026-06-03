/**
 * ABC Exporter Tests
 *
 * Tests clef export correctness and metadata export for all clef types.
 */

import { generateABC } from '@/exporters/abcExporter';
import { Score, ScoreMetadata } from '@/types';

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

describe('ABC Clef Export', () => {
  it.each(['treble', 'bass', 'alto', 'tenor'])('exports %s clef correctly', (clef) => {
    const score = createScoreWithClef(clef);
    const abc = generateABC(score, 120);

    expect(abc).toContain(`clef=${clef}`);
  });

  it('includes required ABC header fields', () => {
    const score = createScoreWithClef('treble');
    const abc = generateABC(score, 120);

    expect(abc).toContain('X:1');
    expect(abc).toContain('T:Test Score');
    expect(abc).toContain('M:4/4');
    expect(abc).toContain('Q:1/4=120');
  });

  describe('exception paths', () => {
    it('defaults unknown clef to treble', () => {
      const score = createScoreWithClef('unknown' as string);
      const abc = generateABC(score, 120);

      expect(abc).toContain('clef=treble');
    });

    it('defaults grand staff to treble clef for voice', () => {
      const score = createScoreWithClef('grand');
      const abc = generateABC(score, 120);

      // Grand is not a standard ABC clef, should default to treble
      expect(abc).toContain('clef=treble');
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
      const abc = generateABC(score, 120);

      expect(abc).toContain('X:1');
      expect(abc).toContain('V:1 clef=treble');
    });

    it('handles missing clef property (defaults to treble)', () => {
      const score = createScoreWithClef('treble');
      // Test fallback when clef is undefined
      (score.staves[0] as { clef?: string }).clef = undefined;
      const abc = generateABC(score, 120);

      expect(abc).toContain('clef=treble');
    });
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

describe('ABC Export - Metadata', () => {
  it('exports title', () => {
    const score = createScoreWithMetadata({ title: 'My Song' });
    const abc = generateABC(score, 120);
    expect(abc).toContain('T:My Song');
  });

  it('exports composer', () => {
    const score = createScoreWithMetadata({
      title: 'My Song',
      composer: 'John Doe',
    });
    const abc = generateABC(score, 120);
    expect(abc).toContain('C:John Doe');
  });

  it('exports lyricist in Z field', () => {
    const score = createScoreWithMetadata({
      title: 'My Song',
      lyricist: 'Jane Smith',
    });
    const abc = generateABC(score, 120);
    expect(abc).toContain('Z:Lyricist: Jane Smith');
  });

  it('exports copyright in N field', () => {
    const score = createScoreWithMetadata({
      title: 'My Song',
      copyright: '© 2026 John Doe',
    });
    const abc = generateABC(score, 120);
    expect(abc).toContain('N:© 2026 John Doe');
  });

  it('omits optional fields when not present', () => {
    const score = createScoreWithMetadata({ title: 'My Song' });
    const abc = generateABC(score, 120);
    expect(abc).not.toMatch(/^C:/m);
    expect(abc).not.toMatch(/^Z:/m);
    expect(abc).not.toMatch(/^N:/m);
  });

  it('uses default title when metadata is not specified', () => {
    const score = createScoreWithClef('treble');
    // Remove metadata to test fallback to legacy title
    delete (score as Partial<Score>).metadata;
    const abc = generateABC(score, 120);
    expect(abc).toContain('T:Test Score');
  });

  it('exports all metadata fields together', () => {
    const score = createScoreWithMetadata({
      title: 'Complete Song',
      composer: 'Composer Name',
      lyricist: 'Lyricist Name',
      copyright: '© 2026 Publisher',
    });
    const abc = generateABC(score, 120);

    expect(abc).toContain('T:Complete Song');
    expect(abc).toContain('C:Composer Name');
    expect(abc).toContain('Z:Lyricist: Lyricist Name');
    expect(abc).toContain('N:© 2026 Publisher');
  });

  it('maintains correct header field order', () => {
    const score = createScoreWithMetadata({
      title: 'Order Test',
      composer: 'Test Composer',
    });
    const abc = generateABC(score, 120);

    // X: should come before T:
    const xIndex = abc.indexOf('X:1');
    const tIndex = abc.indexOf('T:Order Test');
    const cIndex = abc.indexOf('C:Test Composer');
    const mIndex = abc.indexOf('M:4/4');

    expect(xIndex).toBeLessThan(tIndex);
    expect(tIndex).toBeLessThan(cIndex);
    expect(cIndex).toBeLessThan(mIndex);
  });
});
