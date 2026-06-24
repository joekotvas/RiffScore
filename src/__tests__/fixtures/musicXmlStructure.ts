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
  isArray: (name) => ['part', 'measure', 'note', 'score-part', 'backup', 'forward'].includes(name),
});

const orderedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
});

export interface ParsedNote {
  isRest: boolean;
  isChord: boolean;
  /** Integer divisions; NaN if absent (a structural error worth surfacing). */
  duration: number;
  staff?: number;
  restMeasure?: boolean;
  tupletNotationTypes: string[];
  step?: string;
  octave?: number;
  alter?: number;
  type?: string;
}

export interface ParsedBackup {
  /** Integer divisions; NaN if absent (a structural error worth surfacing). */
  duration: number;
}

export interface ParsedMeasure {
  number: number;
  isImplicit: boolean;
  /** divisions declared in <attributes>, inherited from the first measure that sets it. */
  divisions: number;
  /** number of staves declared in <attributes>, inherited like MusicXML attributes. */
  staves: number;
  beats?: number;
  beatType?: number;
  notes: ParsedNote[];
  backups: ParsedBackup[];
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

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
}

function childNumber(node: Record<string, unknown> | undefined, child: string): number {
  if (!node || node[child] === undefined) return NaN;
  return Number(node[child]);
}

function tupletNotationTypes(note: Record<string, unknown>): string[] {
  return asArray<Record<string, unknown>>(
    note.notations as Record<string, unknown> | Record<string, unknown>[] | undefined
  ).flatMap((notations) =>
    asArray<Record<string, unknown>>(
      notations.tuplet as Record<string, unknown> | Record<string, unknown>[] | undefined
    ).map((tuplet) => String(tuplet['@_type'] ?? ''))
  );
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
    let staves = 1;
    let beats: number | undefined;
    let beatType: number | undefined;
    const measures: ParsedMeasure[] = asArray<Record<string, unknown>>(
      part.measure as Record<string, unknown> | Record<string, unknown>[]
    ).map((measure) => {
      const attributes = measure.attributes as Record<string, unknown> | undefined;
      if (attributes && attributes.divisions !== undefined) {
        divisions = Number(attributes.divisions);
      }
      if (attributes && attributes.staves !== undefined) {
        staves = Number(attributes.staves);
      }
      const time = attributes?.time as Record<string, unknown> | undefined;
      if (time) {
        beats = Number(time.beats);
        beatType = Number(time['beat-type']);
      }

      const notes: ParsedNote[] = asArray<Record<string, unknown>>(
        measure.note as Record<string, unknown> | Record<string, unknown>[]
      ).map((note) => {
        const pitch = note.pitch as Record<string, unknown> | undefined;
        const rest = asRecord(note.rest);
        return {
          isRest: note.rest !== undefined,
          isChord: note.chord !== undefined,
          duration: note.duration === undefined ? NaN : Number(note.duration),
          staff: note.staff === undefined ? undefined : Number(note.staff),
          restMeasure: rest?.['@_measure'] === 'yes',
          tupletNotationTypes: tupletNotationTypes(note),
          step: pitch?.step as string | undefined,
          octave: pitch?.octave === undefined ? undefined : Number(pitch.octave),
          alter: pitch?.alter === undefined ? undefined : Number(pitch.alter),
          type: note.type as string | undefined,
        };
      });

      const backups: ParsedBackup[] = asArray<Record<string, unknown>>(
        measure.backup as Record<string, unknown> | Record<string, unknown>[] | undefined
      ).map((backup) => ({ duration: childNumber(backup, 'duration') }));

      return {
        number: Number(measure['@_number']),
        isImplicit: measure['@_implicit'] === 'yes',
        divisions,
        staves,
        beats,
        beatType,
        notes,
        backups,
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
    p.measures.every(
      (m) =>
        m.notes.every((n) => Number.isInteger(n.duration) && n.duration > 0) &&
        m.backups.every((b) => Number.isInteger(b.duration) && b.duration > 0)
    )
  );
}

export interface StaffDurationIssue {
  partId: string;
  measureNumber: number;
  staffNumber: number;
  expected: number;
  actual: number;
  reason: 'missing-staff-tag' | 'missing-staff' | 'duration-mismatch' | 'pickup-mismatch';
}

export interface BackupDurationIssue {
  partId: string;
  measureNumber: number;
  backupIndex: number;
  expected: number;
  actual: number;
  reason: 'missing-backup' | 'duration-mismatch';
}

export function staffDurationSums(measure: ParsedMeasure): Map<number, number> {
  const sums = new Map<number, number>();
  for (const note of measure.notes) {
    if (note.isChord) continue;
    const staff = note.staff ?? 1;
    sums.set(staff, (sums.get(staff) ?? 0) + (Number.isFinite(note.duration) ? note.duration : 0));
  }
  return sums;
}

/**
 * Verify each declared staff in a multi-staff part has a complete duration stream.
 * For implicit pickup measures, every staff must have the same shortened duration;
 * full measures must equal the inherited time-signature expectation.
 */
export function checkStaffDurationSums(score: ParsedScore): StaffDurationIssue[] {
  const issues: StaffDurationIssue[] = [];
  for (const part of score.parts) {
    for (const measure of part.measures) {
      if (measure.staves <= 1) continue;
      const expected = expectedMeasureDivisions(measure);
      if (!Number.isFinite(expected)) continue;

      for (const note of measure.notes) {
        if (note.staff === undefined) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            staffNumber: 0,
            expected,
            actual: note.duration,
            reason: 'missing-staff-tag',
          });
        }
      }

      const sums = staffDurationSums(measure);
      const pickupExpected = measure.isImplicit ? Math.max(...sums.values()) : expected;
      for (let staffNumber = 1; staffNumber <= measure.staves; staffNumber++) {
        const actual = sums.get(staffNumber) ?? 0;
        if (actual === 0) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            staffNumber,
            expected: pickupExpected,
            actual,
            reason: 'missing-staff',
          });
        } else if (measure.isImplicit && actual !== pickupExpected) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            staffNumber,
            expected: pickupExpected,
            actual,
            reason: 'pickup-mismatch',
          });
        } else if (!measure.isImplicit && actual !== expected) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            staffNumber,
            expected,
            actual,
            reason: 'duration-mismatch',
          });
        }
      }
    }
  }
  return issues;
}

