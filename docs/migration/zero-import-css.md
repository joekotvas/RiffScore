# Zero-Import CSS Architecture

This document describes RiffScore's CSS bundling approach where consumers don't need to explicitly import stylesheets.

## How It Works

**Styles are bundled automatically.** Consumers just import the component:

```tsx
import { RiffScore } from 'riffscore';
// No CSS import needed!
```

### Implementation

Styles are imported at the library entry point (`src/index.tsx`):

```tsx
import './styles/index.css'; // Bundled with library
export { RiffScore } from './RiffScore';
```

The bundler (tsup) sees this import and includes CSS in the `dist/` output. When consumers import any component from `riffscore`, they automatically get the styles.

## Why This Approach

| Factor | Bundler Approach |
|--------|-----------------|
| Consumer DX | Best — zero config |
| Bundle size | ~22KB CSS included |
| SSR | ✅ Works out of the box |
| Setup required | None |

Alternative approaches (runtime injection, explicit imports) add complexity with no meaningful benefit for RiffScore's use case as an embeddable React component.

## Explicit Import Option

If a consumer needs explicit CSS control (rare):

```tsx
import 'riffscore/styles.css';  // package.json exports this path
import { RiffScore } from 'riffscore';
```
