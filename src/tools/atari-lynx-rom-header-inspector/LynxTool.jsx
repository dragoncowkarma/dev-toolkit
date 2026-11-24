import { useEffect, useRef, useState } from 'react';
import { parseHeader, parseHex } from './header.utils.js';
import './header.css';

/** Inspect a local LNX file or hexadecimal header. */
export default function LynxTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);

  function handleHex(event) {
    request.current += 1;
    const value = event.target.value;
    setHex(value);
    if (!value.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parseHex(value);
    setError(parsed.error || '');
    setResult(parsed.bytes ? parseHeader(parsed.bytes) : null);
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    const id = ++request.current;
    setHex('');
    setResult(null);
    setError('');
    try {
      const buffer = await file.slice(0, 64).arrayBuffer();
      if (id !== request.current) return;
      setResult(parseHeader(new Uint8Array(buffer)));
    } catch {
      if (id === request.current) setError('Could not read the file.');
    }
  }

  return (
    <section className="lynx-tool" aria-label="Atari Lynx ROM Header Inspector">
      <p>Inspect the first 64 bytes of an LNX file locally in your browser.</p>
      <label htmlFor="lynx-file">LNX file</label>
      <input id="lynx-file" type="file" accept=".lnx" onChange={handleFile} />
      <label htmlFor="lynx-hex">Header hex (up to 64 bytes)</label>
      <textarea id="lynx-hex" value={hex} onChange={handleHex} spellCheck={false}
        placeholder="4C 59 4E 58 ..." />
      {(error || result?.error) && <p role="alert">{error || result.error}</p>}
      {result && <dl className="lynx-fields">
        {Object.entries(result.fields).map(([name, value]) => (
          <div key={name}><dt>{name}</dt><dd>{value === '' ? '(empty)' : value}</dd></div>
        ))}
      </dl>}
    </section>
  );
}
