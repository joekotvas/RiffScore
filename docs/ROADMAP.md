# RiffScore Roadmap

> **Generated:** 2026-06-13 · **Living document** · reflects state through **v1.0.0-alpha.16**: M1 (truth-in-advertising) shipped in **alpha.13**; M2's **#239 (transpose spelling)** shipped in **alpha.14**; M2's **#242 (interactive correctness / structural invariants)** and the **#252 visual-regression harness** shipped in **alpha.15**; M2's deferred follow-ups **#261/#263/#264/#257** + pre-release QA hardening shipped in **alpha.16** (which also re-scoped **#245**).
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
release now on `dev` / [PR #248](https://github.com/joekotvas/RiffScore/pull/248)):

- **Accidental model** — pitch (SPN) is the single source of truth; `note.accidental`
  is a derived mirror, reconciled at load (#234). A policy-only `accidentalDisplay`
  field (`'auto' | 'show' | 'hide' | 'courtesy'`) drives force/hide/courtesy display,
  orthogonal to pitch (#236). One shared resolver feeds the renderer **and** both
  exporters, so the canvas and the export can't drift (#234).
- **Mode-aware minor keys** — all 15 minor keys resolve correctly (was: every minor
  key silently wrong).
- **Key signatures** — alto/tenor key-sig glyphs sit on the right lines, derived from
  one clef-geometry source (#233, #235); enharmonic theoretical keys (D♭/G♭/C♭ minor)
  canonicalize to their representable twins instead of falling back to C (#238).
- **Clef geometry** — note positioning for treble/bass/alto/tenor derives from one
  `CLEF_REFERENCES` SSOT, forward and inverse, regression-tested (the audit's Phase 1D).
- **Meter-aware beaming** — 6/8, 9/8, 12/8 beam by the dotted beat; 3/8 beams whole-bar;
  4/4 unchanged (#241).
- **MusicXML/ABC export wins** — MusicXML `<alter>` from pitch, content-derived
  `<divisions>` (LCM of tuplet denominators), grand-staff as one `<part>` with
  `<staves>` + `<backup>`, pickup `implicit="yes"`, score-level `<fifths>`; ABC
  measure-local accidental cancellation (#240, #238, #234).
- **Transpose lossless undo** — both transpose commands snapshot the pre-image and
  restore verbatim (contract C3).
- **Migration versioning** — `SCHEMA_VERSION` bumped to **2** so scores saved at v1
  re-run the new `migrateScore` steps (key canonicalization + `note.accidental`
  reconciliation) instead of being fast-pathed; the "bump when a migration step is
  added" contract is now honored (#234/#238).

---

## Milestones

### M1 — Truth-in-advertising · ✅ *shipped (v1.0.0-alpha.13)*

Make the README honest — partly by cheap fixes, partly by honest labeling. Highest
integrity-per-effort. **All items below landed on `dev`; M1's gate was met and
independently verified.**

- ✅ **`api.play()` chord parity** — routed through `scheduleScorePlayback` with the
  score + `DEFAULT_CHORD_PLAYBACK`, so the API plays the chord track like the UI's Play
  button. *(Carve-out from #242's `api-play-ignores-chords`.)*
- ✅ **Page View contradiction** — marked **Experimental** in the README and removed
  from the promise set until M4.
- ✅ **Alto/tenor `StaffTemplate`** — added `'alto' | 'tenor'` to `StaffTemplate`,
  `generateStaves`, and `reset()`; programmatic config now matches `setClef`. No
  rendering work (geometry was already correct and regression-tested).
- ✅ **Honest stub labeling** — `setChordDisplay`/`setChordPlayback` (#207), copy/paste
  (#36), and ABC/MusicXML import (#10/#11) are consistently labeled (stub / Coming Soon);
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

- ✅ **#239 Transpose spelling** *(shipped v1.0.0-alpha.14)* — `semitones → steps`
  rename; removed the `|steps|==12 → 7` octave coercion (coupled with the keyboard
  sending ±7); key-aware chromatic enharmonic policy via the shared, MIDI-preserving
  `spellPitchInKey` (in-key spelling wins, naturals preferred, out-of-key tie broken
  by direction — kills the `E♭→F♭→G𝄫…` explosion); added the key-aware spelling tests
  (incl. minor keys). Lossless undo (C3) unaffected.
- ✅ **#242 Structural invariants at the model boundary** *(shipped v1.0.0-alpha.15)* —
  capacity SSOT + measure/score validation, tie validity (`findTieTarget`), shift-left
  delete, tuplet-as-fixed-span container, selection repair + `loadScore` validation,
  chordTrack re-anchoring on add/delete (reflow re-anchor is orphan-drop only → **#255**),
  never-silent overflow, plus the interactive tuplet-editing UX (insert-between, keyboard
  step-through + ghost, blocked cursor) and reflow×tuplet integrity (**#256**). Shipped
  across parallel lanes (0/A/C/D/E/F/G) + two adversarial QA passes. The fail-fast vs
  fail-soft unification (#209) is partially advanced via the refusal registry.
  - **Mandatory dependency on #237 (guard, not full migration):** tuplet durations are
    non-integer on today's grid (eighth-triplet = 5.333…), and `getBreakdownOfQuants`
    silently drops the fractional remainder. Capacity math and note-position re-anchoring
    are therefore **unreliable for partial/in-progress tuplets**. #242 **must** ship a
    tuplet-completeness / integrality guard. The full #237 grid migration is the clean
    fix and stays deferred (see below).
- **#237 rhythm grid — tiling-invariant guard only.** Land the integrality guard (as
  part of #242) plus a tiling-invariant test now. **Defer** the full quant-base ×LCM
  migration (use ≥ `2·LCM(3,5,7)=210`, *not* 105) until tuplet-heavy editing is actually
  exercised and a concrete corruption bug is demonstrated.

**Done when:** no API call or edit can drive the model into an invalid/lossy state
silently; transpose preserves spelling; partial tuplets can't corrupt capacity/anchoring.

---

### M3 — Export & engraving fidelity · *medium*

With a trustworthy model, make what gets shared and printed match it exactly.

- **MusicXML tail** — `<tie>`/`<dot>` DTD child-ordering (strict parsers like Finale
  reject the current order); tuplet `<duration>` sums to `divisions·beats`; #246
  (empty grand-staff staff emits a whole-measure rest; **MusicXML 4.0 XSD validation in
  CI**); #216 slash-chord `<harmony>`.
- **ABC tail** — quintuplet ratio, final barline `|]`, and the export test coverage the
  audit found missing.
- **Beaming sub-grouping #245 (the no-dependency half)** — dotted-rhythm grouping and
  secondary/partial beams (16th-within-8th). *The tuplet-beaming half of #245 depends on
  #237 and is deferred with it.*
- **Tie layout key (#249)** — cross-measure tie endpoint X is computed with the default
  key `'C'` (`Staff.tsx`), so tie ends can diverge slightly from noteheads in non-C keys.
  One-line fix (thread the score key); parallels the #245 `useMeasureLayout` gap.

**Done when:** a representative export validates against the MusicXML 4.0 XSD in CI;
round-trips are pinned; ABC/MusicXML are musically identical to the render.

---

### M4 — Page View: commit or cut · *medium-large (decision point)*

Either make it a real feature or leave it experimental and out of the promise set.

- If committing: #229 (grand-staff brace off-canvas on non-first systems), #231 (chord X
  uses scroll coordinates on wrapped systems), #232 (lasso select is a no-op), plus the
  print-zoom / over-wide-compression / page-aware-cursor defects — built on a unified
  page/system coordinate accessor (#204). Depends on M2's tie model for cross-system ties.

**Done when:** page view is WYSIWYG-correct for grand-staff multi-system scores, **or**
stays clearly labeled experimental and outside the promise set.

---

### M5 — Chord theory & remaining advertised config · *medium*

- **#207** — implement `setChordDisplay`/`setChordPlayback` (if not de-advertised in M1).
- **#247** — accidental display-policy toolbar control. The `accidentalDisplay` policy
  shipped **API-only** in alpha.12 (`setAccidentalDisplay`); this adds the UI affordance
  the changelog already scopes as "a toolbar button is coming."
- **Chord-symbol parsing completeness** (audit Phase 7) — extensions/alterations, slash
  voicings, secondary dominants, Roman half-diminished, minor-key diatonic quality;
  derive from structured Tonal output, not substring heuristics.

**→ M1–M5 is the 1.0 line:** every promise true or honestly scoped, on a correct model.

---

### M6 — Post-1.0 expansion · *after stable 1.0*

New capabilities, sequenced by demand: ABC/MusicXML import (#10/#11), copy/paste (#36),
dynamics (#20/#21), slurs (#19), lyrics (#30), repeats (#28), inline key/time changes
(#26/#27), multi-staff with per-staff instruments (#25), UMD build for non-React sites
(#194), marketing/demo page (#6).

---

## Critical path

```
M1 (truth) ✅  →  M2 (#239 ✅ → #242 ✅)  →  M3 (export/engraving)  →  (M4 decision)  →  M5
```

**M2 is shipped** (#239 in alpha.14, #242 in alpha.15) — it was the long pole. Its deferred
follow-ups **#261, #263, #264, #257 shipped in alpha.16** (close-the-loop), which also re-scoped
**#245** (tuplet rendering verified). **M3 (export/engraving) is next.** M4 (page view) and M5 (chord
theory) are largely independent of each other and can run in parallel. Remaining M2-adjacent
follow-ups: #255 (chord reflow re-anchoring / pickup playback), the capacity SSOT #254, and the
partials #246/#237 — plus QA-pass items #268–#272.

## Cross-cutting — testing & CI (continuous, not a phase)

- **Visual / engraving regression harness (#252)** — a curated set of **native `Score`
  fixtures** rendered two ways. **Lane B (priority): real-browser pixel verification** —
  render to actual pixels via the `window.riffScore` seam and image-diff approved
  baselines (browser pinned, SMuFL font loaded, baselines approved in CI not locally);
  this is the lane that actually *shows* a score is correct (jsdom can't — no fonts/layout),
  and is the structured form of the long-planned thin Playwright geometry smoke. **Lane A
  (supporting, every commit): a fast jsdom geometry net** — a *hybrid* of structured-fact
  snapshots + targeted oracle assertions (the `RenderingDetailed.test.tsx` house style),
  in the existing CI with no new dependency; verified high-fidelity because layout is
  computed in JS (no DOM/font measurement). Deliberately **decoupled from import** (#10/#11),
  which gives a *semantic* oracle, not a visual baseline (a Lane-B *corpus amplifier*,
  never a prerequisite). **Runs parallel to M2.** · **Status:** ✅ shipped (v1.0.0-alpha.15) —
  Lane A (59-fixture fact snapshots + oracles) and the gallery are green in the normal
  suite; Lane B Playwright harness runs in CI against **committed linux baselines** (seeded
  via the "Visual regression (Lane B)" dispatch). Both lanes verified to catch a seeded
  regression. See [VISUAL_TESTING.md](VISUAL_TESTING.md).
- Add **MusicXML 4.0 XSD validation** to CI (with M3 / #246).
- Ongoing: unit-coverage (#17), E2E harness (#15), hit-detection test robustness
  (#211/#210), keep the theory/geometry oracles green.

## Key sequencing dependencies

| Item | Depends on | Note |
|---|---|---|
| #242 (invariants) | ✅ done (alpha.15) | Shipped with the #237 integrality guard inside it (capacity/anchoring math); full ×LCM migration still deferred. |
| #237 (full ×LCM migration) | — (`SCHEMA_VERSION` now at **2**) | Deferred until tuplet-heavy editing demonstrates a concrete bug. Use base ≥ 210, not 105; its migration bumps `SCHEMA_VERSION` to 3. |
| #245 dotted/secondary beams | — | No #237 dependency; lands in M3. |
| #245 tuplet beaming | #237 | Beat-boundary `% beatQuants` is unreliable with non-integer tuplet quants; deferred with #237. |
| M4 cross-system ties | M2 (#242 tie model) | Page-view tie rendering needs the corrected tie model. |
| #239 (transpose) | ✅ done (alpha.14) | Key-aware spelling + steps rename + coercion removal shipped. |

## Mapping to the audit phases

The audit defined 7 phases; this roadmap **re-sequences** them per the audit QA's
recommendation (*"foundations → structural invariants + transpose → then deep export"*)
and folds in the promise-gaps:

- Audit **Phase 1** (foundations) — largely **banked** (1A/1B/1D done; 1C deferred to the
  #237 guard).
- Audit **Phase 3** (transpose) → **M2** (#239).
- Audit **Phase 4** (invariants) → **M2** (#242).
- Audit **Phase 2** (export) → **M3** — *de-prioritized* because its high-impact items
  already shipped; only the tail remains.
- Audit **Phase 5** (engraving) → **M3** (#245 non-tuplet half) + banked beaming.
- Audit **Phase 6** (page view) → **M4**.
- Audit **Phase 7** (chord theory) → **M5**.

---

## Verification

This roadmap's load-bearing claims were independently fact-checked against the code
(2026-06-04; **M1 status updated post-M1 on `dev`**). Confirmed: `SCHEMA_VERSION` is
stamped by `migrateScore` and was bumped to **2** in alpha.12 so v1 scores re-run the new
migration steps (#237 unblocked); the export wins above are all present (`<fifths>` is score-level, which
is correct for the single-key model); `api.play()` now plays the chord track via
`scheduleScorePlayback` and alto/tenor are in `StaffTemplate`/`reset()` (both M1,
shipped in alpha.13); `setChordDisplay`/`setChordPlayback` are stubs; transpose is now
key-aware with lossless undo (#239 shipped in alpha.14 — `spellPitchInKey`, octave
coercion removed); and the
tuplet-grid dependency for #242/#245 is real (partial-tuplet quants are non-integer and
`getBreakdownOfQuants` drops the remainder), making the integrality guard mandatory.
