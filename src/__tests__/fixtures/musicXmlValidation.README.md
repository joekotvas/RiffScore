# MusicXML validation fixtures & helper

This directory provides the scaffolding for verifying exported MusicXML as part of the
correctness effort. It is split into a **fixture** (the schema) and a **helper** (the
parse-based structural oracle), with full XSD validation deferred to Phase 2.

## Files

- **`musicxml-partwise.xsd`** — a focused, self-contained MusicXML 4.0 *partwise*
  schema fixture. It is **not** the full official multi-file XSD; it captures the
  structural skeleton RiffScore's exporter emits (`score-partwise > part > measure >
  note > {pitch|rest|chord} + duration + type`). It documents the real `octave` (single
  digit 0–9) and `divisions`/`duration` (positive integer) constraints.
- **`musicXmlStructure.ts`** — the Phase-1 oracle that runs **today** under Jest using
  `fast-xml-parser`. It parses an exported document and exposes:
  - `parseMusicXml(xml)` — typed structure (parts → measures → notes).
  - `measureDurationSum(measure)` — Σ `<duration>` over time-advancing notes (chord
    members excluded, since they sound simultaneously with the preceding note).
  - `expectedMeasureDivisions(measure)` — `divisions * beats * (4 / beatType)`.
  - `checkDurationSums(score)` — returns the list of measures whose duration sum does
    not equal the time-signature expectation (empty == valid).
  - `allDurationsIntegral(score)` — every `<duration>` is a positive integer.

## Why parse-based first, XSD second

XSD validation proves *well-formedness against a grammar*; it does **not** prove
*musical sense*. The live exporter bug
(`musicXmlExporter.ts`: `Math.floor((dur * ratio[1]) / ratio[0])`) emits triplet-eighth
durations that sum to 15 instead of 16 at `divisions=16` — that output is still
schema-valid but musically corrupt. The **duration-sum invariant** catches it; an XSD
alone would not. So the parse-based content oracle is the higher-value check and ships
in Phase 1; XSD validation is an additional well-formedness gate for Phase 2.

> Note (from the verification strategy): `divisions=16` **cannot** represent triplet
> eighths as integers. The real fix pairs a larger `divisions` value
> (e.g. `LCM(16, present tuplet denominators)`) with removing the `Math.floor`. The
> duration-sum test will correctly stay red until both are fixed.

## Phase-2 wiring (deferred)

To add hard XSD validation, choose one:

1. **`xmllint` (system binary, CI image):**
   ```sh
   xmllint --noout --schema src/__tests__/fixtures/musicxml-partwise.xsd exported.musicxml
   ```
   Or swap in the full official MusicXML 4.0 XSD bundle.

2. **`libxmljs2` (npm, in-process):**
   ```ts
   import { parseXml } from 'libxmljs2';
   import { readFileSync } from 'fs';
   const xsd = parseXml(readFileSync(__dirname + '/musicxml-partwise.xsd', 'utf8'));
   const doc = parseXml(generateMusicXML(score));
   expect(doc.validate(xsd)).toBe(true); // doc.validationErrors lists failures
   ```
   `libxmljs2` is a native module; only the Verify-infra lane / Phase-2 should add it to
   `package.json`, and CI must build native deps.

Until then, import `musicXmlStructure.ts` directly in exporter tests for the
content-level invariants.
