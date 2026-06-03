# RiffScore Verification Strategy — Closing the Correctness Loop

> **Generated:** 2026-06-03 · **Method:** 5-route test-strategy analysis with a flawed-test hunt (6 agents).
> Companion to [CORRECTNESS_AUDIT_2026-06.md](./CORRECTNESS_AUDIT_2026-06.md): the audit finds the bugs; this defines the test layers that catch the whole class going forward.

> ⚠️ **Read alongside [AUDIT_QA_2026-06.md](./AUDIT_QA_2026-06.md).** QA verified the diagnosis half (flawed-test hunt, weak-assertion/no-oracle findings) as the strongest content here, with these corrections: the `divisions=24` recommendation is **insufficient for quintuplets** — use a per-score `LCM(16, present tuplet denominators)`; the `line[stroke-width]` stem selector is **non-specific** (add a `data-testid`/class to `Stem.tsx`); pull a **thin real-browser geometry smoke earlier** (the user's core concern lands too late at Phase 5); and the 7-layer program is **over-scoped for a one-developer alpha** — adopt the quick wins + Layers 1–4, defer browser-geometry/mutation testing. (The flawed-test appendix below is un-deduplicated multi-agent output; the §1 table is the canonical list.)

## 1. Honest Assessment of the Current Suite

### Where it is genuinely strong
RiffScore has a disciplined, large suite (106 test files, ~29k LOC, RTL + fixtures + descriptive names, 75% global coverage gate in `jest.config.js`). The deterministic core is the suite's best asset and the right leverage point:

- **`TimelineService.test.ts`** asserts real seconds and frequencies (C4 found in `261–262Hz` at line 280, G4 `300–400Hz` at 277, tie-merge to `2.0s` at 108). This proves the music→time model is directly assertable.
- **`PageLayoutService.test.ts`** asserts real justification/stretch math against `calculateJustification`/`calculateSingleMeasureWidth` (the service exports ~10 pure functions, `PageLayoutService.ts:90–849`).
- **`core.test.ts`** asserts exact quant durations (`getNoteDuration` formula at `core.ts:41–57`).

These confirm the strategic insight: **the layout engine and timeline are pure, deterministic, numeric — and that is what we should be asserting on, not pixels.**

### Structural blind spots (verified)
1. **jsdom has no layout, no font metrics, no `getBBox`/`getComputedTextLength`.** `jest.config.js:3` is jsdom-only. Grep across `src/__tests__`: **0 `getBBox`**, **0 `getComputedTextLength`**. True rendered geometry — notehead/accidental x,y, stem length, beam slope, ledger-line count/extent, collisions — is unverified by any layer.
2. **Screenshots cannot judge engraving.** A screenshot (or an LLM viewing one) cannot reliably tell E0A3 (half) from E0A4 (black notehead) at score size, a stem 2px short, a beam slope a few degrees off, an accidental nudged half a staff-space, or a ledger line miscounted by one. Screenshots must be a backstop, never the engraving oracle.
3. **`getScore()` stale-state workaround is institutionalized.** `docs/TESTING.md:238–256` tells authors to assert `getSelection().eventId` is *defined* instead of checking the note landed, because "`getScore()` may return stale data in test environments." This converts entry/edit tests into "a pointer exists" assertions — they never verify pitch/duration/position. It papers over a React state-flush timing bug instead of fixing the test env.
4. **No independent oracles.** **0 `toMatchSnapshot`**, **0 `fast-check`**, **0 imports of `tonal` in tests**, no XSD validation, no round-trip. Everything is self-consistency: the same code that may be wrong also writes its own "expected."
5. **Weak-assertion saturation.** **115 `toBeDefined()`**, **206 `toContain(...)`** across the suite. Coverage measures execution, not assertion strength, so 75% coverage hides this entirely.
6. **`_tmp_*` artifacts: already resolved.** `find` confirms none remain. No Playwright/Puppeteer/Storybook/CI exists (`.github/` has only `copilot-instructions.md`).

### Functionally-FLAWED tests — a distinct, serious problem
These are well-shaped and green but verify the wrong thing. **All verified verbatim:**

| Test | Flaw | Verified evidence |
|------|------|-------------------|
| `RenderingDetailed.test.tsx:101–115` | **vacuous** | Renders a beams/tuplets/rests score with **zero `expect()` calls**; body ends `// If we got here without error, success?`. Proves only `render()` didn't throw. |
| `grandStaffAlignment.test.ts:6–26, 81` | **tautological** | Re-implements production `calculateSynchronizedMeasureWidths` *as a local helper* using `Math.max`, then asserts `syncedWidths[0] === Math.max(trebleWidth, bassWidth)` — i.e. `Math.max(a,b)===Math.max(a,b)`. Never tests the real ScoreCanvas path; never asserts the two staves share x positions (the actual meaning of alignment). |
| `layoutEngine.test.ts:54–66` | **vacuous** | For F4+G4 second, asserts only `offsets.some(o => o !== 0)`. Never checks which note shifts, the sign, or the magnitude (`SECOND_INTERVAL_SHIFT`). A wrong-note/wrong-direction/wrong-magnitude shift passes. |
| `layoutEngine.test.ts:84–89` | **vacuous** | Asserts `eventPositions['e1'] toBeDefined()` and `e2 > e1`. Two notes 1px apart pass; the real spacing contract is unasserted. |
| `musicXmlExporter.test.ts` (whole file) | **pins-wrong/structure-not-music** | **84 `toContain`, 0 tuplet refs, 0 `<duration>` value assertions.** Document never parsed, never schema-validated. Regression-locks the live truncation bug below. |
| `ChangePitchTuplet.test.ts:55–64` | **structure-not-music** | "Regression test for tuplet corruption" whose corruption checks are `toBeDefined()`/`staves.length > 0`. Never verifies the tuplet ratio/groupSize survived or that sibling notes kept tuplet metadata. |
| `Smoke.test.tsx` | **mocks-the-subject** | Toolbar (the asserted component) is replaced by a mock that sets text `CLEF_MENU_OPENED`; the bass-clef assertion re-asserts the same text from the treble click. |
| `TESTING.md:238–256` | **policy-level structure-not-music** | Officially recommends asserting selection over score content. |

### The single best illustration of the defect class (live bug, invisible to the suite)
`musicXmlExporter.ts:331`:
```ts
duration = Math.floor((duration * event.tuplet.ratio[1]) / event.tuplet.ratio[0]);
```
With `<divisions>16</divisions>` (line 298): an eighth-note triplet member = `floor(8*2/3) = 5`, so three members sum to **15, not 16** (verified numerically). Quarter triplets sum to **30, not 32**. This is corrupt, underfull MusicXML that MuseScore will reject or silently "repair." The exporter test's 84 substring assertions all pass green on this. (`musicXmlExporter.ts:355` `note.pitch.slice(-1)` also truncates multi-char octaves, e.g. C10.) These are exactly the bug class this strategy must catch automatically.

---

## 2. Verification Matrix

For each correctness dimension: the **primary** owner (P) and **backstop** (B), with the concrete oracle. Layer keys defined in §3.

| Dimension | Primary layer + oracle | Backstop |
|---|---|---|
| **Accidentals (glyph + context persistence)** | **Unit** SMuFL codepoint of `Accidental` (P); **Reference-oracle** measure-scoped accidental rule engine vs `needsAccidental`/`getEffectiveAccidental` (P) | Browser-geometry: accidental bbox left of & vertically centered on notehead |
| **Key signatures** | **Golden-structural** hand-authored circle-of-fifths set/order table vs `KEY_SIGNATURES` (P); **Reference-oracle** Tonal cross-check (B) | Browser-geometry accidental order on staff |
| **Transposition (diatonic & chromatic, enharmonic)** | **Property** Tonal-as-oracle: `Note.midi(out)===Note.midi(in)+semitones` + pinned spelling across keys (P) | Reference-oracle golden cases |
| **Rhythm / tuplets / meter (quant integrity)** | **Property** measure-duration conservation + tuplet-tiling invariant (P); **Reference-oracle** MusicXML `<duration>` sum == divisions (P) | Golden-structural |
| **Beaming** | **Reference-oracle** group counts per meter (3/4, 6/8, 4/4) + slope-sign invariant (P) | Browser-geometry beam polygon endpoints |
| **Stems / noteheads / ledger lines** | **Reference-oracle** pitch→Y/stem-dir/ledger-count table (P); **Browser-geometry** real `getBBox` stem length, ledger span (P) | Golden-structural layout snapshot; Visual backstop |
| **Ties** | **Reference-oracle** TimelineService tie-merge (single sustained event) (P) | Property round-trip |
| **Spacing / clefs** | **Golden-structural** numeric layout snapshot of `calculateScoreLayout` (P); **Browser-geometry** non-overlap invariant (P) | Visual backstop |
| **Page-view / pagination** | **Golden-structural** `calculatePageLayout`/`distributeSystemsToPages` numeric output (P) | Interaction-E2E + Visual backstop |
| **MusicXML export** | **Reference-oracle** XSD validate + parse-back + duration-sum invariant (P); **Golden** human-authored fixtures (P) | Headless MuseScore import (CI-only, advisory) |
| **ABC export** | **Reference-oracle** re-parse via abcjs + compare note sequence (P) | Golden fixtures |
| **Chord symbols** | **Unit** `ChordService` parse root/quality/extension (P) | — |
| **Playback timing** | **Reference-oracle** pure `expectedTimeline(score,bpm)` rational-arithmetic oracle vs `createTimeline` (P) | Interaction-E2E cursor advance |
| **Note entry / capacity** | **Property** capacity invariant after random op sequences (P); **Interaction-E2E** keyboard entry → DOM (P) | — |
| **Data-model / validation** | **Property** JSON round-trip identity (P); **Unit** measure-sums-to-meter (P) | — |
| **Selection / navigation** | **Unit/Interaction-E2E** assert resulting selection AND resulting score content (P) | — |

---

## 3. The Layers (strengths, hard limits, route assignment)

The three routes the user named map onto seven layers. **Unit tests** = layers 1–2 + codepoint. **Harnesses** = layers 3–4 + the SVG geometry-extraction helper (reused in jsdom *and* browser). **Playwright + devtools-MCP smoke** = layers 5–7.

**Layer 1 — Unit (pure functions).** Owns all DOM-independent math with **exact** expected values derived from theory, not from current output. Strength: fastest, zero flake, pinpoints the function. Limit: proves nothing about composition, geometry, or integration; easy to pin a wrong expected.

**Layer 2 — Property-based (`fast-check`).** Owns model *invariants* over random inputs (capacity conservation, tuplet tiling, round-trip identity, transposition midi-delta). Strength: highest defect-per-line; shrinks to a minimal failing score. Limit: only as good as the chosen invariant; weak generators give false confidence.

**Layer 3 — Golden/structural snapshots.** Owns the *full numeric* layout tree (`calculateScoreLayout`, `calculatePageLayout`) and a *normalized SVG-attribute* serialization (tag + testid + x/y/fontSize + codepoint) for canonical fixtures. Strength: cheap, font-independent, catches any engraving-math drift as a reviewable diff. **Limit/danger: snapshots regression-LOCK whatever is captured — including bugs.** Every golden must be human-validated against engraving rules *before* committing; reviewers must never rubber-stamp `-u`.

**Layer 4 — Reference-oracle / differential.** Owns *semantic validity* via authorities **independent of RiffScore's code**: MusicXML XSD + parse-back + duration-sum, ABC re-parse via abcjs, Tonal-as-oracle, the rational `expectedTimeline` oracle, hand-authored golden corpus. Strength: breaks the self-referential loop. Limit: XSD proves well-formedness not musical sense (pair with content asserts); oracle quirks need normalization.

**Layer 5 — Real-browser geometry harness (Playwright + page.evaluate `getBBox`).** The **only** route that sees real Bravura metrics. Owns true SIZE/POSITION/ORIENTATION/COLLISION. Asserts **relational/tolerance** invariants (stem length ≈ 3.5 staff-spaces; accidental bbox right edge ≤ notehead left edge; ledger span > notehead width; higher pitch → smaller y). Strength: authoritative for geometry; numeric (bbox), robust to anti-aliasing. Limit: slower, requires `await document.fonts.ready`; tolerances must be tuned; doesn't prove the glyph identity (pair with codepoint).

**Layer 6 — Visual screenshot backstop.** Owns *gross* regressions only: blank canvas, tofu/`.notdef` (font failed), catastrophic overlap, missing system, theme break. **Pixel-diff that FAILS-AND-ATTACHES for human review; never auto-blesses, never gates merge, never the correctness oracle.** A passing diff means "identical to last time" (could be a locked-in bug), not "correct."

**Layer 7 — Interaction E2E.** Owns the real `command → engine → layout → SVG` pipeline through real focus/hover/keyboard events on the demo. Asserts via **both** engine state (`window.riffScore`) **and** resulting DOM, structurally retiring the getScore workaround. Limit: slowest, flakiest; keep thin over the deterministic layers.

**devtools-MCP role (distinct from Playwright):** the *exploratory/agentic* loop — when the concurrent correctness audit flags a bug, drive the live `demo:dev`, seed the exact failing score via `window.riffScore`, read the offending element's `getBBox`/codepoint to triangulate, then **freeze the reproduction as a permanent Playwright test**. MCP is discovery; Playwright is the CI-gated regression lock. MCP is not in CI.

---

## 4. Typesetting Verification Without Trusting Screenshots

The engraving layer is currently unverified and the one geometry-ish test is tautological (`grandStaffAlignment`). Three deterministic oracles replace eyeballing.

### 4a. Numeric layout-engine output (jsdom, instant)
The engine is pure: `calculateChordLayout` (`positioning.ts:259`), `getStemOffset` (`:360`), `calculateBeamingGroups` (`beaming.ts:18`), `calculateScoreLayout`/`calculatePageLayout`. Assert exact numbers and rule-encoding invariants:

```ts
// Second-interval: exactly one note shifts, sign matches stem direction, magnitude is the constant
const L = calculateChordLayout([{id:'lo',pitch:'F4'},{id:'hi',pitch:'G4'}], 'treble');
expect(L.direction).toBe('up');
expect(L.noteOffsets['hi']).toBe(LAYOUT.SECOND_INTERVAL_SHIFT); // not just "some offset !== 0"
expect(L.noteOffsets['lo'] ?? 0).toBe(0);

// Property: stem direction predicate. Also pin the two divergent functions agree —
// positioning.ts:304 uses furthestY, beaming.ts:127 uses avgY; a single-note "group" must match.
fc.assert(fc.property(genPitch(), p => {
  expect(stemDirSingle(p, 'treble')).toBe(beamDirSingle([p], 'treble'));
}));

// Beaming slope follows pitch contour and respects MAX_SLOPE clamp
const g = calculateBeamingGroups(ascendingEighths, positions)[0];
expect(Math.sign(g.endY - g.startY)).toBe(Math.sign(lastY - firstY));
expect(Math.abs((g.endY - g.startY)/(g.endX - g.startX))).toBeLessThanOrEqual(BEAMING.MAX_SLOPE);
```

### 4b. Reference-oracle table (pitch→Y, ledger count, stem dir), expecteds from theory
```ts
const ORACLE = [
  { clef:'treble', pitch:'C4', ledger:1, side:'below', stem:'up' },
  { clef:'treble', pitch:'C6', ledger:2, side:'above', stem:'down' },
  { clef:'treble', pitch:'B4', ledger:0, stem:'down' }, // middle line → stem down
];
```
This catches pitch-mapping, ledger-count, and stem-direction errors as one data-driven table, and (because expecteds are hand-derived) won't regression-lock a bug.

### 4c. SVG geometry-extraction helper (one parser, two fidelities)
Build `tests/helpers/geometry.ts` that renders to SVG (`renderToStaticMarkup` in jsdom, or live DOM in Playwright) and exposes `noteheads()`, `stems()`, `ledgerLines(id)`, `beams()`, each `{role,x,y,codepoint}` / `{x1,y1,x2,y2}`. The **same** queries run at both fidelities — assertions written once. This also closes the **engine/render divergence** gap: notehead Y is recomputed inside `Note.tsx:249` (`baseY + getOffsetForPitch`) independent of the engine, so assert the component's emitted y equals the engine's computed y for the same note.

### 4d. SMuFL codepoint assertions (glyph identity)
`NoteHead/Accidental/Dot/LedgerLines` are exported (`Note.tsx:318`) and codepoints centralized in `src/constants/SMuFL.ts`. The `getGlyph` branch (`Note.tsx:27–31`) returns whole/half/black — currently **0 codepoint tests** exist.
```ts
import { NOTEHEADS, ACCIDENTALS, REST_GLYPHS } from '@/constants/SMuFL';
const { container } = render(<NoteHead x={0} y={0} duration="half" color="#000" />);
expect(container.querySelector('text')!.textContent).toBe(NOTEHEADS.half); // U+E0A3, not E0A4
// One high-value case also cross-checked against a LITERAL so a wrong constant can't pass:
expect(container.querySelector('text')!.textContent!.codePointAt(0)!.toString(16)).toBe('e0a3');
```

### 4e. Browser-geometry (real Bravura metrics)
```ts
await page.evaluate(() => document.fonts.ready);
const { nh, stem } = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="score-canvas-container"]');
  const nh = c.querySelector('text.NoteHead').getBBox();
  const s = c.querySelector('line[stroke-width]');
  return { nh, stem: { y1:+s.getAttribute('y1'), y2:+s.getAttribute('y2') } };
});
expect(stem.y2).toBeLessThan(nh.y);                    // stem-up rises above notehead
const len = Math.abs(stem.y1 - stem.y2);
expect(len).toBeGreaterThan(nh.height * 2.5);          // ~3.5 staff-spaces, tolerance band
expect(len).toBeLessThan(nh.height * 5);
```
**Collision invariant** (browser, accurate bboxes): no two notehead bboxes overlap unless a legitimate second cluster (`|Δy|==6 && offset==SECOND_INTERVAL_SHIFT`).

### Residual role + hard limits of screenshots
Screenshots do exactly one job: confirm something rendered and flag visual *change* for a human. After `document.fonts.ready`, (a) assert pixel variance/mean is non-uniform (catches blank/tofu), (b) `toHaveScreenshot` on **tiny** regions (one chord/measure) with a generous threshold, **failing-and-attaching the diff for human approval**. They **cannot** judge stem side, 6px line-vs-space placement, ledger count, accidental centering, beam slope, or glyph identity — all proven by §4a–e.

---

## 5. Theory Oracles (independent of RiffScore's own code)

**MusicXML: XSD + parse-back + duration-sum + headless MuseScore.** Commit the MusicXML 4.0 XSD as a fixture. Fast unit run validates well-formedness (libxmljs2 / `xmllint`); parse with `fast-xml-parser` and assert per-measure `Σ<duration> == divisions*beats`. Add a **deliberately failing** triplet test to expose `musicXmlExporter.ts:331` — written to expect **16**, never the buggy **15**. CI-only advisory step: `musescore4 -o out.musicxml in.musicxml` to prove a real engraver accepts it (paired with a content diff — "it opened" ≠ correct, because MuseScore silently auto-repairs).
```ts
const doc = new DOMParser().parseFromString(generateMusicXML(tripletScore), 'text/xml');
const durs = [...doc.querySelectorAll('measure[number="1"] note duration')].map(d => +d.textContent);
expect(durs.every(Number.isInteger)).toBe(true);
expect(durs.slice(0,3).reduce((a,b)=>a+b)).toBe(16); // triplet eighths fill one quarter
```
> Note: divisions=16 **cannot** represent triplet eighths as integers — the real fix is `divisions=24` (or LCM). The duration-sum test correctly fails until both the divisions value and the `Math.floor` are fixed.

**ABC re-parse via abcjs.** Add `abcjs` (dev). `ABCJS.parseOnly(generateABC(score))`, flatten to a note sequence, normalize both sides, deep-compare pitch/octave/accidental/duration/tie/tuplet. Catches octave-mark and accidental-path bugs the substring tests miss.

**Tonal as oracle (used differently than the subject uses it).** Property-test transposition and key membership against Tonal computed inline — plus a few fully hand-verified golden cases that use *no* library, so a shared Tonal misuse can't hide. Fix `ChromaticTransposeCommand.test.ts:100–110`, which currently hedges `expect(['Db4','C#4']).toContain(...)` and thus can't catch a spelling regression: pin the correct key-aware spelling.

**Playback-timing oracle (rational arithmetic).** Standalone `expectedTimeline(score,bpm)` computing seconds from `60/bpm`, accumulated measure starts, exact tuplet rationals (not floored), tie chains merged. Assert `createTimeline` (`TimelineService.ts`) matches within epsilon, adding tuplet-evenness, tie-across-barline, and dotted-in-6/8 cases the current tests omit. Also fix `TimelineService.test.ts:219` (`frequency > 0` is vacuous — assert exact Hz like line 280 already does).

**Hand-verified golden corpus.** ~8–12 small reference scores (C/G/F/Bb/F# keys; eighth & sixteenth triplets; quintuplet; tie across barline; 6/8 beaming; accidental-persists-in-measure; slash chord; grand staff). A human authors and signs the expected MusicXML/ABC by hand (comment: "verified by <human> on <date>, not generated by RiffScore"). Use **committed files**, not `toMatchSnapshot` (machine snapshots re-pin bugs). Canonicalize before diffing.

**Accidental-context rule engine.** `accidentalContext.ts:9` `getEffectiveAccidental(pitch)` takes **only a pitch** — confirmed it has no measure memory. Build a pure reference applying standard CMN rules (accidental persists for the measure on the same letter+octave; natural cancels; barline resets; tie carries across barline) and assert the renderer's decision matches. This will expose the missing measure-scoped logic.

---

## 6. Test Integrity

### Find and fix the existing flawed tests
- **Rewrite the verified offenders** (§1 table): `layoutEngine.test.ts:54–66/84–89` → exact offset/spacing; `grandStaffAlignment.test.ts` → import the production function (not a local copy) and assert corresponding events share x; `ChangePitchTuplet.test.ts` → deep tuplet-field equality on all three notes; `Smoke.test.tsx` → stop mocking the Toolbar under test; `RenderingDetailed.test.tsx` → real DOM assertions (beam polygon count, rest codepoint) or delete.
- **Exporter tests** → parse + duration-sum + XSD, not 84 substrings.
- **TESTING.md** → retract the selection-over-getScore guidance after the env fix.

### Mutation testing (StrykerJS) — the only automated detector of this defect class
Coverage (75%) measures execution, not assertion strength. Add `@stryker-mutator/core` + jest runner, scoped first to `src/engines/layout`, `src/utils/core.ts`, `src/exporters`, `src/utils/accidentalContext.ts`. Surviving mutants directly expose the vacuous/tautological tests (the `toBeDefined` positions, `some(o=>o!==0)`, the `Math.max===Math.max`, the 84 `toContain`). Run nightly/on changed files; set a mutation-score threshold.

### Guardrails against new flawed tests
- **ESLint (`eslint-plugin-jest`):** `valid-expect`, `no-conditional-expect`; a custom/`no-restricted-syntax` rule flagging tests whose **only** assertions are `toBeDefined`/`toBeTruthy`/`typeof` (warning + reviewer judgment, not hard-fail everywhere).
- **CI grep guards:** fail on committed `_tmp_*`/`scratch`/`debug` test files; flag exporter tests that use `toContain` with no parsed/structural assertion.
- **Independent-oracle requirement** for theory/serialization (no self-referential expecteds).
- **Golden-review checklist:** every golden/snapshot blessed against engraving rules (stem length vs Behind Bars, key-sig accidental order) before commit; PRs that run `jest -u` require explicit human justification.

---

## 7. Phased Rollout

### Phase 1 — Foundations & quick wins (no browser, all jsdom)
**Goal:** make the existing suite mean something and stand up deterministic oracles.
**Deliverables:**
- Triage/repair the 8 flawed tests in §1; delete or fix `RenderingDetailed`.
- Fix test-env faithfulness: root-cause `getScore()` staleness (React batching — `ScoreAPI.accidental.test.tsx` already reads it via `act()`), standardize `act()`-wrapped mutations, **delete** the TESTING.md selection workaround.
- Add `fast-check`: capacity-conservation invariant (reuse `calculateTotalQuants`, `core.ts:60`), tuplet-tiling, JSON round-trip identity.
- Add `fast-xml-parser` + MusicXML XSD: parse-back + duration-sum invariant; commit the **failing** triplet test exposing `musicXmlExporter.ts:331`.
- Build `tests/helpers/geometry.ts` (SVG extraction) and a SMuFL codepoint registry test for `NoteHead`/`Accidental`/`Rest` (`Note.tsx:318` exports).
- Reference-oracle pitch→Y/ledger/stem-dir table; key-signature circle-of-fifths table vs `KEY_SIGNATURES`.
**Tooling:** `fast-check`, `fast-xml-parser`, `libxmljs2`/`xmllint`. **Files:** `src/__tests__/property/*`, `src/__tests__/exporters/musicXmlExporter.semantic.test.ts`, `tests/helpers/geometry.ts`, `src/__tests__/glyphs/smufl.test.tsx`.
**Newly caught:** the tuplet-duration corruption, octave truncation, capacity violations, wrong-glyph selection, ledger/stem-direction errors, JSON data-loss, key-sig set errors.

### Phase 2 — Theory oracles & cross-meter matrix
**Goal:** break self-referentiality; kill the 4/4-only blind spot.
**Deliverables:** abcjs re-parse round-trip; Tonal-as-oracle transposition/key property tests (fix the `['Db4','C#4']` hedge); `expectedTimeline` rational oracle + tuplet/tie/6-8 timing cases; accidental-context rule engine vs `getEffectiveAccidental`; shared fixture matrix exercising 3/4, 2/4, **6/8** through beaming (`beaming.ts:66` 4/4 assumption), capacity, and both exporters; hand-verified golden corpus.
**Tooling:** `abcjs`, existing `tonal`. **Newly caught:** 6/8 mis-beaming, enharmonic/directional transpose errors, accidental-persistence bugs, ABC body-fidelity, timing math for tuplets/ties.

### Phase 3 — Golden-structural numeric snapshots
**Goal:** lock deterministic geometry cheaply.
**Deliverables:** rounding serializer + committed numeric goldens for ~10 canonical fixtures from `calculateScoreLayout`/`calculatePageLayout` (single note per clef, second cluster, beamed group, triplet, ledger extremes, accidental run, grand staff, multi-system page). **Each golden human-validated before commit.**
**Newly caught:** silent spacing/stem/beam/justification/pagination drift — surfaced as reviewable diffs.

### Phase 4 — Playwright + devtools-MCP smoke on the demo
**Goal:** real browser, real fonts.
**Deliverables:** `@playwright/test` with `webServer: npm run demo:dev`; seed via `window.riffScore` (`demo/app/page.tsx:114`); SMuFL codepoint oracle on live DOM; font-load/tofu guard (`document.fonts.check('40px Bravura')` + glyph metric band — replaces the mock-only `useFontLoaded.test.ts`); keyboard-entry/undo/export E2E asserting **engine state + DOM**; add `data-glyph`/`data-testid` to `Note.tsx` glyph elements (derive from one `getGlyph()` call so they can't drift). devtools-MCP for triage of audit-flagged bugs → frozen as Playwright tests.
**Newly caught:** integration-wiring breaks jsdom mocks hid, font-not-loaded false-greens, focus/hover/keyboard regressions, hit-testing.

### Phase 5 — Real-browser geometry assertions
**Goal:** the engraving oracle screenshots can't be.
**Deliverables:** `page.evaluate` `getBBox` assertions (stem length, accidental-left-of-notehead, ledger span, beam slope sign), collision invariants, and engine-vs-DOM cross-check (renderer faithfully consumes the engine).
**Newly caught:** stem-too-short, accidental overlap, ledger-length, beam-slope, glyph mis-position — the user's core concern.

### Phase 6 — Visual gallery + pixel-diff backstop + mutation + CI gating
**Goal:** gross-regression net, integrity enforcement, automation lock.
**Deliverables:** `/gallery` demo route of hard cases; `toHaveScreenshot` (advisory, human-approved baselines, masked cursor); StrykerJS with threshold; ESLint/CI guardrails (§6); GitHub Actions per §8.
**Newly caught:** catastrophic visual breakage; vacuous assertions quantified by mutation score.

---

## 8. Tooling & CI

**Install (dev):** `fast-check`, `fast-xml-parser`, `libxmljs2` (or system `xmllint`), `abcjs`, `@playwright/test`, `@stryker-mutator/core` + `@stryker-mutator/jest-runner`, `eslint-plugin-jest`. Commit MusicXML 4.0 XSD as a fixture. Optional CI image: MuseScore CLI.

**Where each layer runs:**
- Layers 1–4 + golden-structural (3): Jest, every push, milliseconds–seconds.
- Layers 5 + 7 (Playwright geometry/E2E): pinned single browser (chromium/Linux) via `webServer`, sharded, `retries: 2` in CI with a **flake budget** (any test retried >1× is quarantined+reported, not silently passed).
- Layer 6 visual: separate advisory job.

**CI jobs (`.github/workflows/`):**
- **Job 1 (gates merge, fast):** `jest` unit + property + golden + lint + `typecheck`.
- **Job 2 (gates merge):** Playwright codepoint + geometry + font-load + keyboard E2E.
- **Job 3 (advisory, blocks nothing):** `toHaveScreenshot` diff → upload diff images + PR comment; baseline updates require explicit human commit. Headless-MuseScore import also advisory.
- **Nightly:** StrykerJS mutation score on `engines/layout`, `core.ts`, `exporters`.

**`playwright.config`:** `webServer: { command: 'npm run demo:build && npm run demo:start || npm run demo:dev', url: 'http://localhost:3000', reuseExistingServer: !process.env.CI }`. **New scripts:** `test:e2e`, `test:e2e:ui`, `test:visual:update`, `test:mutation`.

### QUICK WINS (highest value / lowest effort, do this week)
1. **Delete/fix `RenderingDetailed.test.tsx`** (asserts nothing) and **`grandStaffAlignment.test.ts`** (`Math.max===Math.max`).
2. **Add the failing MusicXML duration-sum test** — exposes the live triplet corruption in ~15 lines (`fast-xml-parser` + `Σ<duration>==16`).
3. **SMuFL codepoint tests** for `NoteHead`/`Accidental`/`Rest` — 0 exist today; components already exported at `Note.tsx:318`; pure RTL, no browser.
4. **Rewrite `layoutEngine.test.ts:54–66`** from `some(o=>o!==0)` to exact `SECOND_INTERVAL_SHIFT` on the correct note.
5. **`fast-check` capacity-conservation property** — reuses existing `calculateTotalQuants`.
6. **Retract the TESTING.md selection workaround** and fix `TimelineService.test.ts:219` (`frequency > 0` → exact Hz).

---

### Relevant files (absolute paths)
- Live bugs: `/Users/josephkotvas/Sites/riffscore/src/exporters/musicXmlExporter.ts` (`:331` tuplet `Math.floor`, `:298` `divisions=16`, `:355` octave slice); `/Users/josephkotvas/Sites/riffscore/src/engines/layout/beaming.ts:66` (4/4 assumption), `:127` vs `/Users/josephkotvas/Sites/riffscore/src/engines/layout/positioning.ts:304` (divergent stem-direction)
- Flawed tests: `/Users/josephkotvas/Sites/riffscore/src/__tests__/RenderingDetailed.test.tsx:101`, `/Users/josephkotvas/Sites/riffscore/src/__tests__/grandStaffAlignment.test.ts:6`, `/Users/josephkotvas/Sites/riffscore/src/__tests__/layoutEngine.test.ts:54`, `/Users/josephkotvas/Sites/riffscore/src/__tests__/exporters/musicXmlExporter.test.ts`, `/Users/josephkotvas/Sites/riffscore/src/__tests__/ChangePitchTuplet.test.ts:55`, `/Users/josephkotvas/Sites/riffscore/src/__tests__/Smoke.test.tsx`, `/Users/josephkotvas/Sites/riffscore/src/__tests__/TimelineService.test.ts:219`
- Policy smell: `/Users/josephkotvas/Sites/riffscore/docs/TESTING.md:238`
- Leverage points: `/Users/josephkotvas/Sites/riffscore/src/services/PageLayoutService.ts`, `/Users/josephkotvas/Sites/riffscore/src/engines/layout/scoreLayout.ts`, `/Users/josephkotvas/Sites/riffscore/src/utils/core.ts`, `/Users/josephkotvas/Sites/riffscore/src/constants/SMuFL.ts`, `/Users/josephkotvas/Sites/riffscore/src/components/Canvas/Note.tsx:318` (exports), `:249` (Y recompute), `/Users/josephkotvas/Sites/riffscore/src/utils/accidentalContext.ts:9` (no measure memory)
- Browser target: `/Users/josephkotvas/Sites/riffscore/demo/app/page.tsx:114` (`window.riffScore` seam)
- Config: `/Users/josephkotvas/Sites/riffscore/jest.config.js` (jsdom, 75% gate), `/Users/josephkotvas/Sites/riffscore/package.json` (no Playwright/fast-check/stryker)

---

## Appendix — Functionally-flawed tests found (well-shaped but verifying the wrong thing)

- **`src/__tests__/RenderingDetailed.test.tsx:101-115 ('renders Beams, Tuplets, and Rests without crashing')`** — *vacuous-assertion*: The test body has ZERO expect() calls; the closing comment literally reads 'If we got here without error, success?'. It proves only that render() doesn't throw, not that any beam/tuplet/rest is drawn, positioned, or even present in the DOM. Confirmed PASS while asserting nothing.
- **`src/__tests__/ChangePitchTuplet.test.ts:55-64 ('should preserve score structure when changing pitch of a tuplet note')`** — *asserts-structure-not-music*: Self-described 'Regression test for tuplet corruption', but its corruption checks are expect(finalScore).toBeDefined(), expect(finalScore.staves).toBeDefined(), expect(staves.length).toBeGreaterThan(0) — true for almost any non-crash. It only checks the edited note's pitch==='G4' and edited event's tuplet toBeDefined(); it never asserts the tuplet's ratio/groupSize/position survived, that the OTHER two notes still carry tuplet metadata, or that total duration is preserved. Sibling-note corruption would pass.
- **`src/__tests__/exporters/musicXmlExporter.test.ts (entire file, esp. tuplet path absent)`** — *pins-wrong-expected*: ~40 assertions are substring toContain() on tags/clefs/kinds; NOT ONE asserts a <duration> value, <type>, divisions consistency, or that a measure's durations sum correctly. This regression-locks the Math.floor truncation bug in musicXmlExporter.ts:331 (triplet eighths export <duration>5</duration>, summing 15 not 16). The suite treats whatever the code emits as correct and would not break if durations were wildly wrong.
- **`src/__tests__/Smoke.test.tsx:18-31 + :89-92 (clef click handling)`** — *mocks-the-subject*: The Toolbar — the component whose reaction is asserted — is replaced by an inline mock that sets text 'CLEF_MENU_OPENED'. So 'Toolbar received the signal' verifies the test's own mock, not real Toolbar behavior. Worse, the bass-clef assertion at :92 re-asserts the SAME text from the treble click (comment: 'text remains same'), so the bass-click branch is effectively vacuous — it would pass whether or not the bass click did anything.
- **`src/__tests__/engines/layout/scoreLayout.test.ts:131-149 ('should apply chord shifts to note positions') and :524-559 ('should position same pitch differently for different clefs')`** — *tautological*: Both wrap the meaningful assertion inside an if() guard and then only assert expect(typeof note.localX).toBe('number') / expect(typeof trebleY).toBe('number'). The named behavior (chord notes shifted; same pitch differing by clef) is never actually asserted — the comments even say '...though if they're perfectly aligned, they could be the same' and 'Both are valid Y positions'. A clef-independent or shift-free bug passes.
- **`src/__tests__/ScoreAPI.cookbook.test.tsx:177-218 ('Build a Chord Progression - 4 chords with correct voicings')`** — *asserts-structure-not-music*: Title claims 'correct voicings' but assertions only count notes (length===3) and check root pitch. It never verifies voicing (interval content/ordering), never verifies the two half-note chords correctly fill the 4/4 measure, and never checks for overflow from the API's auto-advance. 'Correct voicings' is unproven.
- **`src/__tests__/services/PageLayoutService.test.ts:434-467 and :471-489`** — *other*: Conditional-vacuity: the meaningful right-edge/fill assertions run only inside if(system.justification !== 1.0) / if(justifiedNonFirstSystems.length > 1). If the fixture never produces those conditions the test asserts nothing yet stays green. Not wrong, but a latent silent-pass risk; the guards should be replaced by fixtures that guarantee the condition + an explicit expect(count).toBeGreaterThan(0).
- **`src/__tests__/usePlayback.test.ts:38-46 + :145-170`** — *mocks-the-subject*: createTimeline (the score->time mapping) is mocked to return hardcoded entries, then the test asserts createTimeline was called and scheduleTonePlayback received an object with measureIndex:0. It verifies wiring, not that durations/tempo produce correct times — a timing-math bug in the real timeline is invisible here (real timing IS covered separately in TimelineService.test.ts, but this hook's integration is not).
- **`src/__tests__/layoutEngine.test.ts:54-66 ('should calculate note offsets for seconds')`** — *vacuous-assertion*: For F4+G4 (a second) it asserts only `Object.values(layout.noteOffsets).some(o => o !== 0)` — i.e. SOME note got SOME nonzero shift. It never checks which note shifts (upper vs lower per stem direction), the sign, or the magnitude (LAYOUT.SECOND_INTERVAL_SHIFT). The whole point of second-interval logic (positioning.ts:312-336) is direction-dependent: a regression that shifts the wrong note, the wrong way, or by the wrong amount still passes.
- **`src/__tests__/layoutEngine.test.ts:84-89 ('should position events sequentially')`** — *vacuous-assertion*: Asserts `eventPositions['e1'] toBeDefined()`, `e2 toBeDefined()`, and `e2 > e1`. Two quarter notes that are 1px apart, or spaced by an absurd width, both pass. No assertion on the actual spacing value vs getNoteWidth('quarter') (positioning.ts:225). Monotonicity is necessary but far from the real spacing contract.
- **`src/__tests__/exporters/musicXmlExporter.test.ts:40-52 + 100-134 (clef + null-pitch paths)`** — *asserts-structure-not-music*: Every assertion is `xml.toContain('<sign>G</sign>')` etc. The document is never checked for well-formedness, never validated against the MusicXML 4.0 DTD/XSD it declares (line 232), never parsed back. The known duration-drift bug (Math.floor at musicXmlExporter.ts:331) and octave-truncation (line 355) produce strings that still contain all the matched substrings, so these tests are green on musically-wrong output.
- **`src/__tests__/services/PageLayoutService.test.ts:434-467 ('justified systems fill contentWidth')`** — *tautological*: It re-derives the stretch factor by calling the SAME production function `calculateStretchFactor(measuresNaturalWidth, contentWidth, justification)` and then asserts `measuresNaturalWidth * stretchFactor ≈ contentWidth`. Since stretchFactor is defined as availableWidth/naturalWidth (measure.ts:41-57), this is algebraically `naturalWidth * (contentWidth/naturalWidth) == contentWidth` — true by construction regardless of whether the actual per-measure stretched layout fills the system. It does not assert on stretched measure x-positions/widths from calculateMeasureLayout.
- **`docs/TESTING.md:242-255 (codified pattern, not a single test)`** — *asserts-structure-not-music*: Official guidance: prefer `expect(api.getSelection().eventId).toBeDefined()` over `expect(getScore()...events).toHaveLength(1)` because getScore() 'may return stale data in test environments'. This converts an entire category of entry/edit tests into 'a selection exists' assertions — the result of the edit (the note actually added, its pitch/duration) is never verified. It also hides a real stale-state bug (CHANGELOG #200) instead of fixing the test env to read from the authoritative ScoreEngine.
- **`src/__tests__/grandStaffAlignment.test.ts:6-26 and :81 ('should calculate max width per measure for Grand Staff')`** — *tautological*: The test defines a local helper calculateSynchronizedMeasureWidths that itself computes maxWidth = Math.max(...staff widths), then asserts syncedWidths![0] === Math.max(trebleWidth, bassWidth). It is asserting Math.max(a,b) === Math.max(a,b) — cannot fail. It also tests an in-test reimplementation, not the production ScoreCanvas synchronizedMeasureWidths path it claims to mirror, and never asserts the two staves actually share X positions (the real meaning of grand-staff alignment).
- **`src/__tests__/layoutEngine.test.ts:123-135 ('should break beams on quarter notes')`** — *asserts-structure-not-music*: Asserts groups.toHaveLength(0). This proves no >1 beam group formed, not that beaming is musically correct. It does not assert that two eighths separated by a quarter are independently flagged, nor any geometry; it would also pass if beaming were entirely broken and never grouped anything.
- **`docs/TESTING.md:240-256 (documented project-wide test pattern, not a single test)`** — *other*: Guidance tells authors to assert on selection rather than getScore() because getScore() 'may return stale data in test environments.' This institutionalizes asserting that a function ran / selection moved instead of that the score MUTATED CORRECTLY. It is the (d) 'assert that a function ran instead of musical correctness' pattern at policy level and undermines integration-test confidence; the fix is to make the test env faithful (flush React state / await) not to route around the assertion.
- **`src/__tests__/ChangePitchTuplet.test.ts:55-57`** — *vacuous-assertion*: Asserts `finalScore` toBeDefined, `finalScore.staves` toBeDefined, and `staves.length` toBeGreaterThan(0) after a pitch change inside a tuplet. These prove only that a score object came back, not that the pitch changed correctly or that the tuplet metadata/durations survived. A function that returned the unchanged score would still pass two of three.
- **`docs/TESTING.md:244-249 (recommended pattern, used widely across ScoreAPI.entry.* tests)`** — *asserts-structure-not-music*: The documented 'good' test asserts `api.getSelection().eventId` is defined after addNote('C4'). It never checks that a note with pitch C4 and the intended duration was actually inserted at the intended position. It proves a selection pointer exists, not musical correctness — and it was written this way deliberately to dodge a stale-getScore() test-env problem.
- **`src/__tests__/ChromaticTransposeCommand.test.ts:100-110`** — *pins-wrong-expected*: Comment admits uncertainty ('C4 + 1 semitone = Db4 (or C#4 depending on context, verify)') and then asserts `expect(['Db4','C#4']).toContain(n1.pitch)`. By accepting either spelling it cannot detect an enharmonic-spelling regression — the very thing a transposition oracle must pin. It locks in 'whatever Tonal happens to return' rather than the musically-correct spelling for the key/context.
- **`src/__tests__/TupletCommands.test.ts:37-69`** — *asserts-structure-not-music*: Asserts the tuplet objects attached to events have ratio [3,2], groupSize 3, shared id, etc. It verifies the metadata bag, not that the three events actually occupy the duration of two (i.e. the musical meaning of a triplet). A triplet whose members had wrong quant durations would still pass every assertion here.
- **`src/__tests__/exporters/musicXmlExporter.test.ts (entire file)`** — *asserts-structure-not-music*: All 600+ lines assert substrings exist in the exporter's own output string. Nothing validates the document against the declared MusicXML 4.0 DTD or parses it back; ordering is spot-checked with indexOf. A document that is malformed (e.g. tuplet durations that don't sum, missing required children) passes as long as the substrings appear.
- **`src/__tests__/RenderingDetailed.test.tsx:101-115 (test 'renders Beams, Tuplets, and Rests without crashing')`** — *vacuous-assertion*: It renders a complex score then asserts nothing at all — the body literally ends with the comment 'If we got here without error, success?' and 'We can also check for DOM elements if we add test-ids'. It passes as long as render() does not throw, proving zero about whether beams/tuplets/rests are engraved correctly (or at all). A musician would call this no verification.
- **`src/__tests__/ScoreCanvas.test.tsx:21-25,165-182`** — *mocks-the-subject*: The test mocks the canvas internals (renders a fake <g data-testid=staff-…> / <rect data-testid=measure-…>) and then asserts those mock elements are in the document (getByTestId) and that mockContextValue.navigation.select was called. It verifies the mock and a handler dispatch, not the real ScoreCanvas geometry/rendering it is named for.
- **`src/__tests__/useFontLoaded.test.ts:54-67 ('sets isLoaded=true when fonts are ready')`** — *mocks-the-subject*: It stubs document.fonts.ready to resolve, then asserts isLoaded becomes true. This validates the hook's promise wiring but not that Bravura actually loads or renders; combined with useFontLoaded.ts:103-107 (isLoaded flips true on a 3s timeout regardless), a green here does NOT mean the font is available — it must not be relied on as font verification.
- **`docs/TESTING.md:240-256 (guidance, applied across ScoreAPI.entry/navigation tests)`** — *asserts-structure-not-music*: The documented pattern tells authors to assert on getSelection().eventId being defined instead of on getScore() event content, because getScore() 'may return stale data in test environments'. This steers the suite to assert that a selection exists / a function ran rather than that the correct musical content was produced, and entrenches a test-env state-timing bug instead of fixing it.

## Appendix — Per-route blind spots

### Honest audit of the current suite incl. functionally-flawed tests
- TRUE RENDERED GEOMETRY: jsdom has no layout, so nothing verifies notehead/accidental/dot x,y, stem length, beam slope, ledger-line count/extent, or that elements don't collide. Note.tsx renders glyphs as SVG <text> at computed x/y and ledger lines as <line> (Note.tsx:124-153) but no test reads those coordinates.
- SMuFL GLYPH CODEPOINTS: zero tests assert any codepoint (grep NOTEHEAD/getGlyph/uE0A/REST_GLYPHS in __tests__ = 0 matches). The glyph-selection branch in Note.tsx:27-31 (whole vs half vs black notehead) and accidental glyph mapping are entirely unverified — a wrong glyph (e.g. half-note head on a quarter) is undetectable.
- FONT-METRIC-DEPENDENT SPACING: accidental padding, dot offsets, chord-cluster shifts depend on Bravura advance widths that jsdom cannot measure; measure.test.ts asserts 'accidental adds padding' via a hardcoded CONFIG constant, not the glyph's real width.
- ACCIDENTAL/KEY-SIG -> PITCH SOUND: TimelineService maps pitch->frequency, but no test checks that a 'sharp' accidental or a key signature shifts the frequency (C#4 ~277Hz vs C4 ~261Hz). ScoreAPI.accidental.test.tsx only verifies the data-model field is set, not glyph or audio.
- MUSICAL VALIDITY OF MEASURES: no test asserts that a measure's events sum to the time signature, or flags overfull/underfull measures, after add/insert/tuplet/setDuration operations.
- TUPLET CORRECTNESS BEYOND METADATA: tuplet tests assert ratio/position fields but never that a tuplet group's total duration equals the space it replaces, nor that sibling notes keep their tuplet metadata after an edit.
- REAL AUDIO CLOCK / PLAYBACK SCHEDULING: Tone.js mocked everywhere; usePlayback.test.ts additionally mocks createTimeline (the music->time computation), so playback timing correctness is doubly unverified.
- PRINT / PAGINATION OUTPUT: PrintService and page-break visuals are tested only as numeric helpers; actual print/PDF rendering is untested.
- INTERACTION HIT-TESTING IN REAL COORDS: click-to-select relies on getBoundingClientRect, which jsdom returns as zeros; Interaction.test.tsx:78 even comments on this — coordinate-to-note mapping is effectively unverified.

*Screenshot limits:* A screenshot (or an LLM viewing one) can reliably confirm GROSS regressions: blank canvas, total layout collapse, missing staff, catastrophically overlapping systems, wrong overall page structure. It CANNOT reliably confirm engraving correctness: whether a notehead is the correct SMuFL glyph (E0A3 half vs E0A4 black look nearly identical at small sizes), whether a stem is the canonical 3.5-staff-space length or a few px off, whether a beam slope/thickness is correct, whether an accidental sits at the right vertical position relative to its notehead, whether ledger-line count is right by one, or sub-pixel collisions. Therefore screenshots must be a backstop only: pixel-diff against a committed baseline to FLAG changed regions for human review, never the primary oracle. The primary oracles must be: (1) the layout engine's numeric output (calculateScoreLayout/PageLayoutService) asserted directly; (2) rendered SVG geometry read in a real browser via getBBox/getCTM/getComputedTextLength (Playwright/devtools-MCP); (3) SMuFL codepoint assertions on the glyph each component emits.

### Layered verification architecture & route trade-offs
- True engraving geometry: notehead/accidental/flag SIZE, SHAPE, BBox, and collisions are unverified anywhere — jsdom has no font metrics/getBBox, and screenshots can't reliably judge size/orientation. Bravura-dependent placement is effectively untested.
- Cross-meter musical correctness: beaming, beat grouping, and rest consolidation are only exercised in 4/4; 6/8 and 3/4 paths (beaming.ts:66) are untested, so compound-meter bugs are silent.
- Exporter semantic validity: MusicXML/ABC output is never schema-validated, never parsed back, never opened by a third-party reader; substring matches pass on malformed or duration-drifted documents (musicXmlExporter.ts:331,355).
- Whole-measure/whole-score invariants after edit sequences: no property test asserts quant-sum == capacity, reflow preserves total duration (core.ts:reflowScore), tuplet members sum to base, or JSON/XML round-trip identity.
- Vacuous/regression-locked assertions: 115 toBeDefined + 203 toContain + the TESTING.md selection-workaround mean a green suite does not imply correct music; mutation testing would expose how many assertions are dead.
- Integration faithfulness: getScore() staleness means full pipeline (command -> engine -> layout -> SVG) is asserted via selection proxies, not actual resulting notation.
- Playback/timing oracle: cursor timing and note onsets vs computed quant positions are not cross-checked against an independent duration oracle.

*Screenshot limits:* A screenshot (and an LLM reading it) CAN reliably catch: gross regressions (blank/overlapping page, missing system, catastrophic layout break), wrong page count, obviously absent elements, color/theme breakage. A screenshot CANNOT reliably verify, and must NOT be the oracle for: notehead/stem/flag/accidental SIZE relative to staff space, stem ORIENTATION correctness at the pixel level, ledger-line LENGTH, beam SLOPE/thickness, accidental-to-notehead spacing, collision avoidance, or whether the correct SMuFL glyph (vs a similar one) was drawn. Those signals must come from: (a) the numeric layout tree (deterministic, exact), (b) SMuFL codepoint assertions (which glyph), (c) real-browser getBBox geometry (true size/position/overlap). Use pixel-diff only as a change-detector that FLAGS a region FOR HUMAN REVIEW (and gates CI), never as an auto-pass/auto-fail correctness oracle. Keep snapshot scope small (one chord, one measure) so a diff localizes the defect.

### Verifying typesetting correctness without trusting screenshots
- Stem direction correctness — no test pins direction for a note ON the middle line, nor checks that calculateChordLayout (furthestY) and beaming (avgY) agree; a sign error in either decision rule ships green.
- Second-interval offset magnitude/direction — current test only checks 'some offset is nonzero'; a +11/-11 swap, wrong-note-shifted, or stem-X-offset error is invisible.
- Ledger-line count and span — Note.tsx ledger logic is completely untested; wrong count for C6/A6 or missing/extra line for middle C goes uncaught.
- Engine-vs-render Y divergence — notehead Y is recomputed in Note.tsx independent of the engine; the two can drift with nothing asserting equality.
- True glyph SHAPE/SIZE in a real browser — whether the rendered codepoint actually has the Bravura advance width / bbox the layout assumes (jsdom returns zeros; font metrics never exercised).
- Collision/overlap invariants — no check that adjacent noteheads, accidentals, dots, or stems do not overlap (except the legitimate 2nd-interval cluster).
- Accidental placement — that the accidental sits LEFT of and vertically centered on its notehead, and that stacked accidentals in a chord don't collide.
- Beam slope sign, clamping, and stem-clearance — no numeric assertion that slope follows pitch contour, respects MAX_SLOPE, or that every stem reaches the beam.
- Non-4/4 beaming — beat-boundary grouping hardcodes 4/4 (beaming.ts:66); 3/4, 6/8, compound meters unverified.
- Multi-staff vertical alignment — grand-staff test is tautological; real same-X / same-measure-width alignment between treble and bass is unverified.
- Font-not-loaded / blank / tofu rendering — nothing detects the catastrophic case where Bravura fails to load and every glyph renders as a fallback box.

*Screenshot limits:* Screenshots / LLM-vision are a BACKSTOP only, never the engraving oracle. They CAN reliably catch: (1) font-not-loaded / blank canvas / tofu boxes (a whole-page perceptual hash or mean-pixel check flags 'nothing rendered' or 'all glyphs are .notdef'); (2) gross layout regressions — a measure that collapsed to zero width, notes piled at the origin, a system that overflowed the page; (3) pixel-diff between commits to FLAG a changed region for human review (jest-image-snapshot / pixelmatch with a diff image attached to CI). They CANNOT be trusted to judge: whether a stem is on the correct side, whether a notehead center is on the right line vs the adjacent space (6px — sub-perceptual at normal zoom), whether a 2nd-interval note shifted the correct direction, whether the right number of ledger lines drew, whether an accidental is vertically centered, whether a beam slope is musically right, or whether glyph X is the quarter vs the half codepoint. All of those must be proven by numeric/geometry/codepoint assertions, not by looking. A passing pixel-diff means 'identical to last time' (could be a locked-in bug), not 'correct'; a failing pixel-diff means 'changed, look at it' — it must route to a human, never auto-pass and never serve as the correctness gate.

### Independent oracles for music-theory correctness
- Tuplet quant integrity: no oracle proves exported <duration> integers sum to the measure's divisions, nor that ABC (n... members reconstruct to the right total; the Math.floor bug at musicXmlExporter.ts:331 is currently uncatchable.
- MusicXML/ABC well-formedness and schema validity: declared DTD (MusicXML 4.0) is never enforced; a file that no real notation app can open would pass every test.
- ABC note-body fidelity: pitch letter-case, octave marks (',/'), accidentals (^/_/=), and durations are emitted (abcExporter.ts:62-91,208-232) but never re-parsed and compared to the source note sequence.
- Enharmonic / directional transposition correctness: descending chromatic transpose spelling and diatonic-vs-chromatic distinction are not independently verified across keys.
- Accidental-context persistence within a measure: needsAccidental (MusicService.ts:72-97) decides per-note vs key only; there is no oracle for the classic rule that an accidental persists for the rest of the measure on that pitch/octave and a later same-pitch note should NOT re-print it (and ties carry across barline). Untested entirely.
- Key-signature note SETS: KEY_SIGNATURES is generated from Tonal (constants.ts:88-116) but never checked against the canonical circle-of-fifths accidental order/sets for all 15 majors + relative minors.
- Beaming groups for compound meter: 6/8 grouping (2 dotted-quarter beats) vs simple meter is in beaming.ts but has no theory oracle; layout tests run in jsdom.
- Playback timing for tuplets/ties/compound meter: no deterministic seconds-oracle; ties-sustain and tuplet-evenness unproven.
- Round-trip identity: export->import deep-equality for JSON is missing; serialization data loss would go unnoticed.

### Playwright + devtools-MCP smoke, geometry harness & CI
- Sub-glyph engraving errors invisible to screenshots: stem length, beam slope, notehead/accidental micro-position, ledger-line length, glyph rotation — currently unverified by ANY layer.
- Real font metrics & collisions: nothing asserts Bravura actually loaded and rendered (useFontLoaded only mocks document.fonts and falls back on a timeout), nor that accidental/notehead bboxes don't overlap — jsdom has no getBBox/font metrics.
- Click-to-place and drag-to-select hit geometry: depends on getBoundingClientRect (all-zeros in jsdom); coordinateUtils/useDragToSelect mapping from pixel to musical position is untested in a faithful environment.
- Keyboard note-entry as a USER experiences it (focus + hover previewNote + 1-7 duration + Enter commit + r/t/arrows): jsdom fireEvent cannot reproduce real focus/hover/key semantics; handleMutation tests likely call the handler directly, bypassing the DOM event path.
- Real audio path (Tone.js / AudioContext start, playback cursor advancing in real time, ESC-to-stop): all mocked in jsdom (Smoke.test.tsx mocks usePlayback + toneEngine).
- Print path and export-download as browser behaviors (PrintService toggles body.riff-printing + data-print-mode; export triggers a real file download / clipboard write) — only the string generators are unit-tested.
- Page-view layout in a real viewport (PageLayoutService system breaking, page count, footer placement) — depends on real width measurement absent in jsdom.
- Regression-LOCKED bugs: a screenshot baseline or a layout golden can pin musically-WRONG coordinates as 'expected', so future correct fixes look like breakages. No cross-check against an independent reference engraver exists.
- SSR/CSR hydration of the embedded editor (demo SSRs the SVG) — mismatches won't surface in jsdom unit tests.

*Screenshot limits:* A screenshot (and an LLM reading one) CAN reliably catch: gross regressions (blank canvas, font-not-loaded tofu boxes / .notdef rectangles, catastrophic overlap, missing whole systems, wildly wrong page breaks, color/theme failures). It CANNOT reliably judge engraving correctness: it cannot tell a stem that is 2px too short, a notehead rotated a few degrees, an accidental nudged half a staff-space, a beam at a slightly wrong slope, a ledger line of wrong length, or a flat vs natural at small sizes — sub-glyph SIZE/SHAPE/ORIENTATION/POSITION errors are below human/LLM screenshot reliability. Therefore screenshots must be a HUMAN-REVIEW-FLAGGING backstop (pixel-diff that fails -> a person looks), never the correctness oracle. The oracle for engraving must be NUMERIC: (1) the layout engine's deterministic coordinates (PITCH_TO_OFFSET table, eventPositions, stem startY/endY, beam start/endY, getX/getY), (2) live-DOM SVG geometry via getBBox/getComputedTextLength in a real browser, and (3) SMuFL codepoint identity from textContent.charCodeAt(0). A subtle trap: a perfect screenshot match still passes if the WRONG-but-consistent glyph/position is rendered every time (regression-LOCKED bug); only the codepoint+numeric oracles catch that.
