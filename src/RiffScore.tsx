/**
 * RiffScore Component
 *
 * Configurable React component for rendering and interacting with musical scores.
 * Supports two modes:
 * - Generator Mode: Create blank scores from templates (staff + measureCount)
 * - Render Mode: Load compositions from staves array
 *
 * Exposes an imperative API via `window.riffScore` registry for external script control.
 */

import React, { useMemo, useId, useRef, useEffect } from 'react';
import { DeepPartial, RiffScoreConfig } from './types';
import { useRiffScore } from './hooks/useRiffScore';
import { useFontLoaded } from './hooks/layout';
import { ScoreInteractionProvider } from './context/ScoreInteractionContext';
import { ScoreProvider } from './context/ScoreContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ScoreEditorContent } from './components/Layout/ScoreEditor';
import type { InteractionConfigStore } from './services/InteractionConfigStore';
import type { RenderScoreControls, PlaybackCursorState } from './components/Layout/ScoreControls';
import { useScoreAPI } from './hooks/api';

export interface RiffScoreProps {
  /** External visual playback state; null hides the cursor, undefined uses the editor transport. */
  playbackCursor?: PlaybackCursorState | null;
  /** Render custom controls backed by this editor’s reactive history and playback state. */
  renderControls?: RenderScoreControls;
  /** Unique identifier for this RiffScore instance (auto-generated if not provided) */
  id?: string;
  config?: DeepPartial<RiffScoreConfig>;
}

/**
 * Bridge component that connects the API hook to the ScoreContext.
 * The useScoreAPI hook consumes ScoreContext internally and handles
 * registry registration/cleanup.
 */
const RiffScoreAPIBridge: React.FC<{
  instanceId: string;
  config: RiffScoreConfig;
  children: React.ReactNode;
  interaction: InteractionConfigStore;
}> = ({ instanceId, config, children, interaction }) => {
  // useScoreAPI consumes ScoreContext internally
  useScoreAPI({ instanceId, config, interaction });

  return <>{children}</>;
};

/**
 * Internal component that handles the config-driven rendering
 */
const RiffScoreInner: React.FC<RiffScoreProps> = ({
  id,
  config: userConfig,
  renderControls,
  playbackCursor,
}) => {
  const { config, initialScore, interaction } = useRiffScore(userConfig);
  const { theme: _theme, setContainerRef } = useTheme();
  const { className: fontClassName, styleElement: fontStyleElement } = useFontLoaded();
  const containerRef = useRef<HTMLDivElement>(null);

  // Register our container element for scoped theme CSS variable injection
  useEffect(() => {
    if (containerRef.current) {
      setContainerRef(containerRef.current);
    }
    return () => setContainerRef(null);
  }, [setContainerRef]);

  // Use React's useId() for SSR-compatible auto-generated IDs
  const reactId = useId();
  const instanceId = id || `riffScore${reactId}`;

  // Container style for interaction master switch
  const containerStyle: React.CSSProperties = useMemo(
    () => ({
      pointerEvents: config.interaction.isEnabled ? ('auto' as const) : ('none' as const),
      userSelect: 'none' as const,
    }),
    [config.interaction.isEnabled]
  );

  return (
    <div
      ref={containerRef}
      className={`RiffScore ${fontClassName}`}
      style={containerStyle}
      data-riffscore-id={instanceId}
    >
      {fontStyleElement}
      <ScoreProvider initialScore={initialScore} chordRecognition={config.chord?.recognition}>
        <RiffScoreAPIBridge instanceId={instanceId} interaction={interaction} config={config}>
          <ScoreInteractionProvider policy={config.interaction}>
            <ScoreEditorContent
              renderControls={renderControls}
              playbackCursor={playbackCursor}
              scale={config.ui.scale}
              showToolbar={config.ui.showToolbar}
              showFooter={config.ui.showFooter}
              showGhostNotes={config.ui.showGhostNotes}
              showBlockedGhostNotes={config.ui.showBlockedGhostNotes}
              viewport={config.ui.viewport}
              scoreTitleOffset={config.ui.scoreTitleOffset}
              scrollPadding={config.ui.scrollPadding}
              showScoreTitle={config.ui.showScoreTitle}
              engraving={config.ui.engraving}
              tuplet={config.ui.tuplet}
              chordDisplay={config.chord?.display}
              chordPlayback={config.chord?.playback}
              chordEditable={!config.chord?.recognition?.enabled}
              showBackground={config.ui.showBackground}
              interactive={config.interaction.isEnabled}
              enableKeyboard={config.interaction.enableKeyboard}
              enablePlayback={config.interaction.enablePlayback}
            />
          </ScoreInteractionProvider>
        </RiffScoreAPIBridge>
      </ScoreProvider>
    </div>
  );
};

/**
 * RiffScore - Configurable Music Notation Editor
 *
 * @example
 * // Generator Mode - Create blank grand staff with 4 measures
 * <RiffScore config={{ score: { staff: 'grand', measureCount: 4 } }} />
 *
 * @example
 * // Render Mode - Load existing composition
 * <RiffScore config={{ score: { staves: myStaves } }} />
 *
 * @example
 * // Disable all interaction (read-only display)
 * <RiffScore config={{ interaction: { isEnabled: false } }} />
 *
 * @example
 * // Access API via window.riffScore
 * <RiffScore id="my-score" />
 * // Then in console: window.riffScore.get('my-score').addNote('C4')
 */
export const RiffScore: React.FC<RiffScoreProps> = ({
  id,
  config,
  renderControls,
  playbackCursor,
}) => {
  return (
    <ThemeProvider initialTheme={config?.ui?.theme} overrides={config?.ui?.themeOverrides} scoped>
      <RiffScoreInner
        id={id}
        config={config}
        renderControls={renderControls}
        playbackCursor={playbackCursor}
      />
    </ThemeProvider>
  );
};

export default RiffScore;
