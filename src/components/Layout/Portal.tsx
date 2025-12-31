import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@/context/ThemeContext';

/**
 * Portal component that renders children into the RiffScore container.
 * This ensures portal content inherits the scoped theme CSS variables.
 * Falls back to document.body if no container is available.
 */
const Portal = ({ children }: { children: React.ReactNode }) => {
  const [mounted, setMounted] = useState(false);
  const { containerRef } = useTheme();

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Use the RiffScore container if available, otherwise fall back to body
  const target = containerRef || document.body;

  return mounted ? createPortal(children, target) : null;
};

export default Portal;
