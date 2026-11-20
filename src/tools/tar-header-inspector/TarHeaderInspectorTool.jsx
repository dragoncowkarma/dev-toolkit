import { useRef, useState } from 'react';
import { formatTarSize, parseTarArchive } from './tar-header-inspector.utils.js';
import './tar-header-inspector.css';

function formatTimestamp(seconds) {
  if (!seconds) return '—';
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? String(seconds) : date.toISOString();
}

/**
 * Renders a client-side TAR archive header inspector.
 *
 * @returns {React.JSX.Element} The TAR header inspector UI.
 */
export default function TarHeaderInspectorTool() {
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function inspectFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseTarArchive(bytes);
      setFileName(file.name);
      setResult(parsed);
      setError('');
    } catch (caughtError) {
      setFileName(file.name);
      setResult(null);
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to inspect TAR file.');
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

  function handleClear() {
    setFileName('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="tar-inspector" aria-label="TAR Header Inspector">
      <div
        className="tar-inspector__drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a TAR archive here, or choose a file to inspect its headers locally.</p>
        <label className="tar-inspector__button" htmlFor="tar-file-input">
          Choose TAR file
        </label>
        <input
          ref={fileInputRef}
          id="tar-file-input"
          className="tar-inspector__file-input"
          type="file"
          accept=".tar,application/x-tar"
          onChange={handleFileChange}
        />
      </div>

      {fileName && (
        <div className="tar-inspector__file-bar">
          <span>Inspecting: {fileName}</span>
          <button type="button" className="tar-inspector__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      {error && <div className="tar-inspector__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="tar-inspector__results">
          <p className="tar-inspector__summary">
            {result.entries.length} entries ·
            {' '}{result.endOfArchive ? 'End marker found' : 'Reached EOF'}
          </p>
          <ol className="tar-inspector__entries">
            {result.entries.map((entry) => (
              <li key={entry.offset} className="tar-inspector__entry">
                <h3>{entry.name || '(unnamed entry)'}</h3>
                <dl>
                  <div><dt>Type</dt><dd>{entry.type} ({entry.typeflag || 'NUL'})</dd></div>
                  <div><dt>Format</dt><dd>{entry.format}</dd></div>
                  <div><dt>Size</dt><dd>{formatTarSize(entry.size)}</dd></div>
                  <div><dt>Mode</dt><dd>{entry.mode.toString(8).padStart(4, '0')}</dd></div>
                  <div><dt>Owner</dt><dd>{entry.uname || '—'} ({entry.uid})</dd></div>
                  <div><dt>Group</dt><dd>{entry.gname || '—'} ({entry.gid})</dd></div>
                  <div><dt>Modified</dt><dd>{formatTimestamp(entry.mtime)}</dd></div>
                  <div>
                    <dt>Checksum</dt><dd>{entry.checksumValid ? 'Valid' : 'Invalid'}</dd>
                  </div>
                  {entry.linkname && <div><dt>Link target</dt><dd>{entry.linkname}</dd></div>}
                  {(entry.deviceMajor || entry.deviceMinor) && (
                    <div><dt>Device</dt><dd>{entry.deviceMajor}:{entry.deviceMinor}</dd></div>
                  )}
                </dl>
                {Object.keys(entry.pax).length > 0 && (
                  <p className="tar-inspector__pax">PAX: {JSON.stringify(entry.pax)}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
