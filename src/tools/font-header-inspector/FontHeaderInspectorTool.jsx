import { useRef, useState } from 'react';
import { inspectFontHeader } from './font-header-inspector.utils.js';
import './font-header-inspector.css';

function formatValue(value) {
  return typeof value === 'number' ? value.toLocaleString() : value;
}

/**
 * Renders a client-side TTF, OTF, WOFF, and WOFF2 container inspector.
 *
 * @returns {React.JSX.Element} The font header inspector UI.
 */
export default function FontHeaderInspectorTool() {
  const fileInputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  async function inspectFile(file) {
    try {
      const parsed = inspectFontHeader(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (caught) {
      setResult(null);
      setFileName(file.name);
      setError(caught instanceof Error ? caught.message : 'Unable to inspect this font file.');
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) inspectFile(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  }

  return (
    <section className="font-header-inspector" aria-label="Font Header Inspector">
      <div
        className="font-header-inspector__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a TTF, OTF, WOFF, or WOFF2 file here, or choose a file.</p>
        <label className="font-header-inspector__upload btn">
          Choose font file
          <input
            ref={fileInputRef}
            type="file"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            onChange={handleFileChange}
            aria-label="Choose a font file"
          />
        </label>
      </div>

      {fileName && <p className="font-header-inspector__file">Inspecting: {fileName}</p>}
      {error && <p className="font-header-inspector__error" role="alert">⚠ {error}</p>}

      {result && (
        <>
          <section className="font-header-inspector__card" aria-labelledby="font-header-title">
            <h2 id="font-header-title">{result.format} header</h2>
            <dl>
              {Object.entries(result.header).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="font-header-inspector__card" aria-labelledby="font-tables-title">
            <h2 id="font-tables-title">Table directory ({result.tables.length})</h2>
            {result.tables.length === 0 ? <p>No table entries are present.</p> : (
              <div className="font-header-inspector__table-wrap">
                <table>
                  <thead>
                    <tr>{Object.keys(result.tables[0]).map((key) => <th key={key}>{key}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.tables.map((table, index) => (
                      <tr key={`${table.tag}-${index}`}>
                        {Object.values(table).map((value, valueIndex) => (
                          <td key={`${table.tag}-${valueIndex}`}>
                            {value === null ? '—' : formatValue(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
