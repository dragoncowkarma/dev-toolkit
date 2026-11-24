import { useRef, useState } from 'react';
import { parseRomfsHeader } from './romfs.utils.js';
import './romfs.css';

/** Inspect a local ROMFS image without uploading it. */
export default function RomfsSuperblockInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    const request = ++requestRef.current;
    setResult(null);
    setError('');
    if (!file) return;
    try {
      const buffer = await file.slice(0, 512).arrayBuffer();
      if (request === requestRef.current) setResult(parseRomfsHeader(buffer));
    } catch (err) {
      if (request === requestRef.current) setError(err.message || 'Could not read the file.');
    }
  }

  return (
    <section className="romfs-tool" aria-label="ROMFS Superblock Inspector">
      <p>Select a ROMFS image. Only its first 512 bytes are read locally.</p>
      <label htmlFor="romfs-file">ROMFS image</label>
      <input id="romfs-file" type="file" onChange={handleFileChange} />
      {error && <p role="alert" className="romfs-error">{error}</p>}
      {result && (
        <div aria-live="polite">
          <dl>
            <dt>Magic</dt><dd>{result.magic}</dd>
            <dt>Volume name</dt><dd>{result.volumeName || '(empty)'}</dd>
            <dt>Full size</dt><dd>{result.fullSize} bytes</dd>
            <dt>Checksum</dt>
            <dd>0x{result.checksum.toString(16).padStart(8, '0')}</dd>
            <dt>Checksum verification</dt><dd>{result.checksumValid ? 'Pass' : 'Fail'}</dd>
            <dt>First file header offset</dt><dd>{result.firstFileOffset} bytes</dd>
          </dl>
          {result.headerExceedsSize && (
            <p role="alert" className="romfs-error">Full size is smaller than the header.</p>
          )}
        </div>
      )}
    </section>
  );
}
