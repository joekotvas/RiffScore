import { MusicGlyph } from '@/components/Assets/MusicGlyph';
import React, { useContext } from 'react';
import { NoteAnnotationContext } from '@/context/NoteAnnotationContext';
import { LAYOUT } from '@/constants';
import { CONFIG } from '@/config';
import { useTheme } from '@/context/ThemeContext';
import { getScoreHighlightColor } from '@/themes';
import { getOffsetForPitch } from '@/engines/layout';
import { NOTEHEADS, getFontSize, DOTS, ACCIDENTALS } from '@/constants/SMuFL';
import { NoteProps } from '@/componentTypes';

// =============================================================================
// SUB-COMPONENTS (Internal to Note)
// =============================================================================

/**
 * Renders the notehead glyph (whole, half, or black).
 */
const NoteHead = ({
  x,
  y,
  duration,
  color,
}: {
  x: number;
  y: number;
  duration: string;
  color: string;
}) => {
  const getGlyph = () => {
    if (duration === 'whole') return NOTEHEADS.whole;
    if (duration === 'half') return NOTEHEADS.half;
    return NOTEHEADS.black;
  };

  const fontSize = getFontSize(CONFIG.lineHeight);

  return (
    <MusicGlyph
      className="NoteHead"
      x={x}
      y={y}
      fontSize={fontSize}
      textAnchor="middle"
      fill={color}
      style={{ userSelect: 'none' }}
    >
      {getGlyph()}
    </MusicGlyph>
  );
};

/**
 * Renders the accidental symbol using Bravura font glyphs.
 */
const Accidental = ({
  x,
  y,
  symbol,
  color,
  parenthesized = false,
}: {
  x: number;
  y: number;
  symbol: string;
  color: string;
  /** Draw as a parenthesized cautionary accidental (#236 courtesy policy). */
  parenthesized?: boolean;
}) => {
  if (!symbol) return null;

  const fontSize = getFontSize(CONFIG.lineHeight);
  // Wrap a courtesy accidental in the SMuFL accidental-parenthesis glyphs.
  const glyph = parenthesized
    ? `${ACCIDENTALS.parenthesisLeft}${symbol}${ACCIDENTALS.parenthesisRight}`
    : symbol;

  // The parentheses widen the glyph symmetrically (textAnchor="middle"), pushing the
  // right paren toward the notehead. Nudge the whole group left so the parenthesized
  // accidental keeps the same breathing room from the notehead as a bare one.
  const renderX = parenthesized ? x - LAYOUT.ACCIDENTAL.PARENTHESIS_PAD : x;

  return (
    <MusicGlyph
      x={renderX}
      y={y}
      fontSize={fontSize}
      fill={color}
      textAnchor="middle"
      style={{ userSelect: 'none' }}
    >
      {glyph}
    </MusicGlyph>
  );
};

/**
 * Renders the augmentation dot.
 */
const Dot = ({ x, y, color }: { x: number; y: number; color: string }) => {
  const fontSize = getFontSize(CONFIG.lineHeight);

  return (
    <MusicGlyph
      x={x}
      y={y}
      fontSize={fontSize}
      fill={color}
      textAnchor="start"
      style={{ userSelect: 'none' }}
    >
      {DOTS.augmentationDot}
    </MusicGlyph>
  );
};

/**
 * Renders ledger lines above or below the staff.
 */
const LedgerLines = ({
  x,
  y,
  baseY,
  color,
  duration,
}: {
  x: number;
  y: number;
  baseY: number;
  color: string;
  duration?: string;
}) => {
  const lines = [];
  const relativeY = y - baseY;

  // The whole-note head is appreciably wider than the black/half heads, so the default
  // ledger half-width barely clears it. Widen the ledger for whole notes so it peeks past
  // the notehead on both sides, as engraving convention requires.
  const ext =
    duration === 'whole'
      ? LAYOUT.LEDGER_LINE_EXTENSION + LAYOUT.LEDGER_LINE_WHOLE_EXTRA
      : LAYOUT.LEDGER_LINE_EXTENSION;

  // Lines above staff
  if (relativeY < 0) {
    for (let i = -12; i >= relativeY; i -= 12) {
      lines.push(
        <line
          key={`ledger-${i}`}
          x1={x - ext}
          y1={baseY + i}
          x2={x + ext}
          y2={baseY + i}
          stroke={color}
          strokeWidth={LAYOUT.LINE_STROKE_WIDTH}
        />
      );
    }
  }

  // Lines below staff
  if (relativeY > 48) {
    for (let i = 60; i <= relativeY; i += 12) {
      lines.push(
        <line
          key={`ledger-${i}`}
          x1={x - ext}
          y1={baseY + i}
          x2={x + ext}
          y2={baseY + i}
          stroke={color}
          strokeWidth={LAYOUT.LINE_STROKE_WIDTH}
        />
      );
    }
  }

  return <>{lines}</>;
};

/**
 * Hit area for easier clicking on notes.
 * Visibility controlled by CONFIG.debug.showHitZones
 */
