# RiffScore

**RiffScore** is a self-hostable, embeddable sheet music editor designed to liberate your music from third-party walled gardens.

Unlike commercial platforms that require users to leave your site or pay subscription fees, RiffScore allows you to embed interactive, editable scores directly into your application. It focuses on delivering the most essential music notation features with a lightweight, independent engine.

## Documentation

### 📘 [Architecture Guide](./docs/ARCHITECTURE.md)
**For Developers:** Technical reference for the lightweight, embeddable engine.

### 🎨 [Interaction Design Guide](./docs/INTERACTION.md)
**For Designers:** Guide to the intuitive editing behavior.

---

## Features

*   **Self-Hostable**: No external dependencies or platform lock-in.
*   **Embeddable**: Drop it into any React application.
*   **SMuFL Compliance**: Beautiful engraving using the [Bravura](https://github.com/steinbergmedia/bravura) font.
*   **Interactive**: Full editing capabilities right in the browser.
*   **Audio Engine**: Playback via [Tone.js](https://tonejs.github.io/).

## Coming Soon

*   **Read-Only Mode**: Lightweight player for embedding static scores.
*   **Improved Toolbar**: More intuitive controls for common notation tasks.
*   **Imperative API**: Programmatically control the score (e.g., `score.addNote(...)`) for real-time app integration.
*   **Chord Symbols**: Input and playback for lead sheets.
*   **Export Options**: MusicXML and MIDI export.

## Quick Start

```tsx
import RiffScore from './ScoreEditor'; // Component name may vary in source
import { ScoreProvider } from './context/ScoreContext';

function App() {
  return (
    <ScoreProvider>
      <RiffScore />
    </ScoreProvider>
  );
}
```
