import { useMemo, useState } from 'react';
import { getFilteredHttpStatuses } from './httpStatus.utils.js';
import './httpStatus.css';

const CLASS_FILTERS = ['all', '1xx', '2xx', '3xx', '4xx', '5xx'];

/** Renders a searchable reference of standard HTTP status codes. */
export default function HttpStatusTool() {
  const [query, setQuery] = useState('');
  const [statusClass, setStatusClass] = useState('all');
  const [copyStatus, setCopyStatus] = useState('');
  const statuses = useMemo(
    () => getFilteredHttpStatuses(query, statusClass),
    [query, statusClass],
  );

  async function copyCode(code) {
    try {
      await navigator.clipboard.writeText(String(code));
      setCopyStatus(`${code} copied to clipboard.`);
    } catch {
      setCopyStatus(`Unable to copy ${code} to the clipboard.`);
    }
  }

  return (
    <section className="http-status" aria-labelledby="http-status-title">
      <div className="http-status__intro">
        <p className="http-status__eyebrow">Reference</p>
        <h2 id="http-status-title">HTTP Status Code Reference</h2>
        <p>Search standard HTTP response codes, reason phrases, and concise explanations.</p>
      </div>
      <div className="http-status__controls">
        <label className="http-status__search-label" htmlFor="http-status-search">
          Search status codes
        </label>
        <input
          id="http-status-search"
          className="http-status__search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try 404 or not found"
          aria-label="Search HTTP status codes"
        />
        <div className="http-status__filters" aria-label="HTTP status class filters">
          {CLASS_FILTERS.map((filter) => (
            <button
              className="http-status__filter"
              type="button"
              key={filter}
              aria-pressed={statusClass === filter}
              onClick={() => setStatusClass(filter)}
            >
              {filter === 'all' ? 'All' : filter}
            </button>
          ))}
        </div>
      </div>
      <p className="http-status__result-count" role="status" aria-live="polite">
        {statuses.length} {statuses.length === 1 ? 'status code' : 'status codes'} found.
      </p>
      {statuses.length ? (
        <ul className="http-status__list" aria-label="Matching HTTP status codes">
          {statuses.map(({ code, reason, description }) => (
            <li className="http-status__item" key={code}>
              <div className="http-status__code">{code}</div>
              <div className="http-status__details">
                <h3>{reason}</h3>
                <p>{description}</p>
              </div>
              <button
                className="http-status__copy"
                type="button"
                onClick={() => copyCode(code)}
                aria-label={`Copy status code ${code}`}
              >
                Copy code
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="http-status__empty">No HTTP status codes match your search.</p>
      )}
      <p className="http-status__copy-status" role="status" aria-live="polite">
        {copyStatus}
      </p>
    </section>
  );
}
