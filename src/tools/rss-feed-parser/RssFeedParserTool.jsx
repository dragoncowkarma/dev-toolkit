import { useRef, useState } from 'react';
import { parseFeedXml, readFeedFile } from './rssFeedParser.utils.js';
import './rssFeedParser.css';

/**
 * Renders an in-browser RSS 2.0 and Atom 1.0 parser and validator.
 * @returns {React.JSX.Element}
 */
export default function RssFeedParserTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState({ feed: null, errors: [] });
  const [status, setStatus] = useState('');
  const fileInputRef = useRef(null);

  function parseInput(value) {
    setInput(value);
    setResult(value.trim() ? parseFeedXml(value) : { feed: null, errors: [] });
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await readFeedFile(file);
      parseInput(text);
      setStatus(`Loaded ${file.name}.`);
    } catch (error) {
      setResult({ feed: null, errors: [error.message] });
      setStatus('');
    }
  }

  async function handleCopy() {
    if (!result.feed) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result.feed, null, 2));
      setStatus('Parsed feed copied to clipboard.');
    } catch {
      setResult((current) => ({
        ...current,
        errors: [...current.errors, 'Failed to copy feed data.'],
      }));
    }
  }

  function handleClear() {
    setInput('');
    setResult({ feed: null, errors: [] });
    setStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const { feed, errors } = result;
  return (
    <section className="rss-feed-parser-tool" aria-label="RSS and Atom Feed Parser">
      <div className="rss-feed-parser-tool__actions">
        <label className="rss-feed-parser-tool__button rss-feed-parser-tool__file-button">
          Upload feed
          <input
            ref={fileInputRef}
            className="rss-feed-parser-tool__file-input"
            type="file"
            accept={
              '.xml,.rss,.atom,application/xml,text/xml,application/rss+xml,application/atom+xml'
            }
            aria-label="Upload an RSS or Atom feed file"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="rss-feed-parser-tool__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <label className="rss-feed-parser-tool__label" htmlFor="rss-feed-input">
        Feed XML
      </label>
      <textarea
        id="rss-feed-input"
        className="rss-feed-parser-tool__input"
        value={input}
        onChange={(event) => parseInput(event.target.value)}
        placeholder="Paste an RSS 2.0 or Atom 1.0 feed XML document…"
        spellCheck={false}
      />

      {status && <p className="sr-only" role="status" aria-live="polite">{status}</p>}

      {errors.length > 0 && (
        <div className="rss-feed-parser-tool__errors" role="alert">
          <strong>Validation errors</strong>
          <ul>
            {errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </div>
      )}

      {feed && (
        <div className="rss-feed-parser-tool__results">
          <header className="rss-feed-parser-tool__feed-header">
            <div>
              <p className="rss-feed-parser-tool__format">{feed.format}</p>
              <h2>{feed.title || 'Untitled feed'}</h2>
              {feed.description && <p>{feed.description}</p>}
              {feed.updated && <p><strong>Last updated:</strong> {feed.updated}</p>}
              {feed.link && (
                <a href={feed.link} target="_blank" rel="noreferrer">
                  Open feed link
                </a>
              )}
            </div>
            <button type="button" className="rss-feed-parser-tool__button" onClick={handleCopy}>
              Copy parsed data
            </button>
          </header>

          <h3>Entries ({feed.entries.length})</h3>
          <ol className="rss-feed-parser-tool__entries">
            {feed.entries.map((entry, index) => (
              <li key={`${entry.title}-${index}`}>
                <article>
                  <h4>{entry.title || 'Untitled entry'}</h4>
                  {entry.link && (
                    <a href={entry.link} target="_blank" rel="noreferrer">
                      Open entry
                    </a>
                  )}
                  {entry.date && <p><strong>Published:</strong> {entry.date}</p>}
                  {entry.author && <p><strong>Author:</strong> {entry.author}</p>}
                  {entry.summary && <p>{entry.summary}</p>}
                </article>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
