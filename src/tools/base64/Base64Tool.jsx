import { useEffect, useRef, useState } from 'react';
import {
  decodeFromBase64,
  encodeToBase64,
  fileToBase64,
  formatFileSize,
} from './base64.utils.js';
import './base64.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders the Base64 encoder/decoder tool with live text conversion and file upload support.
 *
 * @param {object} props Component props.
 * @param {() => void} props.onBack Callback to return to the tool dashboard.
 * @returns {React.JSX.Element} The Base64 tool UI.
 */
export default function Base64Tool({ onBack }) {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  // Real-time conversion whenever the input or mode changes.
  useEffect(() => {
    if (file) return;
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      const result =
        mode === MODES.ENCODE ? encodeToBase64(input) : decodeFromBase64(input);
      setOutput(result);
      setError('');
    } catch (err) {
      setOutput('');
      setError(err.message);
    }
  }, [input, mode, file]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (file) {
      // Leaving file mode: the uploaded-file label lived in `input` for display
      // purposes only and must not be re-interpreted as conversion input.
      setFile(null);
      setInput('');
      setOutput('');
    }
    setError('');
  }

  function handleInputChange(event) {
    setFile(null);
    setInput(event.target.value);
  }

  function handleSwap() {
    if (error) return;
    setFile(null);
    setInput(output);
    setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setCopyError('');
    } catch {
      // Clipboard failures are reported separately from conversion errors so
      // a denied copy can never disable a valid Swap.
      setCopyError('Failed to copy to clipboard.');
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      const base64 = await fileToBase64(selected);
      setMode(MODES.ENCODE);
      setFile(selected);
      setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
      setOutput(base64);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="base64-tool" aria-label="Base64 Encoder/Decoder Tool">
      <div className="base64-header-row">
        <button
          type="button"
          className="back-button"
          onClick={onBack}
          aria-label="Go back to tool dashboard"
        >
          <span aria-hidden="true">←</span> Back
        </button>
      </div>

      <div className="base64-toolbar">
        <div className="mode-toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            aria-pressed={mode === MODES.ENCODE}
            className={`mode-btn ${mode === MODES.ENCODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.ENCODE)}
          >
            Encode
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.DECODE}
            className={`mode-btn ${mode === MODES.DECODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.DECODE)}
          >
            Decode
          </button>
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Convert a file to Base64"
            />
          </label>
          <button type="button" className="btn" onClick={handleSwap} disabled={!output || !!error}>
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="base64-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base64-input">
            {mode === MODES.ENCODE ? 'Text' : 'Base64'}
          </label>
          <textarea
            id="base64-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE
                ? 'Type or paste text to encode…'
                : 'Paste Base64 to decode…'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base64-output">
              {mode === MODES.ENCODE ? 'Base64' : 'Text'}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            id="base64-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div className="base64-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
