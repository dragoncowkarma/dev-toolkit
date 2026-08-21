import { useEffect, useState } from 'react';
import './urlQuery.css';
import {
  buildUrlOrQuery,
  detectDuplicates,
  parseUrlOrQuery,
} from './urlQuery.utils.js';

/**
 * Renders the URL Query Inspector tool for parsing, editing, and reconstructing
 * URL query parameters and inspecting URL components.
 *
 * @returns {React.JSX.Element} The URL Query Inspector component.
 */
export default function UrlQueryTool() {
  const [input, setInput] = useState('');
  const [parseState, setParseState] = useState(() => parseUrlOrQuery(''));
  const [copiedId, setCopiedId] = useState(null);
  const [copyError, setCopyError] = useState('');

  // Re-parse input whenever raw input string changes
  useEffect(() => {
    const res = parseUrlOrQuery(input);
    setParseState(res);
  }, [input]);

  // Reset copy status feedback after 1.5 seconds
  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(timer);
  }, [copiedId]);

  function handleInputChange(e) {
    setInput(e.target.value);
    setCopyError('');
  }

  function handleClear() {
    setInput('');
    setCopyError('');
    setCopiedId(null);
  }

  function updateParams(newParams) {
    const updatedParams = detectDuplicates(newParams);
    const newNormalized = buildUrlOrQuery({
      isFullUrl: parseState.isFullUrl,
      baseUrl: input,
      hasLeadingQuestionMark: parseState.hasLeadingQuestionMark,
      params: updatedParams,
    });
    setInput(newNormalized);
    setCopyError('');
  }

  function handleKeyChange(index, newKey) {
    const newParams = parseState.params.map((p, i) =>
      i === index ? { ...p, key: newKey } : p
    );
    updateParams(newParams);
  }

  function handleValueChange(index, newValue) {
    const newParams = parseState.params.map((p, i) =>
      i === index ? { ...p, value: newValue } : p
    );
    updateParams(newParams);
  }

  function handleAddParam() {
    const newParam = {
      id: `param-${Date.now()}-${Math.random()}`,
      key: '',
      value: '',
    };
    const newParams = [...parseState.params, newParam];
    updateParams(newParams);
  }

  function handleRemoveParam(index) {
    const newParams = parseState.params.filter((_, i) => i !== index);
    updateParams(newParams);
  }

  async function handleCopy(text, id) {
    if (!text && text !== '') return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      setCopiedId(id);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const { isValid, isFullUrl, urlParts, params, normalizedUrl, error } = parseState;
  const alertMessage = error || copyError;

  return (
    <section className="url-query-tool" aria-label="URL Query Inspector Tool">
      <div className="url-query-header">
        <div className="url-query-title-row">
          <h2 className="url-query-title">URL Query Inspector</h2>
          {input.trim() !== '' && isValid && (
            <span className="badge badge-info" role="status">
              {isFullUrl ? 'Full URL' : 'Query String'}
            </span>
          )}
        </div>
        <div className="url-query-actions">
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <label className="panel-label" htmlFor="url-query-input">
            URL or Query String Input
          </label>
        </div>
        <textarea
          id="url-query-input"
          className="panel-textarea"
          placeholder="Paste an absolute URL (e.g. https://example.com/search?q=test&page=1) or a query string (e.g. ?foo=bar&baz=qux&foo=123)..."
          value={input}
          onChange={handleInputChange}
          spellCheck={false}
          aria-label="URL or query string input"
        />
      </div>

      {alertMessage && (
        <div className="url-query-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {isValid && isFullUrl && urlParts && (
        <div className="panel">
          <span className="panel-label">URL Components</span>
          <div className="components-grid">
            <div className="component-card">
              <span className="component-title">Origin</span>
              <span className="component-value">{urlParts.origin || '(none)'}</span>
            </div>
            <div className="component-card">
              <span className="component-title">Pathname</span>
              <span className="component-value">{urlParts.pathname || '(none)'}</span>
            </div>
            <div className="component-card">
              <span className="component-title">Hash</span>
              <span className="component-value">{urlParts.hash || '(none)'}</span>
            </div>
          </div>
        </div>
      )}

      {isValid && (
        <div className="panel">
          <div className="panel-header">
            <span className="panel-label">
              Query Parameters ({params.length})
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleAddParam}
              aria-label="Add new query parameter"
            >
              + Add Parameter
            </button>
          </div>

          {params.length === 0 ? (
            <p className="url-query-empty">No query parameters detected.</p>
          ) : (
            <div className="table-container">
              <table className="url-query-table">
                <thead>
                  <tr>
                    <th scope="col" className="table-index">#</th>
                    <th scope="col">Key</th>
                    <th scope="col">Value</th>
                    <th scope="col">Status</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((param, index) => (
                    <tr key={param.id || index}>
                      <td className="table-index">{index + 1}</td>
                      <td>
                        <input
                          type="text"
                          className="param-input"
                          value={param.key}
                          onChange={(e) => handleKeyChange(index, e.target.value)}
                          aria-label={`Parameter ${index + 1} key`}
                          placeholder="Key"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="param-input"
                          value={param.value}
                          onChange={(e) => handleValueChange(index, e.target.value)}
                          aria-label={`Parameter ${index + 1} value`}
                          placeholder="Value"
                        />
                      </td>
                      <td>
                        {param.isDuplicate ? (
                          <span className="badge badge-duplicate" title="Duplicate key">
                            Duplicate
                          </span>
                        ) : (
                          <span className="badge badge-unique">Unique</span>
                        )}
                      </td>
                      <td>
                        <div className="param-actions">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleCopy(param.value, `param-val-${index}`)}
                            aria-label={`Copy value for parameter ${index + 1}`}
                          >
                            {copiedId === `param-val-${index}` ? '✓ Copied' : 'Copy Value'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleRemoveParam(index)}
                            aria-label={`Remove parameter ${index + 1}`}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isValid && (
        <div className="panel">
          <div className="panel-header">
            <label className="panel-label" htmlFor="normalized-url-result">
              Normalized Result
            </label>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => handleCopy(normalizedUrl, 'normalized')}
              disabled={!normalizedUrl}
              aria-label="Copy normalized URL"
            >
              {copiedId === 'normalized' ? '✓ Copied' : 'Copy Result'}
            </button>
          </div>
          <textarea
            id="normalized-url-result"
            className="panel-textarea"
            value={normalizedUrl}
            readOnly
            placeholder="Normalized URL or query string will appear here..."
            spellCheck={false}
            aria-label="Normalized URL result"
          />
        </div>
      )}
    </section>
  );
}
