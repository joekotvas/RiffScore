# Tree-Shaking Proposal

## Problem Statement

### Hypothesis (RFC §2.C)
> Tree-shaking effectiveness depends on import discipline; unused theory modules may be retained unintentionally.

### Observed Evidence

```javascript
import { Key, Note, Interval } from 'tonal';
```

Only 3 symbols used from Tonal.js across 8 files.

---

## Current Status: **Optimal**

Tonal.js imports are already tree-shakeable:
- Named imports (not namespace)
- Consumer bundler can eliminate unused exports

---

## Solution Options

### Option 1: No Change (Recommended)

Current imports follow best practices.

### Option 2: Sub-module Imports

```typescript
// Instead of
import { Note } from 'tonal';

// Use
import { Note } from '@tonaljs/note';
```

| Tradeoff | Impact |
|----------|--------|
| Bundle size | Marginal improvement |
| Code clarity | ↓ Verbose imports |
| Maintenance | ↓ More lines to update |

---

## Recommendation

**Option 1: No Change**

Current named imports are optimal. Sub-module imports provide marginal benefit at cost of readability.

---

## Validation Checklist

- [x] Named imports verified in codebase
- [ ] Consumer bundle size test (future)
