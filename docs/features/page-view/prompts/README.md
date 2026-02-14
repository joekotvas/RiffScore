# Page View Implementation Prompts

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)

This directory contains agent prompt documents for implementing the Page View & Print feature. Each phase is designed to be executed by an AI agent with subagents for parallelization.

---

## Execution Model

Each prompt is designed for a **prompt executor** that:
- Can run Bash commands directly
- Can spawn subagents for parallel research and implementation
- Should follow parallelization strategies described in each phase

**Important:** Subagents cannot run Bash commands. They can only read files, search code, and write code. The executor must run all Bash commands (tests, builds, git operations).

---

## Phase Overview

| Phase | Name | Effort | Dependencies |
|-------|------|--------|--------------|
| 1 | [Foundation & Data Model](./phase-1-foundation.md) | 2-3 days | None |
| 2 | [Commands & API](./phase-2-commands-api.md) | 1-2 days | Phase 1 |
| 3 | [Multi-System Rendering](./phase-3-multi-system-rendering.md) | 3-4 days | Phases 1, 2 |
| 4 | [Score Setup Dialog](./phase-4-score-setup-dialog.md) | 2-3 days | Phase 2 |
| 5 | [Toolbar Controls](./phase-5-toolbar-controls.md) | 1 day | Phases 2, 4 |
| 6 | [Print Support](./phase-6-print-support.md) | 2 days | Phase 3 |
| 7 | [Metadata Rendering](./phase-7-metadata-rendering.md) | 3-4 days | Phases 2, 3 |
| 8 | [Export Integration](./phase-8-export-integration.md) | 1 day | Phases 1, 2 |
| 9 | [Polish & Testing](./phase-9-polish-testing.md) | 2-3 days | All |

**Total Estimated Effort:** 17-23 days

---

## Dependency Graph

```
Phase 1 (Foundation)
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
1. Phase 1 (sequential)
2. Phase 2 (sequential)
3. Phases 3 + 4 + 8 (parallel)
4. Phases 5 + 6 + 7 (parallel, after Phase 3)
5. Phase 9 (sequential, final)

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
6. Verify acceptance criteria

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
