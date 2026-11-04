import { useMemo, useRef, useState } from 'react';
import {
  createSitemapIndexSample,
  createUrlsetSample,
  validateSitemap,
} from './sitemapValidator.utils.js';
import './sitemapValidator.css';

const EMPTY_REPORT = {
  entries: [],
  entryCount: 0,
  validUrlCount: 0,
  errors: [],
  warnings: [],
};

/**
 * Renders an in-browser XML sitemap validator and entry inspector.
 *
 * @returns {React.JSX.Element} Sitemap validation tool UI.
 */
export default function SitemapValidatorTool() {
  const [xml, setXml] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef(null);
  const report = useMemo(() => (xml ? validateSitemap(xml) : EMPTY_REPORT), [xml]);

  const filteredEntries = useMemo(() => report.entries.filter((entry) => {
    const matchesQuery = entry.loc.toLowerCase().includes(query.trim().toLowerCase());
    const hasIssues = entry.issues.length > 0;
    return matchesQuery && (filter === 'all'
      || (filter === 'valid' && !hasIssues)
      || (filter === 'issues' && hasIssues));
  }), [filter, query, report.entries]);

  function loadSample(sample) {
    setXml(sample);
    setFileError('');
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setFileError('Choose an XML file with a .xml extension.');
      return;
    }
    try {
      setXml(await file.text());
      setFileError('');
    } catch {
      setFileError('The selected XML file could not be read.');
    }
  }

  function clearInput() {
    setXml('');
    setQuery('');
    setFilter('all');
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const errorsCount = report.errors.length;
  const warningsCount = report.warnings.length;

  return (
    <section className="sitemap-validator" aria-label="XML Sitemap Validator">
      <div className="sitemap-validator__toolbar">
        <div className="sitemap-validator__samples" aria-label="Sitemap examples">
          <button
            type="button"
            className="sitemap-validator__button"
            onClick={() => loadSample(createUrlsetSample())}
          >
            Load sitemap sample
          </button>
          <button
            type="button"
            className="sitemap-validator__button"
            onClick={() => loadSample(createSitemapIndexSample())}
          >
            Load index sample
          </button>
        </div>
        <div className="sitemap-validator__actions">
          <label className="sitemap-validator__button sitemap-validator__upload">
            Upload XML
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              onChange={handleFileChange}
              aria-label="Upload XML sitemap file"
            />
          </label>
          <button type="button" className="sitemap-validator__button" onClick={clearInput}>
            Clear
          </button>
        </div>
      </div>

      <label className="sitemap-validator__label" htmlFor="sitemap-xml-input">
        XML sitemap
      </label>
      <textarea
        id="sitemap-xml-input"
        className="sitemap-validator__input"
        value={xml}
        onChange={(event) => setXml(event.target.value)}
        placeholder="Paste a sitemap <urlset> or <sitemapindex> XML document…"
        spellCheck={false}
        aria-describedby="sitemap-input-help"
      />
      <p id="sitemap-input-help" className="sitemap-validator__hint">
        Validation runs locally in your browser as you type.
      </p>

      {(fileError || (xml && errorsCount > 0)) && (
        <div className="sitemap-validator__alert" role="alert">
          {fileError || report.errors[0].message}
        </div>
      )}

      <dl className="sitemap-validator__stats" aria-label="Validation summary">
        <div><dt>Total entries</dt><dd>{report.entryCount}</dd></div>
        <div><dt>Valid URLs</dt><dd>{report.validUrlCount}</dd></div>
        <div><dt>Errors</dt><dd>{errorsCount}</dd></div>
        <div><dt>Warnings</dt><dd>{warningsCount}</dd></div>
      </dl>

      <div className="sitemap-validator__filters">
        <label htmlFor="sitemap-search">Search URLs</label>
        <input
          id="sitemap-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by URL"
        />
        <label htmlFor="sitemap-status-filter">Show</label>
        <select
          id="sitemap-status-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="all">All entries</option>
          <option value="valid">Valid entries</option>
          <option value="issues">Entries with issues</option>
        </select>
      </div>

      <div className="sitemap-validator__table-wrap">
        <table className="sitemap-validator__table">
          <caption className="sr-only">Parsed sitemap entries</caption>
          <thead>
            <tr>
              <th scope="col">URL</th>
              <th scope="col">Last modified</th>
              <th scope="col">Change frequency</th>
              <th scope="col">Priority</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry) => {
              const issueText = entry.issues.map((issue) => issue.message).join(' ');
              return (
                <tr key={`${entry.index}-${entry.loc}`}>
                  <td className="sitemap-validator__url">
                    {entry.loc || 'Missing <loc>'}
                  </td>
                  <td>{entry.lastmod || '—'}</td>
                  <td>{entry.changefreq || '—'}</td>
                  <td>{entry.priority || '—'}</td>
                  <td>
                    <span
                      className={`sitemap-validator__badge ${entry.issues.length
                        ? 'sitemap-validator__badge--issue'
                        : 'sitemap-validator__badge--valid'}`}
                      aria-label={entry.issues.length
                        ? `Issues: ${issueText}`
                        : 'Valid entry'}
                    >
                      {entry.issues.length
                        ? `${entry.issues.length} issue${entry.issues.length === 1 ? '' : 's'}`
                        : 'Valid'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {xml && filteredEntries.length === 0 && (
              <tr>
                <td colSpan="5" className="sitemap-validator__empty">No matching entries.</td>
              </tr>
            )}
            {!xml && (
              <tr>
                <td colSpan="5" className="sitemap-validator__empty">
                  Paste XML or load a sample to inspect entries.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
