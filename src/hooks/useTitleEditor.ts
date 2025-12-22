import { useState, useEffect, useRef, useCallback } from 'react';
import { UpdateTitleCommand } from '@/commands/UpdateTitleCommand';
import { Command } from '@/commands/types';

interface UseTitleEditorResult {
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  buffer: string;
  setBuffer: (value: string) => void;
  commit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

/**
 * Manages title editing logic including focus, buffer state, and commit.
 */
export function useTitleEditor(
  currentTitle: string,
  dispatch: (command: Command) => void
): UseTitleEditorResult {
  const [isEditing, setIsEditing] = useState(false);
  const [buffer, setBuffer] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSetEditing = useCallback((editing: boolean) => {
    if (editing) {
      setBuffer(currentTitle); // Initialize buffer when starting edit
    }
    setIsEditing(editing);
  }, [currentTitle]);

  // Focus and select when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commit = useCallback(() => {
    setIsEditing(false);
    if (buffer !== currentTitle) {
      dispatch(new UpdateTitleCommand(buffer));
    }
  }, [buffer, currentTitle, dispatch]);

  return { isEditing, setIsEditing: handleSetEditing, buffer, setBuffer, commit, inputRef };
}
