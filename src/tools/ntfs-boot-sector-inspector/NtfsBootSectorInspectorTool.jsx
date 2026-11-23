import { useRef, useState } from 'react';
import { decodeRecordSize, hexDump, parseHex, parseNtfsBootSector } from './ntfs.utils.js';
import './ntfs.css';

/** Inspect a local NTFS boot sector without sending data to a server. */
export default function NtfsBootSectorInspectorTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspect(bytes) {
    try {
      setResult(parseNtfsBootSector(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    setHex('');
    try {
      const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
      if (id === request.current) inspect(bytes);
    } catch {
      if (id === request.current) setError('Could not read the selected file.');
    }
  }

  function inspectHex() {
    request.current += 1;
    try {
      inspect(parseHex(hex));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  const rows = result && [
    ['Bytes per sector', result.bytesPerSector],
    ['Sectors per cluster', result.sectorsPerCluster],
    ['Media descriptor',
      `0x${result.mediaDescriptor.toString(16).padStart(2, '0').toUpperCase()}`],
    ['Sectors per track', result.sectorsPerTrack],
    ['Heads', result.heads],
    ['Hidden sectors', result.hiddenSectors],
    ['Total sectors', result.totalSectors.toString()],
    ['$MFT cluster', result.mftCluster.toString()],
    ['$MFTMirr cluster', result.mftMirrCluster.toString()],
    ['Clusters per MFT record',
      `${result.mftRecordCode} (${decodeRecordSize(result.mftRecordCode)})`],
    ['Clusters per index buffer',
      `${result.indexBufferCode} (${decodeRecordSize(result.indexBufferCode)})`],
    ['Volume serial number', `0x${result.serial.toString(16).padStart(16, '0').toUpperCase()}`],
    ['Stored checksum (not validated)',
      `0x${result.checksum.toString(16).padStart(8, '0').toUpperCase()}`],
  ];

  return (
    <section className="ntfs-inspector" aria-label="NTFS Boot Sector Inspector">
      <p>Inspect the first 512 bytes of a volume locally in your browser.</p>
      <div className="ntfs-inspector__drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="ntfs-file">Upload or drop a disk image or boot sector</label>
        <input id="ntfs-file" type="file" onChange={(event) => readFile(event.target.files[0])} />
      </div>
      <label htmlFor="ntfs-hex">Or paste hexadecimal bytes</label>
      <textarea id="ntfs-hex" className="panel-textarea" value={hex} spellCheck={false}
        onChange={(event) => {
          request.current += 1; setHex(event.target.value); setResult(null); setError('');
        }} />
      <button type="button" className="btn" onClick={inspectHex}>Inspect hex</button>
      {error && <p role="alert">{error}</p>}
      {result && <>
        <h3>Volume geometry and metadata</h3>
        <dl className="ntfs-inspector__fields">
          {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <h3>Raw hex dump</h3>
        <pre className="ntfs-inspector__dump">{hexDump(result.bytes)}</pre>
      </>}
    </section>
  );
}
