import { useEffect, useRef, useState } from 'react';
import { parseSnesHeader } from './snes.utils.js';
import './snes.css';

/** Render a local SNES ROM header inspector. */
export default function SnesRomHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const request = useRef(0);
  const input = useRef(null);
  useEffect(() => () => { request.current += 1; }, []);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    setResult(null);
    setError('');
    setFileName(file?.name || '');
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (id !== request.current) return;
      setResult(parseSnesHeader(bytes));
    } catch (err) {
      if (id === request.current) setError(err.message || 'Unable to read this file.');
    }
  }

  function clear() {
    request.current += 1;
    setResult(null);
    setFileName('');
    setError('');
    if (input.current) input.current.value = '';
  }

  const fields = result && [
    ['Mapping', result.mapping], ['Copier header', result.copierHeader ? 'Present' : 'Absent'],
    ['Header offset', result.headerOffset], ['Title', result.title || '(empty)'],
    ['Map mode', result.mapMode], ['ROM type', result.romType], ['ROM size', result.romSize],
    ['RAM size', result.ramSize], ['Destination', result.destination],
    ['Developer ID', result.developerId], ['Version', result.version],
    ['Checksum complement', result.complement], ['Checksum', result.checksum],
    ['Checksum complement check', result.checksumValid ? 'Valid' : 'Invalid'],
  ];
  return (
    <section className="snes-tool" aria-label="SNES ROM Header Inspector">
      <p>Choose a ROM file to inspect its cartridge header. Files stay in your browser.</p>
      <div className="snes-actions">
        <label htmlFor="snes-file">ROM file</label>
        <input id="snes-file" ref={input} type="file" onChange={handleFile} />
        <button type="button" onClick={clear}>Clear</button>
      </div>
      {fileName && <p>Selected: {fileName}</p>}
      {error && <p className="snes-error" role="alert">{error}</p>}
      {result && (
        <>
          <dl className="snes-fields">
            {fields.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <p>The complement check compares header fields; it does not verify ROM contents.</p>
        </>
      )}
    </section>
  );
}
