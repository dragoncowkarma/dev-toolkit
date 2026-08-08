import { useEffect, useMemo, useState } from 'react';
import {
  generateAxios,
  generateFetch,
  generateNode,
  parseCurl,
  tokenizeCodeForHighlight,
} from './curlConverter.utils.js';
import './curlConverter.css';

const TARGETS = [
  { id: 'fetch', label: 'JS Fetch', generate: generateFetch },
  { id: 'axios', label: 'Axios', generate: generateAxios },
  { id: 'node', label: 'Node.js', generate: generateNode },
];

const SAMPLES = [
  {
    label: 'GET with headers',
    command: 'curl -X GET "https://api.example.com/users?active=true" \\\n'
      + '  -H "Accept: application/json" \\\n'
      + '  -H "X-Client: dev-toolkit"',
  },
  {
    label: 'POST with JSON payload',
    command: 'curl -X POST "https://api.example.com/users" \\\n'
      + '  -H "Content-Type: application/json" \\\n'
      + '  -d \'{"name":"Ada Lovelace","role":"Engineer"}\'',
  },
  {
    label: 'Bearer token auth',
    command: 'curl "https://api.example.com/account" \\\n'
      + '  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.example-token"',
  },
];

/**
 * Renders a browser-only converter that turns a pasted cURL command into
 * fetch, axios, or Node.js request code.
 *
 * @returns {React.JSX.Element} cURL converter interface.
 */
export default function CurlConverterTool() {
  const [input, setInput] = useState(SAMPLES[1].command);
  const [targetId, setTargetId] = useState('fetch');
  const [copyStatus, setCopyStatus] = useState('');

  const target = TARGETS.find((item) => item.id === targetId) ?? TARGETS[0];

  const result = useMemo(() => {
    if (!input.trim()) return { state: 'empty' };
    try {
      const parsed = parseCurl(input);
      return { state: 'parsed', code: target.generate(parsed) };
    } catch (error) {
      return { state: 'invalid', error: error.message };
    }
  }, [input, target]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timeout = setTimeout(() => setCopyStatus(''), 1500);
    return () => clearTimeout(timeout);
  }, [copyStatus]);

  async function copyOutput() {
    if (result.state !== 'parsed') return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopyStatus('Copied code to clipboard.');
    } catch {
      setCopyStatus('Failed to copy code to clipboard.');
    }
  }

  function loadSample(event) {
    const sample = SAMPLES.find((item) => item.label === event.target.value);
    if (sample) setInput(sample.command);
    event.target.value = '';
  }

  return (
    <section className="curl-tool" aria-label="cURL Converter">
      <header className="curl-tool__intro">
        <p className="curl-tool__eyebrow">Converter</p>
        <h2>cURL Converter</h2>
        <p>Paste a cURL command to generate fetch, axios, or Node.js request code.</p>
      </header>

      <div className="curl-tool__controls">
        <label htmlFor="curl-sample">Sample</label>
        <select
          id="curl-sample"
          aria-label="Load sample cURL command"
          defaultValue=""
          onChange={loadSample}
        >
          <option value="" disabled>Load sample…</option>
          {SAMPLES.map((sample) => (
            <option key={sample.label} value={sample.label}>{sample.label}</option>
          ))}
        </select>

        <div className="curl-tool__targets" role="tablist" aria-label="Target language">
          {TARGETS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === targetId}
              className={
                item.id === targetId ? 'curl-tool__tab curl-tool__tab--active' : 'curl-tool__tab'
              }
              onClick={() => setTargetId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="curl-tool__panes">
        <div className="curl-tool__pane">
          <label htmlFor="curl-input">cURL command</label>
          <textarea
            id="curl-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck="false"
            aria-label="cURL command"
            placeholder="curl https://api.example.com"
          />
        </div>

        <div className="curl-tool__pane">
          <div className="curl-tool__output-label">
            <label htmlFor="curl-output">Generated code</label>
            <button
              type="button"
              onClick={copyOutput}
              disabled={result.state !== 'parsed'}
              aria-label="Copy generated code to clipboard"
            >
              Copy code
            </button>
          </div>
          <pre className="curl-tool__output" id="curl-output" aria-label="Generated code output">
            <code>
              {result.state === 'parsed' && tokenizeCodeForHighlight(result.code).map(
                (token, index) => (
                  token.type === 'plain'
                    ? token.text
                    : (
                      <span
                        key={index}
                        className={`curl-tool__token curl-tool__token--${token.type}`}
                      >
                        {token.text}
                      </span>
                    )
                ),
              )}
            </code>
          </pre>
        </div>
      </div>

      {result.state === 'empty' && (
        <p className="curl-tool__empty">Paste a cURL command to generate request code.</p>
      )}
      {result.state === 'invalid' && (
        <p className="curl-tool__error" role="alert">{result.error}</p>
      )}
      {copyStatus && (
        <p
          className="curl-tool__status"
          role={copyStatus.startsWith('Failed') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {copyStatus}
        </p>
      )}
    </section>
  );
}
