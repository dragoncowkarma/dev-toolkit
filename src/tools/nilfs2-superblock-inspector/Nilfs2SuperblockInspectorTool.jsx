import { useRef, useState } from 'react';
import { createSampleImage, inspectImage } from './nilfs2.utils.js';
import './nilfs2.css';

const labels = {
  revision: 'Revision', inodeSize: 'Bytes per inode', blockSizeShift: 'Block size shift',
  blocksPerSegment: 'Blocks per segment', reservedPercentage: 'Reserved segments (%)',
  deviceSize: 'Device size (bytes)', uuid: 'UUID', volumeName: 'Volume name',
  crcSeed: 'CRC32 seed', checksum: 'Stored checksum', checksumLength: 'Checksum length (bytes)',
};

function Superblock({ title, result }) {
  return (
    <section className="nilfs2-result">
      <h3>{title}</h3>
      {result.offset !== undefined && <p>Offset: {result.offset.toString()} bytes</p>}
      <p role={result.status === 'warning' ? 'alert' : undefined}>
        {result.status.toUpperCase()}: {result.message}
      </p>
      {result.fields && <dl>{Object.entries(result.fields).map(([key, value]) => (
        <div key={key}><dt>{labels[key]}</dt><dd>{String(value)}</dd></div>
      ))}</dl>}
    </section>
  );
}

/** Render the NILFS2 inspector. */
export default function Nilfs2SuperblockInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const request = useRef(0);

  async function inspect(file, displayName) {
    const id = ++request.current;
    setResult(null);
    setError('');
    setName(displayName);
    try {
      const next = await inspectImage(file);
      if (id === request.current) setResult(next);
    } catch {
      if (id === request.current) setError('Unable to read the selected image.');
    }
  }

  return (
    <section className="nilfs2-tool" aria-label="NILFS2 Superblock Inspector">
      <p>Inspect superblocks locally. Only the required byte ranges are read.</p>
      <div className="nilfs2-actions">
        <label>Image file <input type="file" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) inspect(file, file.name);
        }} /></label>
        <button type="button" className="btn"
          onClick={() => inspect(createSampleImage(), 'Sample data')}>
          Load sample data
        </button>
      </div>
      {name && <p>Input: {name}</p>}
      {error && <p role="alert">{error}</p>}
      {result && <><Superblock title="Primary superblock" result={result.primary} />
        <Superblock title="Secondary superblock" result={result.secondary} /></>}
    </section>
  );
}
