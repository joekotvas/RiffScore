/**
 * ScoreAPI.layoutMetadataSync.test.tsx
 *
 * Lane 5 (Issue #230): the synchronous layout/metadata getters used to read
 * `scoreRef.current`, a React-state mirror synced inside a useEffect, so a
 * chained call like `api.setViewMode('page').getViewMode()` returned the STALE
 * value within a single tick. The fix routes these getters to the LIVE engine
 * state (the same source `getScore()` uses), which dispatch mutates
 * synchronously (ADR-006).
 *
 * VERIFICATION PHILOSOPHY: every assertion here proves REAL synchronous
 * behavior from first principles, not the implementation shape:
 *   - The set and the get happen in the SAME synchronous tick (chained, or
 *     captured inside one act() callback) so effects have NOT flushed and the
 *     scoreRef mirror is provably stale. A getter reading the mirror would
 *     return the OLD value and fail.
 *   - Each getter is cross-checked against the independent oracle
 *     `api.getScore()` (the live engine), the documented source of truth, so a
 *     getter that lied would diverge from the engine and fail.
 *   - "Before" baselines are asserted so a getter hard-coded to the expected
 *     value could not pass.
 *   - Metadata strings use the normalization oracle (whitespace trimmed,
 *     empty title -> "Untitled") rather than echoing the raw input.
 */

import { render, act } from '@testing-library/react';
import { RiffScore } from '../RiffScore';
import type { MusicEditorAPI } from '../api.types';
import { DEFAULT_LAYOUT_CONFIG, DEFAULT_SCORE_METADATA } from '../config';

const getAPI = (id: string): MusicEditorAPI => {
  return window.riffScore.get(id) as MusicEditorAPI;
};

