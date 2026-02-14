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
