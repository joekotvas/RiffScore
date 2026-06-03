# Phase 5: Toolbar Controls

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 1 day
**Dependencies:** Phase 2 (Commands & API), Phase 4 (Score Setup Dialog)

---

## Objective

Add toolbar buttons for view mode toggle, score setup, and print functionality with keyboard shortcuts.

---

## Deliverables

1. `ViewToggle.tsx` - View mode toggle button
2. `ScoreSetupButton.tsx` - Opens Score Setup dialog
3. `PrintButton.tsx` - Opens print dialog
4. Updated `Toolbar.tsx` with new buttons
5. Keyboard shortcuts registered

---

## Requirements Reference

From PRD:
- **FR-02:** Toggle view mode via toolbar button or `Cmd+\` / `Ctrl+\`
- **FR-31–32:** View Toggle button with icon indicating current mode
- **FR-33:** Score Setup button opens dialog
- **FR-34:** `Cmd+,` / `Ctrl+,` opens Score Setup
- **FR-34a–b:** Print button with printer icon

---

## Component Designs

### ViewToggle.tsx

```typescript
/**
 * ViewToggle
 *
 * Toolbar button to toggle between scroll and page view.
 * Uses ToolbarButton for consistent styling.
 */

import React from 'react';
import { useScoreAPI } from '@/hooks/api/useScoreAPI';
import { ToolbarButton } from '@/components/Toolbar/ToolbarButton';
import { CONFIG } from '@/config';
import { isMac } from '@/utils/platform';

const ICON_SIZE = CONFIG.toolbar.iconSize;

export const ViewToggle: React.FC = () => {
  const api = useScoreAPI();
  const viewMode = api.getViewMode();
  const isPageView = viewMode === 'page';

  const handleToggle = () => {
    api.toggleViewMode();
  };

  const shortcutKey = isMac() ? '⌘' : 'Ctrl';

  return (
    <ToolbarButton
      label={isPageView ? 'Scroll View' : 'Page View'}
      icon={isPageView ? <ScrollViewIcon /> : <PageViewIcon />}
      onClick={handleToggle}
      title={`${isPageView ? 'Scroll View' : 'Page View'} (${shortcutKey}+\\)`}
      isActive={isPageView}
    />
  );
};

const ScrollViewIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE} fill="currentColor">
    <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" />
  </svg>
);

const PageViewIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE} fill="none" stroke="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="2" />
    <path d="M3 9h18M3 15h18" strokeWidth="1.5" />
  </svg>
);
```

### ScoreSetupButton.tsx

```typescript
/**
 * ScoreSetupButton
 *
 * Toolbar button to open the Score Setup dialog.
 */

import React from 'react';
import { ToolbarButton } from '@/components/Toolbar/ToolbarButton';
import { CONFIG } from '@/config';
import { isMac } from '@/utils/platform';

const ICON_SIZE = CONFIG.toolbar.iconSize;

interface ScoreSetupButtonProps {
  onClick: () => void;
}

export const ScoreSetupButton: React.FC<ScoreSetupButtonProps> = ({ onClick }) => {
  const shortcutKey = isMac() ? '⌘' : 'Ctrl';

  return (
    <ToolbarButton
      label="Score Setup"
      icon={<GearIcon />}
      onClick={onClick}
      title={`Score Setup (${shortcutKey}+,)`}
    />
  );
};

const GearIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);
```

### PrintButton.tsx

```typescript
/**
 * PrintButton
 *
 * Toolbar button to open the browser print dialog.
 */

import React from 'react';
import { openPrintDialog } from '@/services/PrintService';
import { ToolbarButton } from '@/components/Toolbar/ToolbarButton';
import { CONFIG } from '@/config';
import { isMac } from '@/utils/platform';

const ICON_SIZE = CONFIG.toolbar.iconSize;

export const PrintButton: React.FC = () => {
  const handlePrint = () => {
    openPrintDialog();
  };

  const shortcutKey = isMac() ? '⌘' : 'Ctrl';

  return (
    <ToolbarButton
      label="Print"
      icon={<PrintIcon />}
      onClick={handlePrint}
      title={`Print (${shortcutKey}+P)`}
    />
  );
};

const PrintIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE} fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6,9 6,2 18,2 18,9" />
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);
```

---

## Toolbar Integration

Update `Toolbar.tsx` to include new buttons:

```typescript
import { ViewToggle } from './ViewToggle';
import { ScoreSetupButton } from './ScoreSetupButton';
import { PrintButton } from './PrintButton';
import { useScoreSetup } from '@/hooks/layout/useScoreSetup';
import { ScoreSetupDialog } from '@/components/Dialog/ScoreSetupDialog';

export const Toolbar: React.FC = () => {
  const scoreSetup = useScoreSetup();

  return (
    <>
      <div className="riff-toolbar">
        {/* ... existing buttons ... */}

        <div className="riff-toolbar__divider" />

        {/* View/Layout Group */}
        <div className="riff-toolbar__group">
          <ViewToggle />
          <ScoreSetupButton onClick={scoreSetup.open} />
          <PrintButton />
        </div>
      </div>

      <ScoreSetupDialog
        isOpen={scoreSetup.isOpen}
        onClose={scoreSetup.close}
      />
    </>
  );
};
```

---

## Keyboard Shortcuts

Register keyboard shortcuts in the main keyboard handler:

```typescript
// In useKeyboardShortcuts or similar
const shortcuts = {
  // View mode toggle: Cmd/Ctrl + \
  'mod+\\': () => api.toggleViewMode(),

  // Score Setup: Cmd/Ctrl + ,
  'mod+,': () => scoreSetup.open(),

  // Print: Cmd/Ctrl + P
  'mod+p': (e: KeyboardEvent) => {
    e.preventDefault();  // Prevent browser default
    openPrintDialog();
  },
};
```

Note: `mod` represents `Cmd` on Mac and `Ctrl` on Windows/Linux.

---

## Platform Detection

Ensure `src/utils/platform.ts` exists:

```typescript
/**
 * Platform detection utilities.
 */

