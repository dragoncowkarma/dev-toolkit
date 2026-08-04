import { useEffect, useMemo, useState } from 'react';
import { csvToJson, jsonToCsv } from './csv.utils.js';
import './csv.css';

const CSV_SAMPLE = `name,team,note
Ada,Platform,"Ships fast, tests faster"
Lin,Data,Ready`;
const JSON_SAMPLE = JSON.stringify([
  { name: 'Ada', team: 'Platform' },
  { name: 'Lin', team: 'Data', note: 'Uses commas, safely' },
], null, 2);

const DIRECTIONS = {
  CSV_TO_JSON: 'csv-to-json',
  JSON_TO_CSV: 'json-to-csv',
};

const DELIMITER_OPTIONS = [
  ['auto', 'Auto-detect'],
  [',', 'Comma (,)'],
  ['\t', 'Tab'],
  [';', 'Semicolon (;)'],
  ['|', 'Pipe (|)'],
];

function inputLabel(direction) {
  return direction === DIRECTIONS.CSV_TO_JSON ? 'CSV input' : 'JSON input';
}

function outputLabel(direction) {
  return direction === DIRECTIONS.CSV_TO_JSON ? 'JSON output' : 'CSV output';
}

/** Renders a real-time, accessible converter between CSV and JSON object arrays. */
export default function CsvTool() {
  const [direction, setDirection] = useState(DIRECTIONS.CSV_TO_JSON);
  const [input, setInput] = useState(CSV_SAMPLE);
  const [delimiter, setDelimiter] = useState('auto');
  const [hasHeader, setHasHeader] = useState(true);
  const [copyStatus, setCopyStatus] = useState('');

  const result = useMemo(() => {
    try {
      const output = direction === DIRECTIONS.CSV_TO_JSON
        ? JSON.stringify(csvToJson(input, { delimiter, hasHeader }), null, 2)
        : jsonToCsv(input, { delimiter: delimiter === 'auto' ? ',' : delimiter });
      return { output, error: '' };
    } catch (error) {
      return { output: '', error: error.message };
    }
  }, [delimiter, direction, hasHeader, input]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(''), 1500);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  function swapDirection() {
    setDirection((current) => current === DIRECTIONS.CSV_TO_JSON
      ? DIRECTIONS.JSON_TO_CSV
      : DIRECTIONS.CSV_TO_JSON);
    setDelimiter((current) => current === 'auto' ? ',' : current);
    setInput(result.error ? '' : result.output);
    setCopyStatus('');
  }

  function loadSample() {
    setInput(direction === DIRECTIONS.CSV_TO_JSON ? CSV_SAMPLE : JSON_SAMPLE);
    setCopyStatus('');
  }

  async function copyOutput() {
    if (result.error || !result.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopyStatus('Copied output to clipboard.');
    } catch {
      setCopyStatus('Failed to copy output to clipboard.');
    }
  }

  const inputId = 'csv-converter-input';
  const outputId = 'csv-converter-output';
  const csvInput = direction === DIRECTIONS.CSV_TO_JSON;

  return (
    <section className="csv-tool" aria-label="CSV Converter">
      <header className="csv-tool__intro">
        <p className="csv-tool__eyebrow">Converter</p>
        <h2>CSV Converter</h2>
        <p>Convert RFC 4180 CSV and JSON object arrays in real time.</p>
      </header>

      <div className="csv-tool__controls">
        <label htmlFor="csv-delimiter">Delimiter</label>
        <select
          id="csv-delimiter"
          value={delimiter}
          onChange={(event) => setDelimiter(event.target.value)}
          aria-label="CSV delimiter"
        >
          {DELIMITER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value} disabled={!csvInput && value === 'auto'}>
              {label}
            </option>
          ))}
        </select>
        {csvInput && (
          <label className="csv-tool__checkbox" htmlFor="csv-has-header">
            <input
              id="csv-has-header"
              type="checkbox"
              checked={hasHeader}
              onChange={(event) => setHasHeader(event.target.checked)}
            />
            Use first row as headers
          </label>
        )}
        <button type="button" onClick={loadSample}>Load sample</button>
      </div>

      <div className="csv-tool__panes">
        <div className="csv-tool__pane">
          <label htmlFor={inputId}>{inputLabel(direction)}</label>
          <textarea
            id={inputId}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCopyStatus('');
            }}
            spellCheck="false"
            aria-label={inputLabel(direction)}
          />
        </div>
        <div className="csv-tool__swap-wrap">
          <button
            type="button"
            className="csv-tool__swap"
            onClick={swapDirection}
            aria-label="Swap conversion direction"
            title="Swap conversion direction"
          >
            ⇄
          </button>
        </div>
        <div className="csv-tool__pane">
          <div className="csv-tool__output-label">
            <label htmlFor={outputId}>{outputLabel(direction)}</label>
            <button
              type="button"
              onClick={copyOutput}
              disabled={Boolean(result.error || !result.output)}
              aria-label="Copy output to clipboard"
            >
              Copy output
            </button>
          </div>
          <textarea
            id={outputId}
            value={result.output}
            readOnly
            spellCheck="false"
            aria-label={outputLabel(direction)}
          />
        </div>
      </div>

      {result.error && <p className="csv-tool__error" role="alert">{result.error}</p>}
      {copyStatus && (
        <p className="csv-tool__status" role={copyStatus.startsWith('Failed') ? 'alert' : 'status'}
          aria-live="polite">
          {copyStatus}
        </p>
      )}
    </section>
  );
}
