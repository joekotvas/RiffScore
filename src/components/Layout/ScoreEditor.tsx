import type { ResolveScoreViewport } from '../Canvas/ScoreGeometry';
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { preparePrint, restoreFromPrint } from '@/services/PrintService';

// Contexts
import { ScoreProvider, useScoreContext } from '@context/ScoreContext';
import { useTheme } from '@context/ThemeContext';

// Hooks
import { useKeyboardShortcuts, useScoreInteraction } from '@hooks/interaction';
import { useMIDI, useSamplerStatus } from '@hooks/audio';
// import { useModifierKeys } from '@hooks/useModifierKeys';
import { useTitleEditor } from '@hooks/useTitleEditor';
import { useChordTrack } from '@hooks/chord/useChordTrack';

// Components
import ScoreCanvas from '@components/Canvas/ScoreCanvas';
import Toolbar, { ToolbarHandle } from '@components/Toolbar/Toolbar';
import ShortcutsOverlay from '@components/Layout/Overlays/ShortcutsOverlay';
import ConfirmDialog from '@components/Layout/Overlays/ConfirmDialog';
import Portal from '@components/Layout/Portal';
import EditorFooter from '@components/Layout/EditorFooter';
import type {
  EngravingConfig,
  ScoreViewConfig,
  TupletConfig,
  ChordDisplayConfig,
  ChordPlaybackConfig,
  ViewportConfig,
} from '@/types';

// Commands
import { SetSingleStaffCommand } from '@commands/SetSingleStaffCommand';
import { UpdateTitleCommand } from '@commands/UpdateTitleCommand';

// Engines & Data
import { useSessionConfig } from '@/context/RiffScoreSession';
import { PlaybackProvider, useEditorPlayback } from '@/context/PlaybackContext';
import { MELODIES } from '@/data/melodies';

// Utilities
import { findEventAtQuantPosition } from '@/utils/navigation/crossStaff';
import { getNoteDuration, isRestEvent } from '@/utils/core';
import { getMeasureCapacity } from '@/constants';
import { getMidi } from '@/services/MusicService';
import { DEFAULT_LAYOUT_CONFIG } from '@/config';

import type { RenderScoreControls, PlaybackCursorState } from './ScoreControls';
import './styles/ScoreEditor.css';
import type { RenderScoreOverlay } from '../Canvas/ScoreOverlay';

// ------------------------------------------------------------------
// Props Interface
// ------------------------------------------------------------------

