import React, { useRef, forwardRef, useState, useLayoutEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useFocusTrap } from '@/hooks/layout';
import Portal from '../../Layout/Portal';
import '../styles/DropdownOverlay.css';

// ========== DROPDOWN TRIGGER BUTTON ==========
interface DropdownTriggerProps {
  label: string;
  icon?: React.ReactNode;
  isOpen: boolean;
  onClick: () => void;
  height?: string;
}

/**
 * Standardized dropdown trigger button with ghost styling:
 * - SM font, all caps
 * - ChevronDown icon
 * - Ghost style (transparent until hover/open)
 */
export const DropdownTrigger = forwardRef<HTMLButtonElement, DropdownTriggerProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ label, icon, isOpen, onClick, height }, ref) => {
    // Height is controlled by CSS defaults but can be overridden via class if needed,
    // though previously it was passed as class `h-9`. CSS sets default height.

    const classes = [
      'riff-DropdownTrigger',
      isOpen ? 'riff-DropdownTrigger--open' : 'riff-DropdownTrigger--default',
    ].join(' ');

    return (
      <button
        ref={ref}
        onClick={onClick}
        className={classes}
        type="button"
      >
        {icon}
        <span className="riff-DropdownTrigger__label">{label}</span>
        <ChevronDown
          size={14}
          className={`riff-DropdownTrigger__chevron ${isOpen ? 'riff-DropdownTrigger__chevron--open' : ''}`}
        />
      </button>
    );
  }
);

DropdownTrigger.displayName = 'DropdownTrigger';

interface DropdownOverlayProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
  /** Optional explicit position. If not provided, position is computed from triggerRef. */
  position?: { x: number; y: number };
  /** Gap between trigger and dropdown (default: 4px) */
  gap?: number;
  children: React.ReactNode;
  width?: string | number;
  maxHeight?: string | number;
  className?: string;
}

/**
 * A portal-based dropdown overlay that positions itself relative to a trigger element.
 *
 * Position can be provided explicitly via `position` prop, or computed automatically
 * from `triggerRef`. If both are provided, `position` takes precedence.
 *
 * This component properly handles ref access by computing position in useLayoutEffect,
 * avoiding the React anti-pattern of accessing refs during render.
 */
const DropdownOverlay: React.FC<DropdownOverlayProps> = ({
  onClose,
  triggerRef,
  position: explicitPosition,
  gap = 4,
  children,
  width = 'auto',
  maxHeight = 'auto',
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);
  // Only use state for position computed from triggerRef
  const [triggerPosition, setTriggerPosition] = useState<{ x: number; y: number } | null>(null);

  // Compute position from triggerRef in useLayoutEffect (the proper place to access refs)
  // Only runs when no explicit position is provided
  useLayoutEffect(() => {
    if (explicitPosition) return; // Skip if explicit position is provided

    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setTriggerPosition({
        x: rect.left,
        y: rect.bottom + gap,
      });
    }
  }, [triggerRef, explicitPosition, gap]);

  // Use explicit position if provided, otherwise use computed position
  const position = explicitPosition ?? triggerPosition ?? { x: 0, y: 0 };

  // Use unified focus trap hook
  useFocusTrap({
    containerRef: ref,
    isActive: true,
    onEscape: onClose,
    returnFocusRef: triggerRef,
    autoFocus: true,
    enableArrowKeys: true,
  });

  return (
    <Portal>
      {/* Backdrop to catch clicks and prevent interaction with background */}
      <div
        className="riff-DropdownOverlay-backdrop"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />

      {/* Dropdown Content */}
      <div
        ref={ref}
        className={`riff-DropdownOverlay ${className}`}
        style={{
          left: position.x,
          top: position.y,
          width: width === 'auto' ? undefined : width,
          maxHeight: maxHeight === 'auto' ? undefined : maxHeight,
        }}
        role="menu"
        aria-modal="true"
      >
        {children}
      </div>
    </Portal>
  );
};

// ========== DROPDOWN ITEM COMPONENT ==========
interface DropdownItemProps {
  onClick: () => void;
  children: React.ReactNode;
  isSelected?: boolean;
  className?: string;
}

/**
 * Standardized dropdown item with consistent styling:
 * - XS font size
 * - Pointer cursor
 * - Background color change on hover
 */
export const DropdownItem: React.FC<DropdownItemProps> = ({
  onClick,
  children,
  isSelected = false,
  className = '',
}) => {
  const classes = [
    'riff-DropdownItem',
    isSelected ? 'riff-DropdownItem--selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button onClick={onClick} className={classes} role="menuitem" type="button">
      {children}
    </button>
  );
};

export default DropdownOverlay;
