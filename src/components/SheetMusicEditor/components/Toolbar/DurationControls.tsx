import React from 'react';
import { NOTE_TYPES } from '../../constants';
import NoteIcon from '../Assets/NoteIcon';
import ToolbarButton from './ToolbarButton';

interface DurationControlsProps {
  activeDuration: string;
  onDurationChange: (duration: string) => void;
  isDurationValid: (duration: string) => boolean;
}

const DurationControls: React.FC<DurationControlsProps> = ({
  activeDuration,
  onDurationChange,
  isDurationValid
}) => {
  return (
    <div className="flex gap-1">
      {Object.keys(NOTE_TYPES).map(type => {
        const shortcuts: Record<string, string> = {
          whole: '7',
          half: '6',
          quarter: '5',
          eighth: '4',
          sixteenth: '3',
          thirtysecond: '2',
          sixtyfourth: '1'
        };
        return (
          <ToolbarButton
            key={type}
            onClick={() => onDurationChange(type)}
            label={NOTE_TYPES[type].label}
            title={`${NOTE_TYPES[type].label} (${shortcuts[type]})`}
            isActive={activeDuration === type}
            icon={<NoteIcon type={type} color={activeDuration === type ? "white" : "currentColor"} />}
            preventFocus={true}
            disabled={!isDurationValid(type)}
          />
        );
      })}
    </div>
  );
};

export default DurationControls;
