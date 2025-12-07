import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import Portal from '../Portal';

interface DropdownOverlayProps {
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
  position: { x: number; y: number };
  children: React.ReactNode;
  width?: string | number;
  maxHeight?: string | number;
  className?: string;
}

const DropdownOverlay: React.FC<DropdownOverlayProps> = ({
  onClose,
  triggerRef,
  position,
  children,
  width = 'auto',
  maxHeight = 'auto',
  className = ''
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    // Focus first button on mount (with slight delay to ensure rendering)
    const timer = setTimeout(() => {
      const buttons = ref.current?.querySelectorAll('button');
      if (buttons && buttons.length > 0) {
        (buttons[0] as HTMLElement).focus();
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if focus is inside our container
      if (!ref.current?.contains(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      const focusableElements = ref.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const activeElement = document.activeElement as HTMLElement;
      const index = Array.from(focusableElements).indexOf(activeElement);

      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.shiftKey) {
          const prevIndex = (index - 1 + focusableElements.length) % focusableElements.length;
          focusableElements[prevIndex].focus();
        } else {
          const nextIndex = (index + 1) % focusableElements.length;
          focusableElements[nextIndex].focus();
        }
      } else if (['ArrowDown', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const nextIndex = (index + 1) % focusableElements.length;
        focusableElements[nextIndex].focus();
      } else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        const prevIndex = (index - 1 + focusableElements.length) % focusableElements.length;
        focusableElements[prevIndex].focus();
      }
    };

    // Use Capture Phase to intercept events before they bubble or are handled by defaults
    document.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown, true);
      
      // Return focus to trigger on close
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
    };
  }, [onClose, triggerRef]);

  return (
    <Portal>
      {/* Backdrop to catch clicks and prevent interaction with background */}
      <div 
        className="fixed inset-0 z-40 bg-transparent"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-hidden="true"
      />
      
      {/* Dropdown Content */}
      <div
        ref={ref}
        className={`fixed z-50 rounded-lg shadow-xl border overflow-hidden backdrop-blur-md ${className}`}
        style={{
          left: position.x,
          top: position.y,
          ...(width !== 'auto' && { width }),
          maxHeight: maxHeight,
          backgroundColor: theme.panelBackground,
          borderColor: theme.border,
          color: theme.text,
        }}
        role="menu"
        aria-modal="true"
      >
        {children}
        <style>{`
          .dropdown-scroll::-webkit-scrollbar {
            width: 6px;
          }
          .dropdown-scroll::-webkit-scrollbar-track {
            background: transparent;
          }
          .dropdown-scroll::-webkit-scrollbar-thumb {
            background-color: ${theme.border};
            border-radius: 3px;
          }
          .dropdown-scroll::-webkit-scrollbar-thumb:hover {
            background-color: ${theme.secondaryText};
          }
        `}</style>
      </div>
    </Portal>
  );
};

export default DropdownOverlay;
