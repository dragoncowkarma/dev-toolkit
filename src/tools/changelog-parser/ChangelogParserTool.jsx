import { useMemo, useRef, useState } from 'react';
import {
  STANDARD_CATEGORIES,
  generateReleaseNotes,
  parseAndValidateChangelog,
} from './changelogParser.utils.js';
import './changelog-parser.css';

/**
 * Renders a client-side Keep a Changelog parser, validator, and release-note exporter.
 * @returns {React.JSX.Element} The changelog parser UI.
 */
export default function ChangelogParserTool() {
  const [markdown, setMarkdown] = useState('');
  const [versionFilter, setVersionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const fileInputRef = useRef(null);
  const parsed = useMemo(() => parseAndValidateChangelog(markdown), [markdown]);

  const filteredReleases = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return parsed.releases.filter((release) => {
      if (versionFilter !== 'all' && release.version !== versionFilter) return false;
      const categories = release.categories.filter((category) => {
        if (categoryFilter !== 'all' && category.name !== categoryFilter) return false;
        return !search || category.items.some((item) => item.toLowerCase().includes(search));
      });
      return categories.length > 0 || (!search && categoryFilter === 'all');
    });
  }, [categoryFilter, parsed.releases, searchTerm, versionFilter]);

  const selectedRelease = parsed.releases.find((release) => release.version === versionFilter)
    ?? parsed.releases[0];
  const releaseNotes = generateReleaseNotes(selectedRelease);

  function handleTextChange(event) {
    setMarkdown(event.target.value);
    setCopyMessage('');
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMarkdown(await file.text());
    setCopyMessage(`Loaded ${file.name}.`);
  }

  async function handleCopy() {
    if (!releaseNotes) return;
    try {
      await navigator.clipboard.writeText(releaseNotes);
      setCopyMessage('Release notes copied to clipboard.');
    } catch {
      setCopyMessage('Unable to copy release notes.');
    }
  }

  function handleClear() {
    setMarkdown('');
    setVersionFilter('all');
    setCategoryFilter('all');
    setSearchTerm('');
    setCopyMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="changelog-parser" aria-label="Changelog Parser Tool">
      <div className="changelog-parser__actions">
        <label className="changelog-parser__button changelog-parser__file-button">
          Load CHANGELOG.md
          <input
            ref={fileInputRef}
            className="changelog-parser__file-input"
            type="file"
            accept=".md,text/markdown,text/plain"
            aria-label="Load a changelog Markdown file"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="changelog-parser__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <label className="changelog-parser__label" htmlFor="changelog-markdown">
        Keep a Changelog Markdown
      </label>
      <textarea
        id="changelog-markdown"
        className="changelog-parser__input"
        value={markdown}
        onChange={handleTextChange}
        placeholder={'# Changelog\n\n## [Unreleased]\n\n### Added\n- New feature'}
        spellCheck={false}
      />

      {markdown && parsed.errors.length > 0 && (
        <div className="changelog-parser__alert" role="alert">
          <h2>Validation errors</h2>
          <ul>{parsed.errors.map((error) => <li key={error}>{error}</li>)}</ul>
        </div>
      )}

      {markdown && parsed.warnings.length > 0 && (
        <div className="changelog-parser__warnings" aria-label="Validation warnings">
          <h2>Warnings</h2>
          <ul>{parsed.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}

      {copyMessage && (
        <div className="sr-only" role="status" aria-live="polite">
          {copyMessage}
        </div>
      )}

      {parsed.releases.length > 0 && (
        <>
          <div className="changelog-parser__filters" aria-label="Release filters">
            <label>
              Version
              <select
                value={versionFilter}
                onChange={(event) => setVersionFilter(event.target.value)}
              >
                <option value="all">All versions</option>
                {parsed.releases.map((release) => (
                  <option key={release.version} value={release.version}>{release.version}</option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {STANDARD_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Search changes
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search release notes"
              />
            </label>
          </div>

          {selectedRelease && (
            <section
              className="changelog-parser__preview"
              aria-labelledby="release-notes-heading"
            >
              <div>
                <h2 id="release-notes-heading">Release notes preview</h2>
                <pre>{releaseNotes}</pre>
              </div>
              <button type="button" className="changelog-parser__button" onClick={handleCopy}>
                Copy release notes
              </button>
            </section>
          )}

          <section aria-labelledby="parsed-releases-heading">
            <h2 id="parsed-releases-heading">Parsed releases</h2>
            {filteredReleases.map((release) => (
              <article className="changelog-parser__release" key={release.version}>
                <h3>
                  {release.version}{release.date && ` - ${release.date}`}
                  {release.yanked && (
                    <span className="changelog-parser__yanked">Yanked</span>
                  )}
                </h3>
                {release.link && <a href={release.link}>View release comparison</a>}
                {release.categories
                  .filter(
                    (category) => categoryFilter === 'all' || category.name === categoryFilter
                  )
                  .map((category) => (
                    <section key={category.name}>
                      <h4>{category.name}</h4>
                      <ul>
                        {category.items
                          .filter((item) => item.toLowerCase().includes(searchTerm.toLowerCase()))
                          .map((item) => <li key={item}>{item}</li>)}
                      </ul>
                    </section>
                  ))}
              </article>
            ))}
            {filteredReleases.length === 0 && <p>No releases match the current filters.</p>}
          </section>
        </>
      )}
    </section>
  );
}
