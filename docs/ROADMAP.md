# RiffScore Roadmap

> **Generated:** 2026-06-04 · **Living document.**
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

The model substrate is started. Shipped (alpha.11 + current `dev`):

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

---

## Milestones

### M1 — Truth-in-advertising · *small (days)*

Make the README honest immediately — partly by cheap fixes, partly by honest labeling.
Highest integrity-per-effort.

- **`api.play()` chord parity** — wire it through `scheduleScorePlayback` instead of the
  melody-only `scheduleTonePlayback`. The chord-scheduling machinery already exists and
  is used by the UI; this is a localized scheduler swap. Restores an advertised promise.
  *(Carve-out from #242's `api-play-ignores-chords`.)*
- **Page View contradiction** — it is listed as both *Feature* and *Coming Soon* and is
  mid-branch (`feature/issue-174`) with confirmed defects → mark **experimental/beta**
  and remove it from the "promises" set until M4.
- **Alto/tenor `StaffTemplate`** — note geometry and key sigs are already correct and
  regression-tested; the *only* gap is that `StaffTemplate` (programmatic config /
  `reset()`) excludes alto/tenor while `setClef`/the clef menu include them. Decide:
  add them to `StaffTemplate` (small) **or** document the asymmetry. No rendering work.
- **Honest stub labeling** — `setChordDisplay`/`setChordPlayback` (#207), copy/paste
  (#36), ABC/MusicXML import (#10/#11), and the never-built grand→single *merge* are
  all advertised as present or imminent. Label them "Coming Soon" consistently (or
  implement the cheap ones).
- **Document** the `on('score')`/`on('selection')` vs `getScore()` coherence contract
  (async event vs synchronous read).

**Done when:** no doc and no API `@status` makes a false claim.

---

### M2 — Interactive correctness substrate · *large (the long pole)*

The model users actually edit and integrators actually drive. The audit's own QA
prioritizes this over deep export fidelity.

- **#239 Transpose spelling** — `semitones → steps` rename; remove the `|steps|==12 → 7`
  octave coercion; key-aware chromatic enharmonic policy (kill the `Ebb`/`Gbbb`
  explosion); add the missing key-aware **spelling tests**. *Diatonic spelling is
  already partly key-aware (`movePitchVisual` snaps via `applyKeySignature`) but
  untested.* Self-contained, half-done, high value — **start here.**
- **#242 Structural invariants at the model boundary** — capacity validation, tie
  validity, selection repair on staff removal, chordTrack re-anchoring on
  add/delete/reflow, `loadScore` validation; resolve the fail-fast vs fail-soft
  contradiction (#209). **The architectural backbone.** Large enough to warrant its own
  planning pass (likely parallel lanes) before coding.
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
M1 (truth)  →  M2 (#239 → #242)  →  M3 (export/engraving)  →  (M4 decision)  →  M5
```

**M2 is the long pole.** Start with **#239** (clean, self-contained, half-done), then give
**#242 a dedicated planning pass** before touching it. M4 (page view) and M5 (chord
theory) are largely independent of each other once M2 lands and can run in parallel.

## Cross-cutting — testing & CI (continuous, not a phase)

- Pull a **thin real-browser geometry smoke** (Playwright) in early — the seam
  (`window.riffScore`) exists, and it catches the rendered-geometry regressions unit
  tests miss across M2–M4.
- Add **MusicXML 4.0 XSD validation** to CI (with M3 / #246).
- Ongoing: unit-coverage (#17), E2E harness (#15), hit-detection test robustness
  (#211/#210), keep the theory/geometry oracles green.

## Key sequencing dependencies

| Item | Depends on | Note |
|---|---|---|
| #242 (invariants) | #237 *guard* (not full migration) | Tuplet capacity/anchoring math needs the integrality guard; ship it inside #242. |
| #237 (full ×LCM migration) | — (schemaVersion ✅ shipped) | Deferred until tuplet-heavy editing demonstrates a concrete bug. Use base ≥ 210, not 105. |
| #245 dotted/secondary beams | — | No #237 dependency; lands in M3. |
| #245 tuplet beaming | #237 | Beat-boundary `% beatQuants` is unreliable with non-integer tuplet quants; deferred with #237. |
| M4 cross-system ties | M2 (#242 tie model) | Page-view tie rendering needs the corrected tie model. |
| #239 (transpose) | — | Lossless undo already done; residual is spelling/units. |

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
(2026-06-04). Confirmed: `schemaVersion` is shipped and stamped by `migrateScore`
(#237 unblocked); the export wins above are all present (`<fifths>` is score-level, which
is correct for the single-key model); `api.play()` is melody-only and the fix is a
localized scheduler swap; alto/tenor note geometry is correct and regression-tested (only
the `StaffTemplate` gap remains); `setChordDisplay`/`setChordPlayback` are stubs; transpose
lossless undo is done while the rename/coercion/spelling-test work remains; and the
tuplet-grid dependency for #242/#245 is real (partial-tuplet quants are non-integer and
`getBreakdownOfQuants` drops the remainder), making the integrality guard mandatory.
