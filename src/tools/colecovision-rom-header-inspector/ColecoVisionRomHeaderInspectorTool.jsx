import { useEffect, useRef, useState } from 'react';
import { parseColecoVision, PREFIX_SIZE } from './colecovision.utils.js';
import './colecovision.css';

const hex = (value) => value.toString(16).toUpperCase().padStart(2, '0');

/** Inspect a locally selected ColecoVision cartridge image. */
export default function ColecoVisionRomHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Choose a ROM file to inspect locally.');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    const id = ++request.current;
    setResult(null);
    setError('');
    if (!file) {
      setStatus('Choose a ROM file to inspect locally.');
      return;
    }
    setStatus(`Reading ${file.name}…`);
    try {
      const buffer = await file.slice(0, PREFIX_SIZE).arrayBuffer();
      if (request.current !== id) return;
      setResult(parseColecoVision(new Uint8Array(buffer), file.size));
      setStatus(`Inspected ${file.name} locally.`);
    } catch (err) {
      if (request.current !== id) return;
      setError(err.message || 'Unable to read file.');
      setStatus('Inspection failed.');
    }
  }

  return (
    <section className="coleco-tool" aria-label="ColecoVision ROM Header Inspector">
      <p>Inspect a cartridge header in your browser. Files are never uploaded.</p>
      <label htmlFor="coleco-file">ROM file</label>
      <input id="coleco-file" type="file" onChange={handleFile} />
      <p role="status">{status}</p>
      {error && <p className="coleco-error" role="alert">{error}</p>}
      {result && <>
        <dl className="coleco-details">
          <dt>ROM size</dt><dd>{result.size.toLocaleString()} bytes</dd>
          <dt>Signature</dt><dd>{result.titleScreen ? 'AA 55 — title screen' :
            '55 AA — skip title screen'}</dd>
          {result.pointers.map(({ label, value }) => <div key={label}>
            <dt>{label}</dt><dd>0x{value.toString(16).toUpperCase().padStart(4, '0')}</dd>
          </div>)}
          {result.vectors.map((vector) => <div key={vector.label}>
            <dt>{vector.label}</dt><dd>{vector.bytes.map(hex).join(' ')}</dd>
          </div>)}
          {result.title && <>
            <dt>Title line 1</dt><dd>{result.title.line1}</dd>
            <dt>Title line 2</dt><dd>{result.title.line2}</dd>
            <dt>Year</dt><dd>{result.title.year}</dd>
          </>}
        </dl>
        {(result.unaligned || result.oversized) && <p role="alert" className="coleco-error">
          {result.unaligned && 'ROM size is not 8 KiB-aligned. '}
          {result.oversized && 'ROM size exceeds 32 KiB.'}
        </p>}
      </>}
    </section>
  );
}
