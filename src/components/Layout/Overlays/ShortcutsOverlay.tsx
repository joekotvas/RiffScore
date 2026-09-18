import React from 'react';
import { useFocusTrap } from '@/hooks/layout/useFocusTrap';
import { X, Keyboard } from 'lucide-react';
import './styles/ShortcutsOverlay.css';

interface Shortcut {
  label: string;
  keys: string[];
}

interface ShortcutGroupProps {
  title: string;
  shortcuts: Shortcut[];
}

const ShortcutGroup: React.FC<ShortcutGroupProps> = ({ title, shortcuts }) => (
  <div className="riff-ShortcutGroup">
    <h3 className="riff-ShortcutGroup__header">{title}</h3>
    <div className="riff-ShortcutGroup__list">
      {shortcuts.map((s, i) => (
        <div key={i} className="riff-ShortcutItem">
          <span>{s.label}</span>
          <div className="riff-ShortcutItem__keys">
            {s.keys.map((k, j) => (
              <kbd key={j} className="riff-Kbd">
                {k}
              </kbd>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

interface ShortcutsOverlayProps {
  onClose: () => void;
}

const ShortcutsOverlay: React.FC<ShortcutsOverlayProps> = ({ onClose }) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useFocusTrap({ containerRef: dialogRef, isActive: true, onEscape: onClose });

  const shortcuts = {
    selection: [
      { label: 'Move Selection', keys: ['←', '→'] },
      { label: 'Extend Selection', keys: ['Shift', '←/→'] },
      { label: 'Range Select', keys: ['Shift', 'Click'] },
      { label: 'Chord Navigation', keys: ['Cmd/Ctrl', '↑/↓'] },
      { label: 'Switch Staff (Grand)', keys: ['Alt', '↑/↓'] },
      { label: 'Select Note', keys: ['Cmd/Ctrl', 'Click'] },
      { label: 'Clear Selection', keys: ['Esc'] },
    ],
    playback: [
      { label: 'Toggle Playback', keys: ['Space'] },
      { label: 'Play Selection', keys: ['P'] },
      { label: 'Replay Last Start', keys: ['Shift', 'Space'] },
      { label: 'Play From Start', keys: ['Shift', 'Alt', 'Space'] },
    ],
    editing: [
      { label: 'Add Note', keys: ['Enter'] },
      { label: 'Remove Note', keys: ['Backspace'] },
      { label: 'Toggle Rest Mode', keys: ['R'] },
      { label: 'Undo', keys: ['Cmd/Ctrl', 'Z'] },
      { label: 'Redo', keys: ['Cmd/Ctrl', 'Shift', 'Z'] },
      { label: 'Pitch Up/Down', keys: ['↑', '↓'] },
      { label: 'Octave Jump', keys: ['Shift', '↑/↓'] },
    ],
    modifiers: [
      { label: 'Toggle Dot', keys: ['.'] },
      { label: 'Toggle Tie', keys: ['T'] },
      { label: 'Flat', keys: ['-'] },
      { label: 'Sharp', keys: ['='] },
      { label: 'Natural', keys: ['0'] },
    ],
    durations: [
      { label: 'Whole Note', keys: ['7'] },
      { label: 'Half Note', keys: ['6'] },
      { label: 'Quarter Note', keys: ['5'] },
      { label: 'Eighth Note', keys: ['4'] },
      { label: '16th Note', keys: ['3'] },
      { label: '32nd Note', keys: ['2'] },
      { label: '64th Note', keys: ['1'] },
    ],
  };

  return (
    <div className="riff-ShortcutsOverlay-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="riff-ShortcutsOverlay"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="riff-ShortcutsOverlay__header">
          <div className="riff-ShortcutsOverlay__title-group">
            <Keyboard size={20} />
            <h2 id={titleId} className="riff-ShortcutsOverlay__title">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            className="riff-ShortcutsOverlay__close-btn"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="riff-ShortcutsOverlay__content" tabIndex={0}>
          {/* Welcome & Instructions */}
          <div className="riff-WelcomeSection">
            <h3 className="riff-WelcomeSection__title">Welcome to RiffScore!</h3>
            <p className="riff-WelcomeSection__text">
              This editor allows you to create sheet music using both mouse and keyboard. Use the
              toolbar above to change note duration, add dots, or manage measures.
            </p>

            <div className="riff-WelcomeSection__grid">
              <div>
                <h4 className="riff-WelcomeSection__subtitle">🖱️ Mouse Interactions</h4>
                <ul className="riff-WelcomeSection__list">
                  <li>Click anywhere in a measure to place the cursor.</li>
                  <li>Click existing notes to select them.</li>
                  <li>Click the background to deselect.</li>
                </ul>
              </div>
              <div>
                <h4 className="riff-WelcomeSection__subtitle">⌨️ Keyboard Interactions</h4>
                <ul className="riff-WelcomeSection__list">
                  <li>
                    Use <kbd className="riff-Kbd">Arrow Keys</kbd> to move the cursor.
                  </li>
                  <li>
                    Press <kbd className="riff-Kbd">Enter</kbd> to add a note at the cursor.
                  </li>
                  <li>
                    Press <kbd className="riff-Kbd">Space</kbd> to play/pause.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="riff-ShortcutsGrid">
            <div>
              <ShortcutGroup title="Playback" shortcuts={shortcuts.playback} />
              <ShortcutGroup title="Selection" shortcuts={shortcuts.selection} />
            </div>
            <div>
              <ShortcutGroup title="Editing" shortcuts={shortcuts.editing} />
              <ShortcutGroup title="Modifiers" shortcuts={shortcuts.modifiers} />
              <ShortcutGroup title="Durations" shortcuts={shortcuts.durations} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="riff-ShortcutsOverlay__footer">
          Press <kbd className="riff-ShortcutsOverlay__footer-kbd">Esc</kbd> to close
        </div>
      </div>
    </div>
  );
};

export default ShortcutsOverlay;
