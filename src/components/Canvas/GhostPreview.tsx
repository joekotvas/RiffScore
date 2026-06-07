import React from 'react';
import { Note } from '@/types';
import { ChordLayout } from '@/engines/layout';
import { LayoutConfig, InteractionState } from '@/componentTypes';
import { Rest } from './Rest';
import ChordGroup from './ChordGroup';
import { NOTE_TYPES } from '@/constants';

interface GhostPreviewProps {
  previewRender: {
    chordNotes: Note[];
    quant: number;
    x: number;
    chordLayout: ChordLayout;
  };
  previewNote: {
    duration: string;
    dotted: boolean;
    mode: string;
    isRest?: boolean;
  };
  baseY: number;
  layout: LayoutConfig;
  interaction: InteractionState;
  measureIndex: number;
}

/**
 * Renders the ghost preview for note/rest entry.
 * Shows a semi-transparent preview of what will be created on click.
 */
const GhostPreview: React.FC<GhostPreviewProps> = ({
  previewRender,
  previewNote,
  baseY,
  layout,
  interaction,
  measureIndex,
}) => {
  const { chordNotes, x, chordLayout } = previewRender;

  // Render rest preview when in REST mode
  if (previewNote?.isRest) {
    return (
      <Rest
        duration={previewNote.duration}
        dotted={previewNote.dotted}
        x={x}
        baseY={baseY}
        isGhost={true}
      />
    );
  }

  // Normal note preview. A CHORD-mode ghost normally omits its stem (it shares the stacked event's
  // stem), but a STANDALONE chord ghost (length 1) is really a fill of a reserved tuplet slot (#242)
  // — draw its stem so the freed space previews as a real note, not a lone notehead.
  const isStandalone = chordNotes.length === 1;
  const shouldDrawStem =
    NOTE_TYPES[previewNote.duration]?.stem && (previewNote.mode !== 'CHORD' || isStandalone);

  return (
    <ChordGroup
      notes={chordNotes}
      duration={previewNote.duration}
      dotted={previewNote.dotted}
      eventId="preview"
      x={x}
      chordLayout={chordLayout}
      isGhost={true}
      layout={layout}
      interaction={interaction}
      measureIndex={measureIndex}
      staffIndex={layout.staffIndex}
      opacity={0.5}
      renderStem={shouldDrawStem}
    />
  );
};

export default GhostPreview;
