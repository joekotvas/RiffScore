import React, { useRef, useState, useCallback } from 'react';

// Contexts
import { ScoreProvider, useScoreContext } from '@context/ScoreContext';
import { useTheme } from '@context/ThemeContext';

// Hooks
import { useKeyboardShortcuts, useScoreInteraction } from '@hooks/interaction';
import { usePlayback, useMIDI, useSamplerStatus } from '@hooks/audio';
// import { useModifierKeys } from '@hooks/useModifierKeys';
import { useTitleEditor } from '@hooks/useTitleEditor';
import { useChordTrack } from '@hooks/chord/useChordTrack';

// Components
import ScoreCanvas from '@components/Canvas/ScoreCanvas';
import Toolbar, { ToolbarHandle } from '@components/Toolbar/Toolbar';
import { ScoreTitleField } from '@components/Layout/ScoreTitleField';
import ShortcutsOverlay from '@components/Layout/Overlays/ShortcutsOverlay';
import ConfirmDialog from '@components/Layout/Overlays/ConfirmDialog';
import Portal from '@components/Layout/Portal';

// Commands
import { SetSingleStaffCommand } from '@commands/SetSingleStaffCommand';
import { UpdateTitleCommand } from '@commands/UpdateTitleCommand';

// Engines & Data
import { setInstrument, InstrumentType } from '@engines/toneEngine';
import { MELODIES } from '@/data/melodies';

// Utilities
import { findEventAtQuantPosition } from '@/utils/navigation/crossStaff';
import { getNoteDuration } from '@/utils/core';
import { TIME_SIGNATURES } from '@/constants';

import './styles/ScoreEditor.css';

// ------------------------------------------------------------------
// Props Interface
// ------------------------------------------------------------------

interface ScoreEditorContentProps {
  scale?: number;
  label?: string;
  showToolbar?: boolean;
  showBackground?: boolean;
  showScoreTitle?: boolean;
  enableKeyboard?: boolean;
  enablePlayback?: boolean;
}

// ------------------------------------------------------------------
// Main Component
// ------------------------------------------------------------------

