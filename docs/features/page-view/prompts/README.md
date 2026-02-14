# Page View Implementation Prompts

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)

This directory contains agent prompt documents for implementing the Page View & Print feature. Each phase is designed to be executed by an AI agent with subagents for parallelization.

---

## Implementation Status

| Phase | Status | Commits | Notes |
|-------|--------|---------|-------|
| 0 | ✅ Complete | `ef0a604`, `c553ed6`, `bf3b70d`, `3bc059d`, `16b8f13` | API standardized to 0-based indexing |
| 1 | ✅ Complete | `1d001d8` | Types, config, and services for page view |
| 2 | ⏳ Pending | — | Ready to start |
| 3 | ⏳ Pending | — | Blocked by Phases 1, 2 |
| 4 | ⏳ Pending | — | Blocked by Phase 2 |
| 5 | ⏳ Pending | — | Blocked by Phases 2, 4 |
| 6 | ⏳ Pending | — | Blocked by Phase 3 |
| 7 | ⏳ Pending | — | Blocked by Phases 2, 3 |
| 8 | ⏳ Pending | — | Blocked by Phases 1, 2 |
| 9 | ⏳ Pending | — | Blocked by all |

**Last Updated:** 2026-02-14

---

## Phase 0 Completion Notes

Phase 0 established the 0-based indexing convention throughout the codebase:

### Deliverables
- **`src/utils/measureIndex.ts`** - Conversion utilities (`toDisplayMeasureNumber`, `toInternalMeasureIndex`, `isValidMeasureIndex`, `clampMeasureIndex`)
- **JSDoc documentation** - All measure-related types now document 0-based convention
- **API standardization** - All API methods use 0-based indices consistently

### Breaking Change
The API now uses 0-based measure indices:
- `select(0)` = first measure (was `select(1)`)
- `select(1)` = second measure (was `select(2)`)

See [CHANGELOG.md](../../../../CHANGELOG.md) for migration details.

### Test Results
- 1227 tests passing
- All documentation updated

---

## Phase 1 Completion Notes

Phase 1 established the foundation types and services for page view:

### Deliverables
- **`src/types.ts`** - Extended with `ScoreMetadata`, `LayoutConfig`, `SystemLayout`, `PageLayout` types
- **`src/config.ts`** - Added layout defaults (`DEFAULT_LAYOUT_CONFIG`, `MARGIN_PRESETS`, `PAGE_DIMENSIONS`, `SYSTEM_SPACING_MULTIPLIERS`)
- **`src/services/PageLayoutService.ts`** - System break algorithm, measure width calculation, justification logic
- **`src/services/MetadataService.ts`** - Validation and normalization following ADR-011 structured feedback

### Key APIs Now Available
```typescript
// PageLayoutService
calculatePageLayout(score, config) → PageLayout
calculateSystemBreaks(measureWidths, contentWidth, indent) → number[][]
getSystemForMeasure(measureIndex, layout) → number
getMeasureOriginInSystem(measureIndex, layout, widths) → { x, systemIndex }

// MetadataService
validateMetadata(metadata) → { ok, errors }
normalizeMetadata(metadata) → ScoreMetadata
```

### Test Results
- 1325 tests passing (98 new tests)
- PageLayoutService: 97.74% statements, 87.14% branches
- MetadataService: 100% statements, 97.77% branches

---

## Execution Model

Each prompt is designed for a **prompt executor** that:
- Can run Bash commands directly
- Can spawn subagents for parallel research and implementation
- Should follow parallelization strategies described in each phase
- **Makes atomic commits** at the end of each phase

**Important:** Subagents cannot run Bash commands. They can only read files, search code, and write code. The executor must run all Bash commands (tests, builds, git operations).

---

## Phase Overview

| Phase | Name | Effort | Dependencies |
|-------|------|--------|--------------|
| 0 | [Zero-Indexed Measures](./phase-0-zero-indexed-measures.md) | 1-2 days | None (prerequisite) |
| 1 | [Foundation & Data Model](./phase-1-foundation.md) | 2-3 days | Phase 0 |
| 2 | [Commands & API](./phase-2-commands-api.md) | 1-2 days | Phase 1 |
| 3 | [Multi-System Rendering](./phase-3-multi-system-rendering.md) | 3-4 days | Phases 1, 2 |
| 4 | [Score Setup Dialog](./phase-4-score-setup-dialog.md) | 2-3 days | Phase 2 |
| 5 | [Toolbar Controls](./phase-5-toolbar-controls.md) | 1 day | Phases 2, 4 |
| 6 | [Print Support](./phase-6-print-support.md) | 2 days | Phase 3 |
| 7 | [Metadata Rendering](./phase-7-metadata-rendering.md) | 3-4 days | Phases 2, 3 |
| 8 | [Export Integration](./phase-8-export-integration.md) | 1 day | Phases 1, 2 |
| 9 | [Polish & Testing](./phase-9-polish-testing.md) | 2-3 days | All |

