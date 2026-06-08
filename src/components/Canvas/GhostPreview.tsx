import React from 'react';
import { Note } from '@/types';
import { ChordLayout, getOffsetForPitch } from '@/engines/layout';
import { LayoutConfig, InteractionState } from '@/componentTypes';
import { useTheme } from '@/context/ThemeContext';
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
    pitch?: string;
    /** Set when the position can't accept input — render greyed with an X (see types.ts). */
    blocked?: 'tuplet-full' | 'measure-full';
  };
  baseY: number;
  layout: LayoutConfig;
  interaction: InteractionState;
  measureIndex: number;
}

/** Half-width of the X drawn over a blocked ghost. */
const BLOCKED_X_HALF = 8;

/**
 * Renders the ghost preview for note/rest entry.
 * Shows a semi-transparent preview of what will be created on click. When the position can't accept
 * the input (a full tuplet's insert gap, or a full bar), the ghost is rendered GREYED with an X
 * instead of teal — a clear "can't place here" signal, paired with the footer status.
 */
const GhostPreview: React.FC<GhostPreviewProps> = ({
  previewRender,
  previewNote,
  baseY,
  layout,
  interaction,
  measureIndex,
}) => {
  const { theme } = useTheme();
  const { chordNotes, x, chordLayout } = previewRender;
  const blocked = previewNote?.blocked;

  let content: React.ReactNode;
  if (previewNote?.isRest) {
    content = (
      <Rest
        duration={previewNote.duration}
        dotted={previewNote.dotted}
        x={x}
        baseY={baseY}
        isGhost={true}
      />
    );
  } else {
    // A CHORD-mode ghost normally omits its stem (it shares the stacked event's stem), but a
    // STANDALONE chord ghost (length 1) is really a fill of a reserved tuplet slot (#242) — draw its
    // stem so the freed space previews as a real note, not a lone notehead.
    const isStandalone = chordNotes.length === 1;
    const shouldDrawStem =
      NOTE_TYPES[previewNote.duration]?.stem && (previewNote.mode !== 'CHORD' || isStandalone);
    content = (
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
  }

  if (!blocked) return <>{content}</>;

  // Blocked: grey the whole ghost (desaturate the teal accent) and stamp an X over the notehead.
  // The X is drawn in the accent colour INSIDE the grayscale group, so it desaturates to the exact
  // same grey as the ghost note.
  const markY = previewNote.isRest
    ? baseY
    : baseY + getOffsetForPitch(previewNote.pitch ?? 'B4', layout.clef);

  return (
    <g data-testid="ghost-blocked" style={{ filter: 'grayscale(100%)' }}>
      {content}
      <g
        stroke={theme.accent}
        strokeWidth={2.75}
        strokeLinecap="round"
        opacity={0.6}
        pointerEvents="none"
      >
        <line x1={x - BLOCKED_X_HALF} y1={markY - BLOCKED_X_HALF} x2={x + BLOCKED_X_HALF} y2={markY + BLOCKED_X_HALF} />
        <line x1={x - BLOCKED_X_HALF} y1={markY + BLOCKED_X_HALF} x2={x + BLOCKED_X_HALF} y2={markY - BLOCKED_X_HALF} />
      </g>
    </g>
  );
};

export default GhostPreview;
