// @ts-nocheck
import { NOTE_TYPES, TIME_SIGNATURES } from '../constants';
import { getNoteDuration } from '../utils/core';
import { getActiveStaff } from '../types';
import { getFrequency } from '../services/MusicService';

// --- AUDIO CONTEXT MANAGEMENT ---

/**
 * Initializes or resumes the AudioContext.
 * @param audioCtxRef - Ref to store the AudioContext (optional, can manage internally if needed)
 * @returns The active AudioContext or null
 */
export const initAudio = (audioCtxRef?: any) => {
    if (typeof window === 'undefined') return null;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    
    if (audioCtxRef) {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    } else {
        // Temporary context
        return new AudioContext();
    }
};

// --- LOW LEVEL PLAYBACK ---

/**
 * Schedules a note to be played at a specific time.
 * @param ctx - The AudioContext
 * @param destination - The destination node (e.g., masterGain or ctx.destination)
 * @param pitch - The pitch to play
 * @param durationType - Duration type
 * @param dotted - Whether the note is dotted
 * @param startTime - Time to start playing
 * @param bpm - Beats per minute (default 120)
 * @param accidental - DEPRECATED: Ignored in favor of absolute pitch
 * @returns The duration of the note in seconds
 */
export const scheduleNote = (ctx, destination, pitch, durationType, dotted, startTime, bpm = 120, accidental = null) => {
    // Use MusicService to get frequency from absolute pitch
    const freq = getFrequency(pitch);
    if (!freq) return 0;

    // Calculate duration in seconds
    // Quarter note = 60/bpm seconds
    const secondsPerBeat = 60 / bpm;
    // Assuming durationType maps to quants
    const quants = getNoteDuration(durationType, dotted, undefined);
    const durationSeconds = (quants / 16) * secondsPerBeat;

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'triangle';
    oscillator.frequency.value = freq;

    oscillator.connect(gainNode);
    gainNode.connect(destination);

    oscillator.start(startTime);
    
    // Envelope
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + durationSeconds);

    oscillator.stop(startTime + durationSeconds + 0.1);
    
    return durationSeconds;
};

/**
 * Plays a simple tone for a given pitch and duration immediately.
 * Uses a temporary AudioContext for simplicity in this stateless utility.
 * @param pitch - The pitch to play (e.g., 'C4')
 * @param durationType - The duration type (e.g., 'quarter')
 * @param dotted - Whether the note is dotted
 * @param accidental - DEPRECATED: Ignored
 * @param keySignature - DEPRECATED: Ignored
 */
export const playTone = (pitch: string, durationType = 'quarter', dotted = false, accidental: 'flat' | 'natural' | 'sharp' | null = null, keySignature: string = 'C') => {
    if (typeof window === 'undefined') return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    
    scheduleNote(ctx, ctx.destination, pitch, durationType, dotted, ctx.currentTime, 120, null);
};

// --- SCORE PLAYBACK ENGINE ---

/**
 * Helper to calculate the start time of a specific measure in seconds
 * Used for synchronizing multiple staves
 */
const calculateMeasureStartTime = (score: any, targetMeasureIndex: number, secondsPerBeat: number): number => {
    const timeSig = score.timeSignature || '4/4';
    let totalTime = 0;
    
    // Use first staff's measures for timing calculation
    const measures = score.staves?.[0]?.measures || [];
    for (let i = 0; i < targetMeasureIndex && i < measures.length; i++) {
        const measure = measures[i];
        let measureQuants;
        if (measure.isPickup) {
            measureQuants = measure.events.reduce((acc, e) => acc + getNoteDuration(e.duration, e.dotted, e.tuplet), 0);
        } else {
            measureQuants = TIME_SIGNATURES[timeSig as keyof typeof TIME_SIGNATURES] || 64;
        }
        totalTime += (measureQuants / 16) * secondsPerBeat;
    }
    
    return totalTime;
};

/**
 * Schedules the entire score for playback.
 * @param ctx - AudioContext
 * @param score - The score object
 * @param bpm - Beats per minute
 * @param startMeasureIndex - Measure to start from
 * @param startEventIndex - Event to start from
 * @param onComplete - Callback when playback finishes
 * @param onPositionUpdate - Callback for position updates: (measureIndex, eventIndex) => void
 * @returns Function to stop playback
 */
