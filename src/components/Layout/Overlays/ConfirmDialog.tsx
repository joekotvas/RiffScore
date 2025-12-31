import React from 'react';
import './styles/ConfirmDialog.css';

interface ConfirmDialogProps {
  title: string;
  message: string;
  /** Array of action buttons. Each has label, onClick, and optional variant */
  actions: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'danger' | 'secondary';
  }>;
  onClose: () => void;
}

/**
 * Reusable confirmation dialog with customizable actions.
 * Renders as a modal overlay with centered content.
 */
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, actions, onClose }) => {
  // Handle ESC key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Lock scroll on mount
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      // Restore scroll on unmount
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  return (
    <div className="riff-ConfirmDialog-backdrop" onClick={onClose}>
      <div className="riff-ConfirmDialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="riff-ConfirmDialog__title">{title}</h2>

        <p className="riff-ConfirmDialog__message">{message}</p>

        <div className="riff-ConfirmDialog__actions">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`riff-ConfirmDialog__button riff-ConfirmDialog__button--${action.variant || 'secondary'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
