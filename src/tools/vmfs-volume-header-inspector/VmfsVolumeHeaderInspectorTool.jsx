import { useEffect, useRef, useState } from 'react';
import { readVmfsFile } from './vmfs.utils.js';
import './vmfs.css';

const fields = [
  ['LVM version', 'version'], ['Volume label', 'label'], ['Volume UUID', 'uuid'],
  ['Device block size (bytes)', 'blockSize'], ['Logical size (bytes)', 'logicalSize'],
  ['Device UUID', 'deviceUuid'], ['Device size (bytes)', 'totalBytes'],
  ['Volume count', 'volumeCount'], ['Physical extents', 'physicalExtents'],
  ['Last extent index', 'lastExtent'], ['Generation', 'generation'],
  ['Data offset (bytes)', 'dataOffset'], ['Created (microseconds)', 'created'],
  ['Modified (microseconds)', 'modified'], ['Extent maps', 'extentMaps'],
  ['Extended metadata offset', 'extendedMetadataOffset'], ['Metadata alignment', 'alignment'],
  ['Flags', 'flags'], ['SCSI vendor', 'vendor'], ['SCSI model', 'model'],
];

/** Render the VMFS LVM header inspector. */
export default function VmfsVolumeHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function inspect(file) {
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    setName(file.name);
    try {
      const value = await readVmfsFile(file);
      if (request.current === id) setResult(value);
    } catch (err) {
      if (request.current === id) setError(err.message);
    }
  }

  return (
    <section className="vmfs-inspector" aria-label="VMFS volume header inspector">
      <p>Select or drop a VMFS partition image or a slice starting at its LVM header.</p>
      <label className="vmfs-inspector__drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); inspect(event.dataTransfer.files[0]); }}>
        <span>Choose or drop a file</span>
        <input type="file" onChange={(event) => inspect(event.target.files[0])} />
      </label>
      {name && <p>File: {name}</p>}
      {error && <p className="vmfs-inspector__error" role="alert">{error}</p>}
      <div aria-live="polite">
        {result && (
          <section aria-label="Header results">
            <h2>First logical volume and LVM device</h2>
            <dl>
              {fields.map(([label, key]) => (
                <div key={key}><dt>{label}</dt><dd>{String(result[key]) || '—'}</dd></div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </section>
  );
}
