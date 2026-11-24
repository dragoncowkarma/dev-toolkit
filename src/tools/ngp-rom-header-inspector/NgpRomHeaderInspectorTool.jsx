import { useRef, useState } from 'react';
import { parseNgpHeader, readNgpHeader } from './ngp.utils.js';
import './ngp.css';

const FIELDS = [
  ['license', 'License'],
  ['startupAddress', 'Startup address'],
  ['softwareId', 'Software ID'],
  ['version', 'Version'],
  ['colorMode', 'Color mode'],
  ['title', 'Game title'],
];

/** Displays a locally parsed Neo Geo Pocket ROM header. */
export default function NgpRomHeaderInspectorTool() {
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    const request = ++requestRef.current;
    setHeader(null);
    setError('');
    if (!file) return;
    try {
      const buffer = await readNgpHeader(file);
      const result = parseNgpHeader(buffer);
      if (request === requestRef.current) setHeader(result);
    } catch (err) {
      if (request === requestRef.current) setError(err.message);
    }
  }

  return (
    <section className="ngp-inspector" aria-label="Neo Geo Pocket ROM header inspector">
      <p>Select a ROM to inspect its first 64 bytes. Your file stays in your browser.</p>
      <label htmlFor="ngp-file">ROM file</label>
      <input id="ngp-file" type="file" accept=".ngp,.ngc,.npc" onChange={handleFileChange} />
      {error && <p className="ngp-error" role="alert">{error}</p>}
      {header && (
        <dl className="ngp-fields">
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{header[key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
