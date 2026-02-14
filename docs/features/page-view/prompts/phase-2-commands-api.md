# Phase 2: Commands & API

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 1-2 days
**Dependencies:** Phase 1 (types, config, services)

---

## Objective

Create the command pattern infrastructure for layout and metadata mutations, plus API factory methods that expose these capabilities to components.

---

## Deliverables

1. `SetViewModeCommand.ts` - Toggle view modes
2. `SetLayoutConfigCommand.ts` - Update layout settings
3. `SetMetadataCommand.ts` - Update metadata fields
4. `layout.ts` API factory
5. `metadata.ts` API factory
6. Integration with `useScoreAPI.ts`
7. Unit tests for all commands

---

## Commands

Create `src/commands/layout/` directory with:

### SetViewModeCommand.ts

```typescript
import { Command, CommandResult } from '@/commands/types';
import { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export class SetViewModeCommand implements Command {
  readonly type = 'SET_VIEW_MODE';
  private previousMode: LayoutConfig['viewMode'];

  constructor(private newMode: LayoutConfig['viewMode']) {}

  execute(score: Score): CommandResult<Score> {
    const layout = score.layout ?? DEFAULT_LAYOUT_CONFIG;
    this.previousMode = layout.viewMode;

    if (this.previousMode === this.newMode) {
      return { ok: true, value: score };
    }

    return {
      ok: true,
      value: {
        ...score,
        layout: { ...layout, viewMode: this.newMode },
      },
    };
  }

  undo(score: Score): CommandResult<Score> {
    const layout = score.layout ?? DEFAULT_LAYOUT_CONFIG;
    return {
      ok: true,
      value: {
        ...score,
        layout: { ...layout, viewMode: this.previousMode },
      },
    };
  }

  describe(): string {
    return `Set view mode to ${this.newMode}`;
  }
}
```

### SetLayoutConfigCommand.ts

```typescript
import { Command, CommandResult } from '@/commands/types';
import { Score, LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export class SetLayoutConfigCommand implements Command {
  readonly type = 'SET_LAYOUT_CONFIG';
  private previousConfig: LayoutConfig;

  constructor(private updates: Partial<LayoutConfig>) {}

  execute(score: Score): CommandResult<Score> {
    this.previousConfig = score.layout ?? DEFAULT_LAYOUT_CONFIG;

    const newConfig: LayoutConfig = {
      ...this.previousConfig,
      ...this.updates,
    };

    // Validate margins preset
    if (newConfig.margins && !['narrow', 'normal', 'wide'].includes(newConfig.margins)) {
      newConfig.margins = 'normal';
    }

    // Validate and round staff size to nearest 10%
    newConfig.staffSize = Math.round(clamp(newConfig.staffSize, 50, 150) / 10) * 10;

    return {
      ok: true,
      value: { ...score, layout: newConfig },
    };
  }

  undo(score: Score): CommandResult<Score> {
    return {
      ok: true,
      value: { ...score, layout: this.previousConfig },
    };
  }

  describe(): string {
    return 'Update layout configuration';
  }
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
```

### SetMetadataCommand.ts

```typescript
import { Command, CommandResult } from '@/commands/types';
import { Score, ScoreMetadata } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';
import { validateMetadata, normalizeMetadata } from '@/services/MetadataService';

export class SetMetadataCommand implements Command {
  readonly type = 'SET_METADATA';
  private previousMetadata: ScoreMetadata;

  constructor(private updates: Partial<ScoreMetadata>) {}

  execute(score: Score): CommandResult<Score> {
    this.previousMetadata = score.metadata ?? DEFAULT_SCORE_METADATA;

    const merged = { ...this.previousMetadata, ...this.updates };

    // Validate
    const validation = validateMetadata(merged);
    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: Object.values(validation.errors).join(', '),
        },
      };
    }

    // Normalize and apply
    const normalized = normalizeMetadata(merged);

    return {
      ok: true,
      value: { ...score, metadata: normalized },
    };
  }

  undo(score: Score): CommandResult<Score> {
    return {
      ok: true,
      value: { ...score, metadata: this.previousMetadata },
    };
  }

  describe(): string {
    return 'Update score metadata';
  }
}
```

