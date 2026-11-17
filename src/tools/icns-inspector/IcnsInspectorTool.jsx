import { useRef, useState } from 'react';
import { parseIcns } from './icns.utils.js';
import './icns-inspector.css';

/**
 * Renders a browser-only ICNS container inspector.
 *
 * @returns {React.JSX.Element} The ICNS inspector UI.
 */
export default function IcnsInspectorTool() {
  const [inspection, setInspection] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = (requestRef.current += 1);
    setInspection(null);
    setError('');
    if (!file.name.toLowerCase().endsWith('.icns')) {
      setError('Please select an .icns icon file.');
      return;
    }

    try {
      const parsed = parseIcns(await file.arrayBuffer());
      if (requestRef.current !== requestId) return;
      setInspection({ ...parsed, fileName: file.name, fileSize: file.size });
      setError(
        parsed.error ?? (parsed.warnings.length > 0 ? 'The file is truncated or malformed.' : '')
      );
    } catch {
      if (requestRef.current === requestId) {
        setError('Unable to read the selected file.');
      }
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setInspection(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="icns-inspector" aria-label="ICNS Icon Inspector">
      <div className="icns-inspector__toolbar">
        <label className="icns-inspector__button">
          Select ICNS File
          <input
            ref={inputRef}
            type="file"
            accept=".icns,image/x-icns"
            className="icns-inspector__file-input"
            aria-label="Select an ICNS file to inspect"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="icns-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {error && <div className="icns-inspector__error" role="alert">⚠ {error}</div>}

      {inspection && !inspection.error && (
        <div className="icns-inspector__results">
          <p className="icns-inspector__summary">
            {inspection.fileName} ({inspection.fileSize.toLocaleString()} bytes) ·
            Declared container length: {inspection.declaredLength?.toLocaleString()} bytes
          </p>
          {inspection.warnings.length > 0 && (
            <ul className="icns-inspector__warnings" aria-label="Inspection warnings">
              {inspection.warnings.map((warning) => <li key={warning}>⚠ {warning}</li>)}
            </ul>
          )}
          <div className="icns-inspector__table-wrap">
            <table>
              <caption>ICNS entries</caption>
              <thead>
                <tr><th>Type</th><th>Kind</th><th>Dimensions</th><th>Format</th><th>Length</th></tr>
              </thead>
              <tbody>
                {inspection.entries.map((entry) => (
                  <tr key={`${entry.offset}-${entry.type}`}>
                    <td><code>{entry.type}</code></td>
                    <td>{entry.label}{entry.warning && <span> — {entry.warning}</span>}</td>
                    <td>{entry.dimensions ?? '—'}</td>
                    <td>{entry.format}</td>
                    <td>{entry.length.toLocaleString()} bytes</td>
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
