import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RiffScore, RiffScoreSession, ConfigMenu, ThemeProvider } from '../../dist/index.mjs';
import '../../dist/index.css';

const abc =
  'X:1\nT:QA score\nM:4/4\nL:1/4\nK:C\n"C"C D E F | "G"G A B c | d c B A | G F E D | C4 |';
function App() {
  const [page, setPage] = useState(false);
  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'COOL' | 'WARM'>('LIGHT');
  const [restricted, setRestricted] = useState(false);
  const [message, setMessage] = useState('Ready');
  return (
    <main>
      <h1>RiffScore release QA</h1>
      <nav aria-label="QA scenarios">
        <button
          onClick={() => {
            const next = !page;
            window.riffScore.get('qa')!.setViewMode(next ? 'page' : 'scroll');
            setPage(next);
          }}
        >
          {page ? 'Scroll view' : 'Page view'}
        </button>
        <select
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as typeof theme)}
        >
          {['LIGHT', 'DARK', 'COOL', 'WARM'].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <button
          onClick={() => {
            setRestricted(!restricted);
            window.riffScore.get('qa')!.setInteractionConfig({
              allowEventDeletion: restricted,
              allowEventInsertion: restricted,
              allowDurationChanges: restricted,
            });
          }}
        >
          Toggle restrictions
        </button>
        <button onClick={() => window.riffScore.get('qa')!.select(0)}>Select first note</button>
        <button
          onClick={() => setMessage(window.riffScore.get('qa')!.export('musicxml').slice(0, 60))}
        >
          Export MusicXML
        </button>
        <button onClick={() => window.riffScore.get('qa')!.undo()}>API undo</button>
      </nav>
      <p role="status">{message}</p>
      <RiffScore
        id="qa"
        config={{
          score: {
            abc: location.search.includes('long') ? abc.replace('C4 |', 'C4 |'.repeat(90)) : abc,
          },
          ui: { theme, scale: 1, viewport: { maxHeight: 400 } },
          interaction: { allowEventDeletion: !restricted },
        }}
        renderControls={(controls) => (
          <div>
            <button onClick={() => controls.play()}>Custom play</button>
            <button onClick={controls.pause}>Custom pause</button>
            <output aria-label="Transport state">
              {controls.isPlaying ? 'Playing' : 'Stopped'}
            </output>
          </div>
        )}
      />
      <h2>Shared measure windows</h2>
      <RiffScoreSession config={{ score: { abc } }}>
        <RiffScore
          id="window"
          config={{
            ui: {
              showToolbar: false,
              showFooter: false,
              view: { measures: { start: 1, end: 3 }, clefs: { 0: 'bass' } },
              viewport: { height: 240 },
              scale: 1,
            },
          }}
        />
        <RiffScore
          id="static"
          config={{
            interaction: { isEnabled: false },
            ui: { showToolbar: false, showFooter: false, viewport: { height: 160 }, scale: 1 },
          }}
        />
      </RiffScoreSession>
      <ThemeProvider>
        <ConfigMenu />
      </ThemeProvider>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
