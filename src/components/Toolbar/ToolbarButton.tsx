import React from 'react';
import './styles/ToolbarButton.css';

interface ToolbarButtonProps {
  icon?: React.ReactNode; // Icon element to display
  label: string; // Text label (used for aria-label and tooltip even if hidden)
  showLabel?: boolean; // Whether to display the label text visually
  isActive?: boolean; // Whether the button is in an active/toggled state
  onClick?: () => void; // Click handler
  className?: string; // Custom CSS classes
  disabled?: boolean; // Disabled state
  title?: string; // Tooltip text (defaults to label if omitted)
  ref?: React.Ref<HTMLButtonElement>; // Ref for the button element
  preventFocus?: boolean; // If true, prevents focus when clicked (useful for keeping focus on canvas)
  isEmphasized?: boolean; // Highlights the button (branding color)
  isDashed?: boolean; // Renders with a dashed border (e.g. for ghost/placeholder actions)
  height?: string; // @deprecated Used legacy inline height, now handled via CSS
  variant?: 'default' | 'ghost'; // Visual style variant
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
