import { useRef, useState } from 'react';
import { inspectFile, parseSuperblock, sampleSuperblock } from './bcachefs.utils.js';
import './bcachefs.css';

/** Render the local bcachefs superblock inspector. */
export default function BcachefsSuperblockInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  async function load(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    try {
      const parsed = await inspectFile(file);
      if (request.current === id) setResult(parsed);
    } catch (err) {
      if (request.current === id) setError(err.message);
    }
  }

  function sample() {
    request.current += 1;
    setError('');
    setResult(parseSuperblock(sampleSuperblock()));
  }

  const rows = result && [
    ['Version', result.version], ['Minimum version', result.versionMin],
    ['Block size', `${result.blockSize} bytes`], ['Superblock offset', `${result.offset} sectors`],
    ['Sequence', result.sequence.toString()], ['Internal UUID', result.uuid],
    ['User UUID', result.userUuid], ['Label', result.label || '(empty)'],
    ['Number of devices', result.devices], ['Checksum type', result.checksumType],
    ['Checksum', result.checksumStatus],
  ];
  return (
    <section className="bcachefs" aria-label="bcachefs Superblock Inspector">
      <p>Inspect the primary superblock at sector 8. Files stay in your browser.</p>
      <div className="bcachefs-actions">
        <label>Disk image <input type="file" onChange={load} /></label>
        <button type="button" onClick={sample}>Load sample data</button>
      </div>
      {error && <p className="bcachefs-error" role="alert">{error}</p>}
      {result && <>
        <dl className="bcachefs-details">
          {rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
        </dl>
        <h3>Device sector counts</h3>
        {result.members ? <ul>{result.members.map((sectors, i) => (
          <li key={i}>Device {i}: {sectors.toString()} sectors</li>
        ))}</ul> : <p>Unavailable: no member field found.</p>}
        <h3>Superblock fields</h3>
        {result.fields.length ? <ul>{result.fields.map((field, i) => (
          <li key={i}>Type {field.type}: {field.size} bytes</li>
        ))}</ul> : <p>No variable-length fields.</p>}
      </>}
    </section>
  );
}