export const scheduleScorePlayback = (ctx, score, bpm, startMeasureIndex = 0, startEventIndex = 0, onComplete, onPositionUpdate) => {
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.value = 0.5;

    const now = ctx.currentTime;
    const secondsPerBeat = 60 / bpm;
    // Assuming 4/4 for tempo calculation base (quarter note beat)
    // Actually, secondsPerBeat is for a quarter note usually.
    // Quants per beat = 16 (quarter note)
    const secondsPerQuant = secondsPerBeat / 16; 
    
    // We need to handle variable measure lengths due to time signatures.
    // But for scheduling, we just need to know the duration of each measure in seconds.
    // Measure duration = (measureQuants / 16) * secondsPerBeat
    
    let startTimeOffset = 0;
    // Calculate offset for start measure
    for (let i = 0; i < startMeasureIndex; i++) {
        const timeSig = score.timeSignature || '4/4';
        const quants = TIME_SIGNATURES[timeSig as keyof typeof TIME_SIGNATURES] || 64;
        startTimeOffset += (quants / 16) * secondsPerBeat;
    }

    let totalDuration = 0;
    let currentGlobalTime = 0; // Time from start of score (0:0:0)

    const skippedNotes = new Set(); // IDs of notes to skip (targets of ties)
    const positionUpdates = []; // Array of {time, measureIndex, eventIndex}

    // Iterate over ALL staves for synchronized Grand Staff playback
    const allStaves = score.staves || [getActiveStaff(score)];
    
    allStaves.forEach((staff, staffIndex) => {
        staff.measures.forEach((measure, mIndex) => {
        // Calculate measure duration
        const timeSig = score.timeSignature || '4/4';
        
        let measureQuants;
        if (measure.isPickup) {
             // For pickup measures, duration is determined by content
             measureQuants = measure.events.reduce((acc, e) => acc + getNoteDuration(e.duration, e.dotted, e.tuplet), 0);
        } else {
             measureQuants = TIME_SIGNATURES[timeSig as keyof typeof TIME_SIGNATURES] || 64;
        }

        const measureDurationSeconds = (measureQuants / 16) * secondsPerBeat;

        if (mIndex < startMeasureIndex) {
            // Only track time once (from first staff) to avoid duplicating
            if (staffIndex === 0) {
                currentGlobalTime += measureDurationSeconds;
            }
            return;
        }

        // Use consistent timing from first staff iteration
        const measureStartTime = now + (staffIndex === 0 ? currentGlobalTime : 0) - startTimeOffset;
        // For non-first staves, we need to calculate their measure start time independently
        const actualMeasureStartTime = staffIndex === 0 ? measureStartTime : 
            now + calculateMeasureStartTime(score, mIndex, secondsPerBeat) - startTimeOffset;

        let currentMeasureQuant = 0;

        measure.events.forEach((event, eIndex) => {
            const eventDur = getNoteDuration(event.duration, event.dotted, event.tuplet);
            
            // Skip events before startEventIndex in the start measure
            if (mIndex === startMeasureIndex && eIndex < startEventIndex) {
                 currentMeasureQuant += eventDur;
                 return;
            }

            const noteStartTime = actualMeasureStartTime + (currentMeasureQuant * secondsPerQuant);
            const eventDurationSeconds = eventDur * secondsPerQuant;

            // Record position update timing (only from first staff to avoid duplicates)
            if (staffIndex === 0 && onPositionUpdate && noteStartTime >= now - 0.1) {
                positionUpdates.push({
                    time: noteStartTime - now,
                    measureIndex: mIndex,
                    eventIndex: eIndex,
                    duration: eventDurationSeconds
                });
            }

            // Only schedule if in future (or very close to now)
            if (noteStartTime >= now - 0.1) {
                event.notes.forEach(note => {
                   if (skippedNotes.has(note.id)) return;

                   // Calculate Total Duration including Ties
                   let totalQuants = eventDur;
                   let currentNote = note;
                   let currentMIndex = mIndex;
                   let currentEIndex = eIndex;

                   // Look ahead for ties (Strict Next Note Logic)
                   while (currentNote.tied) {
                       let foundNext = false;
                       let searchMIndex = currentMIndex;
                       let searchEIndex = currentEIndex + 1;
                       
                       // Check overflow to next measure
                       if (searchEIndex >= staff.measures[searchMIndex].events.length) {
                           searchMIndex++;
                           searchEIndex = 0;
                       }

                       // Valid next event exists?
                       if (searchMIndex < staff.measures.length && searchEIndex < staff.measures[searchMIndex].events.length) {
                           const nextEvent = staff.measures[searchMIndex].events[searchEIndex];
                           const nextNote = nextEvent.notes.find(n => n.pitch === currentNote.pitch);
                           
                           if (nextNote) {
                               // Found matching pitch in strictly next event
                               totalQuants += getNoteDuration(nextEvent.duration, nextEvent.dotted, nextEvent.tuplet);
                               skippedNotes.add(nextNote.id);
                               currentNote = nextNote;
                               currentMIndex = searchMIndex;
                               currentEIndex = searchEIndex;
                               foundNext = true;
                           }
                       }
                       
                       if (!foundNext) break;
                   }

                   // Convert totalQuants to seconds
                   const durationSeconds = (totalQuants / 16) * secondsPerBeat;

                   // Schedule the sound
                   // Apply key signature - get effective accidental
                   const keySignature = staff.keySignature || 'C';
                   const effectiveAccidental = getEffectiveAccidental(note.pitch, note.accidental, keySignature);
                   const freq = getFrequency(note.pitch, effectiveAccidental);
                   if (freq) {
                       const oscillator = ctx.createOscillator();
                       const gainNode = ctx.createGain();
                       oscillator.type = 'triangle';
                       oscillator.frequency.value = freq;
                       oscillator.connect(gainNode);
                       gainNode.connect(masterGain);
                       
                       oscillator.start(noteStartTime);
                       gainNode.gain.setValueAtTime(0, noteStartTime);
                       gainNode.gain.linearRampToValueAtTime(0.3, noteStartTime + 0.05);
                       gainNode.gain.exponentialRampToValueAtTime(0.001, noteStartTime + durationSeconds);
                       oscillator.stop(noteStartTime + durationSeconds + 0.1);
                       
                       const endTime = noteStartTime + durationSeconds - now;
                       if (endTime > totalDuration) totalDuration = endTime;
                   }
                });
            }
            
            currentMeasureQuant += eventDur;
        });
        
        // Only update global time from first staff
        if (staffIndex === 0) {
            currentGlobalTime += measureDurationSeconds;
        }
        });
    });

    // Schedule position updates
    // The cursor should be AT the current position when audio plays, then transition to next
    const positionTimeouts = [];
    if (onPositionUpdate && positionUpdates.length > 0) {
        // First event: immediately show cursor at first position (no transition)
        const first = positionUpdates[0];
        const firstTimeoutId = setTimeout(() => {
            onPositionUpdate(first.measureIndex, first.eventIndex, 0); // 0 duration = instant
        }, Math.max(0, first.time * 1000));
        positionTimeouts.push(firstTimeoutId);

        // Subsequent events: when event N plays, start transitioning TO event N
        // (cursor should already be at N-1 from previous transition)
        for (let i = 1; i < positionUpdates.length; i++) {
            const prev = positionUpdates[i - 1];
            const curr = positionUpdates[i];
            
            // Schedule transition to curr position, triggered when prev event plays
            // Duration is prev event's duration (time to travel from prev to curr)
            const timeoutId = setTimeout(() => {
                onPositionUpdate(curr.measureIndex, curr.eventIndex, prev.duration);
            }, Math.max(0, prev.time * 1000 + 10)); // +10ms to ensure instant update fires first
            positionTimeouts.push(timeoutId);
        }
    }

    // Set timeout for completion
    const timeoutId = setTimeout(() => {
        if (onPositionUpdate) onPositionUpdate(null, null, 0); // Clear position
        if (onComplete) onComplete();
    }, totalDuration * 1000 + 200);

    // Return stop function
    return () => {
        clearTimeout(timeoutId);
        positionTimeouts.forEach(id => clearTimeout(id));
        if (onPositionUpdate) onPositionUpdate(null, null, 0); // Clear position
        masterGain.disconnect();
        // We don't close the context here as it might be reused, 
        // but we could suspend it if we wanted to save resources.
        // For now, just stopping the scheduling is enough (nodes are scheduled, 
        // but we can't easily cancel scheduled nodes without closing context or disconnecting master).\n        // Disconnecting masterGain silences everything.
    };
};
