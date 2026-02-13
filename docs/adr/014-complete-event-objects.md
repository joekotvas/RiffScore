# ADR-014: Complete Event Objects for Commands

> **Principle**: Data Integrity  
> **Status**: Accepted  
> **Date**: 2026-01-02  
> **RFC**: [rfc-insert-event-command.md](../migration/rfc-insert-event-command.md)

## Context

Event insertion commands originally accepted individual properties as constructor parameters:

```typescript
// Previous approach
dispatch(new AddEventCommand(measureIndex, isRest, notes[0], duration, dotted));
```

This pattern caused a bug: when events overflowed to the next measure in insert mode, properties like `tuplet` were silently lost. The command had no parameter for `tuplet`, so overflow logic couldn't preserve it.

As the `ScoreEvent` type evolved to include more properties (`tuplet`, `tied`, future additions), every command accepting events would need signature updates—a maintenance burden and source of regressions.

## Decision

Commands that insert or modify events accept **complete `ScoreEvent` objects** rather than individual properties.

### Key Design Choices

| Aspect | Decision |
|--------|----------|
| **Input** | Full `ScoreEvent` object with all properties |
| **Cloning** | `structuredClone()` ensures independence from input |
| **Undo** | Filter by `event.id`—no index tracking needed |
| **Extensibility** | New properties require no command signature changes |

### Implementation

```typescript
export class InsertEventCommand implements Command {
  constructor(
    private measureIndex: number,
    private event: ScoreEvent,       // Complete object
    private insertIndex?: number,
    private staffIndex: number = 0
  ) {}

  execute(score: Score): Score {
    const clonedEvent = structuredClone(this.event);
    // Insert clonedEvent...
  }

  undo(score: Score): Score {
    // Filter by this.event.id
  }
}
```

## Consequences

### Positive

- **Bug fixed**: Tuplet and other properties survive overflow.
- **Future-proof**: Adding properties to `ScoreEvent` doesn't break command signatures.
- **Simpler callers**: No need to destructure events before dispatching.

### Negative

- **Larger footprint**: Command objects store complete event copies.
- **Caller responsibility**: Callers must construct valid `ScoreEvent` objects (handled by utilities).

## Alternatives Considered

| Alternative | Why Rejected |
|-------------|--------------|
| Add `tuplet` parameter to existing commands | Doesn't scale; same problem repeats for next property |
| Partial object with merge logic | Merge semantics vary by property; error-prone |
| Property bag / `Record<string, unknown>` | Loses type safety |

## Related

- [RFC: InsertEventCommand](../migration/rfc-insert-event-command.md)
- [ADR-003: Transaction Batching](./003-transaction-batching.md)
- [Issue #161](https://github.com/joekotvas/RiffScore/issues/161)
