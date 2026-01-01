# RiffScore Performance & Bundle Audit

**Date**: 2026-01-01  
**Version**: 1.0.0-alpha.6  
**Status**: Complete

---

## Executive Summary

This audit tested 5 hypotheses from the RFC: *"Bundle & Runtime Performance Audit: Audio Decoupling, Asset Loading, and Playback Render Isolation."*

| Hypothesis | Status | Impact |
|------------|--------|--------|
| A. Tone.js reachable in base bundle | **CONFIRMED** | High |
| B. Bravura font impacts first paint | **REJECTED** | Low (correctly handled) |
| C. Tonal.js tree-shaking ineffective | **REJECTED** | None (optimal) |
| D. Cursor updates cause excessive re-renders | **UNVERIFIED** | Medium (needs profiling) |
| E. Layout causes forced reflow | **REJECTED** | None (no DOM reads) |

---

## Mediated Recommendations

### 1. Audio Decoupling (High Priority)

**Primary Recommendation**: Dynamic import of Tone.js

**Alternatives**:
1. Separate entry point (`riffscore/audio`)
2. Move to peer dependency

| Criteria | Dynamic Import | Separate Entry | Peer Dep |
|----------|---------------|----------------|----------|
| Bundle impact | ↓ 400KB | ↓ 400KB | None |
| Breaking change | None | Minor | Medium |
| Effort | Low | High | Low |
| Rollback risk | Low | Medium | Low |

**Decision**: Implement dynamic import. Zero breaking changes, significant bundle savings.

---

### 2. Font Delivery (Implemented)

**Primary Recommendation**: Bundle Bravura font with the library (Option 2)

Implemented behavior:
- Bravura font bundled in `dist/fonts/`
- `@font-face` declaration in bundled CSS
- Zero-config setup for consumers
- FOUC prevention via CSS hide/reveal
- Non-blocking font load preserved

**Action**: README updated to document zero-config experience.

---

### 3. Tree-Shaking (No Change)

**Primary Recommendation**: Maintain current named imports

Tonal.js imports already follow best practices.

---

### 4. Playback Rendering (Deferred)

**Primary Recommendation**: Profile before optimizing

Current architecture uses CSS transitions for cursor. Verify with React Profiler before adding `React.memo` or extracting cursor layer.

---

## Skeptical Review

### Methodology Challenges

1. **source-map-explorer failure**: Bundle visualization could not be generated due to source map column mismatch. Claims about bundle composition rely on grep analysis of the raw bundle.

2. **External vs. bundled confusion**: Initial inspection misinterpreted "external dependency" as "not included". Clarification: Dependencies are NOT inlined in riffscore bundle but ARE loaded by consumer bundler.

### Causality Questions

1. **Is ~400KB Tone.js actually loaded?**
   - CONFIRMED via bundle import analysis
   - Consumer bundler WILL include it unless using dynamic import

2. **Do cursor updates actually cause performance issues?**
   - UNVERIFIED — No profiler data collected
   - CSS transitions may mask potential issues

### Alternative Explanations

1. **Bundle size**
   - The 627KB riffscore bundle size is riffscore code only
   - Tone.js adds ~400KB at consumer level
   - Total consumer impact may be ~1MB+ for visual-only use

2. **Font loading**
   - 3-second timeout is arbitrary
   - Slow network could cause visible "Loading..." for extended period

### Second-Order Risks

| Change | Risk |
|--------|------|
| Dynamic import | First-playback latency spike on slow networks |
| Separate entry | Consumer confusion, documentation burden |
| Font bundling | Version coupling, cache invalidation |

---

## Definition of Done

- [x] Every RFC hypothesis marked CONFIRMED / REJECTED / UNVERIFIED
- [x] Every conclusion tied to reproducible evidence
- [x] Every major recommendation has a counter-argument
- [x] Manual verification steps clearly documented
- [x] Executive summary includes effort, risk, impact, and rollout guidance

---

## Deliverables

| Document | Location |
|----------|----------|
| Methodology | [methodology.md](./methodology.md) |
| Bundle Findings | [bundle/bundle-findings.md](./bundle/bundle-findings.md) |
| Size Baseline | [bundle/size-baseline.md](./bundle/size-baseline.md) |
| Font Loading | [assets/font-loading.md](./assets/font-loading.md) |
| Playback Profiler | [runtime/playback-profiler.md](./runtime/playback-profiler.md) |
| Layout Analysis | [runtime/layout-analysis.md](./runtime/layout-analysis.md) |
| Audio Proposal | [proposals/audio-decoupling.md](./proposals/audio-decoupling.md) |
| Font Proposal | [proposals/font-delivery.md](./proposals/font-delivery.md) |
| Tree-Shaking Proposal | [proposals/tree-shaking.md](./proposals/tree-shaking.md) |
| Render Proposal | [proposals/playback-render-isolation.md](./proposals/playback-render-isolation.md) |
