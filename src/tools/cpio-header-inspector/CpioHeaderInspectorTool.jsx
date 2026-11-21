import { useState } from 'react';
import { parseCpioArchive } from './cpio.utils.js';
import './cpio.css';

/**
 * Renders a client-side inspector for CPIO archive entry headers.
 * @returns {React.JSX.Element} The CPIO header inspector.
 */
export default function CpioHeaderInspectorTool() {
  const [archive, setArchive] = useState(null);
  const [error, setError] = useState('');

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setArchive(parseCpioArchive(await file.arrayBuffer()));
      setError('');
    } catch (caughtError) {
      setArchive(null);
      setError(caughtError.message);
    }
  }

  return (
    <section className="cpio-inspector" aria-label="CPIO Header Inspector">
      <h1>CPIO Header Inspector</h1>
      <p>Read archive metadata locally. File contents are never extracted or uploaded.</p>
      <label className="cpio-inspector__upload">
        Choose a CPIO archive
        <input type="file" accept=".cpio,application/x-cpio" onChange={handleFileChange} />
      </label>
      {error && <div className="cpio-inspector__error" role="alert">{error}</div>}
      {archive && (
        <div className="cpio-inspector__results">
          <p><strong>Format:</strong> {archive.format} · {archive.entries.length} entries</p>
          <div className="cpio-inspector__entries">
            {archive.entries.map((entry, index) => (
              <article className="cpio-inspector__entry" key={`${entry.name}-${index}`}>
                <h2>{entry.name}</h2>
                <dl>
                  <dt>Type / permissions</dt><dd>{entry.type} · {entry.permissions}</dd>
                  <dt>Inode</dt><dd>{entry.inode}</dd>
                  <dt>UID / GID / links</dt><dd>{entry.uid} / {entry.gid} / {entry.nlink}</dd>
                  <dt>Modified</dt><dd>{entry.mtimeDisplay}</dd>
                  <dt>File size</dt><dd>{entry.filesize} bytes</dd>
                  <dt>Device major / minor</dt>
                  <dd>{entry.devmajor ?? 'n/a'} / {entry.devminor ?? 'n/a'}</dd>
                  <dt>Rdev major / minor</dt>
                  <dd>{entry.rdevmajor ?? 'n/a'} / {entry.rdevminor ?? 'n/a'}</dd>
                  <dt>Name size / checksum</dt><dd>{entry.namesize} / {entry.checksum ?? 'n/a'}</dd>
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
