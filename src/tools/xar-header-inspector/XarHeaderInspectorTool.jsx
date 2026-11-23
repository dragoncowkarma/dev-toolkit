import { useRef, useState } from 'react';
import { parseXarHeader } from './xar.utils.js';
import './xar-header.css';

/** @returns {React.JSX.Element} The local XAR header inspector. */
export default function XarHeaderInspectorTool() {
  const [file, setFile] = useState(null);
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef(0);

  function selectFile(event) {
    request.current += 1;
    setFile(event.target.files?.[0] ?? null);
    setHeader(null);
    setError('');
    setLoading(false);
  }

  async function inspect() {
    const id = ++request.current;
    setHeader(null);
    setError('');
    if (!file) {
      setError('Select a file to inspect.');
      return;
    }
    setLoading(true);
    try {
      const buffer = await file.slice(0, 28).arrayBuffer();
      const parsed = parseXarHeader(buffer, file.size);
      if (request.current === id) setHeader(parsed);
    } catch (err) {
      if (request.current === id) setError(err.message || 'Could not read the file.');
    } finally {
      if (request.current === id) setLoading(false);
    }
  }

  return (
    <section className="xar-inspector" aria-label="XAR Header Inspector">
      <p>Inspect a XAR archive header locally. Files stay in your browser.</p>
      <div className="xar-inspector__controls">
        <label htmlFor="xar-file">XAR file</label>
        <input id="xar-file" type="file" onChange={selectFile} />
        <button type="button" onClick={inspect}>Inspect</button>
      </div>
      {loading && <p role="status">Reading header…</p>}
      {error && <p role="alert">{error}</p>}
      {header && (
        <div className="xar-inspector__results" role="status">
          <h2>Header information</h2>
          <dl>
            <dt>Magic</dt><dd>xar!</dd>
            <dt>Header size</dt><dd>{header.size} bytes</dd>
            <dt>Version</dt><dd>{header.version}</dd>
            <dt>Compressed TOC length</dt><dd>{header.tocLengthCompressed.toString()} bytes</dd>
            <dt>Uncompressed TOC length</dt><dd>{header.tocLengthUncompressed.toString()} bytes</dd>
            <dt>Checksum algorithm</dt><dd>{header.checksum}</dd>
            <dt>Heap offset</dt><dd>{header.heapOffset.toString()} bytes</dd>
            <dt>TOC extends past end of file</dt><dd>{header.tocPastEof ? 'Yes' : 'No'}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
