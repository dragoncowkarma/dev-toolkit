import { useMemo, useState } from 'react';
import { formatGraphQL, minifyGraphQL } from './graphqlFormatter.utils.js';
import './graphqlFormatter.css';

/** Renders a live, client-side GraphQL formatter and minifier. */
export default function GraphQLFormatterTool() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState('format');
  const [indentSize, setIndentSize] = useState('2');
  const [notice, setNotice] = useState('');
  const result = useMemo(() => {
    if (!input.trim()) return { output: '', error: '' };
    try {
      return {
        output: mode === 'format'
          ? formatGraphQL(input, { indentSize })
          : minifyGraphQL(input),
        error: '',
      };
    } catch (error) {
      return { output: '', error: error.message };
    }
  }, [indentSize, input, mode]);

  async function copyOutput() {
    if (!result.output) return;
    try {
      await navigator.clipboard.writeText(result.output);
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Unable to copy to clipboard.');
    }
  }

  return (
    <section className="graphql-formatter" aria-label="GraphQL Formatter Tool">
      <div className="graphql-formatter__options">
        <label>
          Mode
          <select
            aria-label="Formatter mode"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="format">Format</option>
            <option value="minify">Minify</option>
          </select>
        </label>
        <label>
          Indent width
          <select
            aria-label="Indent width"
            value={indentSize}
            disabled={mode === 'minify'}
            onChange={(event) => setIndentSize(event.target.value)}
          >
            <option value="2">2 spaces</option>
            <option value="4">4 spaces</option>
          </select>
        </label>
      </div>
      <div className="graphql-formatter__panels">
        <label className="graphql-formatter__panel">
          GraphQL input
          <textarea
            aria-label="GraphQL input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste or type a GraphQL document…"
            spellCheck={false}
          />
        </label>
        <div className="graphql-formatter__panel">
          <div className="graphql-formatter__output-header">
            <label htmlFor="graphql-output">
              {mode === 'format' ? 'Formatted GraphQL' : 'Minified GraphQL'}
            </label>
            <button
              type="button"
              onClick={copyOutput}
              disabled={!result.output}
              aria-label="Copy output to clipboard"
            >
              Copy
            </button>
          </div>
          {result.error ? (
            <p className="graphql-formatter__error" role="alert">{result.error}</p>
          ) : (
            <textarea
              id="graphql-output"
              aria-label={mode === 'format' ? 'Formatted GraphQL' : 'Minified GraphQL'}
              value={result.output}
              readOnly
              spellCheck={false}
            />
          )}
        </div>
      </div>
      <p className="graphql-formatter__notice" role="status" aria-live="polite">{notice}</p>
    </section>
  );
}
