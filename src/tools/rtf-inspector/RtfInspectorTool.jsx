import { useRef, useState } from 'react';
import { parseRtfHeader } from './rtf.utils.js';
import './rtf.css';

/**
 * Renders a client-side RTF header inspector for a locally selected file.
 *
 * @returns {React.JSX.Element} The RTF inspector UI.
 */
export default function RtfInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = new TextDecoder('windows-1252').decode(await file.arrayBuffer());
      setResult(parseRtfHeader(text));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not inspect this file.');
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="rtf-inspector" aria-label="RTF Header Inspector">
      <div className="rtf-inspector__toolbar">
        <label className="rtf-inspector__button rtf-inspector__file-button">
          Choose RTF file
          <input
            ref={inputRef}
            type="file"
            accept=".rtf,application/rtf,text/rtf"
            onChange={handleFileChange}
            aria-label="Choose an RTF file to inspect"
          />
        </label>
        <button type="button" className="rtf-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {fileName && <p className="rtf-inspector__file-name">Inspecting: {fileName}</p>}
      {error && <div className="rtf-inspector__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="rtf-inspector__results">
          <section className="rtf-inspector__section" aria-labelledby="rtf-summary-heading">
            <h2 id="rtf-summary-heading">Header summary</h2>
            <dl className="rtf-inspector__summary">
              <div><dt>RTF version</dt><dd>{result.version}</dd></div>
              <div><dt>Character set</dt><dd>{result.charset}</dd></div>
              <div><dt>Default font</dt><dd>{result.defaultFont ?? 'Not specified'}</dd></div>
              <div><dt>Maximum group depth</dt><dd>{result.maxDepth}</dd></div>
            </dl>
          </section>
          <Table
            title="Font table"
            empty="No font table entries were found."
            hasEntries={result.fonts.length > 0}
          >
            <thead><tr><th>Index</th><th>Family</th><th>Name</th></tr></thead>
            <tbody>
              {result.fonts.map((font) => (
                <tr key={font.index}>
                  <td>{font.index}</td><td>{font.family}</td><td>{font.name || 'Unnamed'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Table
            title="Color table"
            empty="No color table entries were found."
            hasEntries={result.colors.length > 0}
          >
            <thead>
              <tr><th>Index</th><th>Red</th><th>Green</th><th>Blue</th><th>RGB</th></tr>
            </thead>
            <tbody>
              {result.colors.map((color) => (
                <tr key={color.index}>
                  <td>{color.index}</td><td>{color.red}</td><td>{color.green}</td>
                  <td>{color.blue}</td><td>rgb({color.red}, {color.green}, {color.blue})</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </section>
  );
}

function Table({ title, empty, hasEntries, children }) {
  return (
    <section className="rtf-inspector__section">
      <h2>{title}</h2>
      {hasEntries ? <table>{children}</table> : <p>{empty}</p>}
    </section>
  );
}
