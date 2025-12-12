# PianoRiffs Sheet Music Editor

The **SheetMusicEditor** is a professional-grade, web-based music notation engine built with React and SVG. It is designed to provide a fluid, correct, and performant editing experience for musicians and engravers.

## Documentation

We maintain detailed documentation for both the technical architecture and the user interaction model.

### 📘 [Architecture Guide](./docs/ARCHITECTURE.md)
**For Developers:** A comprehensive technical reference covering the codebase structure, data models, rendering pipeline, and core systems.
*   **Core Systems**: Command pattern, Layout Engine, State Management.
*   **Data Model**: Theory-first approach using absolute pitch.
*   **Rendering**: SMuFL-compliant rendering with Bravura.

### 🎨 [Interaction Design Guide](./docs/INTERACTION.md)
**For Designers & Product:** The definitive guide to how the editor behaves, feels, and responds to user input.
*   **Philosophy**: Context-aware intent, flow, and forgiveness.
*   **Input Systems**: Detailed mouse and keyboard workflows.
*   **Rest Handling**: "Silence as a First-Class Citizen".

---

## Features

*   **SMuFL Compliance**: High-quality engraving using the [Bravura](https://github.com/steinbergmedia/bravura) font.
*   **Grand Staff Support**: Fully synchronized multi-staff editing.
*   **Polyphonic Input**: Robust support for chords and voices.
*   **Keyboard-First**: Optimized for rapid entry without leaving the keyboard.
*   **Theory Integration**: Powered by `tonal` for correct musical context.

## Quick Start

```tsx
import ScoreEditor from './ScoreEditor';
import { ScoreProvider } from './context/ScoreContext';

function App() {
  return (
    <ScoreProvider>
      <ScoreEditor />
    </ScoreProvider>
  );
}
```
