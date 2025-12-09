// @ts-nocheck
import React, { useState, useMemo, useCallback } from 'react';
import { NOTE_TYPES } from '../../constants';
import { CONFIG } from '../../config';
import { useTheme } from '../../context/ThemeContext';
import { getOffsetForPitch, getStemOffset } from '../../engines/layout';
import { calculateStemGeometry } from '../../engines/layout/stems';
import { needsAccidental } from '../../services/MusicService';
import { Note, renderFlags } from './Note';
import { ChordStem, ChordAccidental, NoteHitArea } from './ChordComponents';

// --- Helper Functions (Pure Logic) ---

/**
 * Determines accidental symbol to render for a given note.
 * @param {Object} note - The note object
 * @param {string} keySignature - The key signature of the measure
 * @returns {string|null} The accidental symbol (♯, ♭, ♮) or null if none needed
 */
const getAccidentalSymbol = (note, keySignature) => {
  const info = needsAccidental(note.pitch, keySignature);
  const show = info.show || note.accidental;
  const type = note.accidental || info.type;

  if (!show || !type) return null;
  
  const map = { sharp: '♯', flat: '♭', natural: '♮' };
  return map[type] || null;
};

// --- Main Component ---

/**
 * Renders a group of notes (chord) at a specific time.
 * Handles stemming, flags (if not beamed), and individual note rendering.
 * 
 * @param {Object} props
 * @param {Array} props.notes - Array of notes in the chord
 * @param {number} props.quant - Quant position of the chord
 * @param {string} props.duration - Duration type of the chord
 * @param {boolean} props.dotted - Whether the chord is dotted
 * @param {number} props.quantWidth - Width per quant (unused if x is provided)
 * @param {number} props.measureIndex - Index of the measure
 * @param {string} props.eventId - ID of the event
 * @param {Object} props.selection - Current selection state
 * @param {Function} props.onSelectNote - Callback to select a note
 * @param {boolean} props.isGhost - Whether this is a ghost/preview chord
 * @param {number} props.opacity - Opacity for ghost notes
 * @param {boolean} props.renderStem - Whether to render the stem
 * @param {Function|string} props.filterNote - Optional filter to render only specific notes
 * @param {number} props.x - Absolute X position
 * @param {Object} props.beamSpec - Beaming specification if part of a beam group
 * @param {Object} props.layout - Pre-calculated layout data for the chord
 * @param {string} props.clef - Clef for pitch calculation
 * @param {Function} props.onDragStart - Drag handler
 * @param {boolean} props.modifierHeld - Whether a modifier key is held
 * @param {string} props.activeDuration - Active duration for preview logic
 * @param {boolean} props.activeDotted - Active dotted state for preview logic
 * @param {Function} props.onNoteHover - Hover handler
 * @param {boolean} props.isDragging - Whether a drag is in progress
 * @param {number} props.baseY - Y-offset for the staff
 * @param {string} props.keySignature - Key signature
 */
