// @ts-nocheck
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/**
 * Calculates a new pitch based on the current pitch and a direction.
 * Handles shift key for octave jumps.
 * Preserves existing accidental.
 * 
 * @param currentPitch - The current pitch (e.g., 'C4', 'F#4', 'Bb3')
 * @param direction - 'up' or 'down'
 * @param isShift - Whether shift key is pressed (for octave jump)
 * @param clef - Not used (legacy compat)
 * @returns The new pitch
 */
export const calculateNewPitch = (
    currentPitch: string, 
    direction: string, 
    isShift: boolean, 
    clef: string = 'treble'
): string => {
    // Extract accidental
    const match = currentPitch.match(/^([A-G])(#{1,2}|b{1,2})?(\d+)$/);
    if (!match) return currentPitch;

    const letter = match[1];
    const accidental = match[2] || '';
    const octave = parseInt(match[3], 10);
    
    let delta = direction === 'up' ? 1 : -1;
    if (isShift) delta *= 7;

    const currentIdx = LETTERS.indexOf(letter);
    let newIdx = currentIdx + delta;
    
    // Calculate octave shift
    const octaveShift = Math.floor(newIdx / 7);
    newIdx = ((newIdx % 7) + 7) % 7; // Handle negative wrap
    
    const newLetter = LETTERS[newIdx];
    const newOctave = octave + octaveShift;
    
    // Bounds check (roughly A0 to C8 standard piano)
    if (newOctave < 0 || newOctave > 8) return currentPitch;
    
    return `${newLetter}${accidental}${newOctave}`;
};

/**
 * Calculates a new pitch based on an offset in steps.
 * Handles accidentals by preserving them.
 * 
 * @param currentPitch - The starting pitch
 * @param offset - Number of steps (positive = up, negative = down)
 * @param clef - Not used
 * @returns The new pitch
 */
export const getPitchByOffset = (
    currentPitch: string, 
    offset: number, 
    clef: string = 'treble'
): string => {
    const match = currentPitch.match(/^([A-G])(#{1,2}|b{1,2})?(\d+)$/);
    if (!match) return currentPitch;

    const letter = match[1];
    const accidental = match[2] || '';
    const octave = parseInt(match[3], 10);
    
    const currentIdx = LETTERS.indexOf(letter);
    let newIdx = currentIdx + offset;
    
    const octaveShift = Math.floor(newIdx / 7);
    newIdx = ((newIdx % 7) + 7) % 7;
    
    const newLetter = LETTERS[newIdx];
    const newOctave = octave + octaveShift;
    
    if (newOctave < 0 || newOctave > 8) return currentPitch;
    
    return `${newLetter}${accidental}${newOctave}`;
};
