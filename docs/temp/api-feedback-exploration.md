# API Feedback and Error Handling Exploration

> Feature exploration for standardizing feedback, error handling, and status awareness through the RiffScore API while maintaining chainability.

## Current State

RiffScore API methods currently:
- **Return `this`** for chainability (always, even on failure)
- **Log warnings** via `logger.log(..., LogLevel.WARN)` on failure
- **No structured status** returned to the caller
- **No way to detect** if an operation succeeded or failed programmatically

```typescript
// Current behavior
api.addNote('InvalidPitch')  // Logs warning, returns `this` silently
   .addNote('C4');           // Continues chain, no way to know first failed
```

---

## Goals

1. **Maintain chainability** — All mutation methods return `this`
2. **Provide status feedback** — Callers can check if operations succeeded
3. **Structured error info** — Access error details without parsing console
4. **Non-breaking** — Existing code continues to work unchanged
5. **Developer-friendly** — Clear DX for debugging and conditional logic

---

## Options Explored

### Option 1: Status Property on API Instance

Add a `status` or `lastResult` property that updates after each operation.

```typescript
api.addNote('C4');
console.log(api.status);  // { ok: true, method: 'addNote', ... }

api.addNote('InvalidPitch');
console.log(api.status);  // { ok: false, method: 'addNote', error: '...' }
```

**API Shape:**
```typescript
interface APIStatus {
  ok: boolean;
  method: string;
  error?: string;
  timestamp: number;
}

interface MusicEditorAPI {
  status: APIStatus;
  // ... existing methods
}
```

**Pros:**
- Simple to implement
- Non-breaking (existing code ignores it)
- Chainability preserved

**Cons:**
- Only reflects *last* operation (chained ops overwrite)
- Must check immediately after call
- Mutable shared state

---

### Option 2: Status History Array

Track all operation results in a history array.

```typescript
api.addNote('C4').addNote('InvalidPitch').addNote('D4');

console.log(api.history);
// [
//   { ok: true, method: 'addNote', args: ['C4'] },
//   { ok: false, method: 'addNote', args: ['InvalidPitch'], error: '...' },
//   { ok: true, method: 'addNote', args: ['D4'] }
// ]
```

**API Shape:**
```typescript
interface MusicEditorAPI {
  history: APIStatus[];
  clearHistory(): this;
  // ... existing methods
}
```

**Pros:**
- Full audit trail
- Debug-friendly
- Works with long chains

**Cons:**
- Memory growth if not cleared
- Overhead for every operation
- More complex implementation

---

### Option 3: Event-Based Feedback

Emit events on success/failure that listeners can subscribe to.

```typescript
api.on('error', (err) => {
  console.error('Operation failed:', err.method, err.message);
});

api.on('success', (result) => {
  console.log('Completed:', result.method);
});

api.addNote('InvalidPitch');  // Triggers 'error' event
```

**Pros:**
- Decoupled from method calls
- Non-blocking
- Already have `on()` infrastructure

**Cons:**
- Async mental model for sync operations
- Must subscribe before operations
- Doesn't help inline conditional logic

---

### Option 4: Optional Callback Parameter

Add optional callback to each method for immediate feedback.

```typescript
api.addNote('C4', 'quarter', false, (result) => {
  if (!result.ok) console.error(result.error);
});
```

**Pros:**
- Targeted feedback per operation
- Doesn't break existing code (callback is optional)

**Cons:**
- Clutters method signatures
- Inconsistent with current API design
- Harder to chain (callback runs mid-chain)

---

### Option 5: Result Object with Value Method

Return a result wrapper that has both chaining and value access.

```typescript
const result = api.addNote('C4');
result.addNote('D4');           // Chain continues
console.log(result.value());    // { ok: true, ... } or throws
console.log(result.ok);         // true/false
```

**Pros:**
- Best of both worlds
- Fluent and inspectable

**Cons:**
- Breaking change to return type
- Complex TypeScript typing
- Unusual pattern

---

### Option 6: Hybrid — Status Property + Events (Recommended)

Combine Options 1 and 3 for comprehensive feedback.

```typescript
// Immediate check (last operation status)
api.addNote('C4');
if (api.ok) {  /* ... */ }

// Event-based (for logging/monitoring)
api.on('error', handleError);
api.on('operation', logOperation);  // All operations
```

