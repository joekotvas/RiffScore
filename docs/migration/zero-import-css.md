# Zero-Import CSS Architecture

This document describes RiffScore's approach to CSS bundling where consumers don't need to explicitly import stylesheets.

## Current State (Implemented ✅)

**Styles are bundled automatically.** Consumers just import the component:

```tsx
import { RiffScore } from 'riffscore';
// No CSS import needed!
```

Styles are imported at the library entry point (`src/index.tsx`):

```tsx
import './styles/index.css'; // Bundled with library
export { RiffScore } from './RiffScore';
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

## Implementation Status

**✅ Completed**: Styles are bundled at the library entry point (`src/index.tsx`). No consumer action required.

## Future Considerations

If explicit CSS import is ever needed (e.g., for SSR optimization), consider:

```tsx
// Alternative explicit import (not currently required)
import 'riffscore/dist/styles.css';
import { RiffScore } from 'riffscore';
```

