import React from 'react';
import { useFocusTrap } from '@/hooks/layout/useFocusTrap';
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
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const messageId = React.useId();
  useFocusTrap({ containerRef: dialogRef, isActive: true, onEscape: onClose });
  React.useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="riff-ConfirmDialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="riff-ConfirmDialog"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="riff-ConfirmDialog__title">
          {title}
        </h2>

        <p id={messageId} className="riff-ConfirmDialog__message">
          {message}
        </p>

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
