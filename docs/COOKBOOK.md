[← Back to README](../README.md)

# RiffScore Cookbook

> Task-oriented recipes for common use cases.

> **See also**: [API Reference](./API.md) • [Configuration](./CONFIGURATION.md) • [Coding Patterns](./CODING_PATTERNS.md)

---

## 1. Entry Recipes

### Write a C Major Scale

In 4/4 time, one measure holds 4 quarter notes. Use `.select()` to advance to the next measure when needed.

```javascript
const score = window.riffScore.active;

// Measure 1: C4-F4
score.select(1)
   .addNote('C4', 'quarter')
   .addNote('D4', 'quarter')
   .addNote('E4', 'quarter')
   .addNote('F4', 'quarter');

// Measure 2: G4-C5
score.select(2)
   .addNote('G4', 'quarter')
   .addNote('A4', 'quarter')
   .addNote('B4', 'quarter')
   .addNote('C5', 'quarter');
```

### Write a Scale Using Eighth Notes (Single Measure)

```javascript
const score = window.riffScore.active;

// All 8 notes fit in one 4/4 measure as eighths
score.select(1)
   .addNote('C4', 'eighth')
   .addNote('D4', 'eighth')
   .addNote('E4', 'eighth')
   .addNote('F4', 'eighth')
   .addNote('G4', 'eighth')
   .addNote('A4', 'eighth')
   .addNote('B4', 'eighth')
   .addNote('C5', 'eighth');
```

### Build a Chord Progression (I-IV-V-I)

```javascript
const score = window.riffScore.active;

// Measure 1: C major chord (half note)
score.select(1)
   .addNote('C4', 'half')
   .move('left')
   .addTone('E4')
   .addTone('G4')
   .move('right');

// Same measure: F major (cursor auto-advances after addNote)
score.addNote('F4', 'half')
   .move('left')
   .addTone('A4')
   .addTone('C5')
   .move('right');

// Measure 2: G major then C major
score.select(2)
   .addNote('G4', 'half')
   .move('left')
   .addTone('B4')
   .addTone('D5')
   .move('right');

score.addNote('C4', 'half')
   .move('left')
   .addTone('E4')
   .addTone('G4')
   .move('right');
```

### Enter Rests

```javascript
const score = window.riffScore.active;

score.select(1)
   .addNote('C4', 'quarter')
   .addRest('quarter')
   .addNote('E4', 'quarter')
   .addRest('quarter');
```

---

## 1a. Chord Symbol Recipes

### Add a Chord Progression

```javascript
const score = window.riffScore.active;

// I-IV-V-I in C major (one chord per measure in 4/4)
score.addChord(0, 'C')         // Beat 1 of measure 1 (quant 0)
     .addChord(96, 'F')        // Beat 1 of measure 2 (quant 96)
     .addChord(192, 'G7')      // Beat 1 of measure 3 (quant 192)
     .addChord(288, 'C');      // Beat 1 of measure 4 (quant 288)
```

### Navigate and Edit Chords

```javascript
const score = window.riffScore.active;

// Select and change the second chord
score.selectFirstChord()
     .selectNextChord()       // Now on the second chord
     .updateChord(score.getSelectedChord().id, 'Dm7');
```

### Change Chord Notation

```javascript
const score = window.riffScore.active;

// Display chords as Roman numerals
score.setChordNotation('roman');

// Display as Nashville numbers
score.setChordNotation('nashville');
```

---

## 2. Editing Recipes

### Transpose Selection Up an Octave

```javascript
const score = window.riffScore.active;

score.selectAll('measure')
   .transposeDiatonic(7);  // +7 steps = up one octave (diatonic)
```

### Change Duration of Selected Notes

```javascript
const score = window.riffScore.active;

// First add a note, then modify its duration
score.select(1).addNote('C4', 'quarter');

// Move back to the note and change duration
score.move('left').setDuration('eighth', true);  // true = dotted
```

### Convert Notes to Rests

```javascript
const score = window.riffScore.active;

score.selectAll('measure')
   .setInputMode('rest');  // Switch to rest entry mode
```

---

## 3. Observability & Batch Operations

### Monitor System Health

Listen to the `batch` event to track high-level modifying actions for analytics or debugging, decoupling logic from low-level state changes.

```javascript
const score = window.riffScore.active;

score.on('batch', (payload) => {
  console.log(`[${payload.timestamp}] Action: ${payload.label}`);
});
```

### Batch with Transaction (Single Undo Step)

```javascript
const score = window.riffScore.active;

score.select(1);
score.beginTransaction();

for (let i = 0; i < 16; i++) {
  score.addNote(`C${(i % 3) + 4}`, 'sixteenth');
}

score.commitTransaction('Add Scale Run');  // All 16 notes = 1 undo step
```

