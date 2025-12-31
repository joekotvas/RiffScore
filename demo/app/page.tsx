"use client";

import { useState, useEffect } from "react";
import { RiffScore } from "@riffscore/RiffScore";
import { ThemeProvider, useTheme } from "@riffscore/context/ThemeContext";
import ConfigMenu from "demo/app/ConfigMenu";
import type { Score } from "@riffscore/types";

// Copy to clipboard button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <button
      onClick={handleCopy}
      className="demo-copy-btn"
      style={{ 
        backgroundColor: copied ? theme.accent : theme.buttonBackground,
        color: copied ? '#fff' : theme.secondaryText,
        border: `1px solid ${theme.border}`
      }}
      title="Copy to clipboard"
    >
      {copied ? '✓ Copied!' : 'Copy'}
    </button>
  );
}

const examples = [
  {
    title: "Default (No Props)",
    description: "Using <RiffScore /> with no configuration renders an interactive grand staff with 4 measures"
  },
  {
    title: "Treble Clef Only",
    description: "Single treble staff for melody lines",
    config: {
      score: { 
        title: "Melody Line",
        staff: 'treble' as const, 
        measureCount: 4,
        keySignature: 'G'
      }
    }
  },
  {
    title: "Bass Clef Only (Dark Mode)",
    description: "Single bass staff for bass parts",
    config: {
      score: { 
        title: "Bass Line",
        staff: 'bass' as const, 
        measureCount: 4,
        keySignature: 'F'
      },
      ui: { theme: 'DARK' }
    }
  },
  {
    title: "Read-Only Display",
    description: "Interactions disabled - perfect for embedding static scores",
    config: {
      ui: { showToolbar: false },
      interaction: { isEnabled: false },
      score: { 
        title: "Static Score",
        staff: 'grand' as const, 
        measureCount: 2 
      }
    }
  },
  {
    title: "Compact View",
    description: "Scaled down for preview or thumbnail display",
    config: {
      ui: { scale: 0.75, showToolbar: false },
      score: { 
        title: "Compact Preview",
        staff: 'treble' as const, 
        measureCount: 2 
      }
    }
  }
];

// Component to render a RiffScore with live JSON output
function ScoreWithJSON({ 
  id, 
  config, 
  themeName, 
  zoom 
}: { 
  id: string; 
  config?: (typeof examples)[number]['config'];
  themeName: string;
  zoom: number;
}) {
  const [scoreJson, setScoreJson] = useState<Score | null>(null);
  const { theme } = useTheme();
  
  useEffect(() => {
    // Type for riffScore registry
    type RiffScoreInstance = { 
      getScore: () => Score;
      on: (event: string, cb: (s: Score) => void) => () => void;
    };
    type RiffScoreRegistry = { 
      get: (id: string) => RiffScoreInstance | undefined 
    };
    const riffScore = (window as unknown as { riffScore?: RiffScoreRegistry }).riffScore;
    
    let unsubscribe: (() => void) | undefined;
    
    // Small delay to allow RiffScore to register
    const timer = setTimeout(() => {
      const instance = riffScore?.get(id);
      if (instance) {
        // Get initial score
        setScoreJson(instance.getScore());
        // Subscribe to score changes
        unsubscribe = instance.on('score', (score: Score) => {
          setScoreJson(score);
        });
      }
    }, 100);
    
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [id]);
  
  return (
    <>
      <RiffScore id={id} config={{
        ...config,
        ui: {
          ...config?.ui,
          scale: config?.ui?.scale ?? zoom,
          // Use example's theme if specified, otherwise use global theme
          theme: (config?.ui?.theme ?? themeName) as 'DARK' | 'COOL' | 'WARM' | 'LIGHT'
        }
      }} />
      <pre 
        className="demo-json" 
        style={{ backgroundColor: theme.panelBackground, color: theme.secondaryText }}
      >
        <code>
          {scoreJson ? JSON.stringify(scoreJson, null, 2) : '// Loading...'}
        </code>
      </pre>
    </>
  );
}

function ExamplesContent() {
  const { theme, themeName, zoom } = useTheme();
  
  return (
    <div 
      className="demo-page" 
      style={{ backgroundColor: theme.background, color: theme.text }}
    >
      <ConfigMenu />
      
      <header className="demo-header">
        <h1 className="demo-title" style={{ color: theme.text }}>
          RiffScore
        </h1>
        <p className="demo-subtitle" style={{ color: theme.secondaryText }}>
          Easily embed an interactive sheet music editor in your React web app
        </p>
      </header>

      <main className="demo-main">
        {examples.map((example, index) => {
          const codeSnippet = example.config 
            ? `<RiffScore config={${JSON.stringify(example.config, null, 2)}} />`
            : `<RiffScore />`;
          return (
            <section key={index} className="demo-section">
              <div className="demo-section-header" style={{ borderColor: theme.accent }}>
                <h2 className="demo-section-title" style={{ color: theme.text }}>
                  {example.title}
                </h2>
                <p className="demo-section-description" style={{ color: theme.secondaryText }}>
                  {example.description}
                </p>
                <div className="demo-code-wrapper">
                  <div className="demo-code-row">
                    <pre
                      className="demo-code"
                      style={{ backgroundColor: theme.panelBackground, color: theme.secondaryText }}
                    >
                      <code>{codeSnippet}</code>
                    </pre>
                    <CopyButton text={codeSnippet} />
                  </div>
                </div>
              </div>
              <ScoreWithJSON 
                id={`score-${index}`}
                config={example.config}
                themeName={themeName}
                zoom={zoom}
              />
            </section>
          );
        })}
      </main>

      <footer 
        className="demo-footer" 
        style={{ 
          borderTop: `1px solid ${theme.border}`,
          color: theme.secondaryText 
        }}
      >
        <p>
          RiffScore is <span style={{ fontWeight: 600 }}>Open Source</span>. 
          Developed by <a href="https://jokma.com/">Joe Kotvas</a>. 
          <span style={{ margin: '0 0.5rem' }}>•</span>
          <a href="https://github.com/joekotvas/riffscore">View on GitHub</a>
        </p>
      </footer>
    </div>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <ExamplesContent />
    </ThemeProvider>
  );
}
