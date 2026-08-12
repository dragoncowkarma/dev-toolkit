import { useEffect, useState } from 'react';
import { formatHtml, HTML_INDENT_OPTIONS, minifyHtml } from './htmlFormatter.utils.js';
import './htmlFormatter.css';

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sample Page</title>
<style>
body{margin:0;padding:0}
</style>
</head>
<body>
<!-- Main content -->
<div class="container" data-note="a > b">
<h1>Hello, World!</h1>
<p>This is <strong>bold</strong> and <em>italic</em> text.</p>
<img src="logo.png" alt="Logo">
<br>
<pre>
function greet() {
  console.log("hi");
}
</pre>
</div>
</body>
</html>`;

/**
 * Renders an HTML formatting and minification tool with explicit Format/Minify actions,
 * an indentation selector, and accessible error/status feedback regions.
 *
 * @returns {React.JSX.Element} The HTML Formatter tool UI.
 */
export default function HtmlFormatterTool() {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState(HTML_INDENT_OPTIONS.TWO_SPACES);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!status) return undefined;
    const timer = setTimeout(() => setStatus(''), 2000);
    return () => clearTimeout(timer);
  }, [status]);

  function applyResult(result, successStatus) {
    if (result.ok) {
      setOutput(result.result);
      setError(null);
      setStatus(successStatus);
    } else {
      setOutput('');
      setError(result.error);
      setStatus('');
    }
  }

  function handleFormat() {
    if (!input.trim()) return;
    applyResult(formatHtml(input, indent), 'Formatted.');
  }

  function handleMinify() {
    if (!input.trim()) return;
    applyResult(minifyHtml(input), 'Minified.');
  }

  function handleInputChange(event) {
    setInput(event.target.value);
    setOutput('');
    setError(null);
  }

  function handleLoadSample() {
    setInput(SAMPLE_HTML);
    setOutput('');
    setError(null);
    setStatus('Sample loaded.');
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError(null);
    setStatus('Cleared.');
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setStatus('Copied to clipboard.');
    } catch {
      setStatus('Unable to copy to clipboard.');
    }
  }

  return (
    <section className="html-formatter-tool" aria-label="HTML Formatter Tool">
      <header className="html-formatter-tool__intro">
        <p className="html-formatter-tool__eyebrow">Formatter</p>
        <h2>HTML Formatter</h2>
        <p>Pretty-print or minify HTML markup without touching text or raw content.</p>
      </header>

      <div className="html-formatter-tool__controls">
        <label className="html-formatter-tool__indent" htmlFor="html-formatter-indent">
          Indentation
          <select
            id="html-formatter-indent"
            value={indent}
            onChange={(event) => setIndent(event.target.value)}
            aria-label="Indentation"
          >
            <option value={HTML_INDENT_OPTIONS.TWO_SPACES}>2 spaces</option>
            <option value={HTML_INDENT_OPTIONS.FOUR_SPACES}>4 spaces</option>
            <option value={HTML_INDENT_OPTIONS.TAB}>Tabs</option>
          </select>
        </label>

        <div className="html-formatter-tool__actions">
          <button type="button" onClick={handleFormat} disabled={!input.trim()}>
            Format
          </button>
          <button type="button" onClick={handleMinify} disabled={!input.trim()}>
            Minify
          </button>
          <button type="button" onClick={handleLoadSample}>
            Load sample
          </button>
          <button type="button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="html-formatter-tool__panes">
        <div className="html-formatter-tool__pane">
          <label htmlFor="html-formatter-input">HTML input</label>
          <textarea
            id="html-formatter-input"
            value={input}
            onChange={handleInputChange}
            placeholder="Paste HTML markup here…"
            spellCheck={false}
            aria-label="HTML input"
          />
        </div>

        <div className="html-formatter-tool__pane html-formatter-tool__pane--output">
          <div className="html-formatter-tool__output-heading">
            <label htmlFor="html-formatter-output">Output</label>
            <button
              type="button"
              onClick={handleCopy}
              disabled={!output}
              aria-label="Copy output to clipboard"
            >
              Copy
            </button>
          </div>
          <textarea
            id="html-formatter-output"
            value={output}
            readOnly
            placeholder="Formatted or minified result appears here…"
            spellCheck={false}
            aria-label="Output"
          />
        </div>
      </div>

      {error && (
        <div className="html-formatter-tool__error" role="alert">
          <strong>HTML input is invalid.</strong>
          <span>Line {error.line}, column {error.column}: {error.message}</span>
        </div>
      )}

      {status && (
        <p className="html-formatter-tool__status" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </section>
  );
}
