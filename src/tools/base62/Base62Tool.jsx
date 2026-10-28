import { useEffect, useRef, useState } from 'react';
import {
  decodeBase62ToBytes,
  decodeFromBase62,
  encodeBytesToBase62,
  encodeToBase62,
  fileToBytes,
  formatFileSize,
} from './base62.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './base62.css';

const MODES = { ENCODE: 'encode', DECODE: 'decode' };

/** Renders a client-side Base62 encoder and decoder for text and binary files. */
export default function Base62Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [binaryOutput, setBinaryOutput] = useState(null);
  const [copyError, setCopyError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  useEffect(() => {
    if (file || input === '') {
      if (!file) setOutput('');
      setError('');
      setBinaryOutput(null);
      return;
    }
    try {
      if (mode === MODES.ENCODE) {
        setOutput(encodeToBase62(input));
        setBinaryOutput(null);
        setError('');
      } else {
        const bytes = decodeBase62ToBytes(input);
        setBinaryOutput(bytes);
        try {
          setOutput(decodeFromBase62(input));
          setError('');
        } catch (conversionError) {
          setOutput('');
          setError(conversionError.message);
        }
      }
    } catch (conversionError) {
      setOutput('');
      setBinaryOutput(null);
      setError(conversionError.message);
    }
  }, [file, input, mode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    fileRequestRef.current += 1;
    setMode(nextMode);
    setFile(null);
    setInput('');
    setOutput('');
    setBinaryOutput(null);
    setError('');
    setCopyError('');
  }

  function handleInputChange(event) {
    fileRequestRef.current += 1;
    setFile(null);
    setInput(event.target.value);
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setInput('');
    setOutput('');
    setError('');
    setBinaryOutput(null);
    setFile(null);
    setCopyError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);
    try {
      const bytes = await fileToBytes(selected);
      if (fileRequestRef.current !== requestId) return;
      setMode(MODES.ENCODE);
      setFile(selected);
      setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
      setOutput(encodeBytesToBase62(bytes));
      setBinaryOutput(null);
      setError('');
    } catch (fileError) {
      if (fileRequestRef.current !== requestId) return;
      setError(fileError.message);
    }
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  function handleDownload() {
    if (!binaryOutput) return;
    const url = URL.createObjectURL(new Blob([binaryOutput]));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'decoded-base62.bin';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const inputLabel = mode === MODES.ENCODE ? 'Text' : 'Base62';
  const outputLabel = mode === MODES.ENCODE ? 'Base62' : 'Text';
  const alertMessage = error || copyError;

  return (
    <section className="base62-tool" aria-label="Base62 Encoder/Decoder Tool">
      <div className="base62-tool__toolbar">
        <div className="base62-tool__mode-toggle" role="group" aria-label="Conversion mode">
          {Object.entries(MODES).map(([label, value]) => (
            <button
              key={value}
              type="button"
              className={`base62-tool__mode-button ${
                mode === value ? 'base62-tool__mode-button--active' : ''
              }`}
              aria-pressed={mode === value}
              onClick={() => handleModeChange(value)}
            >
              {label[0]}{label.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="base62-tool__actions">
          <label className="base62-tool__button base62-tool__file-button">
            Upload File
            <input ref={fileInputRef} type="file" className="base62-tool__file-input"
              onChange={handleFileChange} aria-label="Encode a file as Base62" />
          </label>
          {mode === MODES.DECODE && binaryOutput && (
            <button type="button" className="base62-tool__button" onClick={handleDownload}>
              Download bytes
            </button>
          )}
          <button type="button" className="base62-tool__button" onClick={handleClear}>Clear</button>
        </div>
      </div>
      <div className="base62-tool__panels">
        <div className="base62-tool__panel">
          <label className="base62-tool__label" htmlFor="base62-input">{inputLabel}</label>
          <textarea id="base62-input" className="base62-tool__textarea" value={input}
            onChange={handleInputChange} spellCheck={false}
            placeholder={
              mode === MODES.ENCODE ? 'Type text or upload a file…' : 'Paste Base62 to decode…'
            }
            aria-invalid={Boolean(error)} aria-describedby={error ? 'base62-error' : undefined} />
        </div>
        <div className="base62-tool__panel">
          <div className="base62-tool__label-row">
            <label className="base62-tool__label" htmlFor="base62-output">{outputLabel}</label>
            <button
              type="button"
              className="base62-tool__button base62-tool__copy-button"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea id="base62-output" className="base62-tool__textarea" value={output} readOnly
            spellCheck={false} placeholder="Result will appear here…" />
        </div>
      </div>
      {copied && (
        <div className="base62-tool__sr-only" role="status" aria-live="polite">
          Copied to clipboard
        </div>
      )}
      {alertMessage && (
        <div id="base62-error" className="base62-tool__error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
