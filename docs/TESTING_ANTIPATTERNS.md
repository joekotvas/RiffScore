[← Back to TESTING](./TESTING.md)

# Testing Anti-Patterns

> Common testing mistakes and their corrections. Discovered during Phase 2g testing enhancement migration.

> **See also**: [Testing Guide](./TESTING.md) • [Contributing](./CONTRIBUTING.md)

---

## 1. Manual Cleanup

**ESLint Rule:** `testing-library/no-manual-cleanup`

### ❌ Anti-Pattern

```typescript
import { render, cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

### ✅ Correct

React Testing Library automatically runs cleanup after each test when used with Jest. No manual cleanup is needed.

```typescript
import { render } from '@testing-library/react';

// No afterEach cleanup needed!
```

---

## 2. Unnecessary Act Wrapping

**ESLint Rule:** `testing-library/no-unnecessary-act`

### ❌ Anti-Pattern

```typescript
import { act } from '@testing-library/react';

await act(async () => {
  // Empty or already-wrapped code
});
```

### ✅ Correct

RTL's `render`, `fireEvent`, and `userEvent` already wrap in act. Only wrap when directly calling React state updates.

```typescript
// userEvent already wraps in act
await user.click(button);

// fireEvent already wraps in act
fireEvent.click(button);
```

---

## 3. Using fireEvent Instead of userEvent

**ESLint Rule:** Not enforced (best practice)

### ❌ Anti-Pattern

```typescript
import { fireEvent } from '@testing-library/react';

fireEvent.click(button);
fireEvent.change(input, { target: { value: 'hello' } });
```

### ✅ Correct

`userEvent` simulates real user interactions more accurately (fires all related events).

```typescript
import userEvent from '@testing-library/user-event';

const user = userEvent.setup();
await user.click(button);
await user.type(input, 'hello');
```

---

## 4. Query by TestId When Accessible Query Exists

**ESLint Rule:** `testing-library/prefer-role-queries` (future)

### ❌ Anti-Pattern

```typescript
screen.getByTestId('submit-button');
```

### ✅ Correct

Prefer accessible queries that mirror how users find elements.

```typescript
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText('Email');
screen.getByText('Click me');
```

**Query Priority:**
1. `getByRole` — best for accessibility
2. `getByLabelText` — form elements
3. `getByText` — non-interactive elements
4. `getByTestId` — last resort

---

## 5. Manual jest-dom Import

**Corrected By:** Global `setupTests.ts`

### ❌ Anti-Pattern (Legacy)

```typescript
import '@testing-library/jest-dom';

test('example', () => { ... });
```

### ✅ Correct

After Phase 2g, jest-dom is imported globally in `setupTests.ts`.

```typescript
// No import needed - globally available
test('example', () => {
  expect(element).toBeInTheDocument();
  expect(element).toBeVisible();
});
```

---

## Anti-Pattern Tracking

| Pattern | Files Affected | Status |
| :--- | :---: | :--- |
| Manual cleanup | 1 | 🔲 To fix |
| Unnecessary act | 1 | 🔲 To fix |
| fireEvent → userEvent | ~10 | 🔲 To migrate |
| Manual jest-dom import | ~20 | 🔲 To remove |

---

[← Back to TESTING](./TESTING.md)
