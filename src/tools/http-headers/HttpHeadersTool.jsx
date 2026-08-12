import { useEffect, useMemo, useState } from 'react';
import {
  analyzeHeaders,
  buildNormalizedOutput,
  filterHeaderRows,
  parseHttpHeaders,
} from './httpHeaders.utils.js';
import './httpHeaders.css';

const SAMPLE_REQUEST = [
  'GET /api/widgets?id=42 HTTP/1.1',
  'Host: api.example.com',
  'Accept: application/json',
  'Authorization: Bearer abc123:def456',
  'Cookie: session=abc123; theme=dark',
  'Accept-Language: en-US,en;q=0.9',
  'Accept-Language: fr-FR,fr;q=0.8',
].join('\n');

const SAMPLE_RESPONSE = [
  'HTTP/1.1 200 OK',
  'Content-Type: application/json; charset=utf-8',
  'Cache-Control: no-store',
  'Set-Cookie: session=abc123; Path=/; SameSite=None',
  'Set-Cookie: theme=dark; Path=/; SameSite=Lax; Secure',
  'Access-Control-Allow-Origin: *',
  'Access-Control-Allow-Credentials: true',
].join('\n');

const MODES = [
  ['auto', 'Auto-detect'],
  ['request', 'Request'],
  ['response', 'Response'],
];

const SEVERITY_LABELS = {
  warning: 'Warning',
  high: 'High',
};

/**
 * Renders a local raw HTTP header inspector: parsing, normalization, categorization, and
 * evidence-backed advisories. Nothing entered here leaves the browser.
 *
 * @returns {React.JSX.Element} HTTP Header Inspector interface.
 */
export default function HttpHeadersTool() {
  const [rawInput, setRawInput] = useState('');
  const [mode, setMode] = useState('auto');
  const [query, setQuery] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  const parseResult = useMemo(() => parseHttpHeaders(rawInput, { mode }), [rawInput, mode]);
  const { headers, startLine, error } = parseResult;

  const normalizedOutput = useMemo(
    () => (error ? '' : buildNormalizedOutput(parseResult)),
    [parseResult, error],
  );
  const advisories = useMemo(() => (error ? [] : analyzeHeaders(headers)), [headers, error]);
  const filteredHeaders = useMemo(() => filterHeaderRows(headers, query), [headers, query]);
  const duplicateCount = useMemo(
    () => headers.filter((header) => header.isDuplicate).length,
    [headers],
  );

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(''), 1500);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  function loadSampleRequest() {
    setRawInput(SAMPLE_REQUEST);
    setMode('request');
    setQuery('');
    setCopyStatus('');
  }

  function loadSampleResponse() {
    setRawInput(SAMPLE_RESPONSE);
    setMode('response');
    setQuery('');
    setCopyStatus('');
  }

  function handleClear() {
    setRawInput('');
    setQuery('');
    setCopyStatus('');
  }

  async function handleCopyNormalized() {
    if (!normalizedOutput) return;
    try {
      await navigator.clipboard.writeText(normalizedOutput);
      setCopyStatus('Normalized headers copied to clipboard.');
    } catch {
      setCopyStatus('Unable to copy normalized headers to the clipboard.');
    }
  }

  const summaryText = rawInput.trim() && !error
    ? `${headers.length} ${headers.length === 1 ? 'header' : 'headers'} parsed`
      + `${startLine ? ` (${startLine.type} start line detected)` : ' (no start line)'}`
      + `, ${duplicateCount} duplicate ${duplicateCount === 1 ? 'field' : 'fields'}, `
      + `${advisories.length} ${advisories.length === 1 ? 'advisory' : 'advisories'}.`
    : '';

  return (
    <section className="http-headers" aria-label="HTTP Header Inspector Tool">
      <header className="http-headers__intro">
        <p className="http-headers__eyebrow">Reference</p>
        <h2>HTTP Header Inspector</h2>
        <p>
          Parse a raw request or response header block entirely in your browser, normalize
          duplicate fields, and surface limited, evidence-backed configuration advisories.
        </p>
      </header>

      <div className="http-headers__toolbar">
        <fieldset className="http-headers__mode">
          <legend>Header block type</legend>
          {MODES.map(([value, label]) => (
            <label key={value} className="http-headers__mode-option">
              <input
                type="radio"
                name="http-headers-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="http-headers__actions">
          <button type="button" onClick={loadSampleRequest}>Load sample request</button>
          <button type="button" onClick={loadSampleResponse}>Load sample response</button>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <label className="http-headers__label" htmlFor="http-headers-input">
        Raw header input
      </label>
      <textarea
        id="http-headers-input"
        className="http-headers__input"
        value={rawInput}
        onChange={(event) => setRawInput(event.target.value)}
        placeholder="Paste a raw request or response header block…"
        spellCheck={false}
        aria-label="Raw header input"
      />

      {error && (
        <p className="http-headers__error" role="alert">{error.message}</p>
      )}

      {summaryText && (
        <p className="http-headers__summary" role="status" aria-live="polite">
          {summaryText}
        </p>
      )}

      {!error && headers.length > 0 && (
        <>
          <label className="http-headers__label" htmlFor="http-headers-filter">
            Filter parsed headers
          </label>
          <input
            id="http-headers-filter"
            className="http-headers__filter"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name, value, or category"
            aria-label="Filter parsed headers"
          />

          <div className="http-headers__table-wrap">
            <table className="http-headers__table" aria-label="Parsed header fields">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Value</th>
                  <th scope="col">Category</th>
                  <th scope="col">Duplicate</th>
                </tr>
              </thead>
              <tbody>
                {filteredHeaders.map((header) => (
                  <tr key={`${header.name}-${header.line}`}>
                    <td>{header.name}</td>
                    <td className="http-headers__value-cell">{header.value}</td>
                    <td>{header.category}</td>
                    <td>{header.isDuplicate ? 'Yes' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredHeaders.length === 0 && (
              <p className="http-headers__empty">No parsed headers match your filter.</p>
            )}
          </div>

          {advisories.length > 0 && (
            <section className="http-headers__advisories" aria-label="Header advisories">
              <h3>Advisories</h3>
              <ul>
                {advisories.map((advisory, index) => (
                  <li
                    key={`${advisory.kind}-${index}`}
                    className={
                      `http-headers__advisory http-headers__advisory--${advisory.severity}`
                    }
                  >
                    <span className="http-headers__advisory-badge">
                      {SEVERITY_LABELS[advisory.severity]}
                    </span>
                    <span>{advisory.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="http-headers__output-label">
            <label htmlFor="http-headers-output">Normalized output</label>
            <button type="button" onClick={handleCopyNormalized}>
              Copy normalized
            </button>
          </div>
          <textarea
            id="http-headers-output"
            className="http-headers__output"
            value={normalizedOutput}
            readOnly
            spellCheck={false}
            aria-label="Normalized header output"
          />
        </>
      )}

      {!error && rawInput.trim() && headers.length === 0 && (
        <p className="http-headers__empty">No header fields were found in the input.</p>
      )}

      {copyStatus && (
        <p className="http-headers__copy-status" role="status" aria-live="polite">
          {copyStatus}
        </p>
      )}
    </section>
  );
}
