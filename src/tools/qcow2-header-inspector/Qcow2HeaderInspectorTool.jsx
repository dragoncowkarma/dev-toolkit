import { useRef, useState } from 'react';
import { decodeInput, formatSize, parseQcow2 } from './qcow2.utils.js';
import './qcow2.css';

const incompatibleNames = ['Dirty', 'Corrupt', 'External data file', 'Compression type',
  'Extended L2'];

function featureText(value, names) {
  const enabled = names.filter((name, index) => name && (value & (1n << BigInt(index))));
  return `0x${value.toString(16)}${enabled.length ? ` (${enabled.join(', ')})` : ''}`;
}

function metadata(header) {
  const rows = [
    ['Version', header.version],
    ['Backing file offset', header.backingOffset],
    ['Backing file size', header.backingSize],
    ['Backing file path', header.backingPath || 'None'],
    ['Cluster bits', header.clusterBits],
    ['Cluster size', `${header.clusterSize} bytes`],
    ['Virtual disk size', `${header.virtualSize} bytes (${formatSize(header.virtualSize)})`],
    ['Encryption method', `${header.encryption} (${['None', 'AES', 'LUKS'][header.encryption]
      ?? 'Unknown'})`],
    ['L1 table entries', header.l1Size],
    ['L1 table offset', header.l1Offset],
    ['Refcount table offset', header.refcountOffset],
    ['Refcount table clusters', header.refcountClusters],
    ['Snapshot count', header.snapshotCount],
    ['Snapshots offset', header.snapshotsOffset],
  ];
  if (header.version === 3) {
    rows.push(
      ['Incompatible features', featureText(header.incompatibleFeatures, incompatibleNames)],
      ['Compatible features', featureText(header.compatibleFeatures, ['Lazy refcounts'])],
      ['Autoclear features', featureText(header.autoclearFeatures, [])],
      ['Refcount order', header.refcountOrder],
      ['Refcount bits', header.refcountBits],
      ['Header length', header.headerLength],
    );
    if (header.compressionType !== null) {
      rows.push(['Compression type', `${header.compressionType} (${
        ['zlib', 'zstd'][header.compressionType] ?? 'Unknown'})`]);
    }
  }
  return rows;
}

/** Render a local QCOW2 header inspector. */
export default function Qcow2HeaderInspectorTool() {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('hex');
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const request = useRef(0);

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setError('');
    setHeader(null);
    setFileName(file.name);
    try {
      const bytes = new Uint8Array(await file.slice(0, 105).arrayBuffer());
      // Read the path independently so large images do not need to be loaded into memory.
      let backingBytes;
      if (bytes.length >= 20) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const offset = view.getBigUint64(8);
        const size = view.getUint32(16);
        if (size && offset > 0n && offset + BigInt(size) <= BigInt(file.size)) {
          backingBytes = new Uint8Array(await file.slice(Number(offset), Number(offset) + size)
            .arrayBuffer());
        }
      }
      const result = parseQcow2(bytes, { totalSize: file.size, backingBytes });
      if (request.current === id) setHeader(result);
    } catch (err) {
      if (request.current === id) setError(err.message || 'Could not read the file.');
    }
  }

  function inspectText(event) {
    event.preventDefault();
    request.current += 1;
    setFileName('');
    try {
      setHeader(parseQcow2(decodeInput(input, format)));
      setError('');
    } catch (err) {
      setHeader(null);
      setError(err.message);
    }
  }

  return (
    <section className="qcow2-tool" aria-label="QCOW2 header inspector">
      <p>Inspect a QCOW2 image locally. Input data stays in your browser.</p>
      <div className="qcow2-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="qcow2-file">Choose a QCOW2 file or drop one here</label>
        <input id="qcow2-file" type="file"
          onChange={(event) => readFile(event.target.files[0])} />
        {fileName && <p>Selected: {fileName}</p>}
      </div>
      <form onSubmit={inspectText}>
        <label htmlFor="qcow2-format">Paste format</label>
        <select id="qcow2-format" value={format}
          onChange={(event) => setFormat(event.target.value)}>
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
        </select>
        <label htmlFor="qcow2-input">Header and backing file bytes</label>
        <textarea id="qcow2-input" value={input} onChange={(event) => setInput(event.target.value)}
          spellCheck={false} />
        <button type="submit">Inspect pasted data</button>
      </form>
      {error && <p className="qcow2-error" role="alert">{error}</p>}
      {header && <section aria-labelledby="qcow2-results">
        <h2 id="qcow2-results">Header metadata</h2>
        <dl>{metadata(header).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>
        ))}</dl>
      </section>}
    </section>
  );
}
