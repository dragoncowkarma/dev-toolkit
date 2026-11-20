import { useRef, useState } from 'react';
import { parseSqliteHeader } from './sqliteHeader.utils.js';
import './sqliteHeader.css';

/**
 * Renders a browser-local inspector for the fixed SQLite database header.
 *
 * @returns {React.JSX.Element} The SQLite header inspector UI.
 */
export default function SqliteHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setHeader(parseSqliteHeader(bytes));
      setFileName(file.name);
      setError('');
    } catch (err) {
      setHeader(null);
      setFileName(file.name);
      setError(err instanceof Error ? err.message : 'Unable to inspect the selected file.');
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    if (event.currentTarget === event.target) setIsDragging(false);
  }

  function clearInspection() {
    setFileName('');
    setHeader(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="sqlite-header-inspector" aria-label="SQLite Header Inspector Tool">
      <div
        className={`sqlite-header-inspector__dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          className="sqlite-header-inspector__file-input"
          type="file"
          accept=".sqlite,.sqlite3,.db,application/x-sqlite3"
          onChange={handleFileChange}
          aria-label="Choose a SQLite database file"
        />
        <p>Drop a SQLite database here, or choose a file.</p>
        <p className="sqlite-header-inspector__hint">
          Only the first 100 header bytes are inspected locally.
        </p>
      </div>

      {(fileName || error) && (
        <div className="sqlite-header-inspector__status">
          <span>{fileName}</span>
          <button type="button" onClick={clearInspection}>Clear</button>
        </div>
      )}

      {error && <div className="sqlite-header-inspector__error" role="alert">⚠ {error}</div>}

      {header && (
        <div className="sqlite-header-inspector__results">
          <h2>Header fields</h2>
          <div className="sqlite-header-inspector__table-wrap">
            <table>
              <thead>
                <tr><th>Field</th><th>Raw bytes</th><th>Decoded value</th></tr>
              </thead>
              <tbody>
                {header.fields.map((field) => (
                  <tr key={field.label}>
                    <th scope="row">{field.label}</th>
                    <td><code>{field.rawBytes}</code></td>
                    <td>{field.value}</td>
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