**Total Estimated Effort:** 18-25 days

---

## Dependency Graph

```
Phase 0 (Zero-Indexed Measures) ← PREREQUISITE
    │
    └─── Phase 1 (Foundation)
             │
             ├─── Phase 2 (Commands & API)
             │        │
             │        ├─── Phase 3 (Multi-System Rendering)
             │        │        │
             │        │        ├─── Phase 6 (Print Support)
             │        │        │
             │        │        └─── Phase 7 (Metadata Rendering)
             │        │
             │        ├─── Phase 4 (Score Setup Dialog)
             │        │        │
             │        │        └─── Phase 5 (Toolbar Controls)
             │        │
             │        └─── Phase 8 (Export Integration)
             │
             └─── Phase 9 (Polish & Testing) ← depends on ALL
```

---

## Parallelization Opportunities

Phases that can run in parallel (after dependencies met):
- **Phases 3, 4, 8** can run in parallel after Phase 2 completes
- **Phases 5, 6, 7** can run in parallel after Phase 3 completes

Maximum parallelism execution order:
1. Phase 0 (sequential, prerequisite)
2. Phase 1 (sequential)
3. Phase 2 (sequential)
4. Phases 3 + 4 + 8 (parallel)
5. Phases 5 + 6 + 7 (parallel, after Phase 3)
6. Phase 9 (sequential, final)

---

## Phase Structure

Every phase prompt includes:

### 1. Objective & Deliverables
What to build and what files to create/modify.

### 2. Implementation Details
Code snippets, type definitions, and algorithm notes.

### 3. Parallelization Strategy
Which subagents to spawn and what they should do.

### 4. Acceptance Criteria
Checklist of requirements that must pass.

### 5. User Walkthrough & Manual Testing
**Step-by-step instructions for verifying the phase works correctly.** This section ensures the executor can manually test all functionality before moving on.

### 6. Phase Completion & Recalibration
- **Recalibration checklist** to verify everything works
- **Review next phase** prompt for any needed updates
- **Commit template** for atomic commits
- **Notes for subsequent phases** on what's now available

---

## Recalibration Process

After completing each phase:

1. **Run tests and lint**
   ```bash
   npm run test
   npm run lint
   ```

2. **Manual testing** - Follow the User Walkthrough section

3. **Review discoveries** - Did you learn anything that affects later phases?

4. **Update next phase prompt** - If needed, modify the next phase to incorporate learnings

5. **Atomic commit** - Use the provided commit template

6. **Proceed to next phase**

---

## Reference Documents

Each prompt pulls context from:
- [PRD.md](../PRD.md) - Product Requirements
- [SRS.md](../SRS.md) - Software Requirements Specification
- [SDD.md](../SDD.md) - Software Design Document
- [docs/AGENTS.md](../../../AGENTS.md) - Agent coding guidelines

---

## Common Patterns

All phases reference these project patterns:

### Layer Hierarchy
```
Components → Hooks → Engines → Services
```

### Command Pattern
All state mutations use undoable commands.

### Structured Feedback (ADR-011)
Never throw; return result objects with `{ ok, value }` or `{ ok, error }`.

### CSS Conventions
- Namespace: `.riff-` prefix
- BEM: `.riff-Block__element--modifier`
- Variables: `--riff-*`

### TypeScript Rules
- No `any`
- Explicit return types on exports
- Unions over enums

---

## Quick Start

To execute a phase:

1. Read the phase prompt document
2. Spawn research subagents as specified
3. Implement files in parallel where noted
4. Run tests: `npm run test`
5. Run lint: `npm run lint`
6. **Follow User Walkthrough for manual testing**
7. Verify acceptance criteria
8. **Complete recalibration checklist**
9. **Make atomic commit**
10. Proceed to next phase

---

## Key Interaction Pattern

Phase 7 (Metadata Rendering) reuses the **ChordTrack interaction pattern**:
- Hover preview with 50% opacity placeholders
- Click-to-edit with text selection
- Tab/Shift+Tab navigation
- Cmd/Ctrl+Click for selection without editing
- Enter to commit, Escape to cancel

Before implementing Phase 7, read:
- `src/components/Canvas/ChordTrack.tsx`
- `src/components/Canvas/ChordSymbol.tsx`
- `src/components/Canvas/ChordInput.tsx`
- `src/hooks/useChordTrack.ts`

---

## Documentation Updates

Phase 9 includes a comprehensive documentation update checklist. Ensure these files are updated before closing #174:

- `docs/AGENTS.md` - Add new files and patterns
- `docs/ARCHITECTURE.md` - Document new services
- `docs/API.md` - Document new API methods
- `docs/COMMANDS.md` - Document new commands
- `README.md` - Update features list
- `CHANGELOG.md` - Add release notes
