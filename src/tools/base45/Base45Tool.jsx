import { useEffect, useState } from 'react';
import { decodeFromBase45, encodeToBase45 } from './base45.utils.js';
import './base45.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders a live Base45 encoder and decoder for UTF-8 text.
 *
 * @returns {React.JSX.Element} The Base45 tool UI.
 */
export default function Base45Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      const result = mode === MODES.ENCODE ? encodeToBase45(input) : decodeFromBase45(input);
      setOutput(result);
      setError('');
    } catch (conversionError) {
      setOutput('');
      setError(conversionError.message);
    }
  }, [input, mode]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setInput(output);
    setOutput('');
    setError('');
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const inputLabel = mode === MODES.ENCODE ? 'Text' : 'Base45';
  const outputLabel = mode === MODES.ENCODE ? 'Base45' : 'Text';

  return (
    <section className="base45-tool" aria-label="Base45 Encoder/Decoder Tool">
      <div className="base45-toolbar">
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
        <button type="button" className="btn" onClick={handleClear}>
          Clear
        </button>
      </div>

      <p className="base45-help">
        Encodes UTF-8 text or raw bytes using the RFC 9285 alphabet: 0-9, A-Z, space, and $%*+-./:.
      </p>

      <div className="base45-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base45-input">
            {inputLabel}
          </label>
          <textarea
            id="base45-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE ? 'Type or paste text to encode…' : 'Paste Base45 to decode…'
            }
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCopyError('');
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'base45-error' : undefined}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base45-output">
              {outputLabel}
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
            id="base45-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <div id="base45-error" className="base45-error" role="alert">
          ⚠ {error}
        </div>
      )}
      {copyError && (
        <div className="base45-error" role="alert">
          ⚠ {copyError}
        </div>
      )}
    </section>
  );
}
