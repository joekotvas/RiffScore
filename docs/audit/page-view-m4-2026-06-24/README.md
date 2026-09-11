# M4 Page View QA - 2026-06-24

The flow under test is: demo editor loads -> switch to page view with a generated
grand-staff score -> verify wrapped engraving, editing, lasso selection, playback cursor,
and print media output.

## Browser Path

- Browser plugin status: invocation failed.
- Fallback reason: in-app Browser bootstrap through `node_repl` failed before execution
  with `Mcp error: -32602: js: codex/sandbox-state-meta: missing field sandboxPolicy`.
- Validation method: local Playwright against the dev server at `http://localhost:3000`.

## Scenario

- Score shape: generated grand-staff score with 28 measures, ties crossing wrapped systems,
  and chords on wrapped systems.
- Layout: Letter page, page view, 90% staff size.
- Rendered result: 4 page SVGs, 15 systems, 5 chord symbols, 82 visible tie paths, and
  15 grand-staff brackets.

## Checks

| Area | Result | Evidence |
| --- | --- | --- |
| Engraving bounds | Pass | No chord, tie, or grand-staff bracket bounds escaped the page SVG bounds. |
| Wrapped ties | Pass | 82 rendered tie paths, including split continuation arcs across wrapped systems. |
| Note editing | Pass | Clicked a wrapped-system note, then edited it to `A4` in page view. |
| Lasso selection | Pass | Page-local drag selected 4 notes in measure 12. |
| Chord editing | Pass | Edited a wrapped-system chord from inline page view input to `A7`. |
| Metadata editing | Pass | Edited the page-view SVG title inline to `M4 Metadata After`; the score API and rendered title both updated. |
| Playback cursor | Pass | Cursor resolved to `x=252.993` inside a 612px page and stayed page-local. |
| Print media | Pass | Toolbar/footer hidden, content transform reset to `none`, canvas overflow visible, 4 page SVGs available for print. |

## Command Gates

- `npm run lint`
- `npm run typecheck`
- `npm test -- --runInBand --silent`

Full Jest result: 166 suites passed, 3109 tests passed, 85 snapshots passed.

## Artifacts

- `qa-result.json` - structured Playwright result and DOM metrics.
- `metadata-edit-result.json` - focused rendered metadata edit result.
- `smoke-home.png` - initial app load.
- `page-view-loaded.png` - generated score in page view.
- `page-view-page-1.png` - first page close view.
- `page-view-after-note-edit.png` - note edit proof.
- `page-view-after-lasso.png` - lasso selection proof.
- `page-view-after-chord-edit.png` - chord inline edit proof.
- `page-view-after-metadata-edit.png` - metadata inline edit proof.
- `page-view-print-media.png` - print media proof.

## Notes

Observed console noise was non-blocking: an existing Bravura font 404, HMR/Tone startup
logs, one batch transaction log, and the expected `addNote` warning for the scripted edit.
