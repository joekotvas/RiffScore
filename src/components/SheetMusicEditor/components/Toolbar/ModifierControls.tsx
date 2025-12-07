import React from 'react';
import { Circle } from 'lucide-react';
import TieIcon from '../Assets/TieIcon';
import ToolbarButton from './ToolbarButton';

interface ModifierControlsProps {
  isDotted: boolean;
  onDotToggle: () => void;
  activeTie: boolean;
  onToggleTie: () => void;
  isDotValid: boolean;
}

const ModifierControls: React.FC<ModifierControlsProps> = ({
  isDotted,
  onDotToggle,
  activeTie,
  onToggleTie,
  isDotValid
}) => {
  return (
    <div className="flex gap-1">
      <ToolbarButton
        onClick={onDotToggle}
        label="Dotted Note"
        isActive={isDotted}
        icon={<Circle size={8} fill="currentColor" />}
        preventFocus={true}
        disabled={!isDotValid}
      />

      <ToolbarButton
        onClick={onToggleTie}
        label="Tie (T)"
        isActive={activeTie}
        icon={<TieIcon size={16} />}
        preventFocus={true}
      />
    </div>
  );
};

export default ModifierControls;
