import { useEffect, useMemo, useState } from 'react';
import { textToSlug } from './slug.utils.js';
import './slug.css';

/**
 * Renders the URL Slug Generator tool allowing users to convert arbitrary text
 * into URL-friendly slugs with configurable separator, case preservation,
 * and maximum length options.
 *
 * @returns {React.JSX.Element} The URL slug tool component.
 */
export default function SlugTool() {
  const [input, setInput] = useState('');
  const [separator, setSeparator] = useState('-');
  const [preserveCase, setPreserveCase] = useState(false);
  const [maxLength, setMaxLength] = useState('');
  const [notice, setNotice] = useState('');

  const slug = useMemo(() => {
    const parsedMaxLength = maxLength !== '' ? parseInt(maxLength, 10) : undefined;
    return textToSlug(input, {
      separator,
      preserveCase,
      maxLength: Number.isNaN(parsedMaxLength) ? undefined : parsedMaxLength,
    });
  }, [input, separator, preserveCase, maxLength]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 2000);
    return () => clearTimeout(timer);
  }, [notice]);

  function handleClear() {
    setInput('');
    setMaxLength('');
    setNotice('Cleared input.');
  }

  async function handleCopy() {
    if (!slug) return;
    try {
      await navigator.clipboard.writeText(slug);
      setNotice('Copied slug to clipboard!');
    } catch {
      setNotice('Failed to copy slug to clipboard.');
    }
  }

  return (
    <section className="slug-tool" aria-label="URL Slug Generator Tool">
      <div className="slug-tool__controls">
        <div className="slug-tool__control-group">
          <label htmlFor="slug-separator">Separator</label>
          <select
            id="slug-separator"
            aria-label="Separator selector"
            value={separator}
            onChange={(e) => setSeparator(e.target.value)}
          >
            <option value="-">Hyphen (-)</option>
            <option value="_">Underscore (_)</option>
          </select>
        </div>

        <div className="slug-tool__control-group">
          <label htmlFor="slug-case-option">Case</label>
          <select
            id="slug-case-option"
            aria-label="Case option selector"
            value={preserveCase ? 'preserve' : 'lowercase'}
            onChange={(e) => setPreserveCase(e.target.value === 'preserve')}
          >
            <option value="lowercase">Lowercase</option>
            <option value="preserve">Preserve Original Case</option>
          </select>
        </div>

        <div className="slug-tool__control-group">
          <label htmlFor="slug-max-length">Max Length</label>
          <input
            type="number"
            id="slug-max-length"
            aria-label="Maximum length numeric input"
            min="1"
            placeholder="Unlimited"
            value={maxLength}
            onChange={(e) => setMaxLength(e.target.value)}
          />
        </div>

        <div className="slug-tool__actions">
          <button
            type="button"
            className="slug-tool__button slug-tool__button--secondary"
            aria-label="Clear all inputs"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="slug-tool__panels">
        <div className="slug-tool__panel">
          <label htmlFor="slug-input">Input Text</label>
          <textarea
            id="slug-input"
            aria-label="Input text"
            placeholder="Type or paste text to convert into a URL slug…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="slug-tool__panel">
          <div className="slug-tool__panel-header">
            <label htmlFor="slug-output">Generated Slug</label>
            <button
              type="button"
              className="slug-tool__button slug-tool__button--primary"
              aria-label="Copy generated slug"
              onClick={handleCopy}
              disabled={!slug}
            >
              Copy
            </button>
          </div>
          <input
            type="text"
            id="slug-output"
            aria-label="Generated slug"
            readOnly
            value={slug}
            placeholder="Generated slug will appear here…"
          />
        </div>
      </div>

      <div className="slug-tool__notice" role="status" aria-live="polite">
        {notice}
      </div>
    </section>
  );
}
