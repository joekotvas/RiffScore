# Parallel Implementation Plan — Foundational Correctness & Verification

> **Generated:** 2026-06-03 · **Status:** Approved for execution (Phase 1) · **Contracts revised after deep review (C1–C4).**
> **Companion docs:** [CORRECTNESS_AUDIT_2026-06.md](./CORRECTNESS_AUDIT_2026-06.md) · [VERIFICATION_STRATEGY_2026-06.md](./VERIFICATION_STRATEGY_2026-06.md) · [AUDIT_QA_2026-06.md](./AUDIT_QA_2026-06.md)
>
> **Goal:** Execute the foundational correctness fixes + verification scaffolding as **7 file-disjoint lanes running in parallel** (worktree-isolated), with a conflict-free merge and an integration gate before the next wave.

---

## Approved decisions

1. **Defer the full quant-base grid migration.** `getNoteDuration` has a **26-file blast radius**; rescaling the quant base now would ripple into exporters, playback, navigation, and all of layout. Foundation 1C is therefore scoped to the *local* fixes (`migrateChordTrack` accumulation + `schemaVersion` + a tiling-invariant test). The deep migration is a separate later wave. *(Confirms AUDIT_QA override.)*
2. **Pitch is the single source of truth for alteration; `accidentalDisplay` is DEFERRED.** *(Revised after contract review.)* `note.pitch` (absolute SPN, e.g. `'F#4'`) is authoritative for sounding pitch **and** enharmonic spelling; alteration is derived from pitch via Tonal (`Note.get(pitch).alt`). Phase 1 does **not** introduce an `accidentalDisplay` field and does **not** remove the legacy `accidental` field — `accidental` is reclassified as a **derived mirror** of pitch (computed, never authored), kept populated so existing readers keep working. A display-policy field (`'auto' | 'show' | 'hide' | 'courtesy'`, **policy-only — never glyph names**) is designed in a later wave when courtesy/hide features are actually built. *Rationale: the originally-proposed enum mixed glyph selection (derivable from pitch) with display policy, which would let the field contradict the pitch and bake that contradiction into the persisted schema.*
3. **7 lanes in Phase 1** (Transpose included).

---

## Why this parallelizes (the conflict reality)

Two files were the natural convergence points of the theory foundations:

- **`engines/layout/measure.ts`** — its `getEventMetrics` imports `getNoteDuration` (rhythm/1C), `getNoteWidth` + `getOffsetForPitch` (clef/1D), **and** reads `n.accidental` for spacing (1A).
- **`types.ts`** — holds both the `accidental` field (1A) and the migration code (1C).

The approved decisions dissolve these collisions:
- Deferring the quant rescale means **1C no longer touches `measure.ts` or `core.ts`** → `measure.ts` is single-owned by **Theory**.
- Pitch-as-truth + `accidental`-as-derived-mirror means **no new field is added** → Model edits `types.ts` only for `schemaVersion`, and Theory never edits `types.ts`. The old Model→Theory field-shape contract dissolves entirely.
- The clef rework (1D) keeps the **`getOffsetForPitch(pitch, clef)` / `getPitchForOffset(offset, clef)` signatures stable** (verified consumers below), so it stays inside `positioning.ts` and doesn't ripple.

Result: every Phase-1 source file is owned by exactly one lane.

---

## Phase 1 — seven file-disjoint lanes (parallel)

