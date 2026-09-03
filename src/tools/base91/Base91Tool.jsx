import { useEffect, useRef, useState } from 'react';
import {
  decodeFromBase91,
  encodeToBase91,
  fileToBase91,
  formatFileSize,
} from './base91.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './base91.css';

const MODES = { ENCODE: 'encode', DECODE: 'decode' };

/**
 * Renders the Base91 encoder/decoder with live text conversion and file encoding.
 * @returns {React.JSX.Element} The Base91 tool UI.
 */
export default function Base91Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  useEffect(() => {
    if (file) return;
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      setOutput(mode === MODES.ENCODE ? encodeToBase91(input) : decodeFromBase91(input));
      setError('');
    } catch (conversionError) {
      setOutput('');
      setError(conversionError.message);
    }
  }, [file, input, mode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    fileRequestRef.current += 1;
    setMode(nextMode);
    if (file) {
      setFile(null);
      setInput('');
      setOutput('');
    }
    setError('');
  }

  function handleInputChange(event) {
    fileRequestRef.current += 1;
    setFile(null);
    setInput(event.target.value);
  }

  function handleSwap() {
    if (error) return;
    fileRequestRef.current += 1;
    setFile(null);
    setInput(output);
    setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);
    try {
      const encoded = await fileToBase91(selected);
      if (fileRequestRef.current !== requestId) return;
      setMode(MODES.ENCODE);
      setFile(selected);
      setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
      setOutput(encoded);
      setError('');
    } catch (fileError) {
      if (fileRequestRef.current === requestId) setError(fileError.message);
    }
  }

  const alertMessage = error || copyError;
  return (
    <section className="base91-tool" aria-label="Base91 Encoder/Decoder Tool">
      <div className="base91-toolbar">
        <div className="mode-toggle" role="group" aria-label="Conversion mode">
          {Object.entries(MODES).map(([label, value]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              className={`mode-btn ${mode === value ? 'active' : ''}`}
              onClick={() => handleModeChange(value)}
            >
              {label[0] + label.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Convert a file to Base91"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleSwap}
            disabled={!output || !!error}
          >
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>Clear</button>
        </div>
      </div>
      <div className="base91-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base91-input">
            {mode === MODES.ENCODE ? 'Text' : 'Base91'}
          </label>
          <textarea
            id="base91-input"
            className="panel-textarea"
            value={input}
            onChange={handleInputChange}
            placeholder={
              mode === MODES.ENCODE ? 'Type or paste text to encode…' : 'Paste Base91 to decode…'
            }
            spellCheck={false}
          />
        </div>
        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base91-output">
              {mode === MODES.ENCODE ? 'Base91' : 'Text'}
            </label>
            <button type="button" className="btn copy-btn" onClick={handleCopy} disabled={!output}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            {copied && (
              <div className="sr-only" role="status" aria-live="polite">
                Copied to clipboard
              </div>
            )}
          </div>
          <textarea
            id="base91-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>
      {alertMessage && (
        <div className="base91-error" role="alert">⚠ {alertMessage}</div>
      )}
    </section>
  );
}
