import React from 'react';
import './styles/Divider.css';

interface DividerProps {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * A themed divider component for toolbar sections
 */
const Divider: React.FC<DividerProps> = ({ orientation = 'vertical', className = '' }) => {
  const baseClass = 'riff-Divider';
  const orientationClass =
    orientation === 'horizontal' ? 'riff-Divider--horizontal' : 'riff-Divider--vertical';

  return <div className={`${baseClass} ${orientationClass} ${className}`} />;
};

export default Divider;
