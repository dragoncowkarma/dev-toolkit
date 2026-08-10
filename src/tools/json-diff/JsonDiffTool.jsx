import { useMemo, useState } from 'react';
import { compareJsonInputs } from './jsonDiff.utils.js';
import './jsonDiff.css';

const SAMPLE_ORIGINAL = `{
  "name": "dev-toolkit",
  "version": 1,
  "features": ["format", "query"],
  "settings": { "theme": "dark", "compact": false }
}`;

const SAMPLE_CHANGED = `{
  "name": "dev-toolkit",
  "version": 2,
  "features": ["format", "compare", "export"],
  "settings": { "theme": "dark" },
  "stable": true
}`;

function formatValue(value) {
  return JSON.stringify(value, null, 2);
}

function summaryLabel(changes) {
  const counts = { added: 0, removed: 0, changed: 0 };
  changes.forEach((change) => { counts[change.type] += 1; });
  return `${counts.added} added, ${counts.removed} removed, ${counts.changed} changed`;
}

/** Renders a structural, path-based comparison for two JSON documents. */
export default function JsonDiffTool() {
  const [originalInput, setOriginalInput] = useState('');
  const [changedInput, setChangedInput] = useState('');
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const result = useMemo(
    () => compareJsonInputs(originalInput, changedInput),
    [changedInput, originalInput],
  );

  function updateInput(setter) {
    return (event) => {
      setter(event.target.value);
      setSampleLoaded(false);
      setCopyStatus('');
    };
  }

  function loadSample() {
    setOriginalInput(SAMPLE_ORIGINAL);
    setChangedInput(SAMPLE_CHANGED);
    setSampleLoaded(true);
    setCopyStatus('');
  }

  function clearInputs() {
    setOriginalInput('');
    setChangedInput('');
    setSampleLoaded(false);
    setCopyStatus('');
  }

  async function copyResult() {
    if (!result.ready || result.changes.length === 0) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(JSON.stringify(result.changes, null, 2));
      setCopyStatus('Diff result copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy diff result to clipboard.');
    }
  }

  return (
    <section className="json-diff-tool" aria-labelledby="json-diff-title">
      <header className="json-diff-tool__intro">
        <p className="json-diff-tool__eyebrow">JSON</p>
        <h2 id="json-diff-title">JSON Diff</h2>
        <p>Compare parsed JSON structures without whitespace or object key-order noise.</p>
      </header>

      <div className="json-diff-tool__controls" aria-label="JSON diff controls">
        <button type="button" onClick={loadSample} aria-pressed={sampleLoaded}>
          Load sample
        </button>
        <button type="button" onClick={clearInputs}>Clear inputs</button>
      </div>

      <div className="json-diff-tool__inputs">
        <div className="json-diff-tool__pane">
          <label htmlFor="json-diff-original">Original JSON</label>
          <textarea
            id="json-diff-original"
            value={originalInput}
            onChange={updateInput(setOriginalInput)}
            placeholder="Paste the original JSON document"
            spellCheck="false"
          />
        </div>
        <div className="json-diff-tool__pane">
          <label htmlFor="json-diff-changed">Changed JSON</label>
          <textarea
            id="json-diff-changed"
            value={changedInput}
            onChange={updateInput(setChangedInput)}
            placeholder="Paste the changed JSON document"
            spellCheck="false"
          />
        </div>
      </div>

      {result.errors.map((error) => (
        <p className="json-diff-tool__error" role="alert" key={error.side}>
          Invalid {error.side} JSON: {error.message}
        </p>
      ))}

      {result.ready && (
        <section className="json-diff-tool__results" aria-labelledby="json-diff-results-title">
          <div className="json-diff-tool__results-heading">
            <h3 id="json-diff-results-title">Changes</h3>
            <button
              type="button"
              onClick={copyResult}
              disabled={result.changes.length === 0}
              aria-label="Copy diff result to clipboard"
            >
              Copy result
            </button>
          </div>
          <p className="json-diff-tool__summary" role="status" aria-live="polite">
            {summaryLabel(result.changes)}
          </p>
          {result.changes.length === 0 ? (
            <p className="json-diff-tool__empty">The JSON documents are structurally equal.</p>
          ) : (
            <ol className="json-diff-tool__change-list">
              {result.changes.map((change) => (
                <li className={`json-diff-tool__change json-diff-tool__change--${change.type}`}
                  key={`${change.type}-${change.path}`}>
                  <div className="json-diff-tool__change-heading">
                    <code>{change.path}</code>
                    <span>{change.type}</span>
                  </div>
                  <div className="json-diff-tool__values">
                    {Object.hasOwn(change, 'oldValue') && (
                      <div><strong>Old value</strong><pre>{formatValue(change.oldValue)}</pre></div>
                    )}
                    {Object.hasOwn(change, 'newValue') && (
                      <div><strong>New value</strong><pre>{formatValue(change.newValue)}</pre></div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {copyStatus && (
        <p className="json-diff-tool__copy-status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      )}
    </section>
  );
}