| # | Lane | Scope | **Exclusively-owned files** |
|---|---|---|---|
| 1 | **Theory** (1A + 1B) | Absolute pitch = single source of truth for accidentals; `setAccidental`/`toggleAccidental` recompute pitch; entry folds the active accidental into pitch; render glyph + spacing derive from pitch + key + measure-local context; `accidental` kept as a derived mirror; mode-aware minor keys via a shared resolver | `services/MusicService.ts`, `utils/accidentalContext.ts`, `hooks/editor/useAccidentalContext.ts`, `hooks/editor/useModifiers.ts`, `hooks/api/modification.ts`, `commands/UpdateNoteCommand.ts`, `components/Canvas/Note.tsx`, `engines/layout/measure.ts`, `services/chord/utils.ts`, **`utils/keyResolution.ts` (new)**, `commands/SetKeySignatureCommand.ts`, `utils/entry/pitchResolver.ts`, `components/Canvas/ChordGroup.tsx`, **`hooks/audio/useMIDI.ts`**, **`hooks/note/useNoteEntry.ts`** *(last two absorbed per C4)* |
| 2 | **Geometry** (1D) | One `CLEF_REFERENCES`-derived pitch↔offset formula + its inverse for hit-testing; delete the treble/bass lookup tables + contradictory `CLEF_REFERENCE` (`tenor` offset is wrong); clef-glyph Y from the same reference | `engines/layout/positioning.ts`, `components/Canvas/ScoreHeader.tsx`, `components/Assets/ClefIcon.tsx`, `utils/clef.ts` |
| 3 | **Model** (1C, re-scoped) | `migrateChordTrack` accumulation (not modulo); add `schemaVersion` + `SCHEMA_VERSION`; tiling-invariant guard. **No `accidentalDisplay`; do not remove `accidental`.** | `types.ts`, `services/chord/ChordQuants.ts` |
| 4 | **Export** | MusicXML emit `<alter>` from `Note.get(pitch).alt` (always; sounding alteration) + keep contextual `<accidental>` glyph; per-score `<divisions>` = LCM of tuplet denominators (integer durations) + `<time-modification>`/`<normal-type>`; ABC measure-local accidental cancellation + `Q:` before `K:` | `exporters/musicXmlExporter.ts`, `exporters/abcExporter.ts` |
| 5 | **API** (#230) | Synchronous layout/metadata getters read the **live engine** (like `getScore`) so chained `set…().get…()` is not stale | `hooks/api/layout.ts`, `hooks/api/metadata.ts`, `hooks/api/useScoreAPI.ts` |
| 6 | **Verify-infra** | Add `fast-check`, `fast-xml-parser`, `abcjs`, MusicXML XSD fixture; build the SVG geometry-extraction helper + SMuFL codepoint registry; property-test harness; CI workflow | `package.json`, **new:** `__tests__/property/*`, `__tests__/helpers/geometry.ts`, `__tests__/glyphs/*`, `__tests__/fixtures/*`, `.github/workflows/*` |
| 7 | **Transpose** (undo-snapshot only) | Capture a full pre-image snapshot on `execute()`, restore verbatim on `undo()` (lossless, forward-compatible); **do not** change spelling logic or the `|steps|==12→7` coercion (deferred) | `commands/TransposeSelectionCommand.ts`, `commands/ChromaticTransposeCommand.ts` |

### Coordination contracts (the only cross-lane couplings)

- **C1 — Pitch is the sole source of truth for sounding pitch + spelling.** Alteration is read from `note.pitch` via Tonal (`Note.get(pitch).alt`). No code reads `note.accidental` as authoritative. Phase 1 does **not** introduce `accidentalDisplay` and does **not** remove `accidental` — the field is a **derived mirror** of pitch, kept populated by the write sites (set/toggle accidental, note entry) via a single Theory-owned derivation helper, so existing readers keep working. Any future display-policy field is **policy-only** (`'auto' | 'show' | 'hide' | 'courtesy'`), never glyph names; designed in a later wave. *Shared principle (Theory + Export both derive from pitch independently); no runtime coupling — consistency verified by the Phase-2 round-trip oracle.*
- **C2 — clef accessor signatures + module surface** (Geometry → consumers): Geometry **must preserve** `getOffsetForPitch(pitch, clef)` and `getPitchForOffset(offset, clef)` signatures (only internals/return values change) and **must leave** the other positioning exports untouched (`getNoteWidth`, `calculateSystemPreamble`, `calculateChordLayout`, `getStemOffset`). The lookup tables + `getPitchToOffset`/`getYToPitch` are **Geometry-internal** (verified: no external importers) and may be deleted. Clef domain = `{treble, bass, alto, tenor}`; `grand` is resolved per-staff upstream, octave-displaced clefs are deferred. Consumers (`Note.tsx`, `Staff.tsx`, `scoreLayout.ts`, `tuplets.ts`, `measure.ts`, `beaming.ts`, `system.ts`, `useMeasureInteraction.ts`) are not edited for the offset change. `getPitchForOffset` returns the **diatonic (natural)** pitch at the line/space.
- **C3 — Transpose lossless undo (internal).** Each `execute()` deep-clones the pre-image of every mutated note (keyed by stable id); `undo()` restores the pre-images **verbatim**. Do **not** implement undo as inverse re-transposition (current code does — it corrupts at range-clamp boundaries and drifts enharmonically). Refresh the snapshot on every `execute()` (redo). No constructor-signature or call-site changes; the deeper spelling fixes are deferred.
- **C4 — `accidental` touch-point reconciliation.** The entry/MIDI **write** sites — [useMIDI.ts:82](../../src/hooks/audio/useMIDI.ts#L82), [useNoteEntry.ts:357-378](../../src/hooks/note/useNoteEntry.ts#L357) — are owned by **Theory**: entry folds the active accidental into the *pitch*, then the mirror is derived. The **read** sites — [useToolsSync.ts:58](../../src/hooks/score/useToolsSync.ts#L58), [system.ts:74](../../src/engines/layout/system.ts#L74) — stay valid via the derived mirror and are **not edited** by any lane (verified working as long as the mirror is populated); they are reconciled at the gate if the mirror is insufficient.

### Test ownership (prevents test-file conflicts)
- Each lane owns the tests for **its own** source files and adds **new** lane-specific test files (e.g. Theory → `MusicService.minorKeys.test.ts`; Geometry → `clefGeometry.roundtrip.test.ts`).
- **Cross-lane existing test files — `layoutEngine.test.ts` and `scoreLayout.test.ts`** (which assert both positioning [Geometry] and measure [Theory]) are **frozen** in Phase 1: no lane edits them. Any breakage from the merged changes is reconciled at the **integration gate**, not inside a lane.
- **Verify-infra** repairs only flawed tests **no active lane touches** (e.g. `RenderingDetailed.test.tsx`). The exporter and theory test repairs belong to their owning lanes (Export / Theory).

### Execution mechanism
- Each lane runs in its **own git worktree** (`isolation: 'worktree'`), commits its work to a branch `lane/<key>`, and returns a structured manifest (branch, files changed, tests added, typecheck/test status, deviations).
- **Integration gate** (after all 7 land, performed in the main session): merge the lane branches (disjoint files ⇒ mechanically conflict-free), `npm install` (Verify-infra changed `package.json`), then run `npm run typecheck && npm run lint && npm test && npm run build` on the union. Resolve any *semantic* integration issues (e.g. a frozen cross-lane test whose expected geometry shifted because Geometry corrected the offsets). Only a green union advances to Phase 2.

---

## Phase 2 — integration oracles & cross-cutting verification (parallel, after the gate)

These combine ≥2 Phase-1 lanes, so they wait for the merge — then fan out again as parallel verification agents (mostly **new test files**, low conflict):

- **Minor-key end-to-end oracle:** render suppresses the diatonic accidental + entry snaps to key (Theory) → MusicXML round-trip carries `<alter>` (Export).
- **Rhythm/export integrity:** XSD-validate + `Σ<duration> == divisions × beats` across **triplet and quintuplet** (Export + Model).
- **ABC fidelity:** re-parse via `abcjs`, compare the reconstructed note sequence.
- **Transpose:** Tonal-oracle spelling + lossless-undo property (Transpose + Theory).
- **Accidental unification:** unify the measure-local glyph logic duplicated between Theory (render) and Export (`<accidental>`/ABC) into one resolver (deferred from Phase 1).
- **Mutation baseline:** StrykerJS on `engines/layout`, `core.ts`, `exporters`, `accidentalContext.ts`; wire CI gating from the Verify-infra workflow.

---

## Explicitly deferred (NOT in this batch — tracked)

| Item | Why deferred |
|---|---|
| Full quant-base grid migration (×LCM) | 26-file blast radius; latent for normal UI; needs its own wave |
| `accidentalDisplay` display-policy field | Not required by Phase-1 correctness; design policy-only when courtesy/hide ship (Decision 2) |
| Removal of the legacy `accidental` field | Has live readers in unowned files; remove in a dedicated wave with its own blast-radius pass |
| Page-view fixes **#229 / #231 / #232** | Audit Phase 6; conflict with layout hot files; not "foundational" |
| Compound-meter beaming (6/8) | Audit Phase 5 |
| Chord-symbol theory (structured Tonal) | Audit Phase 7 |
| Model-boundary structural invariants (capacity, tie validity, selection repair) | Audit Phase 4; partially overlaps Theory/Model — follow-up wave |
| Transpose: spelling-with-key, `semitones→steps` rename, `|steps|==12→7` removal | Couples to `modification.ts` / `MusicService.ts`; only the undo mechanism changes now (C3) |

---

## QA Review of this plan

> Applying the project's own "well-shaped but possibly flawed" skepticism to **this plan**, verified against the real import graph (`grep` of `getNoteDuration`, `getOffsetForPitch`, `getNoteWidth`, `.accidental`, command imports, positioning exports, test references).

### Disjointness proof (Phase 1)
Pairwise file-intersection of all 7 lanes = ∅. Hotspots individually cleared:
- `measure.ts` → **Theory only** (1C deferral removes its `getNoteDuration` edit; C2 keeps Geometry out). ✓
- `types.ts` → **Model only** (no new field; Theory codes against pitch + existing types). ✓
- `MusicService.ts`, `accidentalContext.ts` → **Theory only** (1A+1B combined in one lane). ✓
- `positioning.ts` → **Geometry only**; signatures frozen (C2); tables verified to have **no external importers** → safe to delete. ✓
- `core.ts` → **owned by no lane** (1C deferred); Export reads it unchanged. ✓
- `package.json` → **Verify-infra only**. ✓
- `useMIDI.ts` / `useNoteEntry.ts` → **Theory only** (C4); verified in no other lane. ✓
- `system.ts` / `useToolsSync.ts` → **edited by no lane** (work via the derived mirror); `system.ts` is a positioning consumer but is not edited for the offset change. ✓

### Corrections made during contract review (vs. the first draft)
1. **Deferred `accidentalDisplay`.** The proposed enum conflated glyph selection (derivable from pitch) with display policy; shipping it would have locked a contradiction into the persisted schema. Phase 1 instead makes pitch authoritative and keeps `accidental` as a derived mirror; a policy-only field comes later.
2. **Closed the `accidental` coverage gap (C4).** The field is read/written in 4 files outside Theory's original list (`useMIDI`, `useNoteEntry`, `useToolsSync`, `system.ts`); the write sites are now Theory-owned, the read sites kept working via the mirror — none would silently break.
3. **Tightened C3** to a full pre-image snapshot. Current `undo()` re-transposes inversely, which **corrupts** notes that no-op at the piano-range boundary and drifts enharmonically.
4. **Tightened C2** to freeze the whole positioning module surface (not just the two accessors) and pin the clef domain.
5. **Transpose lane narrowed to undo-snapshot only** (first-draft correction retained): the commands are imported by `modification.ts` (Theory) and `useNavigation.ts` and import `MusicService`; deeper fixes are deferred (C3).
6. **Frozen-cross-lane-test rule** for `layoutEngine.test.ts` / `scoreLayout.test.ts` (retained).

### Residual risks (accepted, mitigated at the gate)
- **Semantic (not file) coupling:** Geometry's corrected clef-offset *values* and Theory's accidental-spacing both feed rendered geometry; the integration gate's full test run catches drift, and the frozen cross-lane tests are reconciled there. C2 keeps the *interface* stable so compilation never breaks across lanes.
- **Export ↔ Theory accidental logic duplication:** in Phase 1, Export implements its own measure-local accidental glyph logic rather than depending on Theory's in-flight resolver; `<alter>` (sounding) comes straight from pitch, so the duplication is confined to the *visible glyph*. Unification is a Phase-2 refactor (flagged, not blocking).

**Verdict:** the 7-lane partition is conflict-free for parallel execution given decisions 1–2 and contracts C1–C4. Cleared to launch as worktree-isolated agents with the integration gate.
