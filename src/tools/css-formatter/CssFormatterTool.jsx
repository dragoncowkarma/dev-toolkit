import { useEffect, useState } from 'react';
import { formatCss, minifyCss } from './cssFormatter.utils.js';
import './cssFormatter.css';

const SAMPLE_CSS = `:root {
  --gap: 8px;
}

.card {
  color: #333;
  background: url("data:image/png;base64,AAAA==");
}

@media (max-width: 600px) {
  .card {
    padding: calc(var(--gap) * 2);
  }
}`;

/**
 * Renders a local CSS formatter and minifier. All processing happens in
 * `cssFormatter.utils.js` on the client - nothing is sent over the network.
 *
 * @returns {React.JSX.Element} The CSS Formatter UI.
 */
export default function CssFormatterTool() {
  const [input, setInput] = useState(SAMPLE_CSS);
  const [output, setOutput] = useState('');
  const [indentSize, setIndentSize] = useState(2);
  const [warning, setWarning] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!status) return undefined;
    const timeout = setTimeout(() => setStatus(''), 1800);
    return () => clearTimeout(timeout);
  }, [status]);

  function applyResult(result, emptyMessage) {
    if (!input.trim()) {
      setOutput('');
      setWarning(null);
      setStatus(emptyMessage);
      return;
    }
    setOutput(result.output);
    setWarning(result.warning);
    setStatus('');
  }

  function runFormat() {
    applyResult(formatCss(input, { indentSize }), 'Input is empty - nothing to format.');
  }

  function runMinify() {
    applyResult(minifyCss(input), 'Input is empty - nothing to minify.');
  }

  function clearAll() {
    setInput('');
    setOutput('');
    setWarning(null);
    setStatus('');
  }

  async function copyOutput() {
    if (!output) {
      setStatus('Nothing to copy yet.');
      return;
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable.');
      await navigator.clipboard.writeText(output);
      setStatus('Copied output to clipboard.');
    } catch {
      setStatus('Could not copy output to clipboard.');
    }
  }

  return (
    <section className="css-formatter-tool" aria-label="CSS Formatter">
      <header className="css-formatter-tool__intro">
        <p className="css-formatter-tool__eyebrow">Formatter</p>
        <h2>CSS Formatter</h2>
        <p>Format or minify CSS entirely in your browser - nothing leaves your machine.</p>
      </header>

      <div className="css-formatter-tool__controls">
        <label className="css-formatter-tool__indent" htmlFor="css-formatter-indent">
          Indentation
          <select
            id="css-formatter-indent"
            value={indentSize}
            onChange={(event) => setIndentSize(Number(event.target.value))}
            aria-label="Indentation size"
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
          </select>
        </label>

        <div className="css-formatter-tool__actions">
          <button type="button" onClick={runFormat}>Format</button>
          <button type="button" onClick={runMinify}>Minify</button>
          <button type="button" onClick={copyOutput} disabled={!output}>Copy</button>
          <button type="button" onClick={clearAll}>Clear</button>
        </div>
      </div>

      <div className="css-formatter-tool__panes">
        <div className="css-formatter-tool__pane">
          <label htmlFor="css-formatter-input">CSS input</label>
          <textarea
            id="css-formatter-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste CSS here..."
            spellCheck="false"
            aria-label="CSS input"
          />
        </div>

        <div className="css-formatter-tool__pane">
          <label htmlFor="css-formatter-output">Formatted output</label>
          <textarea
            id="css-formatter-output"
            value={output}
            readOnly
            placeholder="Formatted or minified CSS appears here..."
            spellCheck="false"
            aria-label="Formatted output"
          />
        </div>
      </div>

      {warning && (
        <p className="css-formatter-tool__warning" role="alert">{warning}</p>
      )}

      {status && (
        <p
          className="css-formatter-tool__status"
          role={status.startsWith('Could not') ? 'alert' : 'status'}
          aria-live="polite"
        >
          {status}
        </p>
      )}
    </section>
  );
}
