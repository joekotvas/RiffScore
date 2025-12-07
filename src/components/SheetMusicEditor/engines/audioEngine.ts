// @ts-nocheck
import { NOTE_TYPES, KEY_SIGNATURES, TIME_SIGNATURES } from '../constants';
import { getNoteDuration } from '../utils/core';
import { getActiveStaff } from '../types';

/**
 * Gets the effective accidental for a note based on key signature.
 * If the note has an explicit accidental ('natural' cancels key sig), use that.
 * Otherwise, apply the key signature.
 * @param pitch - Note pitch (e.g., 'F4')
 * @param noteAccidental - Explicit accidental on the note
 * @param keySignature - Current key signature (e.g., 'G' for G major)
 * @returns The effective accidental for playback
 */
export const getEffectiveAccidental = (pitch: string, noteAccidental: string | null, keySignature: string): string | null => {
    // If note has explicit accidental, use it
    if (noteAccidental) {
        // 'natural' cancels key signature
        if (noteAccidental === 'natural') return null;
        return noteAccidental;
    }
    
    // Apply key signature
    const keySig = KEY_SIGNATURES[keySignature];
    if (!keySig) return null;
    
    // Extract note letter from pitch (e.g., 'F' from 'F4')
    const noteLetter = pitch.charAt(0);
    
    // Check if this note letter is affected by the key signature
    if (keySig.accidentals.includes(noteLetter)) {
        return keySig.type; // 'sharp' or 'flat'
    }
    
    return null;
};

// Pitch frequencies in Hz (all pitches from E1 to G6)
const PITCH_FREQUENCIES: Record<string, number> = {
  // Bass clef range (E1 to B4)
  'E1': 41.20, 'F1': 43.65, 'G1': 49.00, 'A1': 55.00, 'B1': 61.74,
  'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
  // Overlapping and treble range (C3 to G6)
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
  'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
  'C6': 1046.50, 'D6': 1174.66, 'E6': 1318.51, 'F6': 1396.91, 'G6': 1567.98
};

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
 * Calculates frequency for a pitch with optional accidental.
 */
const getFrequency = (pitch: string, accidental?: string | null) => {
    const baseFreq = PITCH_FREQUENCIES[pitch];
    if (!baseFreq) return 0;

    if (accidental === 'sharp') {
        return baseFreq * Math.pow(2, 1/12);
    } else if (accidental === 'flat') {
        return baseFreq / Math.pow(2, 1/12);
    }
    return baseFreq;
};

/**
 * Schedules a note to be played at a specific time.
 * @param ctx - The AudioContext
 * @param destination - The destination node (e.g., masterGain or ctx.destination)
 * @param pitch - The pitch to play
 * @param durationType - Duration type
 * @param dotted - Whether the note is dotted
 * @param startTime - Time to start playing
 * @param bpm - Beats per minute (default 120)
 * @param accidental - Accidental ('sharp', 'flat', 'natural', or null)
 * @returns The duration of the note in seconds
 */
export const scheduleNote = (ctx, destination, pitch, durationType, dotted, startTime, bpm = 120, accidental = null) => {
    const freq = getFrequency(pitch, accidental);
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
 * @param accidental - Accidental ('sharp', 'flat', 'natural', or null)
 * @param keySignature - Key signature to apply (e.g., 'G')
 */
export const playTone = (pitch: string, durationType = 'quarter', dotted = false, accidental: 'flat' | 'natural' | 'sharp' | null = null, keySignature: string = 'C') => {
    if (typeof window === 'undefined') return;
    
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContext();
    
    const effectiveAccidental = getEffectiveAccidental(pitch, accidental, keySignature);
    
    scheduleNote(ctx, ctx.destination, pitch, durationType, dotted, ctx.currentTime, 120, effectiveAccidental);
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