const ChordGroup = ({
  notes,
  quant,
  duration,
  dotted,
  quantWidth,
  measureIndex,
  eventId,
  selection = {},
  onSelectNote, // Unused in original, kept for API compatibility
  isGhost = false,
  opacity = 1,
  renderStem = true,
  filterNote = null,
  x = 0,
  beamSpec = null,
  layout,
  clef = 'treble',
  onDragStart,
  modifierHeld = false,
  activeDuration = null,
  activeDotted = false,
  onNoteHover = null,
  isDragging = false,
  baseY = CONFIG.baseY,
  keySignature = 'C',
}) => {
  const { theme } = useTheme();
  const [hoveredNoteId, setHoveredNoteId] = useState(null);
  const { sortedNotes, direction, noteOffsets, maxNoteShift, minY, maxY } = layout;

  // 1. Derived State & Calculations
  const effectiveDirection = beamSpec?.direction || direction;
  
  // X Position Calculation
  const noteX = useMemo(() => 
    x > 0 ? x : (quant * quantWidth) + CONFIG.measurePaddingLeft, 
  [x, quant, quantWidth]);

  const stemX = useMemo(() => 
    noteX + getStemOffset(layout, effectiveDirection), 
  [noteX, layout, effectiveDirection]);

  const { startY: stemStartY, endY: stemEndY } = useMemo(() => 
    calculateStemGeometry({ beamSpec, stemX, direction: effectiveDirection, minY, maxY, duration }),
  [beamSpec, stemX, effectiveDirection, minY, maxY, duration]);

  // Selection Logic
  const isEventSelected = !isGhost && selection.measureIndex === measureIndex && selection.eventId === eventId;
  const isWholeChordSelected = isEventSelected && !selection.noteId;
  const groupColor = isGhost ? theme.accent : (isWholeChordSelected ? theme.accent : theme.score.note);

  // Filter Logic
  const notesToRender = useMemo(() => {
    if (!filterNote) return sortedNotes;
    return typeof filterNote === 'function' 
      ? sortedNotes.filter(filterNote) 
      : sortedNotes.filter(n => n.pitch === filterNote);
  }, [sortedNotes, filterNote]);

  // 2. Event Handlers
  const handleMouseEnter = useCallback((id) => {
    if (isGhost) return;
    setHoveredNoteId(id);
    onNoteHover?.(true);
  }, [isGhost, onNoteHover]);

  const handleMouseLeave = useCallback(() => {
    setHoveredNoteId(null);
    onNoteHover?.(false);
  }, [onNoteHover]);

  const handleNoteMouseDown = useCallback((e, note) => {
    if (isGhost || !onDragStart) return;
    e.stopPropagation();
    const isModifier = e.metaKey || e.ctrlKey;
    onDragStart(measureIndex, eventId, note.id, note.pitch, e.clientY, isModifier);
  }, [isGhost, onDragStart, measureIndex, eventId]);

  // 3. Render
  const shouldRenderFlags = renderStem && !beamSpec && ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'].includes(duration);
  const hasStem = renderStem && NOTE_TYPES[duration]?.stem;

  return (
    <g className={`chord-group ${isGhost ? 'ghost' : ''}`} opacity={opacity}>
      
      {/* Stem */}
      {hasStem && (
        <ChordStem x={stemX} startY={stemStartY} endY={stemEndY} color={groupColor} />
      )}

      {/* Flags */}
      {shouldRenderFlags && (
        <g>{renderFlags(stemX, stemEndY, duration, effectiveDirection, groupColor)}</g>
      )}

      {/* Individual Notes */}
      {notesToRender.map((note, idx) => {
        const xShift = noteOffsets[note.id] || 0;
        const noteY = baseY + getOffsetForPitch(note.pitch, clef);
        const accidentalSymbol = getAccidentalSymbol(note, keySignature);
        const isHovered = !isGhost && !isDragging && hoveredNoteId === note.id;
        const noteSelected = isEventSelected && (selection.noteId === note.id || !selection.noteId);
        
        // Ghost Preview Logic
        const showPreview = isHovered && activeDuration;

        return (
          <g
            key={note.id || `note-${idx}`}
            className={!isGhost ? "note-group-container" : ""}
            onMouseEnter={() => handleMouseEnter(note.id)}
            onMouseLeave={handleMouseLeave}
          >
            <ChordAccidental 
              x={noteX + xShift - 16}
              y={noteY + 6}
              symbol={accidentalSymbol}
              color={groupColor}
            />

            <g style={{ pointerEvents: 'none' }}>
              <Note 
                quant={quant} 
                pitch={note.pitch} 
                type={duration} 
                dotted={dotted}
                isSelected={noteSelected} 
                quantWidth={quantWidth}
                renderStem={false} 
                xOffset={xShift}
                dotShift={maxNoteShift}
                isGhost={isGhost}
                x={noteX}
                clef={clef}
                baseY={baseY}
              />
            </g>

            {/* Note Duration Preview (Ghost on Hover) */}
            {showPreview && (
              <g style={{ pointerEvents: 'none' }}>
                <Note 
                  quant={quant} 
                  pitch={note.pitch} 
                  type={activeDuration} 
                  dotted={activeDotted}
                  isSelected={false} 
                  quantWidth={quantWidth}
                  renderStem={true} 
                  xOffset={xShift}
                  dotShift={maxNoteShift}
                  isGhost={true}
                  x={noteX}
                  clef={clef}
                  baseY={baseY}
                />
              </g>
            )}

            {/* Hit Area - Must be LAST to sit on top of everything */}
            <NoteHitArea 
              x={noteX + xShift - 10}
              y={noteY - 8}
              cursor={!isGhost ? (modifierHeld ? 'pointer' : 'crosshair') : 'default'}
              onClick={(e) => !isGhost && e.stopPropagation()}
              onMouseDown={(e) => handleNoteMouseDown(e, note)}
            />
          </g>
        );
      })}
    </g>
  );
};
export default ChordGroup;