### index.ts (barrel export)

```typescript
export { SetViewModeCommand } from './SetViewModeCommand';
export { SetLayoutConfigCommand } from './SetLayoutConfigCommand';
export { SetMetadataCommand } from './SetMetadataCommand';
```

---

## API Factories

### layout.ts (src/hooks/api/layout.ts)

```typescript
import { APIContext } from './types';
import { SetViewModeCommand, SetLayoutConfigCommand } from '@/commands/layout';
import { LayoutConfig } from '@/types';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

export const createLayoutMethods = (ctx: APIContext) => ({
  getViewMode(): LayoutConfig['viewMode'] {
    return ctx.getScore().layout?.viewMode ?? 'scroll';
  },

  setViewMode(mode: LayoutConfig['viewMode']) {
    ctx.execute(new SetViewModeCommand(mode));
    return ctx.api;
  },

  toggleViewMode() {
    const current = this.getViewMode();
    return this.setViewMode(current === 'scroll' ? 'page' : 'scroll');
  },

  getLayoutConfig(): LayoutConfig {
    return ctx.getScore().layout ?? DEFAULT_LAYOUT_CONFIG;
  },

  setLayoutConfig(config: Partial<LayoutConfig>) {
    ctx.execute(new SetLayoutConfigCommand(config));
    return ctx.api;
  },

  resetLayoutConfig() {
    ctx.execute(new SetLayoutConfigCommand(DEFAULT_LAYOUT_CONFIG));
    return ctx.api;
  },
});
```

### metadata.ts (src/hooks/api/metadata.ts)

```typescript
import { APIContext } from './types';
import { SetMetadataCommand } from '@/commands/layout';
import { ScoreMetadata, Score, Note } from '@/types';
import { DEFAULT_SCORE_METADATA } from '@/config';

export const createMetadataMethods = (ctx: APIContext) => ({
  getMetadata(): ScoreMetadata {
    return ctx.getScore().metadata ?? DEFAULT_SCORE_METADATA;
  },

  setMetadata(metadata: Partial<ScoreMetadata>) {
    ctx.execute(new SetMetadataCommand(metadata));
    return ctx.api;
  },

  getTitle(): string {
    return this.getMetadata().title;
  },

  setTitle(title: string) {
    return this.setMetadata({ title });
  },

  getComposer(): string | undefined {
    return this.getMetadata().composer;
  },

  setComposer(composer: string) {
    return this.setMetadata({ composer });
  },

  getLyricist(): string | undefined {
    return this.getMetadata().lyricist;
  },

  setLyricist(lyricist: string) {
    return this.setMetadata({ lyricist });
  },

  getCopyright(): string | undefined {
    return this.getMetadata().copyright;
  },

  setCopyright(copyright: string) {
    return this.setMetadata({ copyright });
  },
});

export const createNavigationMethods = (ctx: APIContext) => ({
  /**
   * Select the first element in the score.
   * Used for Tab navigation from metadata fields into the score.
   */
  selectFirstElement() {
    const score = ctx.getScore();
    const firstNote = findFirstNote(score);

    if (firstNote) {
      ctx.selectionEngine.selectNote(firstNote.id);
    } else {
      ctx.selectionEngine.setCursorPosition({ measure: 0, quant: 0 });
    }
    return ctx.api;
  },

  /**
   * Select the last element in the score.
   * Used for Shift+Tab from title field back into score.
   */
  selectLastElement() {
    const score = ctx.getScore();
    const lastNote = findLastNote(score);

    if (lastNote) {
      ctx.selectionEngine.selectNote(lastNote.id);
    } else {
      const lastMeasure = score.staves[0]?.measures.length - 1 ?? 0;
      ctx.selectionEngine.setCursorPosition({ measure: lastMeasure, quant: 0 });
    }
    return ctx.api;
  },
});

function findFirstNote(score: Score): Note | null {
  for (const staff of score.staves) {
    for (const measure of staff.measures) {
      for (const voice of measure.voices) {
        const firstNote = voice.notes.find(n => n.type === 'note');
        if (firstNote) return firstNote;
      }
    }
  }
  return null;
}

function findLastNote(score: Score): Note | null {
  for (let s = score.staves.length - 1; s >= 0; s--) {
    const staff = score.staves[s];
    for (let m = staff.measures.length - 1; m >= 0; m--) {
      const measure = staff.measures[m];
      for (let v = measure.voices.length - 1; v >= 0; v--) {
        const voice = measure.voices[v];
        for (let n = voice.notes.length - 1; n >= 0; n--) {
          if (voice.notes[n].type === 'note') return voice.notes[n];
        }
      }
    }
  }
  return null;
}
```

