# [RFC] Bundle & Runtime Performance Audit
**Audio Decoupling, Asset Loading, and Playback Render Isolation**

## 1. Context & Motivation

RiffScore combines notation rendering (SMuFL / Bravura) with music theory and audio playback (Tonal.js, Tone.js) to provide an interactive sheet-music editor for React.

As the library evolves, it is important to ensure that:

1.  Consumers can embed RiffScore for **visual-only use cases** (read-only scores, previews, educational content) without paying unnecessary bundle or runtime costs.
2.  Playback behavior scales predictably as score complexity increases.

This RFC proposes a measurement-driven audit of bundle composition, asset delivery, and playback render behavior, followed by an optimization strategy based on findings. No refactors are implied by default.

---

## 2. Audit Hypotheses & Objectives

### A. Bundle Architecture: Optional Audio Capability

**Hypothesis**: Tone.js (audio synthesis / playback) may be reachable from the default import graph (`import { RiffScore } from 'riffscore'`), potentially increasing baseline bundle size even when playback is unused.

**Audit Tasks**:
- [ ] Trace all module paths that reference Tone.js or audio helpers.
- [ ] Determine whether Tone.js is included in the base consumer bundle.
- [ ] Identify whether audio logic is imported eagerly or only invoked at runtime.

**Design Objective**: Consumers using RiffScore purely for notation display should not download or parse an audio engine.

**Candidate Strategies (Post-Audit)**:
- Lazy loading via `import('tone')` when playback is invoked.
- Explicit audio adapter or sub-entry (`riffscore/audio`).
- Peer dependency evaluation (only if ergonomics remain acceptable).

### B. Asset Delivery: Bravura / SMuFL Fonts

**Hypothesis**: Bravura (SMuFL) font assets may be delivered in a way that impacts first paint or JavaScript parse time, depending on whether they are bundled, inlined, or externally loaded.

**Audit Tasks**:
- [ ] Verify whether the font is base64-encoded into JS or emitted as a separate asset.
- [ ] Measure font loading behavior relative to first notation render.
- [ ] Confirm fallback behavior before font availability.

**Design Objective**: Font loading should be non-blocking, externally delivered, and not delay first contentful paint.

### C. Tree-Shaking Validation: Tonal.js and Internal Modules

**Hypothesis**: Tree-shaking effectiveness depends on import discipline (named / sub-module imports) and export structure; unused theory modules may be retained unintentionally.

**Audit Tasks**:
- [ ] Review Tonal.js import patterns for sub-module usage.
- [ ] Validate consumer bundle output to confirm unused modules are eliminated.
- [ ] Inspect internal barrel exports for tree-shaking leakage.

**Design Objective**: Consumers should only pay for the theory primitives they actually use.

---

## 3. Runtime Performance: Playback & Rendering

### A. Playback Cursor Render Isolation

**Hypothesis**: Playback cursor updates may trigger React re-renders beyond the minimal necessary subtree, potentially impacting performance on larger scores.

**Audit Tasks**:
- [ ] Profile React renders during playback using the React Profiler.
- [ ] Identify which components re-render per cursor tick.
- [ ] Determine whether the cursor can be isolated as an independent SVG layer or component.

**Design Objective**: Playback cursor movement should:
1.  Avoid re-rendering static SVG notation paths.
2.  Update only the cursor layer or equivalent minimal surface.

### B. Layout Measurement & Reflow

**Hypothesis**: Resize observers or layout calculations may introduce synchronous DOM reads/writes that cause forced reflow during playback or resize.

**Audit Tasks**:
- [ ] Identify layout reads/writes during playback and resize.
- [ ] Check for repeated bounding-box measurements.
- [ ] Validate memoization or batching of layout calculations.

**Design Objective**: No forced reflow or layout thrashing during playback.

---

## 4. Tooling & Metrics (Proposed)

To support this audit and prevent regressions:

1.  **Bundle Size Tracking**
    - Introduce `@size-limit/preset-small-lib`.
    - Establish baselines for:
        - visual-only usage
        - playback-enabled usage (if split)

2.  **Dependency Visualization**
    - Use `source-map-explorer` to:
        - confirm Tone.js exclusion from visual-only builds
        - identify unexpected heavy imports

Tooling is diagnostic first; enforcement comes later.

---

## 5. Acceptance Criteria (Post-Audit)

- [ ] Visual-only bundle baseline documented (target set after measurement).
- [ ] Audio code is not loaded unless playback is explicitly invoked.
- [ ] Bravura font loading is external and non-blocking.
- [ ] Playback cursor updates trigger no re-renders of static notation.
- [ ] Tree-shaking of Tonal.js verified in a consumer build.

---

## 6. Non-Goals

- No immediate API breakage.
- No premature refactors before audit results.
- No assumption that audio must be removed—only isolated where appropriate.

---

## 7. Next Steps

1.  Establish bundle and render baselines.
2.  Document dependency reachability from the public entry point.
3.  Propose targeted changes based on measured data.

*If you’d like, I can also:*
- derive a concrete export map proposal,
- draft a visual-only entry point spec,
- or outline a React Profiler checklist tailored to the current SVG architecture.

**This RFC is now intentionally falsifiable, scoped, and implementation-agnostic.**