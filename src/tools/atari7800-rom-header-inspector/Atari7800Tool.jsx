import { useEffect, useRef, useState } from 'react';
import { decodeHeader, parseHex, readHeader } from './header.utils.js';
import './header.css';

/** Inspect an A78 header from a file or hexadecimal input. */
export default function Atari7800Tool() {
  const [hex, setHex] = useState('');
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const request = useRef(0);
  const fileInput = useRef(null);

  useEffect(() => () => { request.current += 1; }, []);

  function changeHex(event) {
    request.current += 1;
    const value = event.target.value;
    setHex(value);
    setFileName('');
    if (fileInput.current) fileInput.current.value = '';
    if (!value.trim()) {
      setHeader(null);
      setError('');
      return;
    }
    const parsed = parseHex(value);
    setError(parsed.error || '');
    setHeader(parsed.bytes ? decodeHeader(parsed.bytes) : null);
  }

  async function changeFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setHex('');
    setFileName(file.name);
    setHeader(null);
    setError('');
    try {
      const bytes = await readHeader(file);
      if (request.current === id) setHeader(decodeHeader(bytes));
    } catch {
      if (request.current === id) setError('Could not read the file.');
    }
  }

  function clear() {
    request.current += 1;
    setHex('');
    setFileName('');
    setHeader(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="a78-tool" aria-label="Atari 7800 ROM Header Inspector">
      <p>Inspect the first 128 bytes of an A78 file. Your data stays in this browser.</p>
      <label htmlFor="a78-file">ROM file</label>
      <input id="a78-file" ref={fileInput} type="file" onChange={changeFile} />
      {fileName && <p>Selected: {fileName}</p>}
      <label htmlFor="a78-hex">Hex bytes</label>
      <textarea
        id="a78-hex"
        value={hex}
        onChange={changeHex}
        placeholder="Paste hexadecimal byte pairs"
        spellCheck={false}
      />
      <button type="button" onClick={clear}>Clear</button>
      {error && <p className="a78-error" role="alert">{error}</p>}
      {header && (
        <div>
          {header.Signature === 'Invalid' && (
            <p className="a78-error" role="alert">Invalid ATARI7800 signature.</p>
          )}
          <dl className="a78-results">
            {Object.entries(header).map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value || '(empty)'}</dd></div>
            ))}
          </dl>
          {header.Version >= 4 && <p>V4 mapper fields take precedence over legacy cart flags.</p>}
        </div>
      )}
    </section>
  );
}
