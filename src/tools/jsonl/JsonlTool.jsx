import { useEffect, useMemo, useState } from 'react';
import { jsonArrayToJsonl, jsonlToJsonArray } from './jsonl.utils.js';
import './jsonl.css';

const DIRECTIONS = {
  JSONL_TO_ARRAY: 'jsonl-to-array',
  ARRAY_TO_JSONL: 'array-to-jsonl',
};

const JSONL_SAMPLE = `{"event":"started","id":1}
{"event":"updated","id":2,"active":true}
{"event":"finished","id":3}`;

const JSON_ARRAY_SAMPLE = `[
  {"event":"started","id":1},
  {"event":"updated","id":2,"active":true},
  {"event":"finished","id":3}
]`;

function labelsFor(direction) {
  return direction === DIRECTIONS.JSONL_TO_ARRAY
    ? { input: 'JSON Lines input', output: 'Formatted JSON array' }
    : { input: 'JSON array input', output: 'JSON Lines output' };
}

function fileDetailsFor(direction) {
  return direction === DIRECTIONS.JSONL_TO_ARRAY
    ? { filename: 'jsonl-array.json', type: 'application/json' }
    : { filename: 'converted.jsonl', type: 'application/x-ndjson' };
}

/**
 * Renders a client-side formatter and converter for newline-delimited JSON.
 *
 * @returns {React.JSX.Element} JSON Lines utility interface.
 */
export default function JsonlTool() {
  const [direction, setDirection] = useState(DIRECTIONS.JSONL_TO_ARRAY);
  const [input, setInput] = useState(JSONL_SAMPLE);
  const [copyStatus, setCopyStatus] = useState('');

  const result = useMemo(() => {
    if (!input.trim()) {
      return {
        output: '',
        errors: [],
        stats: { totalLines: 0, validLines: 0, invalidLines: 0, parsedObjects: 0 },
      };
    }

    try {
      return direction === DIRECTIONS.JSONL_TO_ARRAY
        ? jsonlToJsonArray(input)
        : { ...jsonArrayToJsonl(input), errors: [] };
    } catch (error) {
      return {
        output: '',
        errors: [{ line: null, content: '', reason: error.message }],
        stats: { totalLines: 0, validLines: 0, invalidLines: 1, parsedObjects: 0 },
      };
    }
  }, [direction, input]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = window.setTimeout(() => setCopyStatus(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const labels = labelsFor(direction);
  const canUseOutput = Boolean(input.trim()) && result.errors.every((error) => error.line);

  function changeDirection(nextDirection) {
    if (nextDirection === direction) return;
    setDirection(nextDirection);
    setInput(nextDirection === DIRECTIONS.JSONL_TO_ARRAY ? JSONL_SAMPLE : JSON_ARRAY_SAMPLE);
    setCopyStatus('');
  }

  function loadSample() {
    setInput(direction === DIRECTIONS.JSONL_TO_ARRAY ? JSONL_SAMPLE : JSON_ARRAY_SAMPLE);
    setCopyStatus('');
  }

  async function copyOutput() {
    if (!canUseOutput) return;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(result.output);
      setCopyStatus('Copied output to clipboard.');
    } catch {
      setCopyStatus('Could not copy output to clipboard.');
    }
  }

  function downloadOutput() {
    if (!canUseOutput) return;

    const details = fileDetailsFor(direction);
    const blob = new Blob([result.output], { type: details.type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = details.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="jsonl-tool" aria-label="JSON Lines Formatter">
      <header className="jsonl-tool__intro">
        <p className="jsonl-tool__eyebrow">Formatter</p>
        <h2>JSON Lines Formatter</h2>
        <p>Validate JSONL record by record, then convert it to or from a JSON array.</p>
      </header>

      <div className="jsonl-tool__controls">
        <div className="jsonl-tool__mode" role="group" aria-label="Conversion direction">
          <button
            type="button"
            aria-pressed={direction === DIRECTIONS.JSONL_TO_ARRAY}
            className={direction === DIRECTIONS.JSONL_TO_ARRAY ? 'is-active' : ''}
            onClick={() => changeDirection(DIRECTIONS.JSONL_TO_ARRAY)}
          >
            JSONL to array
          </button>
          <button
            type="button"
            aria-pressed={direction === DIRECTIONS.ARRAY_TO_JSONL}
            className={direction === DIRECTIONS.ARRAY_TO_JSONL ? 'is-active' : ''}
            onClick={() => changeDirection(DIRECTIONS.ARRAY_TO_JSONL)}
          >
            Array to JSONL
          </button>
        </div>

        <div className="jsonl-tool__actions">
          <button type="button" onClick={loadSample}>Load sample</button>
          <button
            type="button"
            onClick={() => {
              setInput('');
              setCopyStatus('');
            }}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="jsonl-tool__panes">
        <div className="jsonl-tool__pane">
          <label htmlFor="jsonl-input">{labels.input}</label>
          <textarea
            id="jsonl-input"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCopyStatus('');
            }}
            placeholder={`Paste ${labels.input.toLowerCase()} here...`}
            spellCheck="false"
          />
        </div>

        <div className="jsonl-tool__pane jsonl-tool__pane--output">
          <div className="jsonl-tool__output-heading">
            <label htmlFor="jsonl-output">{labels.output}</label>
            <div>
              <button type="button" onClick={copyOutput} disabled={!canUseOutput}>
                Copy
              </button>
              <button type="button" onClick={downloadOutput} disabled={!canUseOutput}>
                Download
              </button>
            </div>
          </div>
          <textarea
            id="jsonl-output"
            value={result.output}
            readOnly
            placeholder="Converted result appears here..."
            spellCheck="false"
          />
        </div>
      </div>

      <dl className="jsonl-tool__statistics" aria-label="Stream statistics">
        <div><dt>Total lines</dt><dd>{result.stats.totalLines}</dd></div>
        <div><dt>Valid JSON lines</dt><dd>{result.stats.validLines}</dd></div>
        <div><dt>Invalid lines</dt><dd>{result.stats.invalidLines}</dd></div>
        <div><dt>Parsed objects</dt><dd>{result.stats.parsedObjects}</dd></div>
      </dl>

      {result.errors.length > 0 && (
        <section className="jsonl-tool__errors" aria-label="Input diagnostics" role="alert">
          <strong>
            {direction === DIRECTIONS.JSONL_TO_ARRAY
              ? 'Invalid lines were excluded from the converted array.'
              : 'The JSON array could not be converted.'}
          </strong>
          <ul>
            {result.errors.map((error, index) => (
              <li key={`${error.line ?? 'input'}-${index}`}>
                {error.line ? `Line ${error.line}: ` : ''}{error.reason}
                {error.content && <code>{error.content}</code>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {copyStatus && (
        <p
          className="jsonl-tool__status"
          role={copyStatus.startsWith('Could not') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copyStatus}
        </p>
      )}
    </section>
  );
}
