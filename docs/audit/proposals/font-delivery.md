# Font Delivery Proposal

## Problem Statement

### Hypothesis (RFC §2.B)
> Bravura font assets may be delivered in a way that impacts first paint or JavaScript parse time.

### Observed Evidence

- Font **not bundled** in library
- Consumer must provide `@font-face` declaration
- `useFontLoaded` hook hides glyphs until font loads

---

## Solution Options

### Option 1: Document Consumer Requirement (Recommended)

**Strategy**: Maintain current behavior, improve documentation.

Current behavior is correct:
- Font externally loaded (no bundle impact)
- FOUC prevented via CSS hiding
- Non-blocking via `document.fonts.ready`

| Tradeoff | Impact |
|----------|--------|
| Bundle size | No change |
| Consumer ergonomics | ↓ Must add font themselves |
| First paint | Optimal |

### Option 2: Bundle Font as Asset

**Strategy**: Include `Bravura.woff2` in `dist/fonts/`.

| Tradeoff | Impact |
|----------|--------|
| Bundle size | ↑ ~300KB |
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

## Recommendation

**Option 1: Document Consumer Requirement**

**Rationale**:
- Current implementation is correct
- No bundle bloat
- Standard web font practice

---

## Acceptance Criteria

- [ ] README documents font requirement
- [ ] Example `@font-face` snippet provided
- [ ] Demo app demonstrates correct setup
