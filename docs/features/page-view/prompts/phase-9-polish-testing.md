# Phase 9: Polish & Testing

**Issue:** [#174](https://github.com/joekotvas/riffscore/issues/174)
**Estimated Effort:** 2-3 days
**Dependencies:** All previous phases

---

## Objective

Complete cross-system interactions (playback, selection, navigation, auto-scroll) and perform comprehensive testing across the entire feature.

---

## Deliverables

1. Playback cursor across systems
2. Selection highlighting across systems
3. Keyboard navigation across systems
4. Auto-scroll in page view
5. Performance optimization
6. Full integration testing

---

## Requirements Reference

From PRD:
- **FR-21:** Playback cursor moves across system breaks seamlessly
- **FR-22:** Auto-scroll keeps current system in view during playback
- **FR-23:** Click to set playback position works across all systems
- **FR-24:** All editing operations work identically in page view
- **FR-25:** Selection across system breaks highlights notes on both systems
- **FR-26:** Keyboard navigation moves between systems at measure boundaries

Non-Functional:
- **NFR-01:** View mode toggle <200ms for 100 measures
- **NFR-03:** 10+ systems renders without scroll jank (<16ms frame time)

---

## Playback Cursor

Update playback cursor to handle system breaks:

```typescript
// In useCursorLayout or similar hook
const getCursorPosition = (quant: number, pageLayout: PageLayout) => {
  const measureIndex = getMeasureAtQuant(quant);
  const system = getSystemForMeasure(measureIndex, pageLayout);

  if (!system) return null;

  return {
    x: getMeasureX(measureIndex) + getQuantOffsetInMeasure(quant),
    y: system.y,
    systemIndex: system.index,
  };
};
```

### Smooth Transition

When cursor moves to a new system:
1. Calculate new Y position from system layout
2. Apply CSS transition for smooth movement
3. Trigger auto-scroll if system is out of view

---

## Selection Highlighting

Update selection rendering to span systems:

```typescript
// In SelectionHighlight component
const renderSelectionAcrossSystems = (
  startMeasure: number,
  endMeasure: number,
  pageLayout: PageLayout
) => {
  const highlights: React.ReactNode[] = [];
  const startSystem = getSystemForMeasure(startMeasure, pageLayout);
  const endSystem = getSystemForMeasure(endMeasure, pageLayout);

  if (!startSystem || !endSystem) return null;

  if (startSystem.index === endSystem.index) {
    // Selection within single system
    highlights.push(
      <rect key="single" {...calculateHighlightRect(startMeasure, endMeasure, startSystem)} />
    );
  } else {
    // Selection spans multiple systems
    for (let i = startSystem.index; i <= endSystem.index; i++) {
      const system = pageLayout.systems[i];
      const systemStartMeasure = i === startSystem.index ? startMeasure : system.measures[0];
      const systemEndMeasure = i === endSystem.index ? endMeasure : system.measures[system.measures.length - 1];

      highlights.push(
        <rect
          key={i}
          {...calculateHighlightRect(systemStartMeasure, systemEndMeasure, system)}
        />
      );
    }
  }

  return <g className="riff-selection-highlight">{highlights}</g>;
};
```

---

## Keyboard Navigation

Update navigation to cross system boundaries:

```typescript
// In navigation utility
const moveRight = (currentMeasure: number, currentQuant: number, pageLayout: PageLayout) => {
  const currentSystem = getSystemForMeasure(currentMeasure, pageLayout);
  if (!currentSystem) return null;

  const measureInSystem = currentSystem.measures.indexOf(currentMeasure);
  const isLastMeasureInSystem = measureInSystem === currentSystem.measures.length - 1;

  if (isLastMeasureInSystem && !currentSystem.isLast) {
    // Move to first measure of next system
    const nextSystem = pageLayout.systems[currentSystem.index + 1];
    return {
      measure: nextSystem.measures[0],
      quant: 0,
      systemIndex: nextSystem.index,
    };
  }

  // Normal move within system
  return moveRightWithinMeasure(currentMeasure, currentQuant);
};

const moveLeft = (currentMeasure: number, currentQuant: number, pageLayout: PageLayout) => {
  const currentSystem = getSystemForMeasure(currentMeasure, pageLayout);
  if (!currentSystem) return null;

  const measureInSystem = currentSystem.measures.indexOf(currentMeasure);
  const isFirstMeasureInSystem = measureInSystem === 0;

  if (isFirstMeasureInSystem && !currentSystem.isFirst) {
    // Move to last measure of previous system
    const prevSystem = pageLayout.systems[currentSystem.index - 1];
    const lastMeasure = prevSystem.measures[prevSystem.measures.length - 1];
    return {
      measure: lastMeasure,
      quant: getLastQuantInMeasure(lastMeasure),
      systemIndex: prevSystem.index,
    };
  }

  // Normal move within system
  return moveLeftWithinMeasure(currentMeasure, currentQuant);
};
```

---

## Auto-Scroll

Implement auto-scroll to keep current system visible:

```typescript
// In useAutoScroll hook
const scrollToSystem = (systemIndex: number, pageLayout: PageLayout, containerRef: RefObject<HTMLElement>) => {
  const system = pageLayout.systems[systemIndex];
  if (!system || !containerRef.current) return;

  const container = containerRef.current;
  const systemTop = system.y;
  const systemBottom = system.y + system.height;
  const scrollTop = container.scrollTop;
  const viewportHeight = container.clientHeight;

  // Check if system is fully visible
  const isAboveViewport = systemTop < scrollTop;
  const isBelowViewport = systemBottom > scrollTop + viewportHeight;

  if (isAboveViewport) {
    // Scroll up to show system at top with padding
    container.scrollTo({
      top: systemTop - 20,
      behavior: 'smooth',
    });
  } else if (isBelowViewport) {
    // Scroll down to show system at bottom with padding
    container.scrollTo({
      top: systemBottom - viewportHeight + 20,
      behavior: 'smooth',
    });
  }
};

// During playback
useEffect(() => {
  if (isPlaying && isPageView) {
    const cursorPosition = getCursorPosition(currentQuant, pageLayout);
    if (cursorPosition) {
      scrollToSystem(cursorPosition.systemIndex, pageLayout, containerRef);
    }
  }
}, [currentQuant, isPlaying, isPageView, pageLayout]);
```

---

## Performance Optimization

### Memoization

```typescript
// Memoize expensive calculations
const pageLayout = useMemo(() => {
  if (!isPageView) return minimalLayout;
  return calculatePageLayout(score, config);
}, [score, config, isPageView]);

// Memoize measure widths
const measureWidths = useMemo(() => {
  return calculateAllMeasureWidths(score, staffScale);
}, [score, staffScale]);
```

### Virtualization (if needed)

For very long scores, consider virtualizing systems:

```typescript
// Only render visible systems
const visibleSystems = useMemo(() => {
  if (!containerRef.current) return pageLayout.systems;

  const scrollTop = containerRef.current.scrollTop;
  const viewportHeight = containerRef.current.clientHeight;
  const buffer = viewportHeight; // Render one viewport above/below

  return pageLayout.systems.filter(system => {
    const top = system.y;
    const bottom = system.y + system.height;
    return bottom >= scrollTop - buffer && top <= scrollTop + viewportHeight + buffer;
  });
}, [pageLayout.systems, scrollTop, viewportHeight]);
```

### Profiling

Use React DevTools and Performance tab to identify bottlenecks:
- Measure render time for 10+ systems
- Check for unnecessary re-renders
- Verify <16ms frame time during scroll

---

## Testing Checklist

### Unit Tests

- [ ] PageLayoutService calculates correct system breaks
- [ ] MetadataService validates all fields
- [ ] Commands execute and undo correctly
- [ ] API methods work as expected

### Integration Tests

- [ ] View mode toggle preserves state
- [ ] Score Setup dialog saves changes
- [ ] Metadata inline editing commits changes
- [ ] Print output hides UI elements
- [ ] Export includes metadata

### Visual Tests

- [ ] First system indented correctly
- [ ] Measure numbers visible at system start
- [ ] Ties split correctly at system breaks
- [ ] Barlines extend across staves
- [ ] Page numbers centered at bottom
- [ ] Copyright on page 1 only

### Interaction Tests

- [ ] Click on metadata enters edit mode
- [ ] Tab navigates through fields
- [ ] Escape cancels editing
- [ ] Cmd/Ctrl+Click selects without editing
- [ ] Arrow keys navigate across systems
- [ ] Selection highlights span systems

### Playback Tests

- [ ] Cursor moves across system breaks
- [ ] Auto-scroll follows playback
- [ ] Click to seek works on all systems

### Performance Tests

- [ ] View toggle <200ms for 100 measures
- [ ] No scroll jank with 10+ systems
- [ ] Print dialog opens without delay

### Cross-Browser Tests

- [ ] Chrome: all features work
- [ ] Firefox: all features work
- [ ] Safari: all features work
- [ ] Edge: all features work

### Accessibility Tests

- [ ] Dialog announced to screen readers
- [ ] System breaks announced
- [ ] Keyboard navigation complete
- [ ] Focus visible

---

## Parallelization Strategy

### Parallel Implementation (3 subagents)
1. **Playback Agent:** Update playback cursor for multi-system
2. **Selection Agent:** Update selection highlighting for multi-system
3. **Navigation Agent:** Update keyboard navigation for multi-system

### Sequential Integration (Executor)
1. Implement auto-scroll
2. Performance optimization
3. Bug fixes from testing

### Parallel Testing (4 subagents)
1. **Unit Tests Agent:** Run and fix unit tests
2. **Integration Tests Agent:** Run and fix integration tests
3. **Visual Tests Agent:** Manual visual verification
4. **A11y Tests Agent:** Accessibility testing

### Final Steps (Executor)
1. Run full test suite: `npm run test`
2. Run lint: `npm run lint`
3. Build: `npm run build`
4. Manual verification in demo app
5. Cross-browser testing

---

## Acceptance Criteria

- [ ] Playback cursor crosses systems smoothly
- [ ] Selection highlights on multiple systems
- [ ] Arrow keys navigate across systems
- [ ] Auto-scroll keeps current system visible
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Performance benchmarks met
- [ ] No lint errors
- [ ] Build succeeds
- [ ] Works in all major browsers

---

## Files to Modify

| File | Action |
|------|--------|
| `src/hooks/playback/useCursorLayout.ts` | Modify |
| `src/components/Canvas/SelectionHighlight.tsx` | Modify |
| `src/utils/navigation/crossSystemNav.ts` | Create |
| `src/hooks/layout/useAutoScroll.ts` | Create |
| Various test files | Create/Modify |

---

## User Walkthrough & Manual Testing

After implementation, perform comprehensive end-to-end testing:

### 1. Run Full Test Suite
```bash
npm run test -- --coverage
npm run lint
npm run build
```

### 2. Start Demo App
```bash
npm run demo:dev
```

### 3. End-to-End Workflow Test

#### A. Create a New Score
1. Create a new score with 8+ measures
2. Add notes, rests, chords
3. Add ties across measure boundaries

#### B. Edit Metadata
1. Click on title → edit inline
2. Tab to composer → edit
3. Tab to lyricist → edit
4. Tab → verify cursor moves to first note

#### C. Test Page View
1. Press `Cmd+\` or `Ctrl+\` to switch to page view
2. Verify systems break correctly
3. Verify measure numbers appear
4. Verify ties split at system breaks

#### D. Test Score Setup
1. Press `Cmd+,` or `Ctrl+,` to open dialog
2. Change staff size to 80%
3. Verify live preview updates
4. Cancel → verify changes reverted
5. Reopen, make changes, Save

#### E. Test Playback
1. Start playback
2. Verify cursor moves across systems
3. Verify auto-scroll follows cursor
4. Click to seek on different system

#### F. Test Selection
1. Select notes spanning system break
2. Verify selection highlights on both systems
3. Use arrow keys to navigate across systems

#### G. Test Print
1. Press `Cmd+P` or `Ctrl+P`
2. Verify print preview is clean
3. Export to PDF
4. Open PDF and verify quality

#### H. Test Export
1. Export to ABC
2. Verify metadata in ABC file
3. Export to MusicXML
4. Import in external app (if available)

### 4. Performance Testing

Create a large score (100+ measures):
```javascript
const api = window.riffScore.get('demo');
// Add many notes programmatically
```

**Verify:**
- [ ] View toggle < 200ms
- [ ] No scroll jank (< 16ms frame time)
- [ ] Print dialog opens promptly

### 5. Cross-Browser Testing

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Page View | [ ] | [ ] | [ ] | [ ] |
| Print | [ ] | [ ] | [ ] | [ ] |
| Metadata Edit | [ ] | [ ] | [ ] | [ ] |
| Playback | [ ] | [ ] | [ ] | [ ] |
| Keyboard Nav | [ ] | [ ] | [ ] | [ ] |

### 6. Accessibility Testing

- [ ] Keyboard-only navigation works
- [ ] Screen reader announces system breaks
- [ ] Focus visible on all interactive elements
- [ ] Dialog traps focus correctly

---

## Documentation Updates

**IMPORTANT:** Before marking Phase 9 complete, update all project documentation.

### Files to Update

| File | Updates Needed |
|------|----------------|
| `docs/AGENTS.md` | Add Page View to Quick Navigation |
| `docs/ARCHITECTURE.md` | Document PageLayoutService, MetadataService |
| `docs/API.md` | Add layout and metadata API methods |
| `docs/COMMANDS.md` | Add SetViewMode, SetLayoutConfig, SetMetadata |
| `docs/KEYBOARD_NAVIGATION.md` | Add cross-system navigation |
| `docs/CONFIGURATION.md` | Add layout config options |
| `README.md` | Add Page View feature to features list |
| `CHANGELOG.md` | Add release notes for #174 |

### Update Checklist

- [ ] `AGENTS.md` updated with new files and patterns
- [ ] `ARCHITECTURE.md` includes page layout layer
- [ ] `API.md` documents all new methods
- [ ] `COMMANDS.md` documents new commands
- [ ] `KEYBOARD_NAVIGATION.md` covers system breaks
- [ ] `CONFIGURATION.md` covers layout settings
- [ ] `README.md` features list updated
- [ ] `CHANGELOG.md` has entry for #174

### README Feature Entry

Add to features section:
```markdown
- **Page View & Print** - View and print scores with automatic system breaks, configurable page sizes (Letter/A4), and professional PDF export
```

### CHANGELOG Entry

```markdown
## [Unreleased]

### Added
- Page View mode with automatic system breaks (#174)
- Print to PDF via native browser dialog
- Score Setup dialog for metadata and layout configuration
- Inline WYSIWYG editing for score metadata (title, composer, lyricist, copyright)
- Page numbers on all pages
- Support for Letter and A4 page sizes
- Configurable margins (Narrow/Normal/Wide)
- Staff size slider (50-150%)
- System spacing options (Compact/Normal/Relaxed)
- Keyboard shortcuts: Cmd/Ctrl+\ (view toggle), Cmd/Ctrl+, (score setup), Cmd/Ctrl+P (print)
- ABC and MusicXML export includes metadata
```

---

## Phase Completion & Final Checklist

### Before Closing Issue #174

1. **All tests pass**
   ```bash
   npm run test -- --coverage
   npm run lint
   npm run build
   ```

2. **Manual testing complete**
   - All workflow tests pass
   - All browsers tested
   - Accessibility verified

3. **Documentation updated**
   - All docs listed above updated
   - README features current
   - CHANGELOG entry added

4. **Code review ready**
   - No console errors
   - No TODO comments left behind
   - Clean git history

### Final Commit Template

```bash
git add .
git commit -m "feat(#174): complete Page View & Print implementation

Phase 9: Polish & Testing

- Implement cross-system playback cursor
- Implement cross-system selection highlighting
- Add cross-system keyboard navigation
- Add auto-scroll during playback
- Performance optimization with memoization
- Full integration testing
- Update project documentation

Closes #174

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Post-Completion

After closing #174:
1. Create PR if on feature branch
2. Update project board
3. Consider follow-up issues for deferred features (courtesy signatures, manual breaks)

---

## Notes for Future Enhancements

Features deferred to future versions:
- Manual system break placement
- Courtesy key/time signatures at system breaks
- Custom page sizes
- Landscape orientation
- Part extraction
- Slur splitting at system breaks
- Headers/footers beyond page numbers and copyright
