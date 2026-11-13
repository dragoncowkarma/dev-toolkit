import { useRef, useState } from 'react';
import { parseWasmModule } from './wasm-module-inspector.utils.js';
import './wasm-module-inspector.css';

/**
 * Renders a client-side WebAssembly binary module inspector.
 *
 * @returns {React.JSX.Element} The WebAssembly module inspector UI.
 */
export default function WasmModuleInspector() {
  const [moduleInfo, setModuleInfo] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const result = parseWasmModule(await file.arrayBuffer());
      setModuleInfo({ ...result, fileName: file.name, fileSize: file.size });
      setError('');
    } catch (caughtError) {
      setModuleInfo(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not read this WebAssembly file.'
      );
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

  function handleClear() {
    setModuleInfo(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="wasm-inspector" aria-label="WebAssembly Module Inspector">
      <div
        className={`wasm-inspector__drop-zone ${isDragging ? 'wasm-inspector__drop-zone--active' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id="wasm-file-input"
          className="wasm-inspector__file-input"
          type="file"
          accept=".wasm,application/wasm"
          onChange={handleFileChange}
        />
        <label htmlFor="wasm-file-input" className="wasm-inspector__upload-button">
          Choose a .wasm file
        </label>
        <p>or drag and drop it here. Files are parsed locally in your browser.</p>
      </div>

      {(moduleInfo || error) && (
        <button type="button" className="wasm-inspector__clear" onClick={handleClear}>
          Clear
        </button>
      )}

      {error && (
        <div className="wasm-inspector__error" role="alert">
          {error}
        </div>
      )}

      {moduleInfo && (
        <div className="wasm-inspector__results">
          <header>
            <h2>{moduleInfo.fileName}</h2>
            <p>
              Version {moduleInfo.version} · {moduleInfo.fileSize.toLocaleString()} bytes
            </p>
          </header>
          <div className="wasm-inspector__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Section</th>
                  <th>ID</th>
                  <th>Offset</th>
                  <th>Byte size</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {moduleInfo.sections.map((section, index) => (
                  <tr key={`${section.offset}-${index}`}>
                    <td>{section.name}</td>
                    <td>{section.id}</td>
                    <td>{section.offset}</td>
                    <td>{section.byteSize}</td>
                    <td>{section.count ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {moduleInfo.sections.filter((section) => section.entries).map((section, index) => (
            <section className="wasm-inspector__entries" key={`${section.name}-${index}`}>
              <h3>{section.name}s</h3>
              <ul>
                {section.entries.map((entry, entryIndex) => (
                  <li key={`${entry.name}-${entryIndex}`}>
                    <code>{entry.name}</code>
                    <span>{entry.kind}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
