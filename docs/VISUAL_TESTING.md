# Visual / engraving regression harness (#252)

A two-lane safety net over a curated corpus of native `Score` fixtures, so a rendering
change can be **seen** to be correct and any regression is caught automatically.

- **Lane A — fast jsdom geometry net** (every commit, in the normal Jest run). Renders each
  fixture through the real `ScoreEditor` pipeline and pins its **structured engraving facts**
  (noteheads / stems / ledger lines / beams / glyph codepoints) two ways: a fact snapshot
  *and* targeted oracle assertions.
- **Lane B — real-browser pixel verification** (Playwright). Rasterizes the same output in
  a real browser and image-diffs it — the lane that actually proves the *pixels* (the SMuFL
  glyphs jsdom can't render).

One corpus feeds both lanes (and the gallery): [`src/__tests__/fixtures/visual/index.ts`](../src/__tests__/fixtures/visual/index.ts).
Each fixture is a **focused scenario** (split at natural seams) carrying a `feature` (gallery
group + filter) and `covers` (the scenarios it exercises). The gallery is **searchable** (by
name / description / tags / covers) and **filterable** by feature.

> **Why two lanes?** jsdom has no fonts or layout engine, so Lane A can only assert
> *attributes* — but RiffScore computes engraving geometry purely in JS, so those
> coordinates equal a real browser's. Lane B adds only the font-rasterization layer on top.

---

## Quick reference

| Command | What it does |
|---|---|
| `npm test` | Runs Lane A (fact snapshots + oracles) as part of the suite. |
| `npm test -- -u` | Accepts Lane A snapshot changes **after you've reviewed the diff**. |
| `npm run visual:gallery` | Writes `./visual-gallery/index.html` — open it to eyeball every fixture. |
| `npm run visual:pixel` | Runs Lane B locally (regenerates the gallery, then pixel-diffs). |
| `npm run visual:pixel:update` | Regenerates **local** pixel baselines (platform-scoped; not committed). |

---

## Adding a fixture

Add one entry to `visualFixtures` in [`src/__tests__/fixtures/visual/index.ts`](../src/__tests__/fixtures/visual/index.ts)
— set `name`, `feature` (reuse an existing group so it filters together), `description`,
`covers` (the scenarios it exercises — shown in the gallery and searchable), `tags`, and a
focused `score`. The `treble(...)` / `clefFixture(...)` / `keyFixture(...)` helpers keep most
fixtures to a line or two. Both lanes and the gallery pick it up automatically. Then:

1. `npm test -- -u` to write its Lane A fact snapshot (review the new snapshot block).
2. Seed its Lane B baseline via CI (see below).

**Determinism contract (load-bearing):**

- Give every note/event/measure/staff a **fixed, explicit id**. Ids leak into the SVG as
  `data-testid` and `createId()` is random — a generated id would churn baselines.
- Fixtures are rendered **pure** (load + render, no edits). An edit would mint random ids.
- Keep fixtures **valid/complete** so `migrateScore` synthesizes nothing on load.
- Only put scenarios RiffScore can represent **correctly** today. Known-buggy output (e.g.
  cross-measure tie layout, #249) is deliberately excluded so we don't bless a bug as
  "golden". If you must capture a known-bad state, annotate it loudly.

---

## Lane A — structured-fact snapshots + oracles

- Test: [`src/__tests__/visual/visualRegression.test.tsx`](../src/__tests__/visual/visualRegression.test.tsx)
- Helper: [`src/__tests__/helpers/visual.tsx`](../src/__tests__/helpers/visual.tsx) (render + normalize)

The snapshot is the **normalized facts** (id-free, coordinates rounded to 2dp) — not raw
SVG — so the diff is small and semantically reviewable, avoiding the rubber-stamp failure of
big-blob snapshots. The oracle assertions pin the load-bearing invariants explicitly (pitch
contour, beam grouping, the triplet "3", chord stacking, key-sig glyph counts…).

**When a Lane A snapshot changes:** read the diff. If the change is intended, `npm test -- -u`
and commit the updated `.snap`. If not, you found a regression.

---

## Lane B — real-browser pixel diff

- Config: [`playwright.config.ts`](../playwright.config.ts) · Spec: [`e2e/visual/fixtures.spec.ts`](../e2e/visual/fixtures.spec.ts)
- Render surface: the **gallery** (`npm run visual:gallery`) — i.e. the exact SVG the real
  `ScoreEditor` emits. `global-setup` regenerates it before every run, so screenshots always
  reflect current source. The Bravura music font is bundled next to the gallery and the spec
  waits on `document.fonts.ready` before capturing.

### Baselines are platform-scoped — approve them in CI, never locally

Glyph rasterization differs by OS, so baselines carry a `-{platform}` suffix
(`…-chromium-linux.png`, `…-chromium-darwin.png`). **Only the linux (CI) baselines are
committed** — `.gitignore` ignores `*-darwin.png` / `*-win32.png`. Running
`npm run visual:pixel:update` on your laptop is fine for local debugging, but those
baselines are intentionally not committed.

### Seeding / updating the committed baselines

Use the **"Visual regression (Lane B)"** GitHub Action:

1. Actions ▸ *Visual regression (Lane B)* ▸ **Run workflow** with `update_baselines = true`
   (on `dev`). It regenerates the linux baselines and commits them.
2. Thereafter the workflow runs on pull requests and fails if the pixels drift. On failure it
   uploads the Playwright HTML report (with expected/actual/diff images) as an artifact.

> Until the linux baselines are seeded once, the PR pixel check will fail with "snapshot
> doesn't exist" — that's expected; run step 1 first. The check is intentionally **separate**
> from the merge-gating `CI / verify` job.

---

## Relationship to the roadmap

This is the testing/CI item in [ROADMAP.md](./ROADMAP.md). It runs **parallel to M2** and is
**decoupled from ABC/MusicXML import (#10/#11)** — import gives a *semantic* oracle, not a
visual baseline, and would later only *amplify* Lane B's corpus. A future enhancement could
drive the live app via the `window.riffScore` seam for runtime-CSS fidelity; the current
gallery surface already pins the engraving output, which is what regresses.
