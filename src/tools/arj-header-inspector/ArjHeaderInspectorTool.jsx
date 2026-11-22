import { useRef, useState } from 'react';
import { parseArjHeaders } from './arj-header.utils.js';
import './arj-header.css';

const labels = {
  magic: 'Magic bytes', basicHeaderSize: 'Basic header size', firstHeaderSize: 'First header size',
  headerCrc: 'Basic header CRC-32', archiverVersion: 'Archiver version',
  extractVersion: 'Extract version', hostOS: 'Host OS', flags: 'ARJ flags', fileType: 'File type',
  securityVersion: 'Security version', created: 'Created (DOS)', modified: 'Modified (DOS)',
  archiveSize: 'Archive size', method: 'Compression method', compressedSize: 'Compressed size',
  originalSize: 'Original size', originalCrc: 'Original CRC-32', filename: 'Filename',
  comment: 'Comment',
};

function HeaderDetails({ title, header }) {
  return (
    <section className="arj-header-details">
      <h3>{title}</h3>
      <dl>
        {Object.entries(header).map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>{key === 'headerCrc' || key === 'originalCrc'
              ? `0x${value.toString(16).toUpperCase().padStart(8, '0')}` : String(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** @returns {React.JSX.Element} ARJ metadata inspector. */
export default function ArjHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    setResult(null);
    setError('');
    if (!file) return;
    try {
      const parsed = parseArjHeaders(await file.arrayBuffer());
      if (request.current === id) setResult(parsed);
    } catch (err) {
      if (request.current === id) setError(err.message || 'Failed to read file.');
    }
  }

  return (
    <section className="arj-inspector" aria-label="ARJ Header Inspector">
      <p>Inspect archive metadata locally. File contents are not decompressed or uploaded.</p>
      <label htmlFor="arj-file">Choose an ARJ archive</label>
      <input id="arj-file" type="file" accept=".arj" onChange={handleFile} />
      <p>Names and comments are shown as byte values; legacy character encodings may differ.</p>
      {error && <p role="alert">{error}</p>}
      {result && <HeaderDetails title="Main header" header={result.mainHeader} />}
      {result && (result.fileHeader
        ? <HeaderDetails title="First file header" header={result.fileHeader} />
        : <p>The archive contains no file headers.</p>)}
    </section>
  );
}
