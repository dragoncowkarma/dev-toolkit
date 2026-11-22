import { useRef, useState } from 'react';
import { parseSfntHeader } from './sfntParser.js';
import './ttfOtfFontHeaderInspector.css';

function formatHex(value) {
  return `0x${value.toString(16).padStart(8, '0').toUpperCase()}`;
}

/**
 * Renders a client-side inspector for SFNT-based TTF and OTF font headers.
 *
 * @returns {React.JSX.Element} The font header inspector UI.
 */
export default function TtfOtfFontHeaderInspectorTool() {
  const [font, setFont] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = (requestRef.current += 1);
    setFont(null);
    setFileName(file.name);
    setError('');

    try {
      const result = parseSfntHeader(await file.arrayBuffer());
      if (requestRef.current !== requestId) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFont(result.font);
    } catch {
      if (requestRef.current === requestId) {
        setError('The selected file could not be read. Please try another font file.');
      }
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setFont(null);
    setFileName('');
    setError('');
  }

  return (
    <section className="sfnt-inspector" aria-label="TTF and OTF font header inspector">
      <div className="sfnt-inspector__toolbar">
        <label className="sfnt-inspector__upload">
          Choose .ttf or .otf file
          <input
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf,application/font-sfnt"
            onChange={handleFileChange}
            aria-label="Choose a TTF or OTF font file"
          />
        </label>
        {(font || error) && (
          <button type="button" className="sfnt-inspector__clear" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {fileName && <p className="sfnt-inspector__file-name">{fileName}</p>}
      {error && <div className="sfnt-inspector__error" role="alert">{error}</div>}

      {font && (
        <>
          <div className="sfnt-inspector__summary">
            <h2>SFNT offset table</h2>
            <dl>
              <div>
                <dt>Version</dt>
                <dd>{formatHex(font.sfntVersion)} — {font.versionLabel}</dd>
              </div>
              <div><dt>Tables</dt><dd>{font.numTables}</dd></div>
              <div><dt>Search range</dt><dd>{font.searchRange}</dd></div>
              <div><dt>Entry selector</dt><dd>{font.entrySelector}</dd></div>
              <div><dt>Range shift</dt><dd>{font.rangeShift}</dd></div>
            </dl>
          </div>

          <div className="sfnt-inspector__directory">
            <h2>Table directory</h2>
            <div className="sfnt-inspector__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Description</th>
                    <th>Checksum</th>
                    <th>Offset</th>
                    <th>Length</th>
                  </tr>
                </thead>
                <tbody>
                  {font.tables.map((table) => (
                    <tr key={`${table.tag}-${table.offset}`}>
                      <td><code>{table.tag}</code></td>
                      <td>{table.description}</td>
                      <td><code>{formatHex(table.checksum)}</code></td>
                      <td>{table.offset}</td>
                      <td>{table.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
