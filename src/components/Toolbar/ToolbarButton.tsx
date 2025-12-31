import React from 'react';
import './styles/ToolbarButton.css';

interface ToolbarButtonProps {
  /** The icon element to display */
  icon?: React.ReactNode;
  /** Text label (used for aria-label and tooltip even if hidden) */
  label: string;
  /** Whether to display the label text visually */
  showLabel?: boolean;
  /** Whether the button is in an active/toggled state */
  isActive?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Custom CSS classes */
  className?: string; 
  /** Disabled state */
  disabled?: boolean;
  /** Tooltip text (defaults to label if omitted) */
  title?: string;
  /** Ref for the button element */
  ref?: React.Ref<HTMLButtonElement>;

  /** If true, prevents focus when clicked (useful for keeping focus on canvas) */
  preventFocus?: boolean;
  /** Highlights the button (branding color) */
  isEmphasized?: boolean;
  /** Renders with a dashed border (e.g. for ghost/placeholder actions) */
  isDashed?: boolean;
  /** @deprecated Used legacy inline height, now handled via CSS */
  height?: string; 
  /** Visual style variant */
  variant?: 'default' | 'ghost';
}

/**
 * ToolbarButton
 *
 * Standard interactive element for the editor toolbar.
 * Supports icons, labels, toggle states, and various visual variants.
 * Accessibility-ready with aria-labels and keyboard support.
 */
const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  (
    {
      icon,
      label,
      showLabel = false,
      isActive = false,
      onClick,
      className = '',
      disabled = false,
      title,
      preventFocus = false,
      isEmphasized = false,
      isDashed = false,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      height, // unused in CSS approach (fixed height in CSS or overridden via class)
      variant = 'default',
    },
    ref
  ) => {
    // We no longer rely on ThemeContext for *computed* styles,
    // but the ThemeProvider still pushes variables to CSS if needed.
    // CSS classes now drive the look.

    const classes = [
      'riff-ToolbarButton',
      // Layout modifiers
      showLabel ? 'riff-ToolbarButton--auto-width' : '',

      // Style modifiers
      isDashed ? 'riff-ToolbarButton--dashed' : 'riff-ToolbarButton--solid-border',
      variant === 'ghost' ? 'riff-ToolbarButton--ghost' : '',

      // State modifiers
      isActive ? 'riff-ToolbarButton--active' : '',
      isEmphasized ? 'riff-ToolbarButton--emphasized' : '',

      // External overrides
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        onClick={onClick}
        onMouseDown={(e) => {
          if (preventFocus) {
            e.preventDefault();
          }
        }}
        disabled={disabled}
        className={classes}
        title={title || label}
        aria-label={label}
        type="button"
      >
        {icon && (
          <span
            className={`riff-ToolbarButton__icon ${showLabel ? 'riff-ToolbarButton__icon--margin' : ''}`}
          >
            {icon}
          </span>
        )}
        {showLabel ? (
          <span className="riff-ToolbarButton__label">{label}</span>
        ) : (
          <span className="riff-ToolbarButton__sr-only">{label}</span>
        )}
      </button>
    );
  }
);

ToolbarButton.displayName = 'ToolbarButton';

export default ToolbarButton;
