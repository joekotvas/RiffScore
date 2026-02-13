# RiffScore Agent Documentation Index

> Quick-reference lookup for AI coding agents. Find the right doc without filling your context.

## Quick Navigation

| I need to... | Read this |
|--------------|-----------|
| Understand the codebase | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Follow coding standards | [CODING_PATTERNS.md](./CODING_PATTERNS.md) |
| Add a new command | [COMMANDS.md](./COMMANDS.md) |
| Work with selection | [SELECTION.md](./SELECTION.md) |
| Modify the API | [API.md](./API.md) |
| Write tests | [TESTING.md](./TESTING.md) |
| Configure the component | [CONFIGURATION.md](./CONFIGURATION.md) |
| Understand the data schema | [DATA_MODEL.md](./DATA_MODEL.md) |
| Work on layout/rendering | [LAYOUT_ENGINE.md](./LAYOUT_ENGINE.md) |
| Understand keyboard nav | [KEYBOARD_NAVIGATION.md](./KEYBOARD_NAVIGATION.md) |
| Review design decisions | [ADRs](./adr/) |
| Release a new version | [RELEASE_WORKFLOW.md](./RELEASE_WORKFLOW.md) |

---

## Architecture Overview (TL;DR)

```
Layers (top to bottom):
Components → Hooks → Engines → Services

Key patterns:
- Command pattern for all state mutations
- Separate ScoreEngine (undoable) and SelectionEngine (ephemeral)
- Factory pattern for API modules
- Quant system: 64 quants = 1 whole note
```

---

## Source File Quick Reference

### Core Types
| File | Contains |
|------|----------|
| `src/types.ts` | Score, Staff, Measure, Event, Note, Selection |
| `src/api.types.ts` | MusicEditorAPI interface |
| `src/componentTypes.ts` | Component prop types |
| `src/config.ts` | Layout constants |

### State Management
| File | Purpose |
|------|---------|
| `src/engines/ScoreEngine.ts` | Score mutations + undo/redo |
| `src/engines/SelectionEngine.ts` | Selection state (no undo) |
| `src/hooks/useScoreLogic.ts` | Main orchestration hook |
| `src/hooks/score/useScoreEngine.ts` | ScoreEngine React binding |
| `src/hooks/score/useSelection.ts` | Selection state hook |

### Commands
| Location | Type |
|----------|------|
| `src/commands/` | Score mutation commands |
| `src/commands/selection/` | Selection commands |
| `src/commands/types.ts` | Command interface |

### API Modules
| File | Methods |
|------|---------|
| `src/hooks/api/navigation.ts` | move, jump, select, selectById |
| `src/hooks/api/selection.ts` | selectAll, extend*, selectFullEvents |
| `src/hooks/api/entry.ts` | addNote, addRest, addTone, tuplets |
| `src/hooks/api/modification.ts` | setPitch, transpose, structure |
| `src/hooks/api/history.ts` | undo, redo, transactions |
| `src/hooks/api/playback.ts` | play, pause, stop |
| `src/hooks/api/io.ts` | loadScore, reset, export |
| `src/hooks/api/events.ts` | on() subscription wrapper |

### Layout Engine
| File | Purpose |
|------|---------|
| `src/engines/layout/positioning.ts` | Pitch → Y coordinate |
| `src/engines/layout/measure.ts` | Event positions, hit zones |
| `src/engines/layout/beaming.ts` | Beam groups |
| `src/engines/layout/stems.ts` | Stem directions/lengths |
| `src/engines/layout/tuplets.ts` | Tuplet brackets |

### Utilities
| File | Purpose |
|------|---------|
| `src/utils/core.ts` | Duration math, score reflow |
| `src/utils/selection.ts` | Selection helpers |
| `src/utils/verticalStack.ts` | 2D selection metrics |
| `src/utils/validation.ts` | Input validation |
| `src/utils/id.ts` | ID generation |
| `src/utils/navigation/` | Navigation logic |
| `src/utils/entry/` | Note insertion helpers |

### Services
| File | Purpose |
|------|---------|
| `src/services/MusicService.ts` | Tonal.js wrapper (theory) |
| `src/services/TimelineService.ts` | Playback timing |

### Components
| Location | Contains |
|----------|----------|
| `src/components/Canvas/` | SVG rendering (ScoreCanvas, Measure, Note, etc.) |
| `src/components/Toolbar/` | Toolbar controls |
| `src/components/Layout/` | Editor layout, overlays |
| `src/components/Assets/` | Icons, glyphs |

