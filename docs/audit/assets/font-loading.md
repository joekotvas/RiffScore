# Font Loading Analysis

## RFC §2.B — Bravura / SMuFL Font Delivery

### Hypothesis
> Bravura (SMuFL) font assets may be delivered in a way that impacts first paint or JavaScript parse time, depending on whether they are bundled, inlined, or externally loaded.

### Finding: **CONFIRMED (External)**

---

## Font Asset Location

| Location | Status |
|----------|--------|
| `dist/` (published package) | ❌ Not present |
| `src/` (library source) | ❌ Not present |
| `demo/public/fonts/Bravura.woff2` | ✅ Present (demo only) |

**Observation**: The Bravura font is NOT bundled with the library. Consumers must provide their own `@font-face` declaration.

---

## Font Loading Mechanism

### `useFontLoaded` Hook

**File**: `src/hooks/layout/useFontLoaded.ts`

```typescript
export const useFontLoaded = (timeoutMs = 3000): FontLoadedResult => {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Uses document.fonts.ready API
    document.fonts.ready.then(() => setIsLoaded(true));

    // Fallback timeout
    setTimeout(() => setIsLoaded(true), timeoutMs);
  }, []);

  return {
    isLoaded,
    className: isLoaded ? 'font-loaded' : 'font-loading',
    styleElement: FONT_STYLE_ELEMENT,
  };
};
```

### Fallback Behavior

CSS rules hide glyphs during loading:

```css
.RiffScore.font-loading svg text {
  visibility: hidden !important;
}
.RiffScore.font-loaded svg text {
  visibility: visible;
}
```

**Observation**: 
- Glyphs hidden until fonts load
- 3-second timeout prevents indefinite hidden state
- Respects `prefers-reduced-motion`

---

## First Paint Impact

| Phase | Behavior |
|-------|----------|
| Initial render | Glyphs hidden (`visibility: hidden`) |
| Font load complete | Glyphs revealed (smooth transition) |
| Timeout (3s) | Fallback reveal even if font fails |

### FOUC Prevention

✅ **No FOUC** — Glyphs are hidden, not displayed with fallback font.

### Potential Issue

⚠️ **Consumer Responsibility**: If consumer does not provide `@font-face`, glyphs remain hidden for 3 seconds then render with fallback font (broken appearance).

---

## Consumer Requirements

To use RiffScore, consumers must add:

```css
@font-face {
  font-family: 'Bravura';
  src: url('/path/to/Bravura.woff2') format('woff2');
  font-display: swap;
}
```

---

## Design Objective Assessment

| Objective | Status |
|-----------|--------|
| Font loading should be non-blocking | ✅ Uses `document.fonts.ready` |
| Externally delivered | ✅ Not bundled |
| Not delay first contentful paint | ✅ Container renders immediately |

**Verdict**: Font delivery is correctly externalized and non-blocking.
