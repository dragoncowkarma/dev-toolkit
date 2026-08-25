import { useMemo, useState } from 'react';
import {
  formatProperties,
  getDuplicateKeys,
  parseProperties,
  SAMPLE_PROPERTIES,
  toJSON,
} from './propertiesFormatter.utils.js';
import './propertiesFormatter.css';

const VIEW_MODES = {
  PROPERTIES: 'properties',
  JSON: 'json',
};

/**
 * Renders the Properties Formatter tool: client-side parsing, normalization, and
 * inspection of Java `.properties` files, with JSON preview and duplicate-key detection.
 *
 * @returns {React.JSX.Element} The Properties Formatter component.
 */
export default function PropertiesFormatterTool() {
  const [input, setInput] = useState(SAMPLE_PROPERTIES);
  const [viewMode, setViewMode] = useState(VIEW_MODES.PROPERTIES);
  const [copyStatus, setCopyStatus] = useState('');

  const parsed = useMemo(() => parseProperties(input), [input]);
  const hasErrors = parsed.errors.length > 0;

  const normalizedOutput = useMemo(
    () => (hasErrors ? '' : formatProperties(parsed.data)),
    [parsed, hasErrors]
  );
  const jsonOutput = useMemo(
    () => (hasErrors ? '' : toJSON(parsed.data)),
    [parsed, hasErrors]
  );
  const duplicateKeys = useMemo(() => getDuplicateKeys(parsed.entries), [parsed.entries]);

  const output = viewMode === VIEW_MODES.JSON ? jsonOutput : normalizedOutput;

  async function copyText(text, label) {
    if (!text) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(text);
      setCopyStatus(`Copied ${label} to clipboard!`);
    } catch {
      setCopyStatus(`Could not copy ${label} to clipboard.`);
    }
  }

  function handleLoadSample() {
    setInput(SAMPLE_PROPERTIES);
    setCopyStatus('');
  }

  function handleClear() {
    setInput('');
    setCopyStatus('');
  }

  function handleInputChange(event) {
    setInput(event.target.value);
    setCopyStatus('');
  }

  return (
    <section className="properties-tool" aria-label="Properties Formatter Tool">
      <header className="properties-tool__intro">
        <p className="properties-tool__eyebrow">Formatter</p>
        <h2>Properties Formatter</h2>
        <p>Parse, normalize, and inspect Java .properties files with a live JSON preview.</p>
      </header>

      <div className="properties-tool__controls">
        <div className="properties-tool__view-toggle" role="group" aria-label="View mode toggle">
          <button
            type="button"
            className={`properties-tool__toggle-btn ${
              viewMode === VIEW_MODES.PROPERTIES ? 'active' : ''
            }`}
            onClick={() => setViewMode(VIEW_MODES.PROPERTIES)}
            aria-pressed={viewMode === VIEW_MODES.PROPERTIES}
          >
            Normalized Properties
          </button>
          <button
            type="button"
            className={`properties-tool__toggle-btn ${
              viewMode === VIEW_MODES.JSON ? 'active' : ''
            }`}
            onClick={() => setViewMode(VIEW_MODES.JSON)}
            aria-pressed={viewMode === VIEW_MODES.JSON}
          >
            JSON Preview
          </button>
        </div>

        <div className="properties-tool__actions">
          <button type="button" className="properties-tool__btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button type="button" className="properties-tool__btn" onClick={handleClear}>
            Clear
          </button>
          <button
            type="button"
            className="properties-tool__btn properties-tool__btn--primary"
            onClick={() => copyText(normalizedOutput, 'normalized properties')}
            disabled={!normalizedOutput}
          >
            Copy Properties
          </button>
          <button
            type="button"
            className="properties-tool__btn properties-tool__btn--primary"
            onClick={() => copyText(jsonOutput, 'JSON')}
            disabled={!jsonOutput}
          >
            Copy JSON
          </button>
        </div>
      </div>

      <div className="properties-tool__panes">
        <div className="properties-tool__pane">
          <label htmlFor="properties-input">Raw .properties Input</label>
          <textarea
            id="properties-input"
            className="properties-tool__textarea"
            value={input}
            onChange={handleInputChange}
            placeholder="Paste .properties content here..."
            spellCheck="false"
          />
        </div>

        <div className="properties-tool__pane">
          <label htmlFor="properties-output">
            {viewMode === VIEW_MODES.JSON ? 'JSON Output' : 'Normalized Properties Output'}
          </label>
          <textarea
            id="properties-output"
            className="properties-tool__textarea"
            value={output}
            readOnly
            placeholder={
              hasErrors ? 'Fix syntax errors to view output...' : 'Output will appear here...'
            }
            spellCheck="false"
          />
        </div>
      </div>

      {duplicateKeys.length > 0 && (
        <p className="properties-tool__duplicate-notice">
          ⚠ Duplicate keys detected (last value wins): {duplicateKeys.join(', ')}
        </p>
      )}

      {!hasErrors && parsed.entries.length > 0 && (
        <div className="properties-tool__entries">
          <p className="properties-tool__entries-title">Parsed Entries (source order)</p>
          <div className="properties-tool__entries-scroll">
            <table className="properties-tool__entries-table">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Key</th>
                  <th scope="col">Value</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.entries.map((entry, idx) => (
                  <tr key={`${entry.line}-${idx}`}>
                    <td>{entry.line}</td>
                    <td>{entry.key}</td>
                    <td>{entry.value}</td>
                    <td>
                      {entry.duplicate ? (
                        <span className="properties-tool__badge">duplicate</span>
                      ) : (
                        ''
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {copyStatus && (
        <p className="properties-tool__status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      )}

      {hasErrors && (
        <div className="properties-tool__errors" role="alert">
          <p className="properties-tool__errors-title">Syntax Errors Found:</p>
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
