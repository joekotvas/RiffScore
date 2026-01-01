# Font Loading Analysis

## RFC §2.B — Bravura / SMuFL Font Delivery

### Hypothesis
> Bravura (SMuFL) font assets may be delivered in a way that impacts first paint or JavaScript parse time, depending on whether they are bundled, inlined, or externally loaded.

### Finding: **CONFIRMED (Bundled)**

---

## Font Asset Location

| Location | Status |
|----------|--------|
| `dist/fonts/Bravura.woff2` | ✅ Bundled with package |
| `src/assets/fonts/Bravura.woff2` | ✅ Source asset |
| `dist/index.css` | ✅ Contains `@font-face` declaration |

**Observation**: Bravura font is bundled with the library. Zero consumer configuration required.

---

## Font Loading Mechanism

### `@font-face` Declaration

**File**: `src/styles/theme.css` (bundled in `dist/index.css`)

```css
@font-face {
  font-family: 'Bravura';
  src: url('./fonts/Bravura.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

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

### CSS Hide/Reveal

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

---

## Design Objective Assessment

| Objective | Status |
|-----------|--------|
| Font loading should be non-blocking | ✅ Uses `document.fonts.ready` |
| Bundled with library | ✅ Bravura font is included in the package |
| Not delay first contentful paint | ✅ Container renders immediately; glyphs reveal after font ready/timeout |

**Verdict**: Font delivery is correctly bundled with the library and remains non-blocking.
