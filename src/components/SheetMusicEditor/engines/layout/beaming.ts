import { ScoreEvent, BeamGroup } from './types';
import { getNoteDuration } from '../../utils/core';
import { getOffsetForPitch, getNoteWidth, getPitchForOffset } from './positioning';
import { CONFIG } from '../../config';
import { MIDDLE_LINE_Y } from '../../constants';

// Removed temporary interfaces


/**
 * Groups events into beaming groups based on musical rules (beats, syncopation).
 * All calculations use CONFIG.baseY - staff positioning is handled by SVG transforms.
 * @param events - List of events in the measure
 * @param eventPositions - Map of event IDs to their x-positions
 * @param clef - The clef for pitch offset lookup
 * @returns Array of beam group specifications
 */
export const calculateBeamingGroups = (events: any[], eventPositions: Record<string, number>, clef: string = 'treble'): any[] => {
    const groups: any[] = [];
    let currentGroup: any[] = [];
    let currentType: string | null = null;
    
    // Helper to finalize a group
    const finalizeGroup = () => {
        if (currentGroup.length > 1) {
            groups.push(processBeamGroup(currentGroup, eventPositions, clef));
        }
        currentGroup = [];
        currentType = null;
    };

    let currentQuant = 0;

    events.forEach((event: any, index: number) => {
        const type = event.duration;
        const isFlagged = ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'].includes(type);
        const durationQuants = getNoteDuration(type, event.dotted, event.tuplet);
        
        // Break beam if:
        // 1. Not a flagged note
        // 2. Dotted note (simplify for now - standard beaming breaks on dots usually unless configured)
        // 3. Type changes (e.g. 8th to 16th - simple engines often break here, complex ones don't)
        // 4. Rest
        
        if (!isFlagged || event.dotted || event.isRest) {
            finalizeGroup();
            currentQuant += durationQuants;
            return;
        }

        if (currentType && currentType !== type) {
            finalizeGroup();
        }

        // Check beat boundaries (simple 4/4 assumption: beat every 1024 quants)
        // If currentQuant is a multiple of beat size, we might break?
        // Actually, we break if we CROSS a beat boundary.
        // But for Quarter beats (1024), we usually beam 8ths together within the beat.
        // We shouldn't beam across beat 2-3 in 4/4 usually.
        // Let's implement a simple rule: Break beam if on a beat boundary?
        // No, we start a new beam at the boundary.
        const BEAT_QUANTS = CONFIG.quantsPerMeasure / 4; // Assuming 4/4
        if (currentQuant % BEAT_QUANTS === 0 && currentGroup.length > 0) {
            finalizeGroup();
        }

        currentGroup.push(event);
        currentType = type;
        currentQuant += durationQuants;
    });

    finalizeGroup();
    return groups;
};

/**
 * Calculates the geometry for a single beam group.
 */
const processBeamGroup = (groupEvents: any[], eventPositions: Record<string, number>, clef: string): any => {
    // 1. Determine direction (majority rule or furthest directly)
    // 2. Calculate slope
    
    const startEvent = groupEvents[0];
    const endEvent = groupEvents[groupEvents.length - 1];
    
    const startX = eventPositions[startEvent.id] + 9; // Stem offset
    const endX = eventPositions[endEvent.id] + 9;
    
    // Calculate average pitch/y
    let sumY = 0;
    let maxDist = -1;
    let unifiedDirection = 'down'; // default
    
    groupEvents.forEach(e => {
        // Find stem tip for this chord
        // Simplified: use first note
         const note = e.notes[0];
         const y = CONFIG.baseY + getOffsetForPitch(note.pitch, clef);
         const dist = Math.abs(y - MIDDLE_LINE_Y);
         if (dist > maxDist) {
             maxDist = dist;
             unifiedDirection = y <= MIDDLE_LINE_Y ? 'down' : 'up';
         }
    });

    // Determine stems lengths
    // Stem length is usually 3.5 spaces (35px).
    const stemLength = 35;
    
    // Calculate Y positions for beam start/end
    // Simple flat beam for now, or match start/end notes?
    // Let's make it flat based on the note furthest from the beam?
    // Or just use the start note?
    
    // Ideally: Linear regression for slope, but let's stick to flat or simple slope.
    
    const startNoteY = CONFIG.baseY + getOffsetForPitch(startEvent.notes[0].pitch, clef);
    const endNoteY = CONFIG.baseY + getOffsetForPitch(endEvent.notes[0].pitch, clef);
    
    // Direction: up (stems up, beam on top), down (stems down, beam on bottom)
    const direction = unifiedDirection;
    
    let startY, endY;
    
    if (direction === 'up') {
        const beamY = Math.min(startNoteY, endNoteY) - stemLength; // Above highest note
        startY = beamY;
        endY = beamY;
    } else {
        const beamY = Math.max(startNoteY, endNoteY) + stemLength; // Below lowest note
        startY = beamY;
        endY = beamY;
    }

    return {
        ids: groupEvents.map(e => e.id),
        startX,
        endX,
        startY,
        endY,
        direction,
        type: startEvent.duration
    };
};
