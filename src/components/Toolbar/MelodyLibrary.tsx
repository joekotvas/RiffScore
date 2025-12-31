import React from 'react';
import { Melody } from '@/types';
import { BookOpen } from 'lucide-react';
import DropdownOverlay, { DropdownItem } from './Menus/DropdownOverlay';

interface MelodyLibraryProps {
  melodies: Melody[];
  onSelectMelody: (melody: Melody) => void;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

const MelodyLibrary: React.FC<MelodyLibraryProps> = ({
  melodies,
  onSelectMelody,
  onClose,
  triggerRef,
}) => {
  return (
    <DropdownOverlay
      onClose={onClose}
      triggerRef={triggerRef}
      width={256} // w-64
      maxHeight={320} // max-h-80
    >
      <div className="riff-DropdownHeader">
        <BookOpen size={16} />
        <h3 className="riff-DropdownHeader__title">
          Melody Library
        </h3>
      </div>

      <div className="riff-DropdownContent" style={{ maxHeight: '320px' }}>
        {melodies.map((melody) => (
          <DropdownItem key={melody.id} onClick={() => onSelectMelody(melody)}>
            {melody.title}
          </DropdownItem>
        ))}
      </div>
    </DropdownOverlay>
  );
};

export default MelodyLibrary;
