import { useRef, useState } from 'react';
import { parseBootSector } from './fat.utils.js';
import './fat.css';

const labels = {
  fatType: 'FAT type', oemName: 'OEM name', bytesPerSector: 'Bytes per sector',
  sectorsPerCluster: 'Sectors per cluster', reservedSectors: 'Reserved sectors',
  fatCount: 'FAT count', rootEntries: 'Root entries', totalSectors: 'Total sectors',
  mediaDescriptor: 'Media descriptor', sectorsPerFat: 'Sectors per FAT',
  dataRegionStart: 'Data region start (sector)', clusterCount: 'Cluster count',
  rootCluster: 'Root cluster', fsInfoSector: 'FSInfo sector', volumeLabel: 'Volume label',
  filesystemType: 'Filesystem type string',
};

/** Render a local FAT boot sector inspector. */
export default function FatBootSectorInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const request = useRef(0);
  const input = useRef(null);

  async function inspect(file) {
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    setFileName(file.name);
    try {
      const buffer = await file.slice(0, 512).arrayBuffer();
      const parsed = parseBootSector(buffer);
      if (request.current === id) setResult(parsed);
    } catch (err) {
      if (request.current === id) setError(err.message || 'Failed to read the selected file.');
    }
  }

  function clear() {
    request.current += 1;
    setResult(null);
    setError('');
    setFileName('');
    if (input.current) input.current.value = '';
  }

  return (
    <section className="fat-inspector" aria-label="FAT Boot Sector Inspector">
      <p>Inspect the first 512 bytes of a disk image locally in your browser.</p>
      <div className="fat-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); inspect(event.dataTransfer.files[0]); }}>
        <label className="fat-button">
          Choose a file
          <input ref={input} type="file" aria-label="Choose a disk image"
            onChange={(event) => inspect(event.target.files[0])} />
        </label>
        <span> or drop a file here</span>
      </div>
      <button className="fat-button" type="button" onClick={clear}>Clear</button>
      {fileName && <p>File: {fileName}</p>}
      {error && <p className="fat-error" role="alert">{error}</p>}
      {result && <dl className="fat-results">
        {Object.entries(result).map(([key, value]) => (
          <div key={key}><dt>{labels[key]}</dt><dd>{key === 'mediaDescriptor'
            ? `0x${value.toString(16).toUpperCase().padStart(2, '0')}` : String(value)}</dd></div>
        ))}
      </dl>}
    </section>
  );
}
