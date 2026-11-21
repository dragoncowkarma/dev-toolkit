import { useState } from 'react';
import { formatFlavor, parseWoffHeader } from './woffHeader.utils.js';
import './woffHeader.css';

function formatBytes(value) {
  return `${value.toLocaleString()} bytes`;
}

/**
 * Renders a client-side WOFF/WOFF2 header and table-directory inspector.
 *
 * @returns {React.JSX.Element} The inspector UI.
 */
export default function WoffHeaderTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseWoffHeader(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (parseError) {
      setResult(null);
      setFileName(file.name);
      setError(parseError.message);
    }
  }

  return (
    <section className="woff-header-tool" aria-label="WOFF Header Inspector">
      <div className="woff-header-tool__intro">
        <p>
          Inspect WOFF and WOFF2 headers locally. Font payloads are never decompressed or uploaded.
        </p>
        <label className="woff-header-tool__upload">
          Choose WOFF or WOFF2 file
          <input
            type="file"
            accept=".woff,.woff2,font/woff,font/woff2"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {error && (
        <div className="woff-header-tool__error" role="alert">
          ⚠ {error}
        </div>
      )}

      {result && (
        <div className="woff-header-tool__results">
          <h2>{fileName}</h2>
          <dl className="woff-header-tool__summary">
            <div><dt>Format</dt><dd>{result.format} ({result.header.signature})</dd></div>
            <div>
              <dt>Version</dt>
              <dd>{result.header.majorVersion}.{result.header.minorVersion}</dd>
            </div>
            <div><dt>SFNT flavor</dt><dd>{formatFlavor(result.header.flavor)}</dd></div>
            <div><dt>Container size</dt><dd>{formatBytes(result.header.length)}</dd></div>
            <div><dt>Total SFNT size</dt><dd>{formatBytes(result.header.totalSfntSize)}</dd></div>
            {result.format === 'WOFF2' && (
              <div>
                <dt>Compressed size</dt>
                <dd>{formatBytes(result.header.totalCompressedSize)}</dd>
              </div>
            )}
            <div><dt>Tables</dt><dd>{result.header.numTables}</dd></div>
          </dl>
          <div className="woff-header-tool__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Offset</th>
                  <th>Compressed length</th>
                  <th>Original length</th>
                  <th>Transform</th>
                </tr>
              </thead>
              <tbody>
                {result.tables.map((table) => (
                  <tr key={`${table.tag}-${table.directoryOffset ?? table.offset}`}>
                    <td>{table.tag}</td>
                    <td>
                      {table.offset === null ? 'Brotli stream' : table.offset.toLocaleString()}
                    </td>
                    <td>{table.compLength?.toLocaleString() ?? '—'}</td>
                    <td>{table.origLength.toLocaleString()}</td>
                    <td>
                      {table.transformLength === null || table.transformLength === undefined
                        ? '—'
                        : table.transformLength.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
