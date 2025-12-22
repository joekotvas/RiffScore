# API Migration Progress

**Last Updated:** 2025-12-21

---

## Summary

| Status | Phases |
| :--- | :--- |
| ✅ Complete | 0, 1, 2 (a-g), 3, 4, 5 (A, B, E) |
| � In Progress | 5 (remaining), 6, 7 |
| 🔲 Remaining | 8 |

**Goal:** Complete transition to a dispatch-based, engine-driven, fully exposed and machine-addressable API.

---

## Completed Phases

<details>
<summary><strong>✅ Phase 0: Type Definitions</strong></summary>

- [x] Define `MusicEditorAPI` interface in [`api.types.ts`](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/api.types.ts)
- [x] Define `RiffScoreRegistry` interface
- [x] Verify TypeScript compilation
</details>

<details>
<summary><strong>✅ Phase 1: The Glue Layer</strong></summary>

- [x] Create [`useScoreAPI`](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/hooks/useScoreAPI.ts) hook
- [x] Modify `RiffScore.tsx` for Registry pattern
- [x] Write [`ScoreAPI.registry.test.tsx`](file:///Users/josephkotvas/Sites/Riffs/riffeasy/riffscore/src/__tests__/ScoreAPI.registry.test.tsx) (15 tests)
- [x] Entry methods functional
- [x] Basic navigation
</details>

<details>
<summary><strong>✅ Phase 2: Selection Engine (a-g)</strong></summary>

- [x] Create `SelectionEngine.ts` with command dispatch pattern
- [x] Create all selection commands (Range, Toggle, SelectAll, Clear, etc.)
- [x] Migrate all `setSelection` calls to dispatch pattern
- [x] Implement vertical selection (note-based → slice-based)
- [x] Testing enhancement (user-event, 75% coverage, antipatterns doc)

> **Decision:** `engine.dispatch()` is the canonical pattern. Direct `setState()` deprecated.
</details>

<details>
<summary><strong>✅ Phase 3: Event Subscriptions</strong></summary>

- [x] Implement `on(event, callback)` in useScoreAPI
- [x] Write `ScoreAPI.events.test.tsx`
- [x] Document ADR 002
- [x] **#122 Fix:** Callbacks fire reliably via `useEffect` with correct data
</details>

<details>
<summary><strong>✅ Phase 4: Transaction Batching</strong></summary>

- [x] Add batching to `ScoreEngine.ts`
- [x] Write `ScoreAPI.transactions.test.tsx`
- [x] Implement `useTransactionBatching` hook
- [x] Document ADR 003
</details>

<details>
<summary><strong>✅ Phase 5: Code Refactor (Components A, B, E)</strong></summary>

- [x] **Component E:** `useScoreLogic.ts` slimming (−154 lines)
- [x] **Component A:** `interaction.ts` modularization (facade pattern)
- [x] **Component B:** `hooks/api/` factory pattern (10 files)
</details>

---

## Remaining Roadmap

### 🔄 Phase 5C: Entry Hook Consolidation

**Goal:** Consolidate entry-related hooks into a cohesive pattern.

| Task | Files | Priority |
|------|-------|----------|
| Audit entry-related hooks | `useNoteActions.ts`, `useMeasureActions.ts`, `useTupletActions.ts` | Medium |
| Identify duplication with `hooks/api/entry.ts` | — | Medium |
| Extract shared utilities or merge | — | Medium |
| Ensure all entry paths use dispatch | — | High |

### 🔄 Phase 5D: Selection Handler Consolidation

**Goal:** Ensure all selection mutations go through dispatch.

| Task | Files | Priority |
|------|-------|----------|
| Audit remaining `setSelection` calls | `useSelection.ts`, `useNavigation.ts` | High |
| Verify all production paths use dispatch | — | High |
| Test file usage is acceptable | Tests can use `setSelection` for setup | Info |

---

### 🔄 Phase 6: API Reliability

**Goal:** Fix known issues that prevent reliable programmatic usage.

| Issue | Severity | Status |
|-------|----------|--------|
| **#1: `getScore()` returns stale data** | Medium | 🔲 |
| **#2: Entry methods don't work with custom staves** | Medium | 🔲 |
| **#3: Measure capacity validation untestable** | Low | Deferred |
| **#4: `addRest()` orphaned noteId** | Info | Deferred |

#### 6A: Fix Stale `getScore()` 
- [ ] Investigate `scoreRef.current` sync in `useScoreAPI`
- [ ] Ensure `getScore()` returns fresh data after mutations
- [ ] Add test: `addNote() → getScore() → verify event exists`

#### 6B: Fix Entry with Custom Staves
- [ ] Debug why `addNote()` fails with custom staves
- [ ] Add test: `config={{ score: { staves: [...] } }} → addNote() → verify`

---

### 🔄 Phase 7: API Completion

**Goal:** Implement remaining API methods for full machine-addressability.

| Method | Factory | Status | Priority |
|--------|---------|--------|----------|
| `selectFullEvents()` | selection.ts | ✅ Impl, ❌ Not tested | Medium |
| `extendSelectionUp()` | selection.ts | ✅ Impl, ❌ Not tested | Medium |
| `extendSelectionDown()` | selection.ts | ✅ Impl, ❌ Not tested | Medium |
| `extendSelectionAll()` | selection.ts | ✅ Impl, ❌ Not tested | Medium |
| `copy()` / `cut()` / `paste()` | — | ⏳ Pending | Low |
| `play()` / `pause()` | playback.ts | ⏳ Stub | Low |
| `on('playback')` | events.ts | ⏳ Stub | Low |

#### 7A: Selection Expansion Tests
- [ ] Test `selectFullEvents()` 
- [ ] Test `extendSelectionUp/Down/All`
- [ ] Test `selectAll()` with different scopes

#### 7B: Clipboard API (Deferred)
- [ ] Implement `copy()`, `cut()`, `paste()`
- [ ] Wire to browser clipboard API

#### 7C: Playback API (Deferred)
- [ ] Complete `play()`, `pause()`, `stop()`
- [ ] Implement `on('playback')` event

---

### � Phase 8: Documentation & Polish

**Goal:** Finalize all documentation for external consumption.

| Document | Status | Tasks |
|----------|--------|-------|
| `docs/API.md` | ✅ Mostly complete | Verify all methods documented |
| `docs/COOKBOOK.md` | ✅ Mostly complete | Add more recipes as needed |
| `docs/ARCHITECTURE.md` | 🔲 Needs update | Document engine architecture |
| `docs/TESTING.md` | ✅ Updated | — |
| `README.md` | 🔲 Needs update | Update for npm publish |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    External Access                          │
│         window.riffScore.get(id) → MusicEditorAPI          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    useScoreAPI Hook                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             hooks/api/* Factories                    │   │
│  │  entry.ts │ navigation.ts │ selection.ts │ history.ts  │
│  │  modification.ts │ playback.ts │ io.ts │ events.ts    │
│  └─────────────────────────────────────────────────────┘   │
└──────────┬─────────────────────────────────────┬────────────┘
           │                                     │
           ▼                                     ▼
┌─────────────────────────┐       ┌─────────────────────────┐
│    ScoreEngine          │       │   SelectionEngine       │
│   dispatch(Command)     │       │   dispatch(Command)     │
│   transactions          │       │   anchor tracking       │
│   undo/redo history     │       │   multi-note selection  │
└─────────────────────────┘       └─────────────────────────┘
           │                                     │
           └──────────────┬──────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Command Pattern                            │
│    AddNoteCommand │ RangeSelectCommand │ MoveNoteCommand   │
│    DeleteEventCommand │ ChangePitchCommand │ etc.          │
└─────────────────────────────────────────────────────────────┘
```

---

## Related Documents

- [API Test Coverage](./api_test_coverage.md) — Test status for each method
- [Implementation Plan](./implementation_plan.md) – Original technical specifications
- [API Reference Draft](./api_reference_draft.md) – API signatures
- [Testing Enhancement Evaluation](./testing_enhancement_evaluation.md) – Testing improvements

---

## Notes

- Test files still use `setSelection` for setup (expected and acceptable)
- `docs/API.md` and `docs/COOKBOOK.md` already exist and are mostly complete
- Playback and clipboard APIs are low priority (can be added post-1.0)