const HitArea = ({
  x,
  y,
  cursor,
  onClick,
  onMouseDown,
  onDoubleClick,
  testId,
}: {
  x: number;
  y: number;
  cursor: string;
  onClick?: (e: React.MouseEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  testId: string;
}) => {
  const showDebug = CONFIG.debug?.showHitZones;
  return (
    <rect
      x={x}
      y={y}
      width={LAYOUT.HIT_AREA.WIDTH}
      height={LAYOUT.HIT_AREA.HEIGHT}
      fill={showDebug ? 'red' : 'white'}
      fillOpacity={showDebug ? 0.3 : 0.01}
      stroke={showDebug ? 'red' : 'none'}
      strokeWidth={showDebug ? 1 : 0}
      style={{ cursor }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      data-note-hit-area="true"
      data-testid={testId}
    />
  );
};

// =============================================================================
// MAIN NOTE COMPONENT
// =============================================================================

/**
 * Renders a complete note with all its visual elements:
 * - NoteHead (glyph)
 * - Accidental
 * - Dot
 * - LedgerLines
 * - HitArea (interaction layer)
 *
 * This is the primary building block used by ChordGroup.
 */
const Note: React.FC<NoteProps> = React.memo(
  ({
    // Note data
    note,
    pitch, // Alternative to note.pitch for simpler use cases
    duration,
    dotted = false,

    // Positioning
    x,
    y: overrideY, // Explicit Y from Layout Engine
    baseY,
    clef,
    xShift = 0,
    dotShift = 0,

    // Appearance
    isSelected = false,
    isPreview = false, // Lasso preview state (shows semi-transparent accent)
    isGhost = false,
    accidentalGlyph = null,
    accidentalParenthesized = false,
    color: overrideColor = null,

    // Interaction handlers (optional for interactive notes)
    handlers = null, // { onMouseEnter, onMouseLeave, onMouseDown, onDoubleClick }
  }) => {
    const { theme } = useTheme();
    const annotation = useContext(NoteAnnotationContext).get(note?.id ?? '');

    // Resolve pitch from either direct prop or note object
    const effectivePitch = pitch || note?.pitch;
    if (!effectivePitch) return null;

    // Calculate position
    const noteX = x + xShift;
    const noteY =
      overrideY !== undefined ? overrideY : baseY + getOffsetForPitch(effectivePitch, clef);

    // Hover (forwarded as selection), selection, and preview share the same notation ink.
    const color =
      overrideColor ||
      (isGhost || isSelected || isPreview ? getScoreHighlightColor(theme) : theme.score.note);

    // Dot Y position (move up if on a line)
    const relativeY = noteY - baseY;
    const dotY = relativeY % 12 === 0 ? noteY - 6 : noteY;
    const dotX = noteX + dotShift + LAYOUT.DOT_OFFSET_X;

    // Accidental position
    const accidentalX = noteX + LAYOUT.ACCIDENTAL.OFFSET_X;
    const accidentalY = noteY + LAYOUT.ACCIDENTAL.OFFSET_Y;

    // Hit area position
    const hitX = noteX + LAYOUT.HIT_AREA.OFFSET_X;
    const hitY = noteY + LAYOUT.HIT_AREA.OFFSET_Y;

    // Note ID for hit area test ID
    const noteId = note?.id || 'note';

    return (
      <g
        data-riffscore-part={!isGhost ? 'note' : undefined}
        className={!isGhost ? 'note-group-container' : ''}
        onMouseEnter={() => handlers?.onMouseEnter?.(note?.id ?? 'note')}
        onMouseLeave={handlers?.onMouseLeave}
      >
        {/* 1. Ledger Lines (behind everything) */}
        <LedgerLines x={noteX} y={noteY} baseY={baseY} color={color} duration={duration} />

        {/* 2. Accidental */}
        {accidentalGlyph && (
          <Accidental
            x={accidentalX}
            y={accidentalY}
            symbol={accidentalGlyph}
            color={color}
            parenthesized={accidentalParenthesized}
          />
        )}

        {/* 3. Note Head */}
        <g style={{ pointerEvents: 'none' }}>
          {!isGhost && annotation?.label && (duration === 'whole' || duration === 'half') ? (
            // A thin, opaque hollow head keeps staff/ledger lines out of the label.
            // Its footprint and stem attachment remain within the standard head envelope.
            <ellipse
              className="NoteHead"
              cx={noteX}
              cy={noteY}
              rx={duration === 'whole' ? 9.5 : 6.5}
              ry={5}
              transform={duration === 'half' ? `rotate(-18 ${noteX} ${noteY})` : undefined}
              fill={theme.background}
              stroke={color}
              strokeWidth={1.2}
            />
          ) : (
            <NoteHead x={noteX} y={noteY} duration={duration} color={color} />
          )}
          {!isGhost && annotation?.label && (
            <text
              data-riffscore-part="notehead-label"
              x={noteX}
              y={noteY}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="sans-serif"
              fontWeight="700"
              fontSize={duration === 'half' ? 6 : 7}
              textLength={Math.min(
                duration === 'half' ? 8 : 12,
                Array.from(annotation.label).length * 4
              )}
              lengthAdjust="spacingAndGlyphs"
              pointerEvents="none"
              fill={duration === 'whole' || duration === 'half' ? color : theme.background}
              aria-label={annotation.label}
              role="img"
            >
              {annotation.label}
            </text>
          )}
        </g>

        {/* 4. Dot */}
        {dotted && <Dot x={dotX} y={dotY} color={color} />}

        {/* 5. Hit Area (on top for interaction) */}
        {handlers && (
          <HitArea
            x={hitX}
            y={hitY}
            cursor={!isGhost ? 'pointer' : 'default'}
            onClick={(e: React.MouseEvent) => !isGhost && e.stopPropagation()}
            onMouseDown={(e: React.MouseEvent) => note && handlers.onMouseDown?.(e, note)}
            onDoubleClick={(e: React.MouseEvent) => note && handlers.onDoubleClick?.(e, note)}
            testId={`note-${noteId}`}
          />
        )}
      </g>
    );
  }
);

// Also export sub-components for special use cases
export { NoteHead, Accidental, Dot, LedgerLines, HitArea };
export default Note;
