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

  // Use the RiffScore container if available, otherwise fall back to body. `document` is read
  // only once mounted so a Portal rendered during server-side rendering is a harmless no-op.
  if (!mounted) return null;
  const target = containerRef || document.body;

  return createPortal(children, target);
};

export default Portal;
