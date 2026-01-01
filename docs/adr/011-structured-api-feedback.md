# 11. Structured API Feedback Pattern

Date: 2026-01-01

## Status

Accepted

## Context

The `MusicEditorAPI` (accessed via `window.riffScore`) previously lacked a consistent mechanism for reporting operation outcomes.
*   Some methods logged warnings to the console on failure (e.g., "Invalid pitch").
*   Others failed silently or threw errors unexpectedly.
*   Fluent method chaining (e.g., `api.select(1).addNote('C4')`) made it difficult to determine *which* step in a chain failed without verbose try/catch blocks or inspecting console logs.
*   External consumers (scripts, tests) had no programmatic way to verify if an action succeeded.

## Decision

We will implement a **Structured Feedback** pattern with a **Fail-Soft** policy for the public API.

### 1. Unified `Result` Object
Every API method will update an internal state property `result` with a standardized object:

```typescript
interface Result {
  ok: boolean;           // Success/Failure flag
  status: 'success' | 'warning' | 'error';
  code: string;          // Machine-readable code (e.g., 'INVALID_PITCH')
  message: string;       // Human-readable description
  method: string;        // The method that generated this result
  details?: Record<string, unknown>; // Context-specific data
  timestamp: number;
}
```

### 2. Fail-Soft Policy
Public API methods **must never throw exceptions** for recoverable usage errors (e.g., invalid input, out-of-bounds indices).
*   **Invalid Input**: The interaction is logged as a failure in `result`, but the method returns `this` (the API instance) to allow chaining to continue.
*   **Critical Failures**: Only catastrophic system errors (e.g., missing dependencies) may throw.

### 3. Sticky Error State (`hasError`)
To support fluent chaining, we introduce a sticky `hasError` flag.
*   If *any* operation in a chain fails, `hasError` becomes `true`.
*   It remains `true` until explicitly reset via `api.clearStatus()`.
*   This allows users to execute a chain and check for success at the end:

```javascript
api.select(1).addNote('A').addNote('B');
if (api.hasError) { handleFailure(); }
```

### 4. Event-Driven Observability
The API will emit events for granular monitoring:
*   `operation`: Fired after *every* method call with the `Result` object.
*   `error`: Fired specifically when `ok` is false.

## Consequences

### Positive
*   **Robustness**: Consumer scripts will not crash due to minor input errors.
*   **Testability**: Tests can assert `expect(api.result.code).toBe('INVALID_PITCH')` instead of spying on `console.warn`.
*   **Observability**: UI indicators (toasts, status bars) can subscribe to `error` events to show feedback to end-users.
*   **Consistency**: All methods now behave predictably regarding feedback.

### Negative
*   **Verbosity**: Consumers wishing to handle errors must explicitly check `api.result` or `api.hasError` rather than relying on standard `try/catch` flow control.
*   **Silent Failures**: If a user ignores `result` and `hasError`, a script might partially execute (some steps working, others failing) without them realizing, potentially leaving the score in an unintended state.

## Implementation Details

*   The implementation is centralized in `useScoreAPI` via a `setResult` function.
*   All individual API factory modules (`entry.ts`, `navigation.ts`, etc.) instrument their methods to call `setResult`.
*   A `collect()` helper method is provided to batch-capture results for a block of operations, returning an aggregated report.
