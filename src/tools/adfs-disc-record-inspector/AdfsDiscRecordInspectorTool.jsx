import { useRef, useState } from 'react';
import { inspectAdfs } from './adfs.utils.js';
import './adfs.css';

const FIELDS = [
  ['Format', 'format'], ['Log2 sector size', 'log2SectorSize'],
  ['Sectors per track', 'sectorsPerTrack'], ['Heads', 'heads'], ['Density', 'density'],
  ['ID length', 'idLength'], ['Log2 bytes per map bit', 'log2BytesPerMapBit'],
  ['Skew', 'skew'], ['Boot option', 'bootOption'], ['Zones', 'zones'],
  ['Disc size (bytes)', 'discSize'], ['Disc ID', 'discId'], ['Disc name', 'discName'],
];

/** Inspect an uploaded image using only a bounded local slice. */
export default function AdfsDiscRecordInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  async function handleFile(event) {
    const id = ++request.current;
    const file = event.target.files?.[0];
    setResult(null);
    setError('');
    if (!file) return;
    try {
      const bytes = await file.slice(0, 4096).arrayBuffer();
      if (id === request.current) setResult(inspectAdfs(bytes));
    } catch {
      if (id === request.current) setError('Unable to read the image.');
    }
  }

  return (
    <section className="adfs-inspector" aria-label="ADFS Disc Record Inspector">
      <p>Choose a disc image. Only the first 4096 bytes are read locally.</p>
      <label>Disc image <input type="file" onChange={handleFile} /></label>
      {error && <p role="alert">{error}</p>}
      {result && <>
        <dl>
          {FIELDS.map(([label, key]) => <div key={key}>
            <dt>{label}</dt><dd>{result[key] ?? 'Unknown'}</dd>
          </div>)}
          <div><dt>Old map sector 0 checksum</dt><dd>{result.mapChecksums[0]}</dd></div>
          <div><dt>Old map sector 1 checksum</dt><dd>{result.mapChecksums[1]}</dd></div>
          <div><dt>Boot block checksum</dt><dd>{result.bootChecksum}</dd></div>
        </dl>
        <p>New-map checksums: Unknown (map zones may lie beyond the first 4096 bytes).</p>
        {result.extents && <><h3>Old map free extents (256-byte sectors)</h3>
          {result.extents.length ? <ul>{result.extents.map(({ start, length }) =>
            <li key={start}>Start {start}, length {length}</li>)}</ul> : <p>No free extents.</p>}
        </>}
      </>}
    </section>
  );
}
