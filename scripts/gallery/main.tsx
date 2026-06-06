/**
 * Visual-fixture gallery — LIVE editor edition (issue #252).
 *
 * Renders the fixture corpus with the ACTUAL riffscore library: each card mounts a real
 * `<RiffScore>` instance in readonly (`interaction.isEnabled: false`), no-toolbar
 * (`ui.showToolbar: false`) mode, fed the fixture's Score. So the gallery shows exactly what
 * the library produces, stays in sync with it automatically, and themes correctly — no baked
 * SVG. The page chrome (search, feature filter, responsive grid) is plain React.
 *
 * Built to a self-contained bundle by scripts/build-gallery.mjs (esbuild) so it opens from
 * file:// — the Bravura font is inlined into the CSS as a data URL.
 */

import '@/styles/index.css';
import './gallery.css';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RiffScore } from '@/RiffScore';
import { visualFixtures, visualFeatures, type VisualFixture } from '@/__tests__/fixtures/visual';

const SCALE = 0.75;

const matches = (fx: VisualFixture, query: string, feature: string): boolean => {
  if (feature !== 'all' && fx.feature !== feature) return false;
  if (!query) return true;
  const hay = [fx.name, fx.feature, fx.description, ...fx.covers, ...fx.tags].join(' ').toLowerCase();
  return hay.includes(query);
};

function FixtureCard({
  fx,
  hidden,
  editing,
  onToggle,
}: {
  fx: VisualFixture;
  hidden: boolean;
  editing: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <figure className={`card${editing ? ' editing' : ''}`} id={fx.name} hidden={hidden}>
      <button
        type="button"
        className="edit-toggle"
        aria-pressed={editing}
        onClick={() => onToggle(fx.name)}
      >
        {editing ? '✓ Done' : '✎ Edit'}
      </button>
      <figcaption>
        <h3>{fx.name}</h3>
        <p>{fx.description}</p>
        <ul className="covers">
          {fx.covers.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <small>
          {fx.tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </small>
      </figcaption>
      <div className={`stage${editing ? ' editing' : ''}`}>
        <RiffScore
          id={`gx-${fx.name}`}
          config={{
            score: fx.score,
            ui: { showToolbar: editing, scale: SCALE, theme: 'LIGHT' },
            interaction: {
              isEnabled: editing,
              enableKeyboard: editing,
              enablePlayback: editing,
            },
          }}
        />
      </div>
    </figure>
  );
}

function Gallery() {
  const [query, setQuery] = useState('');
  const [feature, setFeature] = useState('all');
  // Single active editor: at most one card is editable at a time. Clicking "Edit" on another
  // card locks the previous one (keyboard/MIDI/playback then route unambiguously).
  const [editingId, setEditingId] = useState<string | null>(null);
  const features = useMemo(() => visualFeatures(), []);
  const q = query.trim().toLowerCase();
  const handleToggle = useCallback(
    (name: string) => setEditingId((cur) => (cur === name ? null : name)),
    []
  );
  // If the active editor gets filtered out of view, lock it — don't leave an invisible,
  // still-interactive editor mounted (and registered as window.riffScore.active).
  useEffect(() => {
    if (editingId && !visualFixtures.some((fx) => fx.name === editingId && matches(fx, q, feature))) {
      setEditingId(null);
    }
  }, [q, feature, editingId]);

  // Render EVERY fixture always (editors mount once); filtering just toggles `hidden` so the
  // live editors aren't unmounted/remounted on each keystroke.
  const visibleCount = visualFixtures.filter((fx) => matches(fx, q, feature)).length;

  return (
    <>
      <header>
        <h1>RiffScore visual fixtures</h1>
        <div className="controls">
          <input
            id="q"
            type="search"
            placeholder="Search fixtures, scenarios, tags…"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="chips">
            {['all', ...features].map((f) => (
              <button
                key={f}
                className={`chip${f === feature ? ' active' : ''}`}
                onClick={() => setFeature(f)}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
          <span id="count">
            {visibleCount} / {visualFixtures.length} fixtures
          </span>
        </div>
      </header>
      <main>
        {features.map((f) => {
          const inFeature = visualFixtures.filter((fx) => fx.feature === f);
          const anyVisible = inFeature.some((fx) => matches(fx, q, feature));
          return (
            <section className="feature-section" data-feature={f} key={f} hidden={!anyVisible}>
              <h2 className="feature-title">
                {f} <span className="feature-count">{inFeature.length}</span>
              </h2>
              <div className="cards">
                {inFeature.map((fx) => (
                  <FixtureCard
                    key={fx.name}
                    fx={fx}
                    hidden={!matches(fx, q, feature)}
                    editing={fx.name === editingId}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            </section>
          );
        })}
        {visibleCount === 0 && <p className="empty">No fixtures match.</p>}
      </main>
    </>
  );
}

const rootEl = document.getElementById('root');
if (rootEl) createRoot(rootEl).render(<Gallery />);