/**
 * Verify MusicXML <backup> elements rewind the cursor by the preceding staff's
 * duration in a single-part multi-staff export.
 */
export function checkBackupDurations(score: ParsedScore): BackupDurationIssue[] {
  const issues: BackupDurationIssue[] = [];
  for (const part of score.parts) {
    for (const measure of part.measures) {
      if (measure.staves <= 1) continue;
      const sums = staffDurationSums(measure);
      for (let staffNumber = 2; staffNumber <= measure.staves; staffNumber++) {
        const backupIndex = staffNumber - 2;
        const expected = sums.get(staffNumber - 1) ?? 0;
        const actual = measure.backups[backupIndex]?.duration;
        if (actual === undefined) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            backupIndex,
            expected,
            actual: 0,
            reason: 'missing-backup',
          });
        } else if (actual !== expected) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            backupIndex,
            expected,
            actual,
            reason: 'duration-mismatch',
          });
        }
      }
    }
  }
  return issues;
}

export interface TupletNotationIssue {
  partId: string;
  measureNumber: number;
  noteIndex: number;
  reason: 'tuplet-notation-on-chord-member';
}

/**
 * MusicXML encodes tuplet brackets on the time-advancing note stream. A secondary
 * <chord/> note may carry <time-modification>, but it must not duplicate bracket
 * <notations><tuplet/> that belong to the primary note.
 */
export function checkTupletNotationPlacement(score: ParsedScore): TupletNotationIssue[] {
  const issues: TupletNotationIssue[] = [];
  for (const part of score.parts) {
    for (const measure of part.measures) {
      measure.notes.forEach((note, index) => {
        if (note.isChord && note.tupletNotationTypes.length > 0) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            noteIndex: index,
            reason: 'tuplet-notation-on-chord-member',
          });
        }
      });
    }
  }
  return issues;
}

const NOTE_CHILD_ORDER = [
  'chord',
  'pitch',
  'rest',
  'duration',
  'tie',
  'type',
  'dot',
  'accidental',
  'time-modification',
  'staff',
  'notations',
] as const;

const NOTE_CHILD_RANK = new Map<string, number>(NOTE_CHILD_ORDER.map((tag, index) => [tag, index]));

type OrderedNode = Record<string, unknown>;

function tagName(node: OrderedNode): string | undefined {
  return Object.keys(node).find((key) => key !== ':@' && key !== '#text');
}

