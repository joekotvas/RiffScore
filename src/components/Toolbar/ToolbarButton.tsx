import React from 'react';
import './styles/ToolbarButton.css';

interface ToolbarButtonProps {
  icon?: React.ReactNode;
  label: string;
  showLabel?: boolean;
  isActive?: boolean;
  onClick?: () => void;
  className?: string; // Allow custom classes from consumer
  disabled?: boolean;
  title?: string;
  ref?: React.Ref<HTMLButtonElement>;

  preventFocus?: boolean;
  isEmphasized?: boolean;
  isDashed?: boolean;
  height?: string; // kept for legacy compat, but effectively ignored if using CSS classes mostly
  variant?: 'default' | 'ghost';
}

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
