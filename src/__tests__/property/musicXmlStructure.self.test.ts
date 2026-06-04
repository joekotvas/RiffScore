/**
 * Self-test for the MusicXML parse-based structural helper
 * (../fixtures/musicXmlStructure.ts).
 *
 * Uses hand-authored MusicXML strings whose duration arithmetic is known a priori, so
 * the helper's invariants are validated against ground truth, not against RiffScore's
 * exporter. Critically, it proves the helper FAILS on the exact corruption pattern the
 * live exporter produces (triplet eighths floored to 5 each, summing 15 not 16) — i.e.
 * the oracle is not vacuous: it would catch the real bug.
 */

import {
  parseMusicXml,
  measureDurationSum,
  expectedMeasureDivisions,
  checkDurationSums,
  allDurationsIntegral,
} from '../fixtures/musicXmlStructure';

// A correct 4/4 measure at divisions=16: four quarter notes (16 each) sum to 64.
const CORRECT_4_4 = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>16</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

// Two simultaneous notes (a chord) plus two quarters: chord member must NOT add time.
// Time-advancing durations: 16 (first chord note) + 16 + 16 = 48 -> only fills if the
// measure were 3/4. We test in 3/4 so the chord-exclusion logic is what makes it valid.
const CHORD_3_4 = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>16</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>16</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

// A 6/8 measure at divisions=16: a full bar is 16 * 6 * (4/8) = 48.
// Six eighth notes (duration 8 each) sum to 48.
const CORRECT_6_8 = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>16</divisions>
        <time><beats>6</beats><beat-type>8</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>8</duration><type>eighth</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>8</duration><type>eighth</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>8</duration><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;

// The BUG pattern: one quarter-note triplet (three eighth-triplet members) floored to 5
// each at divisions=16, then a half rest. Time-advancing sum = 5+5+5+32 = 47, but a 4/4
// bar requires 64; even the triplet group alone is 15 not 16. The oracle MUST flag this.
const BUGGY_TRIPLET_4_4 = `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>16</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>5</duration><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>5</duration><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>5</duration><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><rest/><duration>32</duration><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

describe('musicXmlStructure helper self-test', () => {
  it('parses parts, measures and notes with correct flags', () => {
    const score = parseMusicXml(CHORD_3_4);
    expect(score.parts).toHaveLength(1);
    const measure = score.parts[0].measures[0];
    expect(measure.notes).toHaveLength(4);
    expect(measure.notes.map((n) => n.isChord)).toEqual([false, true, false, false]);
    expect(measure.notes[0].step).toBe('C');
    expect(measure.notes[0].octave).toBe(4);
    expect(measure.divisions).toBe(16);
  });

  it('throws on a non-partwise document', () => {
    expect(() => parseMusicXml('<not-a-score/>')).toThrow(/partwise/);
  });

  it('measureDurationSum excludes chord members', () => {
    const score = parseMusicXml(CHORD_3_4);
    // 16 (first) + skip chord + 16 + 16 = 48, NOT 64.
    expect(measureDurationSum(score.parts[0].measures[0])).toBe(48);
  });

  it('expectedMeasureDivisions computes divisions * beats * (4/beatType)', () => {
    expect(expectedMeasureDivisions(parseMusicXml(CORRECT_4_4).parts[0].measures[0])).toBe(64);
    expect(expectedMeasureDivisions(parseMusicXml(CORRECT_6_8).parts[0].measures[0])).toBe(48);
    expect(expectedMeasureDivisions(parseMusicXml(CHORD_3_4).parts[0].measures[0])).toBe(48);
  });

  it('reports NO duration-sum issues for correct 4/4, 6/8 and chord measures', () => {
    expect(checkDurationSums(parseMusicXml(CORRECT_4_4))).toEqual([]);
    expect(checkDurationSums(parseMusicXml(CORRECT_6_8))).toEqual([]);
    expect(checkDurationSums(parseMusicXml(CHORD_3_4))).toEqual([]);
  });

  it('FLAGS the live tuplet-truncation bug pattern (sum 47 != 64)', () => {
    const score = parseMusicXml(BUGGY_TRIPLET_4_4);
    const issues = checkDurationSums(score);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      partId: 'P1',
      measureNumber: 1,
      expected: 64,
      actual: 47, // 5 + 5 + 5 + 32
    });
    // And independently: the triplet GROUP itself sums to 15, not the quarter's 16.
    const tripletGroup = score.parts[0].measures[0].notes.slice(0, 3);
    const groupSum = tripletGroup.reduce((s, n) => s + n.duration, 0);
    expect(groupSum).toBe(15);
    expect(groupSum).not.toBe(16);
  });

  it('allDurationsIntegral is true for valid docs and would be false for fractional durations', () => {
    expect(allDurationsIntegral(parseMusicXml(CORRECT_4_4))).toBe(true);
    const fractional = CORRECT_4_4.replace('<duration>16</duration>', '<duration>5.33</duration>');
    expect(allDurationsIntegral(parseMusicXml(fractional))).toBe(false);
  });
});
