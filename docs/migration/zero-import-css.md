# Zero-Import CSS Architecture

This document explores moving RiffScore to a zero-import CSS model where consumers don't need to explicitly import stylesheets.

## Current State

Consumers must import CSS:
```tsx
import 'riffscore/styles.css';
import { RiffScore } from 'riffscore';
```

## Zero-Import Approach

### Runtime Style Injection

Inject CSS into `<head>` on component mount:

```tsx
// src/hooks/useInjectStyles.ts
import { useEffect } from 'react';
import cssContent from '../styles/index.css?raw'; // Vite raw import

const STYLE_ID = 'riffscore-styles';

export function useInjectStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = cssContent;
    document.head.appendChild(style);
  }, []);
}
```

Call in `RiffScore.tsx`:
```tsx
export const RiffScore: React.FC<Props> = (props) => {
  useInjectStyles();
  return <ThemeProvider>...</ThemeProvider>;
};
```

### Build Configuration

For tsup, use the `esbuild` loader to inline CSS:

```ts
// tsup.config.ts
export default defineConfig({
  esbuildOptions(options) {
    options.loader = { ...options.loader, '.css': 'text' };
  },
});
```

## Trade-offs

| Factor | Explicit Import | Zero-Import |
|--------|----------------|-------------|
| Bundle size | ~22KB CSS separate | +22KB in JS |
| Runtime cost | None | Minimal (one-time inject) |
| SSR | ✅ Works | Needs hydration handling |
| Consumer DX | Good | Best |
| Tree-shaking | CSS always loaded | CSS always loaded |

## Recommendation

**Phase 1 (Current):** Fix explicit import path for standard DX
**Phase 2 (Future):** Add opt-in zero-import via `enableAutoStyles()` export

Example opt-in API:
```tsx
import { RiffScore, enableAutoStyles } from 'riffscore';
enableAutoStyles(); // Call once at app init
```
