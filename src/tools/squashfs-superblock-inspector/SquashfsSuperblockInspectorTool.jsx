import { useState } from 'react';
import { formatTableOffset, parseSquashfsSuperblock } from './squashfsSuperblock.js';
import './squashfsSuperblockInspector.css';

const TABLE_LABELS = {
  id: 'ID table offset',
  xattr: 'Xattr ID table offset',
  inode: 'Inode table offset',
  directory: 'Directory table offset',
  fragment: 'Fragment table offset',
  export: 'Export table offset',
};

/**
 * Renders a client-side inspector for SquashFS 4.0 superblock metadata.
 *
 * @returns {React.JSX.Element} The SquashFS superblock inspector UI.
 */
export default function SquashfsSuperblockInspectorTool() {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    setDetails(null);
    setError('');
    setFileName('');
    if (!file) {
      setError('No file selected. Choose a SquashFS image to inspect.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      setDetails(parseSquashfsSuperblock(buffer));
      setFileName(file.name);
    } catch (readError) {
      setError(readError.message || 'Unable to read the selected file.');
    }
  }

  return (
    <section className="squashfs-inspector" aria-label="SquashFS Superblock Inspector">
      <p className="squashfs-inspector__intro">
        Inspect SquashFS 4.0 metadata entirely in your browser. Files are never uploaded.
      </p>
      <label className="squashfs-inspector__upload" htmlFor="squashfs-file">
        Choose SquashFS image
      </label>
      <input
        id="squashfs-file"
        type="file"
        className="squashfs-inspector__input"
        onChange={handleFileChange}
        aria-describedby="squashfs-file-help"
      />
      <p id="squashfs-file-help" className="squashfs-inspector__help">
        The first 96 bytes are read locally to parse the superblock.
      </p>

      {error && <div className="squashfs-inspector__error" role="alert">{error}</div>}

      {details && (
        <div className="squashfs-inspector__results" role="status" aria-live="polite">
          <h2>Superblock metadata</h2>
          <p className="squashfs-inspector__file">Inspecting: {fileName}</p>
          <dl>
            <dt>Magic</dt><dd>{details.magic}</dd>
            <dt>Inode count</dt><dd>{details.inodeCount}</dd>
            <dt>Modification time (UTC)</dt><dd>{details.modificationTimeIso}</dd>
            <dt>Block size</dt><dd>{details.blockSize}</dd>
            <dt>Fragment count</dt><dd>{details.fragmentCount}</dd>
            <dt>Compression</dt><dd>{details.compression}</dd>
            <dt>Block log</dt>
            <dd>
              {details.blockLog}
              {details.blockLogMatches ? ' (matches block size)' : ' (mismatch)'}
            </dd>
            <dt>ID count</dt><dd>{details.idCount}</dd>
            <dt>Version</dt><dd>{details.majorVersion}.{details.minorVersion}</dd>
            <dt>Root inode reference</dt><dd>{details.rootInodeReference.toString()}</dd>
            <dt>Bytes used</dt><dd>{details.bytesUsed.toString()}</dd>
            {Object.entries(details.tableOffsets).map(([name, offset]) => (
              <div className="squashfs-inspector__field" key={name}>
                <dt>{TABLE_LABELS[name]}</dt><dd>{formatTableOffset(offset)}</dd>
              </div>
            ))}
          </dl>
          <h3>Flags</h3>
          <dl className="squashfs-inspector__flags">
            {details.flags.map((flag) => (
              <div className="squashfs-inspector__field" key={flag.label}>
                <dt>{flag.label}</dt><dd>{flag.enabled ? 'Yes' : 'No'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
