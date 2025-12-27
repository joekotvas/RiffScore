import { calculateScoreLayout } from './scoreLayout';
import { Score, Staff } from '@/types';
import { CONFIG } from '@/config';
import { createTestScore } from '@/__tests__/fixtures/selectionTestScores';

describe('calculateScoreLayout', () => {
  it('should return empty layout for empty score', () => {
    const score: Score = {
      title: 'Test',
      staves: [],
      keySignature: 'C',
      timeSignature: '4/4',
      bpm: 120,
    };
    const layout = calculateScoreLayout(score);
    expect(layout.staves).toHaveLength(0);
    expect(Object.keys(layout.notes)).toHaveLength(0);
    expect(Object.keys(layout.events)).toHaveLength(0);
  });

  it('should calculate layout for a simple score', () => {
    const score = createTestScore(); // Has 2 staves, 2 measures
    const layout = calculateScoreLayout(score);

    // Score has 2 staves (treble, bass)
    expect(layout.staves).toHaveLength(2);
    const staffLayout = layout.staves[0];
    
    // Each staff has 2 measures
    expect(staffLayout.measures).toHaveLength(2);

    const measureLayout = staffLayout.measures[0];
    expect(measureLayout.width).toBeGreaterThan(0);
    expect(measureLayout.events).toBeDefined();

    // Check header layout impact
    // Default Header for C Major is roughly 50-80px
    expect(measureLayout.x).toBeGreaterThan(0);
  });

  it('should synchronize measure widths for grand staff', () => {
    const score = createTestScore();
    // Add a second staff (Grand Staff)
    const staff2: Staff = JSON.parse(JSON.stringify(score.staves[0]));
    staff2.id = 'staff-2';
    // Make the first measure of staff 2 contain more notes to force wider layout
    // (In this mock we might need to manually inject events if createMockScore is simple)
    // For now, let's assume createMockScore returns a basic structure.
    
    // Let's create a custom score setup
    const complexScore: Score = {
       ...score,
       staves: [
         { 
           ...score.staves[0],
           measures: [{ ...score.staves[0].measures[0], events: [] }] // Empty measure on staff 1
         },
         {
           ...score.staves[0], // Use same structure
             id: 'staff-2',
             // Staff 2 has notes, so it should drive width
             measures: [ score.staves[0].measures[0] ]
         }
       ]
    };

    const layout = calculateScoreLayout(complexScore);
    
    const m1Staff1 = layout.staves[0].measures[0];
    const m1Staff2 = layout.staves[1].measures[0];

    // Widths should be equal (synchronized)
    expect(m1Staff1.width).toBeCloseTo(m1Staff2.width);
    
    // Staff 1 measure (empty) should be expanded to match Staff 2
    expect(m1Staff1.width).toBeGreaterThan(CONFIG.measurePaddingLeft + CONFIG.measurePaddingRight);
  });

  it('should generate flat note map', () => {
    const score = createTestScore();
    // Ensure there are notes
    const layout = calculateScoreLayout(score);
    
    const noteKeys = Object.keys(layout.notes);
    expect(noteKeys.length).toBeGreaterThan(0);
    
    // Check note layout structure
    const firstNote = layout.notes[noteKeys[0]];
    expect(firstNote).toHaveProperty('x');
    expect(firstNote).toHaveProperty('y');
    expect(firstNote).toHaveProperty('noteId');
    expect(firstNote).toHaveProperty('staffIndex');
  });
});
