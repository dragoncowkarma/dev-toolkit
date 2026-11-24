import { useEffect, useRef, useState } from 'react';
import { parseBootSector, readFilePrefix } from './refs.utils.js';
import './refs.css';

/**
 * Inspect a ReFS boot sector from a local file.
 * @returns {React.JSX.Element} The inspector UI.
 */
export default function RefsBootSectorInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => () => { requestRef.current += 1; }, []);

  async function inspect(file) {
    if (!file) return;
    const request = ++requestRef.current;
    setResult(null);
    setError('');
    setFileName(file.name);
    setLoading(true);
    try {
      const buffer = await readFilePrefix(file);
      if (request !== requestRef.current) return;
      setResult(parseBootSector(buffer));
    } catch (err) {
      if (request !== requestRef.current) return;
      setError(err.message || 'Could not inspect the selected file.');
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }

  function clear() {
    requestRef.current += 1;
    setResult(null);
    setFileName('');
    setError('');
    setLoading(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    inspect(event.dataTransfer.files[0]);
  }

  const fields = result && [
    ['Structure length', `${result.structureLength} bytes`],
    ['Bytes per sector', result.bytesPerSector],
    ['Sectors per cluster', result.sectorsPerCluster],
    ['Sector count', result.sectorCount.toString()],
    ['Major version', result.majorVersion],
    ['Minor version', result.minorVersion],
    ['Serial number', `0x${result.serialNumber.toString(16).toUpperCase().padStart(16, '0')}`],
    ['Checksum', `0x${result.checksum.toString(16).toUpperCase().padStart(4, '0')}`],
  ];

  return (
    <section className="refs-inspector" aria-label="ReFS Boot Sector Inspector">
      <div className="refs-drop" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <p>Drop a ReFS boot sector or partition image here, or choose a file.</p>
        <p>Only the first 4 KiB is read locally. The image must start at the ReFS volume.</p>
        <label className="refs-button refs-file">
          Choose file
          <input
            ref={inputRef}
            type="file"
            aria-label="Choose a ReFS image"
            onChange={(event) => inspect(event.target.files[0])}
          />
        </label>
        <button type="button" className="refs-button" onClick={clear}>Clear</button>
      </div>
      {fileName && <p>File: {fileName}</p>}
      {loading && <p role="status">Reading file…</p>}
      {error && <p className="refs-error" role="alert">{error}</p>}
      {fields && (
        <dl className="refs-fields">
          {fields.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      )}
    </section>
  );
}
