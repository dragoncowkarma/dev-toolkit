import { useMemo, useState } from 'react';
import { evaluateJsonPathInput } from './jsonpath.utils.js';
import './jsonpath.css';

const SAMPLE_JSON = `{
  "store": {
    "book": [
      { "title": "Sayings of the Century", "author": "Nigel Rees", "price": 8.95 },
      { "title": "Sword of Honour", "author": "Evelyn Waugh", "price": 12.99 },
      { "title": "Moby Dick", "author": "Herman Melville", "price": 8.99 }
    ],
    "bicycle": { "color": "red", "price": 19.95 }
  }
}`;

const SAMPLE_EXPRESSION = '$.store.book[?(@.price < 10)].author';

function matchCountLabel(count) {
  if (count === 0) return 'No matches found';
  return `${count} ${count === 1 ? 'match' : 'matches'} found`;
}

/** Renders a safe, dependency-free JSONPath evaluator for JSON documents. */
export default function JsonPathTool() {
  const [jsonInput, setJsonInput] = useState('');
  const [expression, setExpression] = useState('');
  const [sampleLoaded, setSampleLoaded] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  const result = useMemo(
    () => evaluateJsonPathInput(jsonInput, expression),
    [expression, jsonInput],
  );

  function updateJsonInput(event) {
    setJsonInput(event.target.value);
    setSampleLoaded(false);
    setCopyStatus('');
  }

  function updateExpression(event) {
    setExpression(event.target.value);
    setSampleLoaded(false);
    setCopyStatus('');
  }

  function loadSample() {
    setJsonInput(SAMPLE_JSON);
    setExpression(SAMPLE_EXPRESSION);
    setSampleLoaded(true);
    setCopyStatus('');
  }

  function clearInputs() {
    setJsonInput('');
    setExpression('');
    setSampleLoaded(false);
    setCopyStatus('');
  }

  async function copyOutput() {
    if (!result.ready || !result.output) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API is unavailable.');
      await navigator.clipboard.writeText(result.output);
      setCopyStatus('Output copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy output to clipboard.');
    }
  }

  return (
    <section className="jsonpath-tool" aria-labelledby="jsonpath-tool-title">
      <header className="jsonpath-tool__intro">
        <p className="jsonpath-tool__eyebrow">JSON</p>
        <h2 id="jsonpath-tool-title">JSONPath Evaluator</h2>
        <p>Evaluate JSONPath queries and extract matching JSON nodes in document order.</p>
      </header>

      <div className="jsonpath-tool__controls" aria-label="JSONPath controls">
        <button
          type="button"
          onClick={loadSample}
          aria-pressed={sampleLoaded}
          aria-label="Load sample JSON and JSONPath"
        >
          Load sample
        </button>
        <button
          type="button"
          onClick={clearInputs}
          aria-label="Clear JSON input and JSONPath expression"
        >
          Clear inputs
        </button>
      </div>

      <div className="jsonpath-tool__panes">
        <div className="jsonpath-tool__pane">
          <label htmlFor="jsonpath-json-input">JSON input</label>
          <textarea
            id="jsonpath-json-input"
            value={jsonInput}
            onChange={updateJsonInput}
            aria-label="JSON input"
            placeholder="Paste or type JSON to query"
            spellCheck="false"
          />
        </div>

        <div className="jsonpath-tool__pane jsonpath-tool__pane--query">
          <label htmlFor="jsonpath-expression">JSONPath expression</label>
          <input
            id="jsonpath-expression"
            type="text"
            value={expression}
            onChange={updateExpression}
            aria-label="JSONPath expression"
            placeholder="$.store.book[*].author"
            spellCheck="false"
          />
          <p className="jsonpath-tool__hint">
            Try dot or bracket selectors, `*`, slices, `..`, and filters such as
            {' '}<code>[?(@.price &lt; 10)]</code>.
          </p>
        </div>

        <div className="jsonpath-tool__pane">
          <div className="jsonpath-tool__output-heading">
            <label htmlFor="jsonpath-output">JSONPath output</label>
            <button
              type="button"
              onClick={copyOutput}
              disabled={!result.ready || !result.output}
              aria-label="Copy output to clipboard"
            >
              Copy output
            </button>
          </div>
          <textarea
            id="jsonpath-output"
            value={result.output}
            readOnly
            aria-label="JSONPath output"
            placeholder="Matching nodes will appear here"
            spellCheck="false"
          />
          {result.ready && (
            <p className="jsonpath-tool__match-count" role="status" aria-live="polite">
              {matchCountLabel(result.count)}
            </p>
          )}
        </div>
      </div>

      {result.error && <p className="jsonpath-tool__error" role="alert">{result.error}</p>}
      {copyStatus && (
        <p className="jsonpath-tool__copy-status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      )}
    </section>
  );
}