> **Note**: Without transactions, each `addNote` is a separate undo step. Transactions ensure atomicity for complex scripts.

### Fill Measure with Rest

```javascript
const score = window.riffScore.active;

score.select(3)  // Measure 3
   .addRest('whole');
```

---

## 4. Validation & Errors

### Safe Input Handling

The API validates inputs and returns a result object. You can check the operation status immediately or inspect persistent error flags.

```javascript
const score = window.riffScore.active;

// This will log an error and set hasError=true
score.addNote('InvalidPitch');

if (!score.ok) {
  console.error('Operation failed:', score.result.message);
  console.error('Error code:', score.result.code);
}

// Sticky error state allows checking after a chain
score.select(1).addNote('C4').move('left').addNote('InvalidPitch').move('right').addNote('E4');

if (score.hasError) {
  console.warn('One or more operations in the chain failed');
  score.clearStatus(); // Reset the error flag
}
```

### Batch Result Collection

Use `collect()` to capture results from multiple operations for validation or reporting.

```javascript
const score = window.riffScore.active;

const report = score.collect((api) => {
  api.select(1)
     .addNote('C4', 'quarter')
     .addNote('InvalidPitch') // Will result in error
     .addNote('E4', 'quarter');
});

console.log(`Batch processed with ${report.errors.length} errors.`);
if (!report.ok) {
  report.errors.forEach(err => console.error(err.message));
}
```

---

## 5. Integration Recipes

> [!NOTE]
> **Callback Timing:** Event callbacks fire after React processes state updates (via `useEffect`), not synchronously.
> This ensures callbacks receive guaranteed-fresh data. See [API.md > Events](./API.md#12-events--subscriptions) for details.

### Auto-Save to Backend

```javascript
const score = window.riffScore.active;

const unsub = score.on('score', (newScore) => {
  fetch('/api/scores', {
    method: 'POST',
    body: JSON.stringify(newScore)
  });
});
```

### Sync Selection with External UI

```javascript
const score = window.riffScore.active;

score.on('selection', (selection) => {
  if (selection.eventId) {
    highlightInExternalPiano(selection.noteId);
  }
});
```

### React to Batch Operations (Transactions)

```javascript
const score = window.riffScore.active;

score.on('batch', (payload) => {
  console.log(`Batch "${payload.label}" committed at ${payload.timestamp}`);
  console.log('Commands:', payload.commands.map(c => c.type).join(', '));
  // Use this to sync external state more efficiently than listening to every 'score' event
});
```

### Control Playback

```javascript
const score = window.riffScore.active;

// Playback API is integrated with Tone.js (lazy-loaded)
score.play();     // Start playback
score.pause();    // Pause (retains position)
score.stop();     // Stop and reset to beginning
score.rewind(2);  // Jump to measure 2
```

> **Note**: First playback may have a brief delay (~1-2s) while Tone.js loads. Subsequent playback is instant.

---

## 6. Export Recipes

### Save as JSON

```javascript
const score = window.riffScore.active;

const json = score.export('json');
localStorage.setItem('savedScore', json);
```

### Save as MusicXML

```javascript
const score = window.riffScore.active;

const xml = score.export('musicxml');
downloadFile('score.musicxml', xml, 'application/xml');
```

### Load Saved Score

```javascript
const score = window.riffScore.active;

const saved = localStorage.getItem('savedScore');
if (saved) {
  score.loadScore(JSON.parse(saved));
}
```

> **Note**: `loadScore` replaces the entire current composition.

---

## 7. Query Recipes

### Get Current Score State

```javascript
const score = window.riffScore.active;

const data = score.getScore();
console.log('Title:', data.title);
console.log('Measures:', data.staves[0].measures.length);
```

### Get Current Selection

```javascript
const score = window.riffScore.active;

const sel = score.getSelection();
console.log('Staff:', sel.staffIndex);
console.log('Event ID:', sel.eventId);
console.log('Selected notes:', sel.selectedNotes.length);
```

### Get Configuration

```javascript
const score = window.riffScore.active;

const config = score.getConfig();
console.log('BPM:', config.score?.bpm);
```

---

## 8. Multiple Instances

### Target Specific Editor

```javascript
// If you have <RiffScore id="left-hand" /> and <RiffScore id="right-hand" />
const leftScore = window.riffScore.get('left-hand');
const rightScore = window.riffScore.get('right-hand');

leftScore?.addNote('C3', 'quarter');
rightScore?.addNote('G4', 'quarter');
```

### Get Currently Active Editor

```javascript
const score = window.riffScore.active;  // Most recently focused/mounted

if (score) {
  score.addNote('C4', 'quarter');
}
```

---

[← Back to README](../README.md)
