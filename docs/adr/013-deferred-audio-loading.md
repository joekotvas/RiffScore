# 013. Deferred Audio Loading

Date: 2026-01-01

## Status

Accepted

## Context

Visual music notation is often used in contexts where audio playback is secondary or unnecessary (e.g., static score display, theory blogs, print-preview).
*   **Problem**: Tone.js is a large dependency (~400KB). Previously, it was statically imported (`import * as Tone from 'tone'`), causing consumer bundlers (Webpack, Vite, etc.) to include it in the initial bundle even if playback was never used.
*   **Impact**: Visual-only consumers paid a significant performance penalty for unused functionality. Static Site Generators (SSG) also faced potential issues with AudioContext initialization during server-side rendering.

## Decision

We will use **Dynamic Imports** to defer the loading of the audio engine (Tone.js) until it is explicitly required.

### 1. Principle: Opt-In Performance Cost
Users should only "pay" for the heavy audio engine if and when they choose to use it. The baseline cost of the library should reflect its visual core, not its optional audio capabilities.

### 2. Implementation: Lazy Loading
*   `src/engines/toneEngine.ts` is refactored to remove the static `import` of `tone`.
*   A cached `loadTone()` helper uses the dynamic `import('tone')` syntax.
*   Entry points that require audio (e.g., `initTone()`, `scheduleTonePlayback()`, `playNote()`) must first await `loadTone()` before proceeding.

```typescript
// Pattern used in toneEngine.ts
const loadTone = async (): Promise<ToneModule> => {
  if (toneModuleCache) return toneModuleCache;
  return import('tone').then(module => {
    toneModuleCache = module;
    return module;
  });
};
```

### 3. State Management
The engine tracks loading states (`'not-loaded'`, `'loading'`, `'ready'`) to allow the UI to disable playback buttons or show loading indicators while the module is being fetched over the network.

## Consequences

### Positive
*   **Bundle Size**: Visual-only consumers save ~400KB in their initial bundle size.
*   **Server-Side Rendering (SSR)**: Prevents accidental initialization of browser-only AudioContext during SSG builds.
*   **Initial Load Performance**: Faster Time-to-Interactive (TTI) for all users.

### Negative
*   **First-Interaction Latency**: When a user clicks "Play" for the first time, there is a delay (network fetch + parse time) before audio starts. This is a one-time cost per session.
*   **Code Complexity**: The audio engine code becomes asynchronous, requiring `async/await` patterns and state checks that were previously unnecessary with static imports.

## Alternatives Considered

*   **Separate Package**: Splitting the library into `@riffscore/core` (visual) and `@riffscore/audio`. Rejected to maintain the "batteries-included" ease of use (single install).
*   **Consumer Configuration**: Requiring consumers to pass the Tone instance. Rejected as it degrades the developer experience for the common case.
