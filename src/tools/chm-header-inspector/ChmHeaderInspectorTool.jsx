import { useRef, useState } from 'react';
import { parseChmHeader } from './chm.utils.js';
import './chm.css';

/** Render a local CHM header inspector. */
export default function ChmHeaderInspectorTool() {
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const request = useRef(0);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    const current = ++request.current;
    setHeader(null);
    setError('');
    setName(file?.name || '');
    if (!file) return;
    try {
      const buffer = await file.slice(0, 96).arrayBuffer();
      const parsed = parseChmHeader(buffer);
      if (parsed['Header length'] > file.size) {
        throw new Error('Truncated file: incomplete ITSF header.');
      }
      if (request.current === current) setHeader(parsed);
    } catch (err) {
      if (request.current === current) setError(err.message || 'Unable to read file.');
    }
  }

  return (
    <section className="chm-tool" aria-label="CHM Header Inspector">
      <p>Select a CHM file to inspect its ITSF header. The file stays on your device.</p>
      <label htmlFor="chm-file">CHM file</label>
      <input id="chm-file" type="file" accept=".chm" onChange={handleFile} />
      {name && <p>File: {name}</p>}
      {error && <div className="chm-error" role="alert">{error}</div>}
      {header && (
        <div className="chm-results" aria-label="ITSF header fields">
          <h2>ITSF header</h2>
          <dl>
            {Object.entries(header).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