interface ScoreEditorContentProps {
  renderOverlay?: RenderScoreOverlay;
  resolveViewport?: ResolveScoreViewport;
  showScore?: boolean;
  playbackCursor?: PlaybackCursorState | null;
  renderControls?: RenderScoreControls;
  scale?: number;
  label?: string;
  showToolbar?: boolean;
  showBackground?: boolean;
  showFooter?: boolean;
  showScoreTitle?: boolean;
  showGhostNotes?: boolean;
  /** Show unavailable-entry previews (grey notes with a cross). */
  showBlockedGhostNotes?: boolean;
  viewport?: ViewportConfig;
  scoreTitleOffset?: { x?: number; y?: number };
  /** Scroll-view outer padding in staff units; defaults to 0 above and 50 below. Ignored in page view. */
  scrollPadding?: { top?: number; bottom?: number };
  view?: ScoreViewConfig;
  engraving?: EngravingConfig;
  tuplet?: TupletConfig;
  chordDisplay?: ChordDisplayConfig;
  chordPlayback?: ChordPlaybackConfig;
  chordEditable?: boolean;
  /** Whether the score is interactive. When false (static/read-only view), transient
   *  interaction state (playback cursor, selection, entry preview) is reset. */
  interactive?: boolean;
  enableKeyboard?: boolean;
  enablePlayback?: boolean;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

const ScoreEditorBody = ({
  scale = 1,
  renderControls,
  renderOverlay,
  resolveViewport,
  showScore = true,
  playbackCursor,
  label,
  showToolbar = true,
  showBackground = true,
  showFooter = true,
  showScoreTitle = true,
  showGhostNotes = true,
  showBlockedGhostNotes = true,
  viewport,
  scoreTitleOffset,
  scrollPadding,
  engraving,
  view,
  tuplet,
  chordDisplay,
  chordEditable = true,
  interactive = true,
  enableKeyboard = true,
  enablePlayback = true,
}: ScoreEditorContentProps) => {
  // --- Context & Theme ---
  const { theme } = useTheme();
  const scoreLogic = useScoreContext();
  const sharedSession = useSessionConfig();

  // Grouped API destructuring
  const { score, selection, previewNote } = scoreLogic.state;
  const { dispatch, scoreRef, selectionEngine } = scoreLogic.engines;
  const { activeDuration, isDotted, activeAccidental } = scoreLogic.tools;
  const { select: handleNoteSelection, focus: focusScore } = scoreLogic.navigation;
  const { addChord: addChordToMeasure, updatePitch: updateNotePitch } = scoreLogic.entry;
  const { clearSelection, setPreviewNote, feedback, setFeedback } = scoreLogic;
  const { pendingClefChange, setPendingClefChange } = scoreLogic;

  // --- Local UI State ---
  const playback = useEditorPlayback()!;
  const {
    bpm,
    setBpm,
    instrument: selectedInstrument,
    setInstrument: handleInstrumentChange,
  } = playback;
  const [showHelp, setShowHelp] = useState(false);
  const [isHoveringScore, setIsHoveringScore] = useState(false);
  const [viewportZoom, setViewportZoom] = useState(100); // Viewport zoom in percentage
  const [isFullscreen, setIsFullscreen] = useState(false);
  // #242 Lane D: transient feedback (e.g. an overflow rejection) surfaced from the editor logic and
  // shown in the toolbar, auto-dismissed after a few seconds. setFeedback is stable (useCallback)
  // and `feedback` only changes when a new message is set, so the timer resets per message rather
  // than on every render.
  const errorMsg = feedback?.message ?? null;
  const feedbackSeverity = feedback?.severity ?? 'error';
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback, setFeedback]);

  // --- Refs ---
  const toolbarRef = useRef<ToolbarHandle>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);

  // --- Extracted Hooks ---
  const samplerLoaded = useSamplerStatus();
  // const modifierHeld = useModifierKeys(); // Unused
  const titleEditor = useTitleEditor(score.title, dispatch);

  // --- Complex Hooks ---

  // When the score switches to a static (non-interactive) view — e.g. a gallery card toggled
  // back from editing — reset transient interaction state so nothing stale lingers on the
  // read-only score: stop playback and hide the playhead, drop the selection, and clear the
  // entry ghost-note preview.
  const { isActive: isPlaybackActive, stopPlayback, exitPlaybackMode } = playback;
  useEffect(() => {
    if (interactive) return;
    if (isPlaybackActive) {
      stopPlayback();
      exitPlaybackMode();
    }
    if (!sharedSession && (selection.eventId || selection.noteId || selection.chordId))
      clearSelection();
    if (!sharedSession && previewNote) setPreviewNote(null);
  }, [
    interactive,
    sharedSession,
    isPlaybackActive,
    selection,
    previewNote,
    stopPlayback,
    exitPlaybackMode,
    clearSelection,
    setPreviewNote,
  ]);

  const { midiStatus } = useMIDI(
    addChordToMeasure,
    activeDuration,
    isDotted,
    activeAccidental,
    scoreRef,
    interactive,
    () => !!scoreContainerRef.current?.contains(document.activeElement)
  );
  const chordTrackHook = useChordTrack({
    scoreRef,
    score,
    selectionEngine,
    dispatch,
  });

  useScoreInteraction({
    scoreRef,
    selection,
    onUpdatePitch: updateNotePitch,
    onSelectNote: (
      measureIndex,
      eventId,
      noteId,
      staffIndex,
      isMulti,
      selectAllInEvent,
      isShift
    ) => {
      if (measureIndex !== null && eventId !== null) {
        handleNoteSelection(
          measureIndex,
          eventId,
          noteId,
          staffIndex,
          isMulti,
          selectAllInEvent,
          isShift
        );
      }
    },
  });

  // Calculate quants per measure for chord navigation
  const quantsPerMeasure = getMeasureCapacity(score.timeSignature);

  // Chord track Tab navigation handler
  const handleChordTabNavigate = useCallback(
    (direction: 'next' | 'previous') => {
      const selectedChordId = selection.chordId;
      if (!selectedChordId) return;

      // Find current chord's position
      const currentChord = chordTrackHook.chords.find((c) => c.id === selectedChordId);
      if (!currentChord) return;

      // Build sorted list of valid positions from Map<measure, Set<quant>>
      const sortedPositions: Array<{ measure: number; quant: number }> = [];
      for (const [measure, quants] of chordTrackHook.validPositions) {
        for (const quant of quants) {
          sortedPositions.push({ measure, quant });
        }
      }
      sortedPositions.sort((a, b) => a.measure - b.measure || a.quant - b.quant);

      // Find current index
      const currentIdx = sortedPositions.findIndex(
        (p) => p.measure === currentChord.measure && p.quant === currentChord.quant
      );
      if (currentIdx === -1) return;

      // Find target position
      const targetIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
      if (targetIdx < 0 || targetIdx >= sortedPositions.length) return;

      const targetPosition = sortedPositions[targetIdx];
      const chordAtPosition = chordTrackHook.chords.find(
        (c) => c.measure === targetPosition.measure && c.quant === targetPosition.quant
      );
      if (chordAtPosition) {
        chordTrackHook.startEditing(chordAtPosition.id);
      } else {
        chordTrackHook.startCreating(targetPosition);
      }
    },
    [selection.chordId, chordTrackHook]
  );

  // ESC from selected chord - return focus to topmost note at chord's quant
  const handleChordEscapeToNotes = useCallback(() => {
    const selectedChordId = selection.chordId;
    if (!selectedChordId) return;

    const chord = chordTrackHook.chords.find((c) => c.id === selectedChordId);
    if (!chord) return;

    const measureIndex = chord.measure;
    const localQuant = chord.quant;

    // Clear chord selection first
    selectionEngine.selectChord(null);

    // Try to find a note at this quant in the topmost staff first
    for (let staffIdx = 0; staffIdx < score.staves.length; staffIdx++) {
      const staff = score.staves[staffIdx];
      const measure = staff?.measures[measureIndex];
      const event = findEventAtQuantPosition(measure, localQuant);

      if (event && !isRestEvent(event) && (event.notes?.length ?? 0) > 0) {
        // Found a note - select the highest note in the event
        const sortedNotes = [...(event.notes || [])].sort((a, b) => {
          const midiA = a.pitch ? getMidi(a.pitch) : 0;
          const midiB = b.pitch ? getMidi(b.pitch) : 0;
          return midiB - midiA; // Descending (highest first)
        });
        handleNoteSelection(measureIndex, event.id, sortedNotes[0]?.id || null, staffIdx);
        return;
      }
    }

    // No note at this quant - find nearest note to the left
    for (let mIdx = measureIndex; mIdx >= 0; mIdx--) {
      for (let staffIdx = 0; staffIdx < score.staves.length; staffIdx++) {
        const staff = score.staves[staffIdx];
        const measure = staff?.measures[mIdx];
        if (!measure?.events?.length) continue;

        const maxQuant = mIdx === measureIndex ? localQuant : quantsPerMeasure;
        let currentQuant = 0;
        let lastValidEvent: { event: (typeof measure.events)[0]; quant: number } | null = null;

        for (const event of measure.events) {
          if (currentQuant < maxQuant && !isRestEvent(event) && (event.notes?.length ?? 0) > 0) {
            lastValidEvent = { event, quant: currentQuant };
          }
          currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
        }

        if (lastValidEvent) {
          const sortedNotes = [...(lastValidEvent.event.notes || [])].sort((a, b) => {
            const midiA = a.pitch ? getMidi(a.pitch) : 0;
            const midiB = b.pitch ? getMidi(b.pitch) : 0;
            return midiB - midiA;
          });
          handleNoteSelection(mIdx, lastValidEvent.event.id, sortedNotes[0]?.id || null, staffIdx);
          return;
        }
      }
    }
  }, [
    selection.chordId,
    chordTrackHook.chords,
    score.staves,
    quantsPerMeasure,
    selectionEngine,
    handleNoteSelection,
  ]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  useKeyboardShortcuts(
    scoreLogic,
    playback,
    {
      isEditingTitle: titleEditor.isEditing,
      isHoveringScore,
      scoreContainerRef,
      isAnyMenuOpen: () => (toolbarRef.current?.isMenuOpen() ?? false) || showHelp,
      isDisabled: !enableKeyboard || !interactive,
      enablePlayback,
      showChordSymbols: chordDisplay?.visible !== false,
    },
    { handleTitleCommit: titleEditor.commit },
    { navigateAndEdit: handleChordTabNavigate, escapeToNotes: handleChordEscapeToNotes },
    { toggleScoreSetup: () => toolbarRef.current?.toggleScoreSetup(), toggleFullscreen }
  );

  // --- Event Handlers ---
  const handleEscape = useCallback(() => {
    setTimeout(() => scoreContainerRef.current?.focus(), 0);
    focusScore();
  }, [focusScore]);

  const handleClefConfirm = useCallback(() => {
    if (!pendingClefChange) return;
    dispatch(new SetSingleStaffCommand(pendingClefChange.targetClef));
    setPendingClefChange(null);
  }, [pendingClefChange, dispatch, setPendingClefChange]);

  const handleBackgroundClick = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  // Printing: enter print mode for browser-menu prints that bypass openPrintDialog, and drop
  // the on-screen state a sheet must not carry (selection colour, hover ghost). Browsers take
  // the print snapshot right after 'beforeprint', so the DOM update is flushed synchronously.
  useEffect(() => {
    const handleBeforePrint = () => {
      preparePrint();
      flushSync(() => {
        clearSelection();
        setPreviewNote(null);
      });
    };
    const handleAfterPrint = () => restoreFromPrint();
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
    };
  }, [clearSelection, setPreviewNote]);

  const handleHoverChange = useCallback(
    (isHovering: boolean) => {
      setIsHoveringScore(isHovering);
      if (!isHovering) {
        const isFocused =
          document.activeElement === scoreContainerRef.current ||
          scoreContainerRef.current?.contains(document.activeElement);
        if (!isFocused) setPreviewNote(null);
      }
    },
    [setPreviewNote]
  );

  // Exit playback mode (hide cursor) whenever selection changes
  // This covers: clicking notes, keyboard navigation, background clicks
  // (exitPlaybackMode is destructured alongside the playback-disable effect above.)
  React.useEffect(() => {
    exitPlaybackMode();
  }, [selection, exitPlaybackMode]);

  // --- Render ---
  const viewportOptions = isFullscreen ? undefined : viewport;
  const dimension = (value: number | undefined): number | undefined =>
    value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
  const viewportHeight = dimension(viewportOptions?.height);
  const editorClassName = `riff-ScoreEditor${isFullscreen ? ' riff-ScoreEditor--fullscreen' : ''}`;

  return (
    <div
      className={editorClassName}
      data-testid="score-editor"
      style={{
        backgroundColor: showBackground ? theme.panelBackground : 'transparent',
        color: theme.text,
        scrollbarWidth: 'thin',
        scrollbarColor: `${theme.border} transparent`,
      }}
    >
      {showToolbar && (
        <Toolbar
          ref={toolbarRef}
          label={label}
          scoreTitle={score.title}
          isEditingTitle={titleEditor.isEditing}
          onEditingChange={titleEditor.setIsEditing}
          onTitleChange={(t) => dispatch(new UpdateTitleCommand(t))}
          isPlaying={playback.isPlaying}
          onPlayToggle={enablePlayback ? playback.handlePlayToggle : undefined}
          bpm={bpm}
          onBpmChange={setBpm}
          midiStatus={midiStatus}
          melodies={MELODIES}
          selectedInstrument={selectedInstrument}
          onInstrumentChange={handleInstrumentChange}
          samplerLoaded={samplerLoaded}
          errorMsg={errorMsg}
          feedbackSeverity={feedbackSeverity}
          onToggleHelp={() => setShowHelp(true)}
          onEscape={handleEscape}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
      )}

      {showHelp && (
        <Portal>
          <ShortcutsOverlay onClose={() => setShowHelp(false)} />
        </Portal>
      )}

      <div
        className="riff-ScoreEditor__viewport"
        hidden={!showScore}
        style={{
          backgroundColor: showBackground ? theme.background : 'transparent',
          width: dimension(viewportOptions?.width),
          minWidth: dimension(viewportOptions?.minWidth),
          maxWidth: dimension(viewportOptions?.maxWidth),
          height: viewportHeight,
          minHeight: dimension(viewportOptions?.minHeight),
          maxHeight: dimension(viewportOptions?.maxHeight),
          flex: viewportHeight === undefined ? undefined : 'none',
          overflow: viewportOptions?.overflow,
        }}
      >
        <div
          className="riff-ScoreEditor__content"
          style={{
            justifyContent:
              viewportOptions?.verticalAlign === 'center'
                ? 'center'
                : viewportOptions?.verticalAlign === 'end'
                  ? 'flex-end'
                  : undefined,
            transform: `scale(${viewportZoom / 100})`,
            transformOrigin:
              (score.layout?.viewMode ?? DEFAULT_LAYOUT_CONFIG.viewMode) === 'scroll'
                ? 'top left'
                : 'top center',
          }}
        >
          {showScore && (
            <ScoreCanvas
              renderOverlay={renderOverlay}
              resolveViewport={resolveViewport}
              interactive={interactive}
              scale={scale}
              view={view}
              bounds={viewportOptions?.bounds}
              engraving={engraving}
              tuplet={tuplet}
              showScoreTitle={showScoreTitle}
              showGhostNotes={showGhostNotes}
              showBlockedGhostNotes={showBlockedGhostNotes}
              scoreTitleOffset={scoreTitleOffset}
              scrollPadding={scrollPadding}
              overflow={viewportOptions?.overflow}
              showBackground={showBackground}
              chordDisplay={chordDisplay}
              chordEditable={chordEditable}
              zoom={viewportZoom / 100}
              playbackPosition={
                playbackCursor === undefined
                  ? playback.playbackPosition
                  : (playbackCursor ?? { measureIndex: 0, quant: 0, duration: 0 })
              }
              containerRef={scoreContainerRef}
              onHoverChange={handleHoverChange}
              onBackgroundClick={handleBackgroundClick}
              onKeySigClick={() => toolbarRef.current?.openKeySigMenu()}
              onTimeSigClick={() => toolbarRef.current?.openTimeSigMenu()}
              onClefClick={() => toolbarRef.current?.openClefMenu()}
              isPlaying={
                playbackCursor === undefined
                  ? playback.isPlaying
                  : (playbackCursor?.isPlaying ?? false)
              }
              isPlaybackVisible={
                playbackCursor === undefined ? playback.isActive : playbackCursor !== null
              }
              chordTrack={chordTrackHook}
            />
          )}
        </div>
      </div>

      <div className="riff-ScoreEditor__controls">
        {renderControls?.({
          score,
          canUndo: interactive && scoreLogic.state.history.length > 0,
          canRedo: interactive && scoreLogic.state.redoStack.length > 0,
          undo: () => {
            if (interactive) scoreLogic.historyAPI.undo();
          },
          redo: () => {
            if (interactive) scoreLogic.historyAPI.redo();
          },
          playbackState: { ...playback.playbackPosition, isPlaying: playback.isPlaying },
          playbackEnabled: interactive && enablePlayback,
          isPlaying: playback.isPlaying,
          play: async () => {
            if (!interactive || !enablePlayback) return;
            const position = playback.getPosition();
            await playback.playScore(position.measureIndex ?? 0, position.quant ?? 0);
          },
          pause: playback.pausePlayback,
          stop: playback.stopPlayback,
          seek: (measureIndex, quant = 0) => {
            if (
              Number.isInteger(measureIndex) &&
              measureIndex >= 0 &&
              Number.isFinite(quant) &&
              quant >= 0
            )
              playback.seekPlayback?.(measureIndex, quant);
          },
          bpm,
          setBpm: (value) => {
            if (Number.isFinite(value) && value > 0) {
              if (playback.isPlaying) playback.pausePlayback();
              setBpm(value);
            }
          },
          instrument: selectedInstrument,
          setInstrument: handleInstrumentChange,
          samplerLoaded,
        })}
      </div>

      {showFooter && (
        <EditorFooter
          selection={selection}
          previewNote={previewNote}
          score={score}
          zoom={viewportZoom}
          onZoomChange={setViewportZoom}
        />
      )}

      {pendingClefChange && (
        <Portal>
          <ConfirmDialog
            title="Change to Single Staff?"
            message={`This will remove the ${pendingClefChange.targetClef === 'treble' ? 'bass' : 'treble'} clef and all its contents.`}
            actions={[
              { label: 'Cancel', onClick: () => setPendingClefChange(null), variant: 'secondary' },
              {
                label: `Drop ${pendingClefChange.targetClef === 'treble' ? 'Bass' : 'Treble'} Clef`,
                onClick: handleClefConfirm,
                variant: 'danger',
              },
            ]}
            onClose={() => setPendingClefChange(null)}
          />
        </Portal>
      )}
    </div>
  );
};

// Direct/internal consumers receive the same transport ownership as RiffScore.
const ScoreEditorContent = (props: ScoreEditorContentProps): React.ReactElement => {
  const playback = useEditorPlayback();
  return playback ? (
    <ScoreEditorBody {...props} />
  ) : (
    <PlaybackProvider chordPlayback={props.chordPlayback}>
      <ScoreEditorBody {...props} />
    </PlaybackProvider>
  );
};

// ------------------------------------------------------------------
// Wrapper with Provider
// ------------------------------------------------------------------

const ScoreEditor = ({
  scale = 1,
  label,
  initialData,
}: {
  scale?: number;
  label?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialData?: any;
}) => {
  return (
    <ScoreProvider initialScore={initialData}>
      <ScoreEditorContent scale={scale} label={label} />
    </ScoreProvider>
  );
};

export { ScoreEditorContent };
export default ScoreEditor;