const ScoreEditorContent = ({
  scale = 1,
  label,
  showToolbar = true,
  showBackground = true,
  showScoreTitle = true,
  enableKeyboard = true,
  enablePlayback = true,
}: ScoreEditorContentProps) => {
  // --- Context & Theme ---
  const { theme } = useTheme();
  const scoreLogic = useScoreContext();

  // Grouped API destructuring
  const { score, selection } = scoreLogic.state;
  const { dispatch, scoreRef, selectionEngine } = scoreLogic.engines;
  const { activeDuration, isDotted, activeAccidental } = scoreLogic.tools;
  const { select: handleNoteSelection, focus: focusScore } = scoreLogic.navigation;
  const { addChord: addChordToMeasure, updatePitch: updateNotePitch } = scoreLogic.entry;
  const { clearSelection, setPreviewNote } = scoreLogic;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pendingClefChange, setPendingClefChange } = scoreLogic as any; // UI state from context

  // --- Local UI State ---
  const [bpm, setBpm] = useState(120);
  const [showHelp, setShowHelp] = useState(false);
  const [isHoveringScore, setIsHoveringScore] = useState(false);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentType>('bright');
  // Error state temporarily disabled/unused
  // const [errorMsg, setErrorMsg] = useState(null);
  const errorMsg = null;

  // --- Refs ---
  const toolbarRef = useRef<ToolbarHandle>(null);
  const scoreContainerRef = useRef<HTMLDivElement>(null);

  // --- Extracted Hooks ---
  const samplerLoaded = useSamplerStatus();
  // const modifierHeld = useModifierKeys(); // Unused
  const titleEditor = useTitleEditor(score.title, dispatch);

  // --- Complex Hooks ---
  const playback = usePlayback(score, bpm);
  const { midiStatus } = useMIDI(
    addChordToMeasure,
    activeDuration,
    isDotted,
    activeAccidental,
    scoreRef
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
  const quantsPerMeasure = TIME_SIGNATURES[score.timeSignature || '4/4'] || 96;

  // Chord track Tab navigation handler
  const handleChordTabNavigate = useCallback(
    (direction: 'next' | 'previous') => {
      const selectedChordId = selection.chordId;
      if (!selectedChordId) return;

      // Find current chord's quant
      const currentChord = chordTrackHook.chords.find((c) => c.id === selectedChordId);
      if (!currentChord) return;

      const currentQuant = currentChord.quant;

      // Get sorted valid quants and find next/previous position
      const sortedQuants = Array.from(chordTrackHook.validQuants).sort((a, b) => a - b);

      let targetQuant: number | undefined;
      if (direction === 'next') {
        targetQuant = sortedQuants.find((q) => q > currentQuant);
      } else {
        const previousQuants = sortedQuants.filter((q) => q < currentQuant);
        targetQuant = previousQuants[previousQuants.length - 1];
      }

      if (targetQuant !== undefined) {
        const chordAtQuant = chordTrackHook.chords.find((c) => c.quant === targetQuant);
        if (chordAtQuant) {
          chordTrackHook.startEditing(chordAtQuant.id);
        } else {
          chordTrackHook.startCreating(targetQuant);
        }
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

    const quant = chord.quant;
    const measureIndex = Math.floor(quant / quantsPerMeasure);
    const localQuant = quant % quantsPerMeasure;

    // Clear chord selection first
    selectionEngine.selectChord(null);

    // Try to find a note at this quant in the topmost staff first
    for (let staffIdx = 0; staffIdx < score.staves.length; staffIdx++) {
      const staff = score.staves[staffIdx];
      const measure = staff?.measures[measureIndex];
      const event = findEventAtQuantPosition(measure, localQuant);

      if (event && !event.isRest && event.notes?.length) {
        // Found a note - select the highest note in the event
        const sortedNotes = [...event.notes].sort((a, b) => {
          const midiA = a.pitch ? parseInt(a.pitch.replace(/\D/g, '')) : 0;
          const midiB = b.pitch ? parseInt(b.pitch.replace(/\D/g, '')) : 0;
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
        let lastValidEvent: { event: typeof measure.events[0]; quant: number } | null = null;

        for (const event of measure.events) {
          if (currentQuant < maxQuant && !event.isRest && event.notes?.length) {
            lastValidEvent = { event, quant: currentQuant };
          }
          currentQuant += getNoteDuration(event.duration, event.dotted, event.tuplet);
        }

        if (lastValidEvent) {
          const sortedNotes = [...lastValidEvent.event.notes!].sort((a, b) => {
            const midiA = a.pitch ? parseInt(a.pitch.replace(/\D/g, '')) : 0;
            const midiB = b.pitch ? parseInt(b.pitch.replace(/\D/g, '')) : 0;
            return midiB - midiA;
          });
          handleNoteSelection(mIdx, lastValidEvent.event.id, sortedNotes[0]?.id || null, staffIdx);
          return;
        }
      }
    }
  }, [selection.chordId, chordTrackHook.chords, score.staves, quantsPerMeasure, selectionEngine, handleNoteSelection]);

  useKeyboardShortcuts(
    scoreLogic,
    playback,
    {
      isEditingTitle: titleEditor.isEditing,
      isHoveringScore,
      scoreContainerRef,
      isAnyMenuOpen: () => (toolbarRef.current?.isMenuOpen() ?? false) || showHelp,
      isDisabled: !enableKeyboard,
    },
    { handleTitleCommit: titleEditor.commit },
    { navigateAndEdit: handleChordTabNavigate, escapeToNotes: handleChordEscapeToNotes }
  );

  // --- Event Handlers ---
  const handleInstrumentChange = useCallback((instrument: InstrumentType) => {
    setSelectedInstrument(instrument);
    setInstrument(instrument);
  }, []);

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
  const { exitPlaybackMode } = playback;
  React.useEffect(() => {
    exitPlaybackMode();
  }, [selection, exitPlaybackMode]);

  // --- Render ---
  return (
    <div
      className="riff-ScoreEditor"
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
          onToggleHelp={() => setShowHelp(true)}
          onEscape={handleEscape}
        />
      )}

      {showHelp && (
        <Portal>
          <ShortcutsOverlay onClose={() => setShowHelp(false)} />
        </Portal>
      )}

      <div className="riff-ScoreEditor__content" style={{ backgroundColor: theme.background }}>
        {showScoreTitle && (
          <div className="riff-ScoreEditor__title-wrapper">
            <ScoreTitleField
              title={score.title}
              isEditing={titleEditor.isEditing}
              setIsEditing={titleEditor.setIsEditing}
              buffer={titleEditor.buffer}
              setBuffer={titleEditor.setBuffer}
              commit={titleEditor.commit}
              inputRef={titleEditor.inputRef}
              theme={theme}
              scale={scale}
            />
          </div>
        )}

        <ScoreCanvas
          scale={scale}
          playbackPosition={playback.playbackPosition}
          containerRef={scoreContainerRef}
          onHoverChange={handleHoverChange}
          onBackgroundClick={handleBackgroundClick}
          onKeySigClick={() => toolbarRef.current?.openKeySigMenu()}
          onTimeSigClick={() => toolbarRef.current?.openTimeSigMenu()}
          onClefClick={() => toolbarRef.current?.openClefMenu()}
          isPlaying={playback.isPlaying}
          isPlaybackVisible={playback.isActive}
          chordTrack={chordTrackHook}
        />
      </div>

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
