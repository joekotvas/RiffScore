/**
 * MusicXML parse-based structural-check helper (Verify-infra scaffolding, Phase 1).
 *
 * Companion to the committed MusicXML 4.0 partwise XSD fixture (musicxml-partwise.xsd
 * in this directory). FULL XSD validation (libxmljs2 / xmllint) is a Phase-2 wiring
 * step — see musicXmlValidation.README.md. This module provides the cheap, dependency-
 * light structural oracle that runs today under Jest using fast-xml-parser.
 *
 * The headline invariant is the DURATION-SUM check: within a measure, the sum of
 * <duration> across time-advancing notes (i.e. excluding <chord/> members, which sound
 * simultaneously with the previous note) must equal divisions * beats. This is exactly
 * the invariant that exposes the live tuplet-truncation bug
 * (musicXmlExporter.ts: `Math.floor((dur * ratio[1]) / ratio[0])`), where three triplet
 * eighths export durations summing to 15 instead of 16 at divisions=16. The substring
 * tests in the existing exporter suite are GREEN on that corrupt output; this helper is
 * not, because it computes a real arithmetic invariant rather than matching text.
 */

import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Force arrays for repeatable elements so single/many are handled uniformly.
  isArray: (name) => ['part', 'measure', 'note', 'score-part'].includes(name),
});

export interface ParsedNote {
  isRest: boolean;
  isChord: boolean;
  /** Integer divisions; NaN if absent (a structural error worth surfacing). */
  duration: number;
  step?: string;
  octave?: number;
  alter?: number;
  type?: string;
}

export interface ParsedMeasure {
  number: number;
  /** divisions declared in <attributes>, inherited from the first measure that sets it. */
  divisions: number;
  beats?: number;
  beatType?: number;
  notes: ParsedNote[];
}

export interface ParsedPart {
  id: string;
  measures: ParsedMeasure[];
}

export interface ParsedScore {
  version?: string;
  parts: ParsedPart[];
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Parse a MusicXML *partwise* document string into a flat, typed structure.
 * Throws if the root <score-partwise> element is missing (a fundamental structural
 * failure that should never be silently tolerated).
 */
export function parseMusicXml(xml: string): ParsedScore {
  const doc = parser.parse(xml);
  const root = doc['score-partwise'];
  if (!root) {
    throw new Error('Not a partwise MusicXML document: missing <score-partwise> root.');
  }

  const parts: ParsedPart[] = asArray<Record<string, unknown>>(
    root.part as Record<string, unknown> | Record<string, unknown>[]
  ).map((part) => {
    let divisions = NaN;
    const measures: ParsedMeasure[] = asArray<Record<string, unknown>>(
      part.measure as Record<string, unknown> | Record<string, unknown>[]
    ).map((measure) => {
      const attributes = measure.attributes as Record<string, unknown> | undefined;
      if (attributes && attributes.divisions !== undefined) {
        divisions = Number(attributes.divisions);
      }
      let beats: number | undefined;
      let beatType: number | undefined;
      const time = attributes?.time as Record<string, unknown> | undefined;
      if (time) {
        beats = Number(time.beats);
        beatType = Number(time['beat-type']);
      }

      const notes: ParsedNote[] = asArray<Record<string, unknown>>(
        measure.note as Record<string, unknown> | Record<string, unknown>[]
      ).map((note) => {
        const pitch = note.pitch as Record<string, unknown> | undefined;
        return {
          isRest: note.rest !== undefined,
          isChord: note.chord !== undefined,
          duration: note.duration === undefined ? NaN : Number(note.duration),
          step: pitch?.step as string | undefined,
          octave: pitch?.octave === undefined ? undefined : Number(pitch.octave),
          alter: pitch?.alter === undefined ? undefined : Number(pitch.alter),
          type: note.type as string | undefined,
        };
      });

      return {
        number: Number(measure['@_number']),
        divisions,
        beats,
        beatType,
        notes,
      };
    });

    return { id: String(part['@_id']), measures };
  });

  return { version: root['@_version'] as string | undefined, parts };
}

/**
 * Sum of <duration> across TIME-ADVANCING notes in a measure: chord members are
 * excluded because they sound at the same time position as the preceding note.
 */
export function measureDurationSum(measure: ParsedMeasure): number {
  return measure.notes
    .filter((n) => !n.isChord)
    .reduce((sum, n) => sum + (Number.isFinite(n.duration) ? n.duration : 0), 0);
}

/**
 * Expected total divisions in a measure for its time signature:
 *   divisions are per quarter note, so a full measure = divisions * beats * (4 / beatType).
 * Example: divisions=16, 4/4 -> 16 * 4 * (4/4) = 64; 6/8 -> 16 * 6 * (4/8) = 48.
 */
export function expectedMeasureDivisions(measure: ParsedMeasure): number {
  const { divisions, beats, beatType } = measure;
  if (!Number.isFinite(divisions) || beats === undefined || beatType === undefined) {
    return NaN;
  }
  return divisions * beats * (4 / beatType);
}

export interface DurationSumIssue {
  partId: string;
  measureNumber: number;
  expected: number;
  actual: number;
}

/**
 * Verify the duration-sum invariant for every measure that declares a time signature.
 * Returns the list of violations (empty == valid). Measures without a known time
 * signature are skipped (we cannot compute the expectation for them).
 */
export function checkDurationSums(score: ParsedScore): DurationSumIssue[] {
  const issues: DurationSumIssue[] = [];
  for (const part of score.parts) {
    for (const measure of part.measures) {
      const expected = expectedMeasureDivisions(measure);
      if (!Number.isFinite(expected)) continue;
      const actual = measureDurationSum(measure);
      if (actual !== expected) {
        issues.push({
          partId: part.id,
          measureNumber: measure.number,
          expected,
          actual,
        });
      }
    }
  }
  return issues;
}

/** True if every <duration> in the document is a positive integer (MusicXML requires integers). */
export function allDurationsIntegral(score: ParsedScore): boolean {
  return score.parts.every((p) =>
    p.measures.every((m) =>
      m.notes.every((n) => Number.isInteger(n.duration) && n.duration > 0)
    )
  );
}
