import { useMemo, useState } from 'react';
import {
  formatIni,
  parseIni,
  SAMPLE_INI,
  toJSON,
} from './iniFormatter.utils.js';
import './iniFormatter.css';

const VIEW_MODES = {
  INI: 'ini',
  JSON: 'json',
};

/**
 * Renders the INI Formatter tool for client-side INI parsing, formatting, and JSON preview.
 *
 * @returns {React.JSX.Element} The INI Formatter component.
 */
export default function IniFormatterTool() {
  const [input, setInput] = useState(SAMPLE_INI);
  const [viewMode, setViewMode] = useState(VIEW_MODES.INI);
  const [copyStatus, setCopyStatus] = useState('');

  const parsed = useMemo(() => parseIni(input), [input]);

  const output = useMemo(() => {
    if (parsed.errors.length > 0) {
      return '';
    }
    if (viewMode === VIEW_MODES.JSON) {
      return toJSON(parsed.data);
    }
    return formatIni(parsed.data);
  }, [parsed, viewMode]);

  async function handleCopy() {
    if (!output) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(output);
      setCopyStatus('Copied output to clipboard!');
    } catch {
      setCopyStatus('Could not copy output to clipboard.');
    }
  }

  function handleLoadSample() {
    setInput(SAMPLE_INI);
    setCopyStatus('');
  }

  function handleClear() {
    setInput('');
    setCopyStatus('');
  }

  return (
    <section className="ini-tool" aria-label="INI Formatter Tool">
      <header className="ini-tool__intro">
        <p className="ini-tool__eyebrow">Formatter</p>
        <h2>INI Formatter</h2>
        <p>Parse, format, and convert INI configuration files with live JSON preview.</p>
      </header>

      <div className="ini-tool__controls">
        <div className="ini-tool__view-toggle" role="group" aria-label="View mode toggle">
          <button
            type="button"
            className={`ini-tool__toggle-btn ${viewMode === VIEW_MODES.INI ? 'active' : ''}`}
            onClick={() => setViewMode(VIEW_MODES.INI)}
            aria-pressed={viewMode === VIEW_MODES.INI}
          >
            Formatted INI
          </button>
          <button
            type="button"
            className={`ini-tool__toggle-btn ${viewMode === VIEW_MODES.JSON ? 'active' : ''}`}
            onClick={() => setViewMode(VIEW_MODES.JSON)}
            aria-pressed={viewMode === VIEW_MODES.JSON}
          >
            JSON Preview
          </button>
        </div>

        <div className="ini-tool__actions">
          <button type="button" className="ini-tool__btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button type="button" className="ini-tool__btn" onClick={handleClear}>
            Clear
          </button>
          <button
            type="button"
            className="ini-tool__btn ini-tool__btn--primary"
            onClick={handleCopy}
            disabled={!output}
          >
            Copy Output
          </button>
        </div>
      </div>

      <div className="ini-tool__panes">
        <div className="ini-tool__pane">
          <label htmlFor="ini-input">Raw INI Input</label>
          <textarea
            id="ini-input"
            className="ini-tool__textarea"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCopyStatus('');
            }}
            placeholder="Paste INI content here..."
            spellCheck="false"
          />
        </div>

        <div className="ini-tool__pane">
          <label htmlFor="ini-output">
            {viewMode === VIEW_MODES.JSON ? 'JSON Output' : 'Formatted INI Output'}
          </label>
          <textarea
            id="ini-output"
            className="ini-tool__textarea"
            value={output}
            readOnly
            placeholder={
              parsed.errors.length > 0
                ? 'Fix syntax errors to view output...'
                : 'Formatted output will appear here...'
            }
            spellCheck="false"
          />
        </div>
      </div>

      {copyStatus && (
        <p className="ini-tool__status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      )}

      {parsed.errors.length > 0 && (
        <div className="ini-tool__errors" role="alert">
          <p className="ini-tool__errors-title">Syntax Errors Found:</p>
          <ul>
            {parsed.errors.map((error, idx) => (
              <li key={`${error.line}-${idx}`}>
                Line {error.line}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
