// @ts-nocheck
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CONFIG } from '../../config';
import { NOTE_TYPES } from '../../constants';
import { useTheme } from '../../context/ThemeContext';
import { calculateMeasureLayout, getOffsetForPitch, calculateChordLayout, calculateBeamingGroups } from '../../engines/layout';
import { calculateTupletBrackets } from '../../engines/layout/tuplets'; // Restore tuplets import
import { getNoteDuration } from '../../utils/core';
import ChordGroup from './ChordGroup';
import { Rest } from './Rest';
import Beam from './Beam';
import TupletBracket from './TupletBracket';
import { MeasureProps } from '../../componentTypes';

/**
 * Renders a single measure of the score.
 * Handles hit detection, event rendering, beaming, and ghost note preview.
 * 
 * New Architecture: Uses grouped props (layout, interaction) for cleaner data flow.
 */
const Measure: React.FC<MeasureProps> = ({ 
  measureData, 
  measureIndex, 
  startX, 
  isLast, 
  forcedWidth, 
  forcedEventPositions, 
  layout, 
  interaction 
}) => {
  const { theme } = useTheme();
  
  // Destructure for easier access
  const { events, id } = measureData;
  const { scale, baseY, clef, keySignature, verticalOffset, staffIndex } = layout;
  const { 
    selection, 
    previewNote, 
    activeDuration, 
    isDotted, 
    modifierHeld, 
    isDragging,
    onAddNote,
    onSelectNote,
    onDragStart,
    onHover 
  } = interaction;

  const [hoveredMeasure, setHoveredMeasure] = useState(false);
  const [hoveredPitch, setHoveredPitch] = useState<string | null>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);
  const [isNoteHovered, setIsNoteHovered] = useState(false);

  // --- Layout Calculation ---
  const measureLayout = useMemo(() => {
    return calculateMeasureLayout(events, undefined, clef, measureData.isPickup, forcedEventPositions);
  }, [events, clef, measureData.isPickup, forcedEventPositions]);

  const { hitZones, eventPositions, totalWidth, processedEvents } = measureLayout;

  // Calculate Beams separately (not part of core layout engine yet)
  const beamGroups = useMemo(() => {
      // Need to import calculateBeamingGroups!
      // We will assume it is available in imports, or update imports below.
      return calculateBeamingGroups(events, eventPositions, clef);
  }, [events, eventPositions, clef]);

  // Calculate Tuplets
  const tupletGroups = useMemo(() => {
      return calculateTupletBrackets(processedEvents, eventPositions, clef); 
  }, [processedEvents, eventPositions, clef]);

  // Use forced width if provided (Grand Staff sync), otherwise calculated width
  const effectiveWidth = forcedWidth || totalWidth;

  // --- Event Handlers ---

  const handleMeasureMouseMove = (e: React.MouseEvent) => {
    if (isNoteHovered) {
        setHoveredPitch(null);
        setCursorX(null);
        onHover?.(null, null, null); 
        return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    
    // Find closest hit zone
    const hit = hitZones.find(zone => x >= zone.x && x < zone.x + zone.width);
    
    setHoveredMeasure(true);
    setCursorX(hit ? hit.x : x);
    
    if (hit) {
         // Pass raw event, parent calculates pitch from clientY
         onHover?.(measureIndex, hit, null); 
    } else {
        // Pass "gap" hit
         onHover?.(measureIndex, { x: x, quant: 0, duration: activeDuration }, null);
    }
  };

  const handleMeasureMouseLeave = () => {
    setHoveredMeasure(false);
    setHoveredPitch(null);
    setCursorX(null);
    onHover?.(null, null, null);
  };

  const handleMeasureClick = (e: React.MouseEvent) => {
    if (isNoteHovered) return;
    e.stopPropagation();

    if (hoveredMeasure && onAddNote) {
       // We'll trust the parent's `previewNote` state which serves as the "buffer" for the new note
       // If previewNote exists and is on this measure, commit it.
       if (previewNote && previewNote.measureIndex === measureIndex) {
           onAddNote(measureIndex, previewNote, true);
       }
    }
  };
  
  // PREVIEW LOGIC
  const previewRender = useMemo(() => {
    if (!previewNote) return null;
    
    // Allow rendering if it's for this measure OR if it's for the next measure (overflow) and we are the last measure
    const isOverflowPreview = isLast && previewNote.measureIndex === measureIndex + 1;
    if (previewNote.measureIndex !== measureIndex && !isOverflowPreview) {
        return null;
    }
    
    const visualTempNote = { 
        ...previewNote, 
        quant: 0, // Not used for positioning anymore
        id: 'preview' 
    };

    let combinedNotes = [visualTempNote];
    let xPos = 0;
    
    if (isOverflowPreview) {
         const lastInsertZone = hitZones.find(z => z.type === 'INSERT' && z.index === events.length);
         if (lastInsertZone) {
             xPos = lastInsertZone.startX + (lastInsertZone.endX - lastInsertZone.startX) / 2;
         } else {
             xPos = totalWidth - CONFIG.measurePaddingRight;
         }
    } else if (previewNote.mode === 'CHORD') {
        const existingEvent = events[previewNote.index];
        if(existingEvent) {
             xPos = eventPositions[existingEvent.id];
             combinedNotes = [...existingEvent.notes, visualTempNote];
        }
    } else if (previewNote.mode === 'INSERT') {
        const insertZone = hitZones.find(z => z.type === 'INSERT' && z.index === previewNote.index);
        if (insertZone) {
            xPos = insertZone.startX + (insertZone.endX - insertZone.startX) / 2;
        } else {
            if (previewNote.index < events.length) {
                 xPos = eventPositions[events[previewNote.index].id] - 20;
            } else {
                 xPos = totalWidth - CONFIG.measurePaddingRight;
            }
        }
    } else {
        // APPEND
        const appendZone = hitZones.find(z => z.type === 'APPEND');
        xPos = appendZone ? appendZone.startX : 0;
    }
    
    const chordLayout = calculateChordLayout(combinedNotes, clef);

    return {
        chordNotes: combinedNotes,
        quant: 0,
        x: xPos,
        chordLayout
    };

  }, [previewNote, events, measureIndex, layout, hitZones, eventPositions, totalWidth, clef, isLast]);

  // Map renderable events
  const beamMap = {};
  beamGroups.forEach(group => {
      group.ids.forEach(id => {
          beamMap[id] = group;
      });
  });
  
  const renderableEvents = processedEvents.map(ev => ({
      ...ev,
      beamSpec: beamMap[ev.id]
  }));

  // Render Bar Lines
  const renderBarLine = () => {
      const x = effectiveWidth; 
      return (
          <line 
            x1={x} y1={baseY} 
            x2={x} y2={baseY + CONFIG.lineHeight * 4} 
            stroke={theme.score.staffLine} 
            strokeWidth={isLast ? 3 : 1} 
          />
      );
  };

  return (
    <g transform={`translate(${startX}, 0)`}>
      
      {/* RENDER EVENTS */}
      {renderableEvents.map((event, idx) => {
        if (event.isRest) {
            return (
                <Rest
                   key={event.id}
                   duration={event.duration}
                   dotted={event.dotted}
                   x={event.x}
                   quant={event.quant}
                   quantWidth={0}
                   baseY={baseY}
                />
            );
        }

        return (
            <ChordGroup
              key={event.id}
              notes={event.notes}
              quant={event.quant}
              duration={event.duration}
              dotted={event.dotted}
              quantWidth={0} 
              measureIndex={measureIndex}
              eventId={event.id}
              selection={selection}
              onSelectNote={onSelectNote}
              x={event.x}
              beamSpec={beamMap[event.id]}
              layout={event.chordLayout}
              clef={clef}
              onDragStart={onDragStart}
              modifierHeld={modifierHeld}
              activeDuration={activeDuration}
              activeDotted={isDotted}
              onNoteHover={(isHovering) => setIsNoteHovered(isHovering)}
              isDragging={isDragging}
              baseY={baseY}
              keySignature={keySignature}
            />
        );
      })}

      {/* RENDER BEAMS */}
      {beamGroups.map((beam, idx) => (
          <Beam 
            key={`beam-${idx}`}
            beam={beam}
            color={theme.score.note}
          />
      ))}
      
      {/* RENDER TUPLETS */}
      {tupletGroups.map((tuplet, idx) => (
          <TupletBracket
            key={`tuplet-${idx}`}
            group={tuplet}
            baseY={baseY}
            staffHeight={CONFIG.lineHeight * 4}
            theme={theme}
          />
      ))}
      
      {/* Legacy Fallback for Tuplets if tupletGroups is empty but engine/tuplets is used? 
          No, calculateMeasureLayout returns tupletGroups now.
          The previous file import calculateTupletBrackets manually. 
          Let's stick to what layout returns. */}

      {/* Hit Area extended for Interaction */}
      <rect 
        x={0} 
        y={baseY - 50} 
        width={effectiveWidth} 
        height={CONFIG.lineHeight * 12} 
        fill="transparent" 
        style={{ cursor: 'crosshair' }} 
        onClick={handleMeasureClick}
        onMouseMove={handleMeasureMouseMove}
        onMouseLeave={handleMeasureMouseLeave}
      />
      
      {/* Bar Line */}
      {renderBarLine()}

      {/* PREVIEW GHOST */}
      {previewRender && !isNoteHovered && (
          <g style={{ pointerEvents: 'none' }}>
               {(() => {
                 const { chordNotes, quant, x } = previewRender;
                 const shouldDrawStem = NOTE_TYPES[previewNote.duration].stem && previewNote.mode !== 'CHORD';

                 return (
                    <ChordGroup
                        notes={chordNotes}
                        quant={quant}
                        duration={previewNote.duration}
                        dotted={previewNote.dotted}
                        quantWidth={0}
                        measureIndex={measureIndex}
                        eventId="preview"
                        isGhost={true}
                        opacity={0.5}
                        renderStem={shouldDrawStem}
                        filterNote={(note) => note.id === 'preview'}
                        x={x}
                        layout={previewRender.chordLayout}
                        clef={clef}
                        baseY={baseY}
                        keySignature={keySignature}
                    />
                 );
               })()}
          </g>
      )}
    </g>
  );
};

export default Measure;
