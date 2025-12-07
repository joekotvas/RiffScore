import { useState } from 'react';

export const useEditorTools = () => {
  const [activeDuration, setActiveDuration] = useState('quarter');
  const [isDotted, setIsDotted] = useState(false);
  const [activeAccidental, setActiveAccidental] = useState<'flat' | 'natural' | 'sharp' | null>(null); // null, 'sharp', 'flat', 'natural'
  const [activeTie, setActiveTie] = useState(false);
  
  // User Preferences (Sticky state)
  const [userSelectedDuration, setUserSelectedDuration] = useState('quarter');
  const [userSelectedDotted, setUserSelectedDotted] = useState(false);

  const handleDurationChange = (newDuration: string) => {
      setActiveDuration(newDuration);
      setUserSelectedDuration(newDuration);
  };

  const handleDotToggle = () => {
      const newState = !isDotted;
      setIsDotted(newState);
      setUserSelectedDotted(newState);
      return newState;
  };

  const handleAccidentalToggle = (type: 'flat' | 'natural' | 'sharp' | null) => {
      const newState = activeAccidental === type ? null : type;
      setActiveAccidental(newState);
      return newState;
  };

  const handleTieToggle = () => {
      const newState = !activeTie;
      setActiveTie(newState);
      return newState;
  };

  return {
      activeDuration,
      setActiveDuration,
      isDotted,
      setIsDotted,
      activeAccidental,
      setActiveAccidental,
      activeTie,
      setActiveTie,
      userSelectedDuration,
      userSelectedDotted,
      handleDurationChange,
      handleDotToggle,
      handleAccidentalToggle,
      handleTieToggle
  };
};