function collectOrderedElements(
  nodes: unknown,
  wanted: string,
  out: unknown[][] = []
): unknown[][] {
  if (!Array.isArray(nodes)) return out;
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const record = node as OrderedNode;
    const tag = tagName(record);
    if (!tag) continue;
    const children = record[tag];
    if (tag === wanted && Array.isArray(children)) {
      out.push(children);
    }
    collectOrderedElements(children, wanted, out);
  }
  return out;
}

export interface NoteChildOrderIssue {
  noteIndex: number;
  previous: string;
  current: string;
}

export function checkNoteChildOrder(xml: string): NoteChildOrderIssue[] {
  const ordered = orderedParser.parse(xml);
  const noteChildren = collectOrderedElements(ordered, 'note');
  const issues: NoteChildOrderIssue[] = [];

  noteChildren.forEach((children, noteIndex) => {
    let lastRank = -1;
    let lastTag = '';
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      const tag = tagName(child as OrderedNode);
      if (!tag) continue;
      const rank = NOTE_CHILD_RANK.get(tag);
      if (rank === undefined) continue;
      if (rank < lastRank) {
        issues.push({ noteIndex, previous: lastTag, current: tag });
        return;
      }
      lastRank = rank;
      lastTag = tag;
    }
  });

  return issues;
}

export interface FullMeasureRestIssue {
  partId: string;
  measureNumber: number;
  staffNumber: number;
  reason: 'missing-measure-rest-attribute';
}

export function checkFullMeasureRests(score: ParsedScore): FullMeasureRestIssue[] {
  const issues: FullMeasureRestIssue[] = [];
  for (const part of score.parts) {
    for (const measure of part.measures) {
      const expected = measure.isImplicit ? NaN : expectedMeasureDivisions(measure);
      for (const note of measure.notes) {
        if (
          note.isRest &&
          !note.isChord &&
          Number.isFinite(expected) &&
          note.duration === expected &&
          !note.restMeasure
        ) {
          issues.push({
            partId: part.id,
            measureNumber: measure.number,
            staffNumber: note.staff ?? 1,
            reason: 'missing-measure-rest-attribute',
          });
        }
      }
    }
  }
  return issues;
}

export interface MusicXmlValidationIssue {
  category:
    | 'duration'
    | 'staff-duration'
    | 'backup'
    | 'tuplet-notation'
    | 'note-order'
    | 'full-measure-rest';
  message: string;
  detail:
    | DurationSumIssue
    | StaffDurationIssue
    | BackupDurationIssue
    | TupletNotationIssue
    | NoteChildOrderIssue
    | FullMeasureRestIssue;
}

export function validateMusicXmlStructure(xml: string): MusicXmlValidationIssue[] {
  const score = parseMusicXml(xml);
  const singleStaffDurationIssues = checkDurationSums(score).filter((issue) => {
    const measure = score.parts
      .find((part) => part.id === issue.partId)
      ?.measures.find((m) => m.number === issue.measureNumber);
    return !measure?.isImplicit && (measure?.staves ?? 1) <= 1;
  });

  return [
    ...singleStaffDurationIssues.map((detail) => ({
      category: 'duration' as const,
      message: `measure ${detail.measureNumber} duration sum ${detail.actual} != ${detail.expected}`,
      detail,
    })),
    ...checkStaffDurationSums(score).map((detail) => ({
      category: 'staff-duration' as const,
      message: `measure ${detail.measureNumber} staff ${detail.staffNumber} ${detail.reason}`,
      detail,
    })),
    ...checkBackupDurations(score).map((detail) => ({
      category: 'backup' as const,
      message: `measure ${detail.measureNumber} backup ${detail.backupIndex} ${detail.reason}`,
      detail,
    })),
    ...checkTupletNotationPlacement(score).map((detail) => ({
      category: 'tuplet-notation' as const,
      message: `measure ${detail.measureNumber} chord note has tuplet notation`,
      detail,
    })),
    ...checkNoteChildOrder(xml).map((detail) => ({
      category: 'note-order' as const,
      message: `note ${detail.noteIndex} has ${detail.current} after ${detail.previous}`,
      detail,
    })),
    ...checkFullMeasureRests(score).map((detail) => ({
      category: 'full-measure-rest' as const,
      message: `measure ${detail.measureNumber} staff ${detail.staffNumber} lacks rest measure attribute`,
      detail,
    })),
  ];
}