### Tests
| Location | Purpose |
|----------|---------|
| `src/__tests__/` | All test files |
| `src/__tests__/fixtures/` | Shared test scores |
| `src/__tests__/helpers/` | Test utilities and additional fixtures |

---

## Common Task Patterns

### Adding a Score Command

1. Create `src/commands/MyCommand.ts`:
```typescript
export class MyCommand implements Command {
  readonly type = 'MY_COMMAND';
  private previousValue: any;  // Store for undo

  execute(state: Score): Score {
    this.previousValue = state.someField;
    return {...state, /* changes */};
  }

  undo(state: Score): Score {
    return {...state, someField: this.previousValue };
  }
}
```
2. Export from `src/commands/index.ts`
3. Add tests in `src/__tests__/commands/`

> **Note**: Score commands require both `execute()` and `undo()`. Selection commands only need `execute()` (no undo history).

### Adding a Selection Command

1. Create `src/commands/selection/MySelectionCommand.ts`
2. Implement `SelectionCommand` interface
3. Export from `src/commands/selection/index.ts`

### Adding an API Method

1. Add to appropriate factory in `src/hooks/api/`
2. Add type signature to `src/api.types.ts`
3. Use structured feedback pattern (never throw):
```typescript
if (!valid) {
  setResult({ ok: false, code: 'ERROR_CODE', message: '...' });
  return this;
}
```

### Writing Tests

- Use fixtures from `src/__tests__/fixtures/` and helpers from `src/__tests__/helpers/`
- Test commands as pure functions: `command.execute(state, context)`
- For API tests: render `<RiffScore id="test" />`, get API via `window.riffScore.get('test')`
- Use `waitFor()` for async subscription callbacks

---

## Key Concepts (One-Liners)

| Concept | Definition |
|---------|------------|
| **Quant** | Smallest time unit (64 per whole note, 16 per quarter) |
| **Ghost Cursor** | Preview of note to be inserted (`eventId === null`) |
| **Vertical Metric** | `(100 - staffIndex) * 1000 + midi` for 2D selection |
| **Anchor** | Fixed point in range selection |
| **Transaction** | Batch of commands = single undo step |
| **Fail-Soft** | API methods return `this` + set error state, never throw |

---

## ADR Index (Design Decisions)

| # | Topic | Key Insight |
|---|-------|-------------|
| 001 | Vertical Selection | Per-slice anchors for independent chord extension |
| 002 | Event Subscriptions | Observer pattern for decoupled state listeners |
| 003 | Transaction Batching | Unit of Work pattern for atomic operations |
| 004 | API Factory Pattern | SRP via domain-specific API modules |
| 005 | Selection Dispatch | Command pattern for selection (single source of truth) |
| 006 | Synchronous API | Engine queries reflect immediate state |
| 007 | Clef Reference | Open-Closed principle via reference table |
| 008 | Observability | Separate transactional (batch) vs failure (error) events |
| 009 | Pattern Governance | Explicit approval for new architectural patterns |
| 010 | Composition Hooks | Bundle related hooks to reduce prop drilling |
| 011 | Structured Feedback | Result objects + sticky error states |
| 012 | Bundled Fonts | Zero-config font delivery |
| 013 | Deferred Audio | Dynamic import for Tone.js |
| 014 | Complete Events | Event objects contain full context |

---

## CSS Conventions

- **Namespace**: All classes use `.riff-` prefix
- **BEM**: `.riff-Block__element--modifier`
- **Variables**: `--riff-color-primary`, `--riff-spacing-unit`
- **No preprocessors**: Vanilla CSS only
- **Co-location**: Styles next to components

---

## TypeScript Rules

- **No `any`**: Strictly forbidden
- **Explicit returns**: All exports have explicit return types
- **Unions over enums**: `type Direction = 'up' | 'down'`
- **Path aliases**: `@/`, `@hooks/`, `@commands/`, etc.

---

## Testing Coverage Requirements

| Area | Target |
|------|--------|
| New/Modified files | 100% |
| Commands | 80%+ |
| Utils | 85%+ |
| Services | 95%+ |

---

## Scripts Reference

```bash
npm run demo:dev    # Dev server with hot reload
npm run build       # Build library
npm run test        # Run tests
npm run lint        # ESLint check
npm run format      # Prettier format
```

---

## Don't Read Unless Needed

| Topic | Why Skip |
|-------|----------|
| `docs/migration/` | Historical planning docs |
| `docs/audit/` | Bundle optimization audit (complete) |
| `docs/temp/` | Temporary exploration notes |
| `QUALITY_CHECK.md` | Manual QA checklist |
| `TESTING_ANTIPATTERNS.md` | Only if writing tests |
