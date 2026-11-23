import { useRef, useState } from 'react';
import { inspectExfat, parseHex } from './exfat.utils.js';
import './exfat.css';

/** Render a local exFAT boot sector inspector. */
export default function ExfatBootSectorInspectorTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspectText(value) {
    request.current += 1;
    setHex(value);
    if (!value.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parseHex(value);
    setError(parsed.error || '');
    setResult(parsed.bytes ? inspectExfat(parsed.bytes) : null);
  }

  function readFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setHex('');
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (request.current === id) setResult(inspectExfat(new Uint8Array(reader.result)));
    };
    reader.onerror = () => {
      if (request.current === id) setError('Could not read the selected file.');
    };
    reader.readAsArrayBuffer(file.slice(0, 512));
    event.target.value = '';
  }

  return (
    <section className="exfat-tool" aria-label="exFAT Boot Sector Inspector">
      <p>Choose a volume image or paste hexadecimal bytes. Data stays in your browser.</p>
      <label htmlFor="exfat-file">Choose a file</label>
      <input id="exfat-file" type="file" onChange={readFile} />
      <label htmlFor="exfat-hex">Hexadecimal bytes</label>
      <textarea id="exfat-hex" value={hex} onChange={(event) => inspectText(event.target.value)}
        placeholder="Paste the first 512 bytes as hex" spellCheck={false} />
      {error && <p role="alert">{error}</p>}
      {result && <>
        {result.warnings.length > 0 && <div role="alert"><strong>Warnings</strong>
          <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>}
        <h3>Boot sector fields</h3>
        <dl>{Object.entries(result.fields).map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>
        ))}</dl>
        <h3>Derived geometry</h3>
        <dl>{Object.entries(result.derived).map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{String(value)}</dd></div>
        ))}</dl>
      </>}
    </section>
  );
}
