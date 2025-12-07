import React from 'react';
import ToolbarButton from './ToolbarButton';

interface AccidentalControlsProps {
  activeAccidental: 'flat' | 'natural' | 'sharp' | null;
  onToggleAccidental: (accidental: 'flat' | 'natural' | 'sharp') => void;
}

const AccidentalControls: React.FC<AccidentalControlsProps> = ({
  activeAccidental,
  onToggleAccidental
}) => {
  return (
    <div className="flex gap-1">
        <ToolbarButton
          onClick={() => onToggleAccidental('flat')} 
          label="Flat"
          isActive={activeAccidental === 'flat'}
          className="text-xl pb-1"
          icon="♭"
          preventFocus={true}
        />
        <ToolbarButton
          onClick={() => onToggleAccidental('natural')} 
          label="Natural"
          isActive={activeAccidental === 'natural'}
          className="text-xl pb-1"
          icon="♮"
          preventFocus={true}
        />
        <ToolbarButton
          onClick={() => onToggleAccidental('sharp')} 
          label="Sharp"
          isActive={activeAccidental === 'sharp'}
          className="text-xl pb-1"
          icon="♯"
          preventFocus={true}
        />
    </div>
  );
};

export default AccidentalControls;