describe('ScoreAPI layout/metadata synchronous getters (Issue #230)', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = jest.fn();
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
  });

  afterEach(() => {
    if (window.riffScore) {
      window.riffScore.instances.clear();
      window.riffScore.active = null;
    }
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Layout: view mode
  // -------------------------------------------------------------------------
  describe('view mode', () => {
    test('setViewMode is visible to getViewMode in the SAME synchronous tick (chained)', () => {
      render(<RiffScore id="vm-chain" />);
      const api = getAPI('vm-chain');

      // Baseline oracle: default is "scroll". (Guards against a getter that is
      // hard-coded to return "page".)
      expect(api.getViewMode()).toBe(DEFAULT_LAYOUT_CONFIG.viewMode);
      expect(DEFAULT_LAYOUT_CONFIG.viewMode).toBe('scroll');

      // The setter returns `this`, so the getter executes in the SAME
      // synchronous statement -- React has not re-rendered, the scoreRef mirror
      // is still stale. Reading the live engine is the only way this passes.
      let observed: string | undefined;
      act(() => {
        observed = api.setViewMode('page').getViewMode();
      });
      expect(observed).toBe('page');

      // Cross-check against the independent live-engine oracle.
      expect(api.getScore().layout?.viewMode).toBe('page');
      // And the getter must still agree after effects flush.
      expect(api.getViewMode()).toBe('page');
    });

    test('getViewMode read mid-tick (before effects flush) reflects the dispatch', () => {
      render(<RiffScore id="vm-midtick" />);
      const api = getAPI('vm-midtick');

      let duringTick: string | undefined;
      let engineDuringTick: string | undefined;
      act(() => {
        api.setViewMode('page');
        // Still inside the act callback: the scoreRef-syncing effect has NOT
        // run yet, but the engine has already been mutated synchronously.
        duringTick = api.getViewMode();
        engineDuringTick = api.getScore().layout?.viewMode;
      });

      expect(engineDuringTick).toBe('page'); // engine is the source of truth
      expect(duringTick).toBe('page'); // getter must match it, not lag behind
    });

    test('toggleViewMode flips relative to the live state, synchronously and repeatedly', () => {
      render(<RiffScore id="vm-toggle" />);
      const api = getAPI('vm-toggle');

      expect(api.getViewMode()).toBe('scroll');

      // First toggle: scroll -> page, observed within the same tick.
      let afterFirst: string | undefined;
      act(() => {
        afterFirst = api.toggleViewMode().getViewMode();
      });
      expect(afterFirst).toBe('page');

      // Second toggle must read the UPDATED live state (page) to flip back.
      // If toggle read a stale mirror it would still see "scroll" and produce
      // "page" again -- this asserts the round-trip really alternates.
      let afterSecond: string | undefined;
      act(() => {
        afterSecond = api.toggleViewMode().getViewMode();
      });
      expect(afterSecond).toBe('scroll');
      expect(api.getScore().layout?.viewMode).toBe('scroll');
    });

    test('two toggles in ONE synchronous tick return to the original mode', () => {
      render(<RiffScore id="vm-double" />);
      const api = getAPI('vm-double');

      const start = api.getViewMode();
      let end: string | undefined;
      act(() => {
        // Both toggles happen before any re-render. The second toggle depends
        // on seeing the first toggle's result via the live engine.
        api.toggleViewMode();
        end = api.toggleViewMode().getViewMode();
      });
      expect(end).toBe(start);
    });
  });

  // -------------------------------------------------------------------------
  // Layout: full config
  // -------------------------------------------------------------------------
  describe('layout config', () => {
    test('setLayoutConfig is visible to getLayoutConfig in the SAME tick', () => {
      render(<RiffScore id="lc-chain" />);
      const api = getAPI('lc-chain');

      // Baselines from the oracle defaults.
      expect(api.getLayoutConfig().pageSize).toBe(DEFAULT_LAYOUT_CONFIG.pageSize);
      expect(api.getLayoutConfig().margins).toBe(DEFAULT_LAYOUT_CONFIG.margins);
      expect(DEFAULT_LAYOUT_CONFIG.pageSize).not.toBe('a4'); // ensure the change is real

      let observed: ReturnType<MusicEditorAPI['getLayoutConfig']> | undefined;
      act(() => {
        observed = api.setLayoutConfig({ pageSize: 'a4', margins: 'wide' }).getLayoutConfig();
      });

      expect(observed?.pageSize).toBe('a4');
      expect(observed?.margins).toBe('wide');

      // Cross-check live engine oracle.
      expect(api.getScore().layout?.pageSize).toBe('a4');
      expect(api.getScore().layout?.margins).toBe('wide');
    });

    test('partial setLayoutConfig merges over live state without clobbering siblings', () => {
      render(<RiffScore id="lc-merge" />);
      const api = getAPI('lc-merge');

      // Establish a non-default field first.
      act(() => {
        api.setLayoutConfig({ pageSize: 'a4' });
      });
      expect(api.getLayoutConfig().pageSize).toBe('a4');

      // A subsequent partial update must read the LIVE config (pageSize:'a4')
      // and merge onto it. If the command read a stale mirror, pageSize could
      // revert. We change a different field and assert pageSize survives, in
      // the same synchronous tick as the read.
      let merged: ReturnType<MusicEditorAPI['getLayoutConfig']> | undefined;
      act(() => {
        merged = api.setLayoutConfig({ margins: 'narrow' }).getLayoutConfig();
      });

      expect(merged?.margins).toBe('narrow');
      expect(merged?.pageSize).toBe('a4'); // preserved across the partial update
    });

    test('resetLayoutConfig restores defaults, observable synchronously', () => {
      render(<RiffScore id="lc-reset" />);
      const api = getAPI('lc-reset');

      act(() => {
        api.setLayoutConfig({ pageSize: 'a4', margins: 'wide' });
      });
      expect(api.getLayoutConfig().pageSize).toBe('a4');

      let afterReset: ReturnType<MusicEditorAPI['getLayoutConfig']> | undefined;
      act(() => {
        afterReset = api.resetLayoutConfig().getLayoutConfig();
      });

      expect(afterReset?.pageSize).toBe(DEFAULT_LAYOUT_CONFIG.pageSize);
      expect(afterReset?.margins).toBe(DEFAULT_LAYOUT_CONFIG.margins);
      expect(afterReset?.viewMode).toBe(DEFAULT_LAYOUT_CONFIG.viewMode);
    });
  });

  // -------------------------------------------------------------------------
  // Metadata
  // -------------------------------------------------------------------------
  describe('metadata', () => {
    test('setMetadata({title}) is visible to getTitle in the SAME tick', () => {
      render(<RiffScore id="md-title" />);
      const api = getAPI('md-title');

      // Baseline: default title is "Untitled" (oracle), proving the getter is
      // not pre-seeded with our target value.
      expect(api.getTitle()).toBe(DEFAULT_SCORE_METADATA.title);
      expect(DEFAULT_SCORE_METADATA.title).toBe('Untitled');

      let observed: string | undefined;
      act(() => {
        observed = api.setMetadata({ title: 'Sonata' }).getTitle();
      });
      expect(observed).toBe('Sonata');

      // Cross-check the live engine.
      expect(api.getScore().metadata?.title).toBe('Sonata');
    });

    test('setTitle/setComposer/setLyricist/setCopyright each read back synchronously', () => {
      render(<RiffScore id="md-fields" />);
      const api = getAPI('md-fields');

      // composer/lyricist/copyright are undefined by default.
      expect(api.getComposer()).toBeUndefined();
      expect(api.getLyricist()).toBeUndefined();
      expect(api.getCopyright()).toBeUndefined();

      const observed: Record<string, string | undefined> = {};
      act(() => {
        observed.title = api.setTitle('Prelude').getTitle();
        observed.composer = api.setComposer('Bach').getComposer();
        observed.lyricist = api.setLyricist('Anon').getLyricist();
        observed.copyright = api.setCopyright('Public Domain').getCopyright();
      });

      expect(observed.title).toBe('Prelude');
      expect(observed.composer).toBe('Bach');
      expect(observed.lyricist).toBe('Anon');
      expect(observed.copyright).toBe('Public Domain');

      // Every field set above must coexist in the live engine simultaneously,
      // which also proves each partial setMetadata merged onto the prior live
      // state instead of a stale mirror that would drop earlier fields.
      const meta = api.getScore().metadata;
      expect(meta?.title).toBe('Prelude');
      expect(meta?.composer).toBe('Bach');
      expect(meta?.lyricist).toBe('Anon');
      expect(meta?.copyright).toBe('Public Domain');
    });

    test('metadata getters honor the normalization oracle (trim) synchronously', () => {
      render(<RiffScore id="md-normalize" />);
      const api = getAPI('md-normalize');

      let title: string | undefined;
      let composer: string | undefined;
      act(() => {
        // Independent oracle: normalizeMetadata trims surrounding whitespace.
        // The getter must reflect the NORMALIZED stored value, not the raw arg.
        title = api.setTitle('  Fugue  ').getTitle();
        composer = api.setComposer('  Handel ').getComposer();
      });
      expect(title).toBe('Fugue');
      expect(composer).toBe('Handel');

      // Empty/whitespace title falls back to the default per the oracle.
      let emptied: string | undefined;
      act(() => {
        emptied = api.setTitle('   ').getTitle();
      });
      expect(emptied).toBe(DEFAULT_SCORE_METADATA.title);
    });

    test('getMetadata reflects setMetadata in the SAME tick and matches the engine', () => {
      render(<RiffScore id="md-getmeta" />);
      const api = getAPI('md-getmeta');

      let snapshot: ReturnType<MusicEditorAPI['getMetadata']> | undefined;
      act(() => {
        snapshot = api
          .setMetadata({ title: 'Etude', composer: 'Chopin' })
          .getMetadata();
      });

      expect(snapshot?.title).toBe('Etude');
      expect(snapshot?.composer).toBe('Chopin');

      // getMetadata must equal the live-engine metadata exactly.
      expect(snapshot).toEqual(api.getScore().metadata);
    });
  });

  // -------------------------------------------------------------------------
  // Regression guard: getScore (already-correct accessor) and the layout/
  // metadata getters agree at all times, proving they share one source.
  // -------------------------------------------------------------------------
  describe('consistency with getScore (single source of truth)', () => {
    test('layout + metadata getters agree with getScore WITHIN the mutating tick', () => {
      render(<RiffScore id="consistency" />);
      const api = getAPI('consistency');

      // Capture every getter against the live-engine oracle INSIDE the same
      // synchronous act() callback, before effects flush and the scoreRef
      // mirror catches up. A lagging getter would diverge from getScore() here.
      const obs: Record<string, unknown> = {};
      act(() => {
        api.setViewMode('page');
        api.setLayoutConfig({ staffSize: 120 });
        api.setMetadata({ title: 'Mixed', lyricist: 'Someone' });

        const score = api.getScore();
        obs.viewModeMatches = api.getViewMode() === score.layout?.viewMode;
        obs.layoutMatches =
          JSON.stringify(api.getLayoutConfig()) === JSON.stringify(score.layout);
        obs.metadataMatches =
          JSON.stringify(api.getMetadata()) === JSON.stringify(score.metadata);
        obs.titleMatches = api.getTitle() === score.metadata?.title;
        obs.lyricistMatches = api.getLyricist() === score.metadata?.lyricist;
        // Also assert the actual mutated values landed (not just self-consistent).
        obs.viewMode = api.getViewMode();
        obs.staffSize = api.getLayoutConfig().staffSize;
        obs.title = api.getTitle();
      });

      expect(obs.viewModeMatches).toBe(true);
      expect(obs.layoutMatches).toBe(true);
      expect(obs.metadataMatches).toBe(true);
      expect(obs.titleMatches).toBe(true);
      expect(obs.lyricistMatches).toBe(true);
      expect(obs.viewMode).toBe('page');
      expect(obs.staffSize).toBe(120);
      expect(obs.title).toBe('Mixed');
    });
  });
});
