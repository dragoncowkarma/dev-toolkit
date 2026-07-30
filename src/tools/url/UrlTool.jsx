import { useEffect, useState } from 'react';
import { decodeUrl, encodeUrl, isValidUrl, parseQueryParams } from './url.utils.js';
import './url.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

/**
 * Renders the URL encoder/decoder tool with live conversion, URL validation,
 * and a query-string parameter table.
 *
 * @returns {React.JSX.Element} The URL tool UI.
 */
export default function UrlTool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);

  // Real-time conversion whenever the input or mode changes.
  useEffect(() => {
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      const result = mode === MODES.ENCODE ? encodeUrl(input) : decodeUrl(input);
      setOutput(result);
      setError('');
    } catch (err) {
      setOutput('');
      setError(err.message);
    }
  }, [input, mode]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
  }

  function handleInputChange(event) {
    setInput(event.target.value);
  }

  function handleSwap() {
    if (error) return;
    setInput(output);
    setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
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
      // Clipboard failures are reported separately from conversion errors so
      // a denied copy can never disable a valid Swap.
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || copyError;
  const queryParams = parseQueryParams(input);
  const showUrlValidity = input.trim() !== '';
  const urlIsValid = isValidUrl(input);

  return (
    <section className="url-tool" aria-label="URL Encoder/Decoder Tool">
      <div className="url-toolbar">
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
          {showUrlValidity && (
            <span
              className={`url-validity-badge ${urlIsValid ? 'valid' : 'invalid'}`}
              role="status"
            >
              {urlIsValid ? '✓ Valid URL' : '⚠ Not a full URL'}
            </span>
          )}
          <button type="button" className="btn" onClick={handleSwap} disabled={!output || !!error}>
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="url-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="url-input">
            {mode === MODES.ENCODE ? 'Text / URL' : 'Encoded URL'}
          </label>
          <textarea
            id="url-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE
                ? 'Type or paste a URL or text to encode…'
                : 'Paste a percent-encoded URL to decode…'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="url-output">
              {mode === MODES.ENCODE ? 'Encoded URL' : 'Text / URL'}
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
            id="url-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {alertMessage && (
        <div className="url-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      <div className="query-params">
        <h3 className="query-params-title">Query Parameters</h3>
        {queryParams.length === 0 ? (
          <p className="query-params-empty">No query parameters detected in the input.</p>
        ) : (
          <table className="query-params-table">
            <thead>
              <tr>
                <th scope="col">Key</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {queryParams.map((param, index) => (
                <tr key={`${param.key}-${index}`}>
                  <td>{param.key}</td>
                  <td>{param.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