export const isMac = (): boolean => {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
};

export const isWindows = (): boolean => {
  return navigator.platform.toUpperCase().indexOf('WIN') >= 0;
};

export const getModifierKey = (): string => {
  return isMac() ? '⌘' : 'Ctrl';
};
```

---

## Coding Standards

### Icon Guidelines
- Use SVG with `currentColor` for fill/stroke
- Size from `CONFIG.toolbar.iconSize`
- Consistent stroke width (typically 2)

### ToolbarButton Props
- `label`: Accessible text
- `icon`: React node for icon
- `onClick`: Click handler
- `title`: Tooltip text with shortcut
- `isActive`: Optional boolean for toggle state

---

## Parallelization Strategy

### Parallel Implementation (3 subagents)
1. **View Toggle Agent:** Create ViewToggle.tsx with icons
2. **Setup Button Agent:** Create ScoreSetupButton.tsx
3. **Print Button Agent:** Create PrintButton.tsx

### Sequential Integration (Executor)
1. Update Toolbar.tsx with new buttons
2. Register keyboard shortcuts
3. Ensure platform.ts exists

### Final Step (Executor)
Run `npm run test` and verify in demo app.

---

## Acceptance Criteria

- [ ] `ViewToggle.tsx` created with both icons
- [ ] `ScoreSetupButton.tsx` created
- [ ] `PrintButton.tsx` created
- [ ] `Toolbar.tsx` updated with new button group
- [ ] `Cmd/Ctrl+\` toggles view mode
- [ ] `Cmd/Ctrl+,` opens Score Setup
- [ ] `Cmd/Ctrl+P` opens print dialog
- [ ] Buttons show correct tooltips
- [ ] View toggle icon reflects current mode
- [ ] All tests pass

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/Toolbar/ViewToggle.tsx` | Create |
| `src/components/Toolbar/ScoreSetupButton.tsx` | Create |
| `src/components/Toolbar/PrintButton.tsx` | Create |
| `src/components/Toolbar/Toolbar.tsx` | Modify |
| `src/utils/platform.ts` | Create/Verify |
| `src/__tests__/components/Toolbar/ViewToggle.test.tsx` | Create |
| `src/__tests__/components/Toolbar/PrintButton.test.tsx` | Create |

---

## User Walkthrough & Manual Testing

After implementation, verify the following manually:

### 1. Run Tests
```bash
npm run test
npm run lint
```

### 2. Start Demo App
```bash
npm run demo:dev
```

### 3. Test View Toggle Button

- [ ] Button appears in toolbar
- [ ] Click toggles between Scroll View and Page View
- [ ] Icon changes to reflect current mode
- [ ] Tooltip shows correct label and shortcut

### 4. Test Score Setup Button

- [ ] Button appears in toolbar with gear icon
- [ ] Click opens Score Setup dialog
- [ ] Tooltip shows "Score Setup (Cmd+,)" or "Score Setup (Ctrl+,)"

### 5. Test Print Button

- [ ] Button appears in toolbar with printer icon
- [ ] Click opens browser print dialog
- [ ] Print preview shows score without UI chrome

### 6. Test Keyboard Shortcuts

| Shortcut | Expected Action | Mac | Windows |
|----------|-----------------|-----|---------|
| Toggle View | `Cmd+\` | `Ctrl+\` | Switches view mode |
| Score Setup | `Cmd+,` | `Ctrl+,` | Opens dialog |
| Print | `Cmd+P` | `Ctrl+P` | Opens print dialog |

### 7. Test Button Grouping

- [ ] View Toggle, Score Setup, and Print buttons are grouped together
- [ ] Divider separates this group from other toolbar items

---

## Phase Completion & Recalibration

### Before Moving to Phase 6

After completing Phase 5:

1. **Verify all buttons work**
   - Each button performs correct action
   - Keyboard shortcuts work
   - Tooltips are accurate

2. **Check toolbar layout**
   - Buttons don't overflow
   - Icons are correct size
   - Grouping is logical

3. **Review Phase 6 prompt**
   - Does Print button correctly trigger PrintService?
   - Are there any shortcut conflicts?

### Recalibration Checklist

- [ ] All tests pass
- [ ] All three buttons work correctly
- [ ] All keyboard shortcuts work
- [ ] Tooltips accurate on Mac and Windows
- [ ] Phase 6 prompt reviewed and updated if needed

### Commit Template

```bash
git add src/components/Toolbar/ src/utils/platform.ts
git commit -m "feat(#174): add toolbar controls for page view

- Create ViewToggle button with scroll/page icons
- Create ScoreSetupButton to open dialog
- Create PrintButton to trigger print
- Add keyboard shortcuts (Cmd/Ctrl + \\, ,, P)
- Update Toolbar with new button group

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Notes for Subsequent Phases

After this phase:
- Toolbar has all page view controls
- Users can toggle view mode, open setup, and print
- Phase 6 will implement the print stylesheet and service
