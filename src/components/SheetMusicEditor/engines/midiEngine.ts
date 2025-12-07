// @ts-nocheck
/**
 * MIDI utility module for connecting to MIDI devices and handling note input.
 * Uses the Web MIDI API.
 */

// MIDI note number to pitch name mapping
const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Converts a MIDI note number to a pitch string (e.g., 60 -> "C4")
 * @param midiNote - MIDI note number (0-127)
 * @returns Pitch string like "C4", "F#5", etc.
 */
export const midiNoteToPitch = (midiNote: number): string => {
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    const noteName = MIDI_NOTE_NAMES[noteIndex];
    
    // Convert sharps to natural + accidental info
    // For now, return as natural notes (sharps will be handled separately)
    if (noteName.includes('#')) {
        // Return the natural note name, accidental handled separately
        return `${noteName.replace('#', '')}${octave}`;
    }
    return `${noteName}${octave}`;
};

/**
 * Checks if a MIDI note is a sharp/black key
 */
export const isMidiNoteSharp = (midiNote: number): boolean => {
    const noteIndex = midiNote % 12;
    return [1, 3, 6, 8, 10].includes(noteIndex); // C#, D#, F#, G#, A#
};

/**
 * Gets the accidental for a MIDI note
 */
export const getMidiNoteAccidental = (midiNote: number): string | null => {
    return isMidiNoteSharp(midiNote) ? 'sharp' : null;
};

/**
 * Request MIDI access and return available input devices
 */
export const requestMIDIAccess = async (): Promise<{
    inputs: MIDIInput[];
    access: MIDIAccess | null;
    error: string | null;
}> => {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
        return { inputs: [], access: null, error: 'Web MIDI API not supported in this browser' };
    }

    try {
        const access = await navigator.requestMIDIAccess();
        const inputs = Array.from(access.inputs.values());
        return { inputs, access, error: null };
    } catch (err) {
        return { inputs: [], access: null, error: `MIDI access denied: ${err.message}` };
    }
};

/**
 * Sets up MIDI input listeners
 * @param access - MIDIAccess object
 * @param onNoteOn - Callback for note-on events (midiNote, velocity)
 * @param onNoteOff - Callback for note-off events (midiNote)
 * @returns Cleanup function to remove listeners
 */
export const setupMIDIListeners = (
    access: MIDIAccess,
    onNoteOn: (midiNote: number, velocity: number) => void,
    onNoteOff?: (midiNote: number) => void
): (() => void) => {
    const handleMessage = (event: MIDIMessageEvent) => {
        const [status, note, velocity] = event.data;
        
        // Note On: 0x90-0x9F (channel 1-16)
        if ((status & 0xF0) === 0x90 && velocity > 0) {
            onNoteOn(note, velocity);
        }
        // Note Off: 0x80-0x8F or Note On with velocity 0
        else if ((status & 0xF0) === 0x80 || ((status & 0xF0) === 0x90 && velocity === 0)) {
            if (onNoteOff) onNoteOff(note);
        }
    };

    // Add listener to all inputs
    access.inputs.forEach(input => {
        input.onmidimessage = handleMessage;
    });

    // Handle device connection/disconnection
    access.onstatechange = (event) => {
        const port = event.port;
        if (port.type === 'input') {
            if (port.state === 'connected') {
                port.onmidimessage = handleMessage;
            }
        }
    };

    // Return cleanup function
    return () => {
        access.inputs.forEach(input => {
            input.onmidimessage = null;
        });
        access.onstatechange = null;
    };
};

// Type declarations for Web MIDI API
declare global {
    interface Navigator {
        requestMIDIAccess(): Promise<MIDIAccess>;
    }
    
    interface MIDIAccess {
        inputs: Map<string, MIDIInput>;
        outputs: Map<string, MIDIOutput>;
        onstatechange: ((event: MIDIConnectionEvent) => void) | null;
    }
    
    interface MIDIInput {
        id: string;
        name: string;
        manufacturer: string;
        state: string;
        type: string;
        onmidimessage: ((event: MIDIMessageEvent) => void) | null;
    }
    
    interface MIDIOutput {
        id: string;
        name: string;
    }
    
    interface MIDIMessageEvent {
        data: Uint8Array;
    }
    
    interface MIDIConnectionEvent {
        port: MIDIInput | MIDIOutput;
    }
}