---

## Integration

Update `src/hooks/api/useScoreAPI.ts`:

```typescript
import { createLayoutMethods } from './layout';
import { createMetadataMethods, createNavigationMethods } from './metadata';

// In the factory function, spread the new methods:
return {
  ...createLayoutMethods(ctx),
  ...createMetadataMethods(ctx),
  ...createNavigationMethods(ctx),
  // ... existing methods
};
```

Update `src/api.types.ts` with method signatures:

```typescript
export interface MusicEditorAPI {
  // ... existing methods ...

  // Layout API
  getViewMode(): 'scroll' | 'page';
  setViewMode(mode: 'scroll' | 'page'): this;
  toggleViewMode(): this;
  getLayoutConfig(): LayoutConfig;
  setLayoutConfig(config: Partial<LayoutConfig>): this;
  resetLayoutConfig(): this;

  // Metadata API
  getMetadata(): ScoreMetadata;
  setMetadata(metadata: Partial<ScoreMetadata>): this;
  getTitle(): string;
  setTitle(title: string): this;
  getComposer(): string | undefined;
  setComposer(composer: string): this;
  getLyricist(): string | undefined;
  setLyricist(lyricist: string): this;
  getCopyright(): string | undefined;
  setCopyright(copyright: string): this;

  // Navigation API
  selectFirstElement(): this;
  selectLastElement(): this;
}
```

---

## Coding Standards

### Command Pattern (docs/COMMANDS.md)

- Commands require both `execute()` and `undo()`
- Store previous state in private field for undo
- Return `CommandResult<Score>` (structured feedback)
- Use `describe()` for debugging/history UI

### API Factory Pattern (ADR-004)

- Single Responsibility: one factory per domain
- Fluent interface: methods return `ctx.api` for chaining
- Fail-soft: set error state via `setResult()`, never throw

### Testing Commands

```typescript
// Test as pure functions
const command = new SetViewModeCommand('page');
const result = command.execute(initialScore);
expect(result.ok).toBe(true);
expect(result.value.layout?.viewMode).toBe('page');

// Test undo
const undoResult = command.undo(result.value);
expect(undoResult.value.layout?.viewMode).toBe('scroll');
```

---

## Parallelization Strategy

### Parallel Implementation (3 subagents)
1. **Commands Agent:** Create all three command files
2. **Layout API Agent:** Create layout.ts factory
3. **Metadata API Agent:** Create metadata.ts factory (including navigation methods)

### Sequential Integration (Executor)
After all files created:
1. Create barrel export index.ts
2. Update useScoreAPI.ts integration
3. Update api.types.ts

### Parallel Testing (2 subagents)
1. **Command Tests Agent:** Write tests for all commands
2. **API Tests Agent:** Write integration tests for API methods

### Final Step (Executor)
Run `npm run test` and `npm run lint` to verify.

---

## Acceptance Criteria

