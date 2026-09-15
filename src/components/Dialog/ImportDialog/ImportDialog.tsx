/**
 * ImportDialog
 *
 * Modal for bringing a score in: ABC notation or MusicXML (typed, pasted, or opened from a
 * .abc / .musicxml / .xml / compressed .mxl file) or the editor's own JSON export. The text is
 * parsed as it changes so the user sees what will load — title, staves, bars — and every
 * warning before committing.
 * Importing replaces the score through LoadScoreCommand, so it is a single undo step.
 *
 * @module components/Dialog/ImportDialog
 * @tested src/__tests__/components/Dialog/ImportDialog.test.tsx
 */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useScoreContext } from '@/context/ScoreContext';
import { useFocusTrap } from '@/hooks/layout';
import { LoadScoreCommand } from '@/commands/LoadScoreCommand';
import {
  IMPORT_FORMAT_LABELS,
  importScoreText,
  unpackScoreFile,
  type ImportTextResult,
} from '@/importers';
import { getModifierKey } from '@/utils/platform';
import './ImportDialog.css';

interface ImportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Called when the dialog closes (after an import or on cancel) */
  onClose: () => void;
  /** Element to focus again when the dialog closes (the menu button that opened it) */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

const PLACEHOLDER = [
  'X:1',
  'T:My Tune',
  'M:4/4',
  'L:1/8',
  'K:G',
  '|: G2 GAB | d2 dBA | G2 GAB | A2 A2 :|',
].join('\n');

/**
 * Read a picked file as bytes (FileReader keeps this working in older browsers and jsdom), then
 * unpack it to text: a compressed .mxl archive is unzipped, anything else is decoded as it is.
 */
const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bytes =
          reader.result instanceof ArrayBuffer ? new Uint8Array(reader.result) : new Uint8Array(0);
        const unpacked = unpackScoreFile(bytes);
        if (unpacked.ok) resolve(unpacked.text);
        else reject(new Error(`Could not read ${file.name}: ${unpacked.error}`));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not read the file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsArrayBuffer(file);
  });

const FILE_TYPES = [
  '.abc',
  '.txt',
  '.json',
  '.musicxml',
  '.xml',
  '.mxl',
  'text/plain',
  'application/json',
  'application/xml',
  'text/xml',
  'application/vnd.recordare.musicxml+xml',
  'application/vnd.recordare.musicxml',
].join(',');

/** The parse result for the current text, or null while the text box is empty. */
const analyze = (text: string): ImportTextResult | null =>
  text.trim() ? importScoreText(text) : null;

const ImportDialogContent: React.FC<Omit<ImportDialogProps, 'isOpen'>> = ({
  onClose,
  returnFocusRef,
}) => {
  const ctx = useScoreContext();
  const { dispatch } = ctx.engines;

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // A click only closes the dialog when it both starts and ends on the backdrop, so dragging a
  // text selection out of the text box and releasing outside does not throw the text away.
  const backdropPress = useRef(false);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  // A multi-megabyte document is parsed at transition priority, so typing stays responsive.
  const deferredText = useDeferredValue(text);
  const result = useMemo(() => analyze(deferredText), [deferredText]);

  useFocusTrap({
    containerRef: dialogRef,
    isActive: true,
    onEscape: onClose,
    returnFocusRef,
    autoFocus: false, // the trap would focus the × button; the text box is where typing starts
  });

  useEffect(() => {
    // After the File menu's own focus trap has handed focus back to its trigger.
    textareaRef.current?.focus();
  }, []);

  const handleImport = useCallback(() => {
    if (!result?.ok) return;
    dispatch(new LoadScoreCommand(result.score));
    onClose();
  }, [dispatch, onClose, result]);

  const handleFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;
    try {
      setText(await readFileText(file));
      setFileName(file.name);
      setFileError(null);
    } catch (e) {
      setFileError(e instanceof Error ? e.message : 'Could not read the file');
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      // Enter inside the text box types a newline; the modifier makes it import.
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleImport();
      }
    },
    [handleImport]
  );

  const modKey = getModifierKey();

  return (
    <div
      className="riff-ImportDialog-backdrop"
      onMouseDown={(e) => {
        backdropPress.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropPress.current && e.target === e.currentTarget) onClose();
        backdropPress.current = false;
      }}
      role="presentation"
      data-testid="import-backdrop"
    >
      <div
        ref={dialogRef}
        className="riff-ImportDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="riff-import-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="riff-ImportDialog__header">
          <h2 id="riff-import-title" className="riff-ImportDialog__title">
            Import Score
          </h2>
          <button
            type="button"
            className="riff-ImportDialog__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="riff-ImportDialog__content">
          <p className="riff-ImportDialog__hint">
            Paste ABC notation, MusicXML or the JSON this editor exports, or open a{' '}
            <code>.abc</code> / <code>.musicxml</code> / <code>.mxl</code> / <code>.json</code>{' '}
            file. Importing replaces the current score (you can undo it).
          </p>

          <div className="riff-ImportDialog__file-row">
            <button
              type="button"
              className="riff-ImportDialog__button riff-ImportDialog__button--secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Open file…
            </button>
            <span className="riff-ImportDialog__file-name" aria-live="polite">
              {fileError ?? fileName ?? 'No file chosen'}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_TYPES}
              className="riff-ImportDialog__file-input"
              aria-label="Score file"
              onChange={handleFile}
            />
          </div>

          <label className="riff-ImportDialog__label" htmlFor="riff-import-text">
            Score text
          </label>
          <textarea
            ref={textareaRef}
            id="riff-import-text"
            className="riff-ImportDialog__textarea"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName(null);
            }}
            placeholder={PLACEHOLDER}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            rows={10}
          />

          <div className="riff-ImportDialog__status" aria-live="polite">
            {result === null ? null : result.ok ? (
              <>
                <p className="riff-ImportDialog__ready" data-testid="import-summary">
                  Ready to import <strong>{result.score.title}</strong> —{' '}
                  {result.score.staves.length === 1
                    ? '1 staff'
                    : `${result.score.staves.length} staves`}
                  , {result.score.staves[0]?.measures.length ?? 0} bars,{' '}
                  {IMPORT_FORMAT_LABELS[result.format]}.
                </p>
                {result.warnings.length > 0 && (
                  <div className="riff-ImportDialog__warnings" data-testid="import-warnings">
                    <p className="riff-ImportDialog__warnings-title">
                      {result.warnings.length === 1
                        ? '1 thing'
                        : `${result.warnings.length} things`}{' '}
                      to know:
                    </p>
                    <ul className="riff-ImportDialog__warnings-list">
                      {result.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="riff-ImportDialog__error" data-testid="import-error">
                Could not read this as {IMPORT_FORMAT_LABELS[result.format]}: {result.error}
              </p>
            )}
          </div>
        </div>

        <div className="riff-ImportDialog__footer">
          <button
            type="button"
            className="riff-ImportDialog__button riff-ImportDialog__button--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="riff-ImportDialog__button riff-ImportDialog__button--primary"
            onClick={handleImport}
            disabled={!result?.ok}
            title={`Import (${modKey}+Enter)`}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Import dialog. Renders nothing while closed; the inner component remounts on each open so
 * the text box and file state start fresh.
 */
export const ImportDialog: React.FC<ImportDialogProps> = ({ isOpen, onClose, returnFocusRef }) => {
  if (!isOpen) return null;
  return <ImportDialogContent onClose={onClose} returnFocusRef={returnFocusRef} />;
};
