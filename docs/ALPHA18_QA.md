# Alpha.18 release verification

This release was checked against the alpha.17 API and notation behavior, with extra contract tests for new configuration and composition boundaries.

## Automated coverage

- 215 Jest suites: 3,856 passing tests, 87 passing snapshots. Includes command/history, property, layout/geometry, import/export, recognition, unmetered timing, permission rollback and audio lifecycle coverage.
- TypeScript and ESLint pass; library and Next.js demo production builds pass.
- 30 real-browser scenarios pass across desktop Chromium, Pixel 7 Chromium emulation and iPhone 13 WebKit emulation. Covers keyboard editing/announcements/undo, restricted editing, touch selection, portrait/landscape, viewport containment, real audio/API/control agreement, four built-in theme contrast scans, dialog focus/return, read-only scrolling, title/chord clearance, and print pagination.
- Browser suite runs against the built distribution and is checked into CI as `npm run test:browser` (build first). Linux pixel regression remains a separate CI gate with platform-specific baselines.
- Clean packed-package consumers test React 18 and React 19, CJS/ESM imports, server rendering, browser hydration/editing with supplied stable score identities, and browser-independent musical queries. Reproduce with `node scripts/verify-package.mjs /path/to/clean-consumer` after installing the packed artifact and React there. Bravura's font and license notice ship with the package.

## Fixes made during QA

The API, toolbar and custom controls now use one per-view transport and instrument. Synchronous seek and snapshots agree with subsequent playback events. Idle views cannot cancel another view's audio. Retained API references read current configuration. Multi-step permission refusals restore score/history/selection. Read-only siblings preserve shared selection while hiding their own editing chrome.

Chord typography is grouped under `chord.display.font`, tuplets under `ui.engraving.tuplets`, and total engraving width is named `contentWidth`. Invalid scale falls back safely. Titles/chords above high notes retain clearance; display-only clefs feed the same layout and interaction geometry. Dialogs trap and restore focus, scrollable help is keyboard reachable, theme contrast no longer depends on translucent backgrounds, and reduced-motion preferences are honored.

## Print review

The browser suite exports a two-page Letter PDF containing 94 measures, with unscaled 816 × 1056 CSS-pixel page SVGs. Rendered PDF pages were visually inspected for clipping, bar continuity and page breaks. Print hides toolbar/custom controls/transient overlays and removes viewport/zoom limits. The host fixture isolates the score it intends to print; hosts with multiple editors or unrelated page content must similarly choose their print content. Core does not select a whole application's printable content.

## Limits

Device emulation is not physical-device certification. Automated accessibility scans and keyboard checks do not replace assistive-technology user testing. PDF visual review covers the supplied fixtures, not every host stylesheet or printer. Audio checks verify scheduling/state in real browsers, not listening quality or every hardware device. No claim is made for independent simultaneous transports, arbitrary third-party glyph adapters, a general extension registry, multi-voice notation, or future arranging/collaboration infrastructure.