- [ ] All three commands created in `src/commands/layout/`
- [ ] Barrel export in `src/commands/layout/index.ts`
- [ ] `layout.ts` API factory created
- [ ] `metadata.ts` API factory created (with navigation methods)
- [ ] `useScoreAPI.ts` updated to spread new methods
- [ ] `api.types.ts` updated with new method signatures
- [ ] Command tests pass with 80%+ coverage
- [ ] All tests pass (`npm run test`)
- [ ] No lint errors (`npm run lint`)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/commands/layout/SetViewModeCommand.ts` | Create |
| `src/commands/layout/SetLayoutConfigCommand.ts` | Create |
| `src/commands/layout/SetMetadataCommand.ts` | Create |
| `src/commands/layout/index.ts` | Create |
| `src/hooks/api/layout.ts` | Create |
| `src/hooks/api/metadata.ts` | Create |
| `src/hooks/api/useScoreAPI.ts` | Modify |
| `src/api.types.ts` | Modify |
| `src/__tests__/commands/layout/LayoutCommands.test.ts` | Create |

---

## User Walkthrough & Manual Testing

After implementation, verify the following manually:

### 1. Run Tests
```bash
npm run test -- --coverage
npm run lint
```

### 2. Test Commands via API

Open the demo app and use browser console:

```javascript
// Get API instance
const api = window.riffScore.get('demo');

// Test view mode toggle
console.log('Current view mode:', api.getViewMode()); // 'scroll'
api.setViewMode('page');
console.log('After toggle:', api.getViewMode()); // 'page'

// Test undo
api.undo();
console.log('After undo:', api.getViewMode()); // 'scroll'

// Test layout config
api.setLayoutConfig({ staffSize: 120 });
console.log('Staff size:', api.getLayoutConfig().staffSize); // 120

// Test metadata
api.setMetadata({ title: 'Test Song', composer: 'Test Composer' });
console.log('Title:', api.getTitle()); // 'Test Song'
console.log('Composer:', api.getComposer()); // 'Test Composer'

// Test navigation methods
api.selectFirstElement();
// Verify cursor moves to first note

api.selectLastElement();
// Verify cursor moves to last note
```

### 3. Verify Undo/Redo
- Make several changes via API
- Use `api.undo()` multiple times
- Verify state reverts correctly
- Use `api.redo()` to restore

### 4. Check Type Safety
```bash
npx tsc --noEmit
```

---

## Phase Completion & Recalibration

### Before Moving to Phase 3

After completing Phase 2:

1. **Verify command integration**
   - Commands execute correctly through API
   - Undo/redo works for all commands
   - API methods chain properly (return `this`)

2. **Document any API changes**
   - Did you need to modify APIContext interface?
   - Are there missing methods that later phases will need?

3. **Review Phase 3 prompt**
   - Does multi-system rendering have access to layout API?
   - Are the command signatures correct for what Phase 3 needs?

### Recalibration Checklist

- [ ] All tests pass with 80%+ coverage for commands
- [ ] API methods work in browser console
- [ ] Undo/redo works correctly
- [ ] TypeScript compiles without errors
- [ ] No lint errors
- [ ] Phase 3 prompt reviewed and updated if needed

### Commit Template

```bash
git add src/commands/layout/ src/hooks/api/layout.ts src/hooks/api/metadata.ts \
        src/hooks/api/useScoreAPI.ts src/api.types.ts src/__tests__/commands/layout/
git commit -m "feat(#174): add layout and metadata commands and API

- Create SetViewModeCommand, SetLayoutConfigCommand, SetMetadataCommand
- Create layout.ts and metadata.ts API factories
- Add selectFirstElement() and selectLastElement() navigation methods
- Integrate new methods into useScoreAPI
- Update api.types.ts with new method signatures

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase, components can use:
- `api.toggleViewMode()` - Switch between scroll/page view
- `api.setLayoutConfig()` - Update page size, margins, staff size
- `api.setMetadata()` - Update title, composer, etc.
- `api.selectFirstElement()` - Navigate to first note (for Tab from metadata)

Phase 3 will use these APIs to control rendering.
