# Bundle Findings

## Summary

| Metric | Value |
|--------|-------|
| ESM bundle | 627.88 KB |
| CJS bundle | 635.32 KB |
| CSS bundle | 28.79 KB |
| Published tarball | 800.7 KB (compressed) |
| Source maps | 1.5 MB each |

---

## RFC §2.A — Tone.js Reachability

### Hypothesis
> Tone.js (audio synthesis / playback) may be reachable from the default import graph (`import { RiffScore } from 'riffscore'`), potentially increasing baseline bundle size even when playback is unused.

### Finding: **CONFIRMED**

**Evidence**: Bundle header inspection

```javascript
// dist/index.mjs (lines 1-6)
import React2, { createElement, createContext, ... } from 'react';
import { Key, Note, Interval } from 'tonal';
import * as Tone from 'tone';  // <-- EAGER NAMESPACE IMPORT
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { ChevronDown, ... } from 'lucide-react';
import { createPortal } from 'react-dom';
```

**Import Chain**:
```
src/index.tsx
└── RiffScore.tsx
    └── components/Layout/ScoreEditor.tsx (line 26)
        └── import { setInstrument, InstrumentType } from '@engines/toneEngine';
            └── import * as Tone from 'tone';
```

### Analysis

1. `ScoreEditor.tsx` imports `toneEngine` even if `enablePlayback` is `false`
2. Import is static, not dynamic (`import()`)
3. Consumer bundlers will include Tone.js in their output

### Impact

- **Bundle tax**: Consumers pay for Tone.js (~400KB minified) even for visual-only use
- **Parse time**: Tone.js module initialization runs regardless of usage

---

## RFC §2.C — Tonal.js Tree-Shaking

### Hypothesis
> Tree-shaking effectiveness depends on import discipline; unused theory modules may be retained unintentionally.

### Finding: **CONFIRMED (Positive)**

**Evidence**: Named imports observed

```javascript
import { Key, Note, Interval } from 'tonal';
```

### Analysis

Only 3 symbols imported from Tonal.js:
- `Key` (used in 2 files)
- `Note` (used in 6 files)
- `Interval` (used in 1 file)

Consumer bundlers can tree-shake unused Tonal.js modules.

### Files Using Tonal.js

| File | Imports |
|------|---------|
| `services/MusicService.ts` | `Note`, `Key` |
| `commands/ChromaticTransposeCommand.ts` | `Note`, `Interval` |
| `hooks/editor/useModifiers.ts` | `Note` |
| `constants.ts` | `Key` |
| `Toolbar/Menus/KeySignatureOverlay.tsx` | `Key` |
| `utils/entry/pitchResolver.ts` | `Note` |
| `utils/accidentalContext.ts` | `Note`, `Key` |
| `utils/validation.ts` | `Note` |

---

## Dependency Summary

| Dependency | Import Style | Tree-Shakeable | In Bundle |
|------------|--------------|----------------|-----------|
| `tone` | `import * as Tone` | ❌ Namespace | External |
| `tonal` | Named imports | ✅ Yes | External |
| `lucide-react` | Named imports | ✅ Yes | External |
| `react` | Named imports | ✅ Yes | External |

**Note**: All dependencies are external (not bundled inline). Consumer bundler handles resolution.
