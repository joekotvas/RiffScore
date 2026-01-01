# Font Delivery Proposal

**Status**: ✅ IMPLEMENTED (see Issue #193)

## Problem Statement

### Hypothesis (RFC §2.B)
> Bravura font assets may be delivered in a way that impacts first paint or JavaScript parse time.

### Pre-Implementation State

- Font was NOT bundled in library
- Consumer had to provide `@font-face` declaration
- `useFontLoaded` hook hid glyphs until font loaded

---

## Solution Options Evaluated

### Option 1: Document Consumer Requirement

**Strategy**: Maintain external behavior, improve documentation.

| Tradeoff | Impact |
|----------|--------|
| Bundle size | No change |
| Consumer ergonomics | ↓ Must add font themselves |
| First paint | Optimal |

### Option 2: Bundle Font as Asset ✅ CHOSEN

**Strategy**: Include `Bravura.woff2` in `dist/fonts/`.

| Tradeoff | Impact |
|----------|--------|
| Bundle size | ↑ ~241KB |
| Consumer ergonomics | ↑ Zero config |
| CDN caching | ↓ Coupled to lib version |

### Option 3: CDN Reference

**Strategy**: Default `@font-face` pointing to CDN.

| Tradeoff | Impact |
|----------|--------|
| Bundle size | No change |
| Consumer ergonomics | ↑ Optional config |
| External dependency | ↑ CDN availability risk |

---

## Implemented Solution

**Option 2: Bundle Font as Asset**

**Rationale**:
- Zero-config experience aligns with "plug and play" goal
- Music notation is visual-first — broken fonts = broken library
- 241KB is reasonable for a one-time cached download
- Advanced users can still override via CSS cascade

**Changes Made**:
- Added `Bravura.woff2` to `src/assets/fonts/`
- Configured tsup to copy font to `dist/fonts/`
- Added `@font-face` to `src/styles/theme.css`
- Updated README to note fonts are bundled

---

## Acceptance Criteria

- [x] Font bundled in `dist/fonts/Bravura.woff2`
- [x] `@font-face` declaration in bundled CSS
- [x] README documents zero-config experience
- [x] Demo app works without manual font setup
