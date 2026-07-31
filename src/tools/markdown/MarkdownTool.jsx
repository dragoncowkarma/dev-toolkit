import React, { useMemo, useState } from 'react';
import { parseMarkdown } from './markdown.utils.js';
import './markdown.css';

const SAMPLE_MARKDOWN = [
  '# Markdown Previewer',
  '',
  '## Features',
  '- **Bold**, *italic*, and ~~strikethrough~~ text',
  '- `inline code` and fenced code blocks',
  '- Ordered and unordered lists',
  '',
  '1. Type markdown on the left',
  '2. Watch the live preview update',
  '',
  '> Switch to the Raw HTML tab to copy or download the generated markup.',
  '',
  '[Learn more about Markdown](https://www.markdownguide.org)',
  '',
  '---',
  '',
  '```js',
  'function greet(name) {',
  '  return `Hello, ${name}!`;',
  '}',
  '```',
].join('\n');

const TOAST_DURATION_MS = 2500;

/**
 * Live Markdown Previewer with a rendered HTML preview and raw HTML tab.
 * @param {object} props Component props.
 * @param {() => void} [props.onBack] Navigates back to the tool dashboard.
 * @returns {React.JSX.Element} The Markdown Previewer tool.
 */
export default function MarkdownTool({ onBack }) {
  const [input, setInput] = useState('');
  const [viewMode, setViewMode] = useState('preview');
  const [toast, setToast] = useState('');

  const html = useMemo(() => parseMarkdown(input), [input]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(''), TOAST_DURATION_MS);
  };

  const handleInputChange = (event) => setInput(event.target.value);

  const handleLoadSample = () => setInput(SAMPLE_MARKDOWN);

  const handleClear = () => setInput('');

  const handleCopyHtml = () => {
    if (!html) return;
    navigator.clipboard
      .writeText(html)
      .then(() => showToast('HTML copied to clipboard!'))
      .catch(() => showToast('Failed to copy HTML.'));
  };

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    if (!input) return;
    downloadFile(input, 'document.md', 'text/markdown');
  };

  const handleDownloadHtml = () => {
    if (!html) return;
    downloadFile(html, 'document.html', 'text/html');
  };

  return (
    <section className="markdown-tool" aria-label="Markdown Previewer Tool">
      {toast && (
        <div className="markdown-tool__toast" role="status">
          <span aria-hidden="true">✅</span> {toast}
        </div>
      )}

      <div className="markdown-tool__header">
        <div className="markdown-tool__title-group">
          {onBack && (
            <button
              type="button"
              className="markdown-tool__back"
              onClick={onBack}
              aria-label="Go back to tool dashboard"
            >
              <span aria-hidden="true">←</span> Back
            </button>
          )}
          <h2 className="markdown-tool__title">Markdown Previewer</h2>
        </div>
        <div className="markdown-tool__actions">
          <button
            type="button"
            className="markdown-tool__button"
            onClick={handleLoadSample}
            aria-label="Load sample markdown"
          >
            📋 Load Sample
          </button>
          <button
            type="button"
            className="markdown-tool__button"
            onClick={handleClear}
            aria-label="Clear markdown input"
          >
            🗑️ Clear
          </button>
        </div>
      </div>

      <div className="markdown-tool__workspace">
        <div className="markdown-tool__panel">
          <div className="markdown-tool__panel-header">
            <h3 className="markdown-tool__panel-title">Markdown Input</h3>
          </div>
          <textarea
            className="markdown-tool__editor"
            placeholder="Type or paste your markdown here..."
            value={input}
            onChange={handleInputChange}
            aria-label="Markdown input"
            spellCheck="false"
          />
        </div>

        <div className="markdown-tool__panel">
          <div className="markdown-tool__panel-header">
            <div
              className="markdown-tool__tabs"
              role="tablist"
              aria-label="Output view modes"
            >
              <button
                type="button"
                className={`markdown-tool__tab ${viewMode === 'preview' ? 'is-active' : ''}`}
                onClick={() => setViewMode('preview')}
                role="tab"
                aria-selected={viewMode === 'preview'}
              >
                Preview
              </button>
              <button
                type="button"
                className={`markdown-tool__tab ${viewMode === 'html' ? 'is-active' : ''}`}
                onClick={() => setViewMode('html')}
                role="tab"
                aria-selected={viewMode === 'html'}
              >
                Raw HTML
              </button>
            </div>
            <div className="markdown-tool__panel-actions">
              <button
                type="button"
                className="markdown-tool__button"
                onClick={handleCopyHtml}
                disabled={!html}
                aria-label="Copy generated HTML to clipboard"
              >
                📋 Copy HTML
              </button>
              <button
                type="button"
                className="markdown-tool__button"
                onClick={handleDownloadMarkdown}
                disabled={!input}
                aria-label="Download markdown file"
              >
                💾 .md
              </button>
              <button
                type="button"
                className="markdown-tool__button"
                onClick={handleDownloadHtml}
                disabled={!html}
                aria-label="Download HTML file"
              >
                💾 .html
              </button>
            </div>
          </div>

          <div className="markdown-tool__output">
            {!input.trim() ? (
              <p className="markdown-tool__empty-state">
                Nothing to preview yet — start typing or load the sample markdown.
              </p>
            ) : viewMode === 'preview' ? (
              <div
                className="markdown-tool__preview"
                data-testid="markdown-preview"
                // Safe: parseMarkdown HTML-escapes all user text before generating
                // markup, so this can only ever contain markdown-derived tags.
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <pre className="markdown-tool__html-source" data-testid="markdown-html-source">
                {html}
              </pre>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
