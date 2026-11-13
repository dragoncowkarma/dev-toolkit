import { useRef, useState } from 'react';
import { inspectTorrent } from './torrent.utils.js';
import './torrent-inspector.css';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(2)} ${units[index]}`;
}

/** Renders a client-side .torrent metadata inspector. */
export default function TorrentInspector() {
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setMetadata(inspectTorrent(bytes));
      setFileName(file.name);
      setError('');
    } catch (caught) {
      setMetadata(null);
      setFileName(file.name);
      setError(caught instanceof Error ? caught.message : 'Unable to inspect this torrent file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return <section className="torrent-inspector" aria-label="Torrent File Inspector">
    <input
      ref={inputRef}
      className="torrent-inspector__input"
      type="file"
      accept=".torrent,application/x-bittorrent"
      aria-label="Select a torrent file"
      onChange={(event) => inspectFile(event.target.files?.[0])}
    />
    <div
      className={`torrent-inspector__dropzone ${
        isDragging ? 'torrent-inspector__dropzone--active' : ''
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <span>🧲</span>
      <strong>Drop a .torrent file here</strong>
      <span>or</span>
      <button
        type="button"
        className="torrent-inspector__button"
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </button>
      <small>Parsed entirely in your browser. Nothing is uploaded.</small>
    </div>
    {fileName && <p className="torrent-inspector__filename">Selected: {fileName}</p>}
    {error && <div className="torrent-inspector__error" role="alert">⚠ {error}</div>}
    {metadata && <div className="torrent-inspector__results">
      <h2>{metadata.name || 'Torrent metadata'}</h2>
      <dl className="torrent-inspector__summary">
        <dt>Info-hash (SHA-1)</dt><dd><code>{metadata.infoHash}</code></dd>
        <dt>Layout</dt><dd>{metadata.isMultiFile ? 'Multi-file torrent' : 'Single file'}</dd>
        <dt>Total size</dt><dd>{formatSize(metadata.totalSize)}</dd>
        <dt>Piece length</dt><dd>{formatSize(metadata.pieceLength)}</dd>
        <dt>Piece count</dt><dd>{metadata.pieceCount}</dd>
        {metadata.creationDate && <>
          <dt>Created</dt><dd>{new Date(metadata.creationDate).toLocaleString()}</dd>
        </>}
        {metadata.createdBy && <><dt>Created by</dt><dd>{metadata.createdBy}</dd></>}
        {metadata.comment && <><dt>Comment</dt><dd>{metadata.comment}</dd></>}
        {metadata.encoding && <><dt>Encoding</dt><dd>{metadata.encoding}</dd></>}
      </dl>
      <h3>Trackers</h3>
      {metadata.announceUrls.length ? <ul>
        {metadata.announceUrls.map((url) => <li key={url}>{url}</li>)}
      </ul> : <p>No announce URLs declared.</p>}
      <h3>{metadata.isMultiFile ? 'Files' : 'File'}</h3>
      <ul className="torrent-inspector__files">
        {metadata.files.map((file) => <li key={file.path}>
          <code>{file.path}</code><span>{formatSize(file.size)}</span>
        </li>)}
      </ul>
    </div>}
  </section>;
}