**API Shape:**
```typescript
interface MusicEditorAPI {
  // Status properties
  ok: boolean;               // true if last operation succeeded
  lastError: string | null;  // Error message or null
  
  // Events
  on(event: 'error', cb: (err: OperationError) => void): Unsubscribe;
  on(event: 'operation', cb: (result: OperationResult) => void): Unsubscribe;
  
  // ... existing methods and events
}

interface OperationResult {
  ok: boolean;
  method: string;
  args?: unknown[];
  error?: string;
  timestamp: number;
}
```

## Option 7: Debug Mode (For Development)

Sometimes developers only need verbose feedback while writing scripts, not in production.

```typescript
// Enable debug mode
api.debug(true)
   .selectNext()
   .transpose(2);

// Internal behavior:
selectNext() {
  if (this._debug) console.log('[RiffScore] selectNext: Boundary reached');
  return this;
}
```

**Pros:**
- Zero overhead in production
- Simple toggle
- Familiar pattern

**Cons:**
- Only console output
- No programmatic access to status

---

## Result Interface

A structured result object with status levels and musical context:

```typescript
interface Result {
  // Core status
  ok: boolean;
  status: 'info' | 'warning' | 'error';
  
  // Operation context
  method: string;
  message: string;
  timestamp: number;
  
  // Musical details (when relevant)
  details?: {
    selectedCount?: number;
    measures?: number[];
    staves?: ('treble' | 'bass')[];
    quant?: number;
  };
}
```

**Examples:**
```typescript
// Successful selection
api.result = { 
  ok: true, 
  status: 'info',
  method: 'selectRange',
  message: '10 notes selected across 3 measures',
  details: { selectedCount: 10, measures: [1, 2, 3], staves: ['treble', 'bass'] }
}

// Boundary warning
api.result = {
  ok: true,  // Operation completed, but with caveat
  status: 'warning',
  method: 'selectNext',
  message: 'End of measure reached',
  details: { measures: [4] }
}

// Error
api.result = {
  ok: false,
  status: 'error', 
  method: 'addNote',
  message: 'Invalid pitch format "X99"',
  details: {}
}
```

---

## Updated Recommendation

**Use State Inspection + Callbacks + Debug Mode**

Combining the best patterns:

### 1. State Inspection (Primary)
```typescript
interface MusicEditorAPI {
  // Read-only result of last operation
  result: Result;
  
  // Convenience accessor
  readonly ok: boolean;  // Shorthand for result.ok
}
```

### 2. Callback Subscriptions (For UI/Logging)
```typescript
const api = riffScore.get('score-1');

// Subscribe to all operations
api.on('operation', (result: Result) => {
  updateStatusBar(result.message);
});

// Subscribe to errors only
api.on('error', (result: Result) => {
  showToast(`Error: ${result.message}`);
});
```

### 3. Debug Mode (For Development)
```typescript
api.debug(true);  // Enable verbose console logging
api.debug(false); // Disable for production
```

### Complete Usage:
```typescript
// Setup (once)
const api = riffScore.get('my-score');
api.on('error', showErrorToast);
api.debug(process.env.NODE_ENV === 'development');

// Script execution
api
  .select(1)
  .addNote('C4')
  .transpose(2);

// Inline check if needed
if (!api.ok) {
  console.error(api.result.message);
  console.log('Details:', api.result.details);
}
```

---

## Command-Query Separation (CQS)

For strict data validation before proceeding, use explicit query methods:

```typescript
// Command (mutates, returns this)
api.selectMeasure(1).addNote('C#');

// Query (reads, returns data)
const info = api.getSelectionInfo();
// { count: 4, staves: ['treble'], measures: [1], notes: [...] }

// Resume chain
api.play();
```

This keeps commands chainable while providing explicit query points.

---

## Implementation Complexity

| Feature | Effort |
|---------|--------|
| `result` property with Result interface | Low |
| `ok` convenience getter | Low |
| Update all API methods | Medium |
| `on('operation')` / `on('error')` events | Low |
| `debug(flag)` method | Low |
| Structured `details` in Result | Medium |

**Total: ~1-2 days**

---

## Open Questions

1. Should `status: 'warning'` still set `ok: true`? (I say yes — operation succeeded but with caveat)
2. Should `debug()` be per-instance or global?
3. Should `details` be typed per-method or generic object?

---

## Next Steps

1. Finalize Feedback interface
2. Create GitHub issue for implementation
3. Update `api.types.ts` with new types
4. Add status management to API factory
5. Update all API methods to emit feedback

