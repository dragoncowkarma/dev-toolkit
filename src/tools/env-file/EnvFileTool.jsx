import { useMemo, useState } from 'react';
import {
  findMissingKeys,
  maskValue,
  parseEnvFile,
  toExampleTemplate,
  toJSON,
  toShellExport,
  toYAML,
} from './envFile.utils.js';
import './envFile.css';

const OUTPUT_FORMATS = {
  JSON: 'json',
  YAML: 'yaml',
  SHELL: 'shell',
  EXAMPLE: 'example',
};

function formatOutput(entries, format) {
  if (format === OUTPUT_FORMATS.YAML) return toYAML(entries);
  if (format === OUTPUT_FORMATS.SHELL) return toShellExport(entries);
  if (format === OUTPUT_FORMATS.EXAMPLE) return toExampleTemplate(entries);
  return JSON.stringify(toJSON(entries), null, 2);
}

/**
 * Renders live dotenv parsing, conversion, comparison, and safe value masking.
 *
 * @returns {React.JSX.Element} The Env File tool interface.
 */
export default function EnvFileTool() {
  const [source, setSource] = useState('');
  const [example, setExample] = useState('');
  const [format, setFormat] = useState(OUTPUT_FORMATS.JSON);
  const [maskSecrets, setMaskSecrets] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const parsed = useMemo(() => parseEnvFile(source), [source]);
  const exampleParsed = useMemo(() => parseEnvFile(example), [example]);
  const comparison = useMemo(
    () => findMissingKeys(parsed.entries, exampleParsed.entries),
    [parsed, exampleParsed]
  );
  const output = useMemo(() => formatOutput(parsed.entries, format), [format, parsed.entries]);

  async function copyOutput() {
    if (!output) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(output);
      setCopyStatus('Copied output to clipboard.');
    } catch {
      setCopyStatus('Could not copy output to clipboard.');
    }
  }

  return (
    <section className="env-file-tool" aria-label="Env File Tool">
      <header className="env-file-tool__intro">
        <p className="env-file-tool__eyebrow">Formatter</p>
        <h2>Env File Tool</h2>
        <p>Parse, validate, compare, and convert dotenv files without leaving the browser.</p>
      </header>

      <div className="env-file-tool__controls">
        <label htmlFor="env-output-format">
          Output format
          <select
            id="env-output-format"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value={OUTPUT_FORMATS.JSON}>JSON</option>
            <option value={OUTPUT_FORMATS.YAML}>YAML</option>
            <option value={OUTPUT_FORMATS.SHELL}>Shell export</option>
            <option value={OUTPUT_FORMATS.EXAMPLE}>.env.example template</option>
          </select>
        </label>
        <label className="env-file-tool__mask" htmlFor="env-mask-secrets">
          <input
            id="env-mask-secrets"
            type="checkbox"
            checked={maskSecrets}
            onChange={(event) => setMaskSecrets(event.target.checked)}
          />
          Mask displayed values
        </label>
        <button type="button" onClick={() => setShowComparison((visible) => !visible)}>
          {showComparison ? 'Hide comparison' : 'Compare .env.example'}
        </button>
      </div>

      <div className="env-file-tool__panes">
        <div className="env-file-tool__pane">
          <label htmlFor="env-source">.env source</label>
          <textarea
            id="env-source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setCopyStatus('');
            }}
            placeholder={'API_URL=https://example.com\nAPI_KEY=sk_live_abc123'}
            spellCheck="false"
          />
        </div>
        <div className="env-file-tool__pane">
          <div className="env-file-tool__output-heading">
            <label htmlFor="env-output">Converted output</label>
            <button type="button" onClick={copyOutput} disabled={!output}>Copy to clipboard</button>
          </div>
          <textarea id="env-output" value={output} readOnly spellCheck="false" />
        </div>
      </div>

      <p className="env-file-tool__status" role="status" aria-live="polite">{copyStatus}</p>

      {!source.trim() ? (
        <p className="env-file-tool__empty">Paste a .env file to inspect its entries.</p>
      ) : (
        <>
          {parsed.errors.length > 0 && (
            <div className="env-file-tool__errors" role="alert">
              <p>Could not parse some lines:</p>
              <ul>
                {parsed.errors.map((error) => (
                  <li key={`${error.line}-${error.message}`}>Line {error.line}: {error.message}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="env-file-tool__table-wrap">
            <table>
              <caption>Parsed environment entries</caption>
              <thead>
                <tr><th scope="col">Key</th><th scope="col">Value</th><th scope="col">Line</th></tr>
              </thead>
              <tbody>
                {parsed.entries.map((entry) => (
                  <tr
                    className={entry.isDuplicate ? 'is-duplicate' : ''}
                    key={`${entry.line}-${entry.key}`}
                  >
                    <td>{entry.key}{entry.isDuplicate && <span> Duplicate</span>}</td>
                    <td>{maskSecrets ? maskValue(entry.value) : entry.value}</td>
                    <td>{entry.line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showComparison && (
        <div className="env-file-tool__comparison">
          <label htmlFor="env-example">.env.example</label>
          <textarea
            id="env-example"
            value={example}
            onChange={(event) => setExample(event.target.value)}
            placeholder="Paste the example file to compare keys…"
            spellCheck="false"
          />
          <div className="env-file-tool__missing">
            <div>
              <h3>Missing in .env</h3>
              <ul>{comparison.missingInSource.map((key) => <li key={key}>{key}</li>)}</ul>
            </div>
            <div>
              <h3>Missing in .env.example</h3>
              <ul>{comparison.missingInExample.map((key) => <li key={key}>{key}</li>)}</ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
