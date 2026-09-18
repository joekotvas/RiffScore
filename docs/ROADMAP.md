# RiffScore Roadmap

Updated 2026-09-18 against **1.0.0-alpha.18**. The [issue index](./ISSUE_TRACKING.md) records the active backlog, ownership and verification labels. Prior release dates are not carried forward as new commitments.

## Current priorities

1. **Protect score data at public boundaries.** Prioritize [malformed score loads](https://github.com/joekotvas/RiffScore/issues/69), [invalid duration input](https://github.com/joekotvas/RiffScore/issues/70) and [lower-staff harmony export loss](https://github.com/joekotvas/RiffScore/issues/76). Reproduce remaining reports against the current release before implementation.
2. **Finish API and musical correctness.** Resolve [result/state contracts](https://github.com/joekotvas/RiffScore/issues/57), [chord normalization](https://github.com/joekotvas/RiffScore/issues/52), [cancelled playback results](https://github.com/joekotvas/RiffScore/issues/73) and [copyright round trips](https://github.com/joekotvas/RiffScore/issues/75); retain existing same-turn and multi-instance regression coverage.
3. **Make verification and documentation match the product.** Enforce [coverage in CI](https://github.com/joekotvas/RiffScore/issues/55), add [full MusicXML schema validation](https://github.com/joekotvas/RiffScore/issues/41), and finish [runnable recipes](https://github.com/joekotvas/RiffScore/issues/77) and [packed-consumer stylesheet verification](https://github.com/joekotvas/RiffScore/issues/74).
4. **Plan broader notation and editing features deliberately.** Clipboard, duration-first tuplets, staff management, independent voices, inline signatures, slurs, dynamics and lyrics remain separate scoped features. See the issue index rather than inferring delivery dates from the planning snapshot below.

## Delivered baseline

- ABC and MusicXML/MXL import, with documented unsupported-feature warnings.
- Page view, multi-system layout and Letter/A4 printing, hardened through alpha.18.
- MusicXML extended chord-kind mapping and shared pickup-aware note/chord timing.
- Synchronous exports and horizontal API navigation that preserves staff/meter context.
- Unmetered notation, optional chord recognition, per-editor configuration and permission controls.
- Shared sessions, measure windows, overlays, glyph adapters, the headless theory entry and synchronized playback controls/events.

See the [changelog](../CHANGELOG.md) for release scope. The public core's [alpha.18 verification record](https://github.com/joekotvas/RiffScore/blob/main/docs/ALPHA18_QA.md) reports the relevant tests and limitations. Remaining scope is explicit: general extension registries, independent simultaneous audio transports and multi-voice notation are not delivered by those composition contracts.

## How work advances

- Start with a current reproduction and behavior-level acceptance criteria.
- Use `needs-verification` for older reports or unresolved acceptance checks; remove resolved scope rather than reopening shipped features.
- Keep focused defects separate from coordinating tracking issues, and link only active repositories.
- Assign milestones when scope and a delivery target are chosen; old milestone dates are not commitments.

---

# Planning context through alpha.17

> Numeric references in this snapshot are historical plain text, not active issue numbers. Use the current roadmap above and the issue index for remaining work.
>
> **Generated:** 2026-06-23 · **Historical planning snapshot** · reflects state through **v1.0.0-alpha.17**: M1 (truth-in-advertising) shipped in **alpha.13**; M2's **reference 239 (transpose spelling)** shipped in **alpha.14**; M2's **reference 242 (interactive correctness / structural invariants)** and the **reference 252 visual-regression harness** shipped in **alpha.15**; M2's deferred follow-ups **reference 261/reference 263/reference 264/reference 257** + pre-release QA hardening shipped in **alpha.16**; **M3 export/engraving fidelity** (PR reference 295), **M4 page view** (hardened after the 2026-09 QA pass, PRs reference 298–reference 307, then the beaming/spacing/stem/tie/staff-spacing engraving pass reference 308–reference 320) and **ABC (reference 10) / MusicXML (reference 11) import** shipped in **alpha.17**, with M4's remaining gaps listed under M4.
> Grounded in the 2026-06 correctness audit ([CORRECTNESS_AUDIT_2026-06.md](audit/CORRECTNESS_AUDIT_2026-06.md),
> [AUDIT_QA_2026-06.md](audit/AUDIT_QA_2026-06.md)) and re-sequenced per the audit's
> own second-pass QA. Every load-bearing claim below was independently fact-checked
> against the code (see [Verification](#verification)).

## North star

RiffScore's biggest risk is **not** missing features — it is *advertised capabilities
that are broken, stubbed, or self-contradictory*, sitting on a model that can still be
silently corrupted by an edit or an API call. So "solid footing / delivers on its
promises" means one thing:

> **A defensible 1.0 where every advertised promise is either correct or honestly
> scoped, built on a model that no edit or API call can silently invalidate.**

The milestones below are ordered so each one leaves the project *more honest and more
solid* than the last. Correctness and truth-in-advertising come before new features.

---

## Where we are — already banked

The model substrate is solid. Shipped through **v1.0.0-alpha.12** (alpha.11 + the
release now on `dev` / PR 248):

- **Accidental model** — pitch (SPN) is the single source of truth; `note.accidental`
  is a derived mirror, reconciled at load (reference 234). A policy-only `accidentalDisplay`
  field (`'auto' | 'show' | 'hide' | 'courtesy'`) drives force/hide/courtesy display,
  orthogonal to pitch (reference 236). One shared resolver feeds the renderer **and** both
  exporters, so the canvas and the export can't drift (reference 234).
- **Mode-aware minor keys** — all 15 minor keys resolve correctly (was: every minor
  key silently wrong).
- **Key signatures** — alto/tenor key-sig glyphs sit on the right lines, derived from
  one clef-geometry source (reference 233, reference 235); enharmonic theoretical keys (D♭/G♭/C♭ minor)
  canonicalize to their representable twins instead of falling back to C (reference 238).
- **Clef geometry** — note positioning for treble/bass/alto/tenor derives from one
  `CLEF_REFERENCES` SSOT, forward and inverse, regression-tested (the audit's Phase 1D).
- **Meter-aware beaming** — 6/8, 9/8, 12/8 beam by the dotted beat; 3/8 beams whole-bar;
  4/4 unchanged (reference 241).
- **MusicXML/ABC export wins** — MusicXML `<alter>` from pitch, content-derived
  `<divisions>` (LCM of tuplet denominators), grand-staff as one `<part>` with
  `<staves>` + `<backup>`, pickup `implicit="yes"`, score-level `<fifths>`; ABC
  measure-local accidental cancellation (reference 240, reference 238, reference 234).
- **M3 export/engraving tail** *(Unreleased / pending release)* — MusicXML key `<mode>`,
  whole-measure rests for empty grand-staff staves, richer `<harmony>`/`<degree>` for
  extended/altered chords (export layer only — display/playback normalization stays open,
  cluster 7), stricter note-order/tuplet/rest structural validation, ABC pickup-bar meters
  and fractional-tuplet chord anchors, cross-measure key/stretch-aware tie layout, and
  mixed-value secondary/partial beams. *(The official MusicXML-4.0-XSD-in-CI gate is not
  delivered — see M3 below.)*
- **M4 page view hardening** *(Unreleased / pending release)* — Page View is committed,
  no longer cut/experimental: grand-staff multi-system engraving uses page-aware measure
  coordinates, cross-system ties split at wraps, chord editing resolves page/system X
  positions, lasso selection and playback cursor use page-local coordinates, empty scores
  still render a page shell, and print mode removes editor chrome/zoom transforms. The
  2026-09 QA pass then hardened it in PRs reference 298, reference 302, reference 303, reference 304: system headroom so chord
  tracks and hit areas never overlap neighbouring systems; the last page is never vertically
  justified; over-wide measures compress to fit; print restores the toolbar; grand staves stay
  synchronised in justified systems; page-layout widths equal rendered widths; the pointer maps
  through `staffScale` and viewport zoom; pages print at physical size on the paper palette;
  a 7.6mm default staff (`staffSize: 60`). **Known gaps:** no auto-scroll to the playback
  cursor/selection across pages; `api.play()`/`rewind()` do not drive the on-canvas cursor;
  printing from scroll view is not paginated (print from page view). Rendered QA evidence lives
  in [docs/audit/page-view-m4-2026-06-24/](audit/page-view-m4-2026-06-24/) (predates the
  2026-09 fixes).
- **Transpose lossless undo** — both transpose commands snapshot the pre-image and
  restore verbatim (contract C3).
- **Migration versioning** — `SCHEMA_VERSION` bumped to **2** so scores saved at v1
  re-run the new `migrateScore` steps (key canonicalization + `note.accidental`
  reconciliation) instead of being fast-pathed; the "bump when a migration step is
  added" contract is now honored (reference 234/reference 238).

---

## Milestones

### M1 — Truth-in-advertising · ✅ *shipped (v1.0.0-alpha.13)*

Make the README honest — partly by cheap fixes, partly by honest labeling. Highest
integrity-per-effort. **All items below landed on `dev`; M1's gate was met and
independently verified.**

- ✅ **`api.play()` chord parity** — routed through `scheduleScorePlayback` with the
  score + `DEFAULT_CHORD_PLAYBACK`, so the API plays the chord track like the UI's Play
  button. *(Carve-out from reference 242's `api-play-ignores-chords`.)*
- ✅ **Page View contradiction** — marked **Experimental** in the README and removed
  from the promise set until M4.
- ✅ **Alto/tenor `StaffTemplate`** — added `'alto' | 'tenor'` to `StaffTemplate`,
  `generateStaves`, and `reset()`; programmatic config now matches `setClef`. No
  rendering work (geometry was already correct and regression-tested).
- ✅ **Honest stub labeling** — `setChordDisplay`/`setChordPlayback` (reference 207), copy/paste
  (reference 36), and ABC/MusicXML import (reference 10/reference 11) are consistently labeled (stub / Coming Soon);
  the never-built grand→single *merge* JSDoc was corrected.
- ✅ **Coherence contract** — documented `getScore()` (synchronous/authoritative) vs
  `on('score')`/`on('selection')` (post-commit, may coalesce) on the API.
- ➕ **Batch event label** (found during M1 QA) — `commitTransaction(label)` now reaches
  `payload.label` (it was dropped by `ScoreEngine.commitBatch`), so the documented
  `on('batch')` examples actually work.
- ➕ **Docs quality pass** — corrected drift across API.md / DATA_MODEL.md /
  CONFIGURATION.md / COOKBOOK.md (method signatures, the `ChordSymbol` + tuplet shapes,
  the chord-progression recipe, the keyboard reference, dead links, section numbering).

**Done when:** no doc and no API `@status` makes a false claim. — ✅ **Met** (independently verified).

---

### M2 — Interactive correctness substrate · *large (the long pole)*

The model users actually edit and integrators actually drive. The audit's own QA
prioritizes this over deep export fidelity.

- ✅ **reference 239 Transpose spelling** *(shipped v1.0.0-alpha.14)* — `semitones → steps`
  rename; removed the `|steps|==12 → 7` octave coercion (coupled with the keyboard
  sending ±7); key-aware chromatic enharmonic policy via the shared, MIDI-preserving
  `spellPitchInKey` (in-key spelling wins, naturals preferred, out-of-key tie broken
  by direction — kills the `E♭→F♭→G𝄫…` explosion); added the key-aware spelling tests
  (incl. minor keys). Lossless undo (C3) unaffected.
- ✅ **reference 242 Structural invariants at the model boundary** *(shipped v1.0.0-alpha.15)* —
  capacity SSOT + measure/score validation, tie validity (`findTieTarget`), shift-left
  delete, tuplet-as-fixed-span container, selection repair + `loadScore` validation,
  chordTrack re-anchoring on add/delete (reflow re-anchor is orphan-drop only → **reference 255**),
  never-silent overflow, plus the interactive tuplet-editing UX (insert-between, keyboard
  step-through + ghost, blocked cursor) and reflow×tuplet integrity (**reference 256**). Shipped
  across parallel lanes (0/A/C/D/E/F/G) + two adversarial QA passes. The fail-fast vs
  fail-soft unification (reference 209) is partially advanced via the refusal registry.
  - **Mandatory dependency on reference 237 (guard, not full migration):** tuplet durations are
    non-integer on today's grid (eighth-triplet = 5.333…), and `getBreakdownOfQuants`
    silently drops the fractional remainder. Capacity math and note-position re-anchoring
    are therefore **unreliable for partial/in-progress tuplets**. reference 242 **must** ship a
    tuplet-completeness / integrality guard. The full reference 237 grid migration is the clean
    fix and stays deferred (see below).
- **reference 237 rhythm grid — tiling-invariant guard only.** Land the integrality guard (as
  part of reference 242) plus a tiling-invariant test now. **Defer** the full quant-base ×LCM
  migration (use ≥ `2·LCM(3,5,7)=210`, *not* 105) until tuplet-heavy editing is actually
  exercised and a concrete corruption bug is demonstrated.

**Done when:** no API call or edit can drive the model into an invalid/lossy state
silently; transpose preserves spelling; partial tuplets can't corrupt capacity/anchoring.

---

### M3 — Export & engraving fidelity · ✅ *done (Unreleased / pending release)*

With a trustworthy model, make what gets shared and printed match it exactly.

- ✅ **MusicXML tail** — note child-ordering remains parser-safe; tuplet durations sum to
  `divisions·beats`; reference 246 empty grand-staff staves emit `<rest measure="yes"/>`; minor
  keys emit `<mode>`; tuplet bracket notations are primary-note only; extended/altered
  chords (9/11/13, add/alter tones) map into richer `<harmony>` / `<degree>` output.
  *(Export layer only — the internal chord-symbol normalization and slash-bass voicing
  are still wrong on screen and in playback (cluster 7, LIVE). Slash `<bass>` **export**
  predates M3 and is unchanged here.)*
- ✅ **MusicXML structural validation** — representative real exporter output, **including a
  tuplet-containing score**, now runs through a deterministic Jest gate that checks staff
  duration streams, `<backup>` durations, note child order, tuplet notation placement, and
  full-measure rests. This catches the *musical-corruption* defect class (e.g. duration-sum
  errors an XSD would happily pass) better than a schema check.
- ⏳ **Official MusicXML 4.0 XSD validation in CI** — *still owed (audit Phase 2 gate, not
  delivered by M3).* The audit requires validating a representative export against the
  official XSD via `xmllint` in CI; the committed reduced `.xsd` fixture is documentation
  only and is wired to no test. The structural gate above substitutes for the corruption
  class but does **not** discharge this verification requirement.
- ✅ **ABC tail** — pickup bars emit their own temporary `[M:n/d]` meter and chord symbols
  on fractional tuplet positions are no longer dropped (shared chord-anchor quantizer).
  *(Quintuplet ratios and the final barline `|]` shipped earlier in alpha.16, not M3.)*
- ✅ **Beaming sub-grouping reference 245 (the no-dependency half)** — dotted-rhythm grouping and
  secondary/partial beam segments now render from layout data (for example 8th+16th+16th
  and dotted-8th+16th). *The tuplet-beaming half of reference 245 depends on reference 237 and remains
  deferred with it. Of the audit finding reference 9 siblings, mean-Y stem direction and the 45°
  `MAX_SLOPE` clamp were resolved in M4 (farthest-note direction, rise-capped slant, half-bar
  eighth groups in 4/4); beamed-over-rests stays LIVE.*
- ✅ **Tie layout key (reference 249)** — cross-measure tie endpoint X now uses the same key-aware
  measure layout as rendered noteheads, in both the unstretched and justified
  (stretch ≠ 1.0) paths, regression-tested at tie-X == notehead-X. *(Cross-SYSTEM tie arcs
  — reference 270 — are separate and still open: Tie.tsx's split-arc props stay unwired.)*

**Done when:** exports are internally consistent (durations sum, DTD child order,
tuplet/rest placement) under structural CI tests, tie endpoints match noteheads, and beams
render from layout data. — ✅ **Met** for the scoped M3 tail. Two verification items remain
explicitly open: the audit's official-MusicXML-4.0-XSD-in-CI gate (above), and true
export↔render *round-trip* agreement, which is untestable until an import path exists
(there is none today).

---

### M4 — Page View · hardened *(Unreleased / pending release; remaining gaps listed)*

Page View stays in the promise set. The hardening pass closes the defects that made it a
decision point:

- Page/system coordinate access is now used for measure origins, chord tracks, note hit
  testing, playback cursor placement, and system lookup.
- Grand-staff multi-system engraving keeps brackets, ties, chords, and notes inside the
  printable page bounds, including continuation tie arcs across wraps.
- Page-view editing covers note click/edit, chord inline edit, metadata inline edit, and
  lasso selection against page-local coordinates.

The 2026-09 QA pass found the first cut short of WYSIWYG and hardened it in PRs reference 298, reference 302,
reference 303, reference 304:

- Each system reserves vertical headroom for its ledger zone and chord band, so chord tracks and
  measure hit areas never overlap neighbouring systems; the last page is never vertically
  justified; an over-wide measure is compressed to fit rather than clipped by the page.
- Grand staves stay synchronised in justified systems; page-layout widths equal the rendered
  widths; the pointer maps through `staffScale` and viewport zoom.
- Print mode targets the current editor shell, hides toolbar/footer chrome (and restores the
  toolbar afterwards), removes zoom transforms, and prints pages at physical sheet size on the
  paper palette.
- The default staff is 7.6mm (`staffSize: 60`, the lead-sheet/vocal/piano standard).

**Known remaining gaps:**

- No auto-scroll to the playback cursor or the selection across pages.
- `api.play()` / `rewind()` do not drive the on-canvas cursor.
- Printing from scroll view is not paginated — print from page view.

**Done when:** page view is WYSIWYG-correct for grand-staff multi-system scores. — **Hardened**
(unit/visual regressions for each 2026-09 fix, plus the earlier rendered Playwright QA on a
4-page, 15-system grand-staff score — [audit note](audit/page-view-m4-2026-06-24/), which
predates those fixes); the gaps above remain open.

---

### M5 — Chord theory & remaining advertised config · *medium*

- **reference 207** — implement `setChordDisplay`/`setChordPlayback` (if not de-advertised in M1).
- **reference 247** — accidental display-policy toolbar control. The `accidentalDisplay` policy
  shipped **API-only** in alpha.12 (`setAccidentalDisplay`); this adds the UI affordance
  the changelog already scopes as "a toolbar button is coming."
- **Chord-symbol parsing completeness** (audit Phase 7) — extensions/alterations, slash
  voicings, secondary dominants, Roman half-diminished, minor-key diatonic quality;
  derive from structured Tonal output, not substring heuristics.

**→ M1–M5 is the 1.0 line:** every promise true or honestly scoped, on a correct model.

---

### M6 — Post-1.0 expansion · *after stable 1.0*

New capabilities, sequenced by demand: copy/paste (reference 36) (ABC import reference 10 and MusicXML import reference 11
shipped ahead of schedule — see [ABC_IMPORT.md](./ABC_IMPORT.md) and
[MUSICXML_IMPORT.md](./MUSICXML_IMPORT.md)),
dynamics (reference 20/reference 21), slurs (reference 19), lyrics (reference 30), repeats (reference 28), inline key/time changes
(reference 26/reference 27), multi-staff with per-staff instruments (reference 25), UMD build for non-React sites
(reference 194), marketing/demo page (reference 6).

---

## Critical path

```
M1 (truth) ✅  →  M2 (#239 ✅ → #242 ✅)  →  M3 (export/engraving) ✅  →  M4 (page view) ✅  →  M5
```

**M2 is shipped** (reference 239 in alpha.14, reference 242 in alpha.15) — it was the long pole. Its deferred
follow-ups **reference 261, reference 263, reference 264, reference 257 shipped in alpha.16** (close-the-loop). **M3 shipped in
alpha.17** (PR reference 295: export/engraving tail; reference 249 and reference 282 closed; reference 245/reference 246/reference 278 narrowed to their
post-M3 remainders), and **M4 shipped in alpha.17** (2026-09 QA pass → PRs reference 298–reference 307, then the
engraving pass reference 308–reference 320; remaining gaps listed under M4), alongside ABC and MusicXML import
(reference 10, reference 11). M5 (chord theory) is next.
Remaining M2/M3-adjacent follow-ups: reference 255 (chord reflow re-anchoring / pickup playback), the
capacity SSOT reference 254, full reference 237 quant migration, and full official MusicXML XSD CI.

## Cross-cutting — testing & CI (continuous, not a phase)

- **Visual / engraving regression harness (reference 252)** — a curated set of **native `Score`
  fixtures** rendered two ways. **Lane B (priority): real-browser pixel verification** —
  render to actual pixels via the `window.riffScore` seam and image-diff approved
  baselines (browser pinned, SMuFL font loaded, baselines approved in CI not locally);
  this is the lane that actually *shows* a score is correct (jsdom can't — no fonts/layout),
  and is the structured form of the long-planned thin Playwright geometry smoke. **Lane A
  (supporting, every commit): a fast jsdom geometry net** — a *hybrid* of structured-fact
  snapshots + targeted oracle assertions (the `RenderingDetailed.test.tsx` house style),
  in the existing CI with no new dependency; verified high-fidelity because layout is
  computed in JS (no DOM/font measurement). Deliberately **decoupled from import** (reference 10/reference 11),
  which gives a *semantic* oracle, not a visual baseline (a Lane-B *corpus amplifier*,
  never a prerequisite). **Runs parallel to M2.** · **Status:** ✅ shipped (v1.0.0-alpha.15) —
  Lane A (59-fixture fact snapshots + oracles) and the gallery are green in the normal
  suite; Lane B Playwright harness runs in CI against **committed linux baselines** (seeded
  via the "Visual regression (Lane B)" dispatch). Both lanes verified to catch a seeded
  regression. See [VISUAL_TESTING.md](VISUAL_TESTING.md).
- ✅ **MusicXML structural validation gate** — shipped with M3 in the normal Jest/CI path
  using `fast-xml-parser` plus semantic checks for duration/staff/backup/order/tuplet/rest
  invariants. Add the full official **MusicXML 4.0 XSD** bundle to CI as a follow-up
  hardening layer when the CI image/dependency choice is settled.
- Ongoing: unit-coverage (reference 17), E2E harness (reference 15), hit-detection test robustness
  (reference 211/reference 210), keep the theory/geometry oracles green.

## Key sequencing dependencies

| Item | Depends on | Note |
|---|---|---|
| reference 242 (invariants) | ✅ done (alpha.15) | Shipped with the reference 237 integrality guard inside it (capacity/anchoring math); full ×LCM migration still deferred. |
| reference 237 (full ×LCM migration) | — (`SCHEMA_VERSION` now at **2**) | Deferred until tuplet-heavy editing demonstrates a concrete bug. Use base ≥ 210, not 105; its migration bumps `SCHEMA_VERSION` to 3. |
| reference 245 dotted/secondary beams | ✅ done with M3 | No reference 237 dependency; mixed-value primary/secondary/partial segments now render from layout data. |
| reference 245 tuplet beaming | reference 237 | Beat-boundary `% beatQuants` is unreliable with non-integer tuplet quants; deferred with reference 237. |
| M4 cross-system ties | M2 (reference 242 tie model) | Page-view tie rendering needs the corrected tie model. |
| reference 239 (transpose) | ✅ done (alpha.14) | Key-aware spelling + steps rename + coercion removal shipped. |

## Mapping to the audit phases

The audit defined 7 phases; this roadmap **re-sequences** them per the audit QA's
recommendation (*"foundations → structural invariants + transpose → then deep export"*)
and folds in the promise-gaps:

- Audit **Phase 1** (foundations) — largely **banked** (1A/1B/1D done; 1C deferred to the
  reference 237 guard).
- Audit **Phase 3** (transpose) → **M2** (reference 239).
- Audit **Phase 4** (invariants) → **M2** (reference 242).
- Audit **Phase 2** (export) → **M3** — ✅ tail complete for the scoped exporter defects;
  official full-XSD CI remains hardening.
- Audit **Phase 5** (engraving) → **M3** — ✅ reference 245 non-tuplet half + reference 249 complete; tuplet
  beaming still follows reference 237.
- Audit **Phase 6** (page view) → **M4**.
- Audit **Phase 7** (chord theory) → **M5**.

---

## Verification

This roadmap's load-bearing claims were independently fact-checked against the code
(2026-06-04; **M1 status updated post-M1 on `dev`; M3 merged to `dev` 2026-06-24**). Confirmed: `SCHEMA_VERSION` is
stamped by `migrateScore` and was bumped to **2** in alpha.12 so v1 scores re-run the new
migration steps (reference 237 unblocked); the export wins above are all present (`<fifths>` is score-level, which
is correct for the single-key model); `api.play()` now plays the chord track via
`scheduleScorePlayback` and alto/tenor are in `StaffTemplate`/`reset()` (both M1,
shipped in alpha.13); `setChordDisplay`/`setChordPlayback` are stubs; transpose is now
key-aware with lossless undo (reference 239 shipped in alpha.14 — `spellPitchInKey`, octave
coercion removed); and the
tuplet-grid dependency for reference 242/reference 245 is real (partial-tuplet quants are non-integer and
`getBreakdownOfQuants` drops the remainder), making the integrality guard mandatory; and
M3's scoped export/engraving tail is covered by exporter, layout, visual-structure, and
MusicXML structural validation tests.
