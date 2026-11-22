import { useRef, useState } from 'react';
import { parseGitIndex, readIndexFile } from './gitIndex.utils.js';
import './gitIndex.css';

function formatTimestamp(timestamp) {
  return `${timestamp.seconds}s + ${timestamp.nanoseconds}ns`;
}

/**
 * Renders a local-only Git index header and entry inspector.
 *
 * @returns {React.JSX.Element} The Git index inspector UI.
 */
export default function GitIndexInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const initialStatus = 'Choose a local .git/index file to inspect it in your browser.';
  const [status, setStatus] = useState(initialStatus);
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    try {
      const buffer = await readIndexFile(file);
      const parsed = parseGitIndex(buffer);
      setResult(parsed);
      setError('');
      setStatus(`Parsed ${parsed.entryCount} index entries from ${file.name}.`);
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
      setStatus('');
    }
  }

  function handleClear() {
    if (inputRef.current) inputRef.current.value = '';
    setResult(null);
    setError('');
    setStatus(initialStatus);
  }

  return (
    <section className="git-index-inspector" aria-label="Git Index Inspector">
      <div className="git-index-inspector__controls">
        <label className="git-index-inspector__upload" htmlFor="git-index-file">
          Choose Git index file
        </label>
        <input
          ref={inputRef}
          id="git-index-file"
          type="file"
          onChange={handleFileChange}
          aria-describedby="git-index-local-note"
        />
        <button
          type="button"
          className="git-index-inspector__clear"
          onClick={handleClear}
        >
          Clear
        </button>
      </div>
      <p id="git-index-local-note">
        Your file is parsed locally in this browser and is never uploaded.
      </p>
      {status && <p role="status">{status}</p>}
      {error && <div className="git-index-inspector__error" role="alert">{error}</div>}
      {result && (
        <>
          <h2>Header</h2>
          <dl className="git-index-inspector__header">
            <div><dt>Signature</dt><dd>{result.signature}</dd></div>
            <div><dt>Version</dt><dd>{result.versionLabel}</dd></div>
            <div><dt>Entries</dt><dd>{result.entryCount}</dd></div>
            <div><dt>Checksum</dt><dd><code>{result.checksum}</code></dd></div>
          </dl>
          <h2>Entries</h2>
          {result.entryCount > result.entries.length && (
            <p>Showing the first {result.entries.length} of {result.entryCount} entries.</p>
          )}
          <div className="git-index-inspector__table-wrap">
            <table>
              <thead><tr><th>Path</th><th>Metadata</th><th>SHA-1</th><th>Flags</th></tr></thead>
              <tbody>
                {result.entries.map((entry, index) => (
                  <tr key={`${entry.path}-${index}`}>
                    <td><code>{entry.path}</code></td>
                    <td>
                      ctime: {formatTimestamp(entry.ctime)}<br />
                      mtime: {formatTimestamp(entry.mtime)}<br />
                      dev/ino: {entry.dev}/{entry.ino}; uid/gid: {entry.uid}/{entry.gid}<br />
                      {entry.mode.type} {entry.mode.permissions}; {entry.size} bytes
                    </td>
                    <td><code>{entry.sha1}</code></td>
                    <td>
                      assume-valid: {entry.flags.assumeValid ? 'yes' : 'no'}; extended:
                      {' '}{entry.flags.extended ? 'yes' : 'no'}<br />
                      stage: {entry.flags.stage}; name length: {entry.flags.nameLength}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h2>Extensions</h2>
          {result.extensions.length === 0 ? <p>None</p> : (
            <ul>{result.extensions.map((extension) => (
              <li key={`${extension.signature}-${extension.size}`}>
                <code>{extension.signature}</code>: {extension.size} bytes
              </li>
            ))}</ul>
          )}
        </>
      )}
    </section>
  );
}
