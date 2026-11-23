import { useEffect, useRef, useState } from 'react';
import { decodeBytes, parseGbaHeader } from './gba.utils.js';
import './gba.css';

const hex = (value, width = 2) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;

export default function GbaRomHeaderInspectorTool() {
  const [text, setText] = useState('');
  const [format, setFormat] = useState('hex');
  const [result, setResult] = useState(null);
  const [filename, setFilename] = useState('');
  const request = useRef(0);

  useEffect(() => () => { request.current += 1; }, []);

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setFilename(file.name);
    setText('');
    setResult(null);
    try {
      const buffer = await file.slice(0, 0xc0).arrayBuffer();
      if (request.current === id) setResult(parseGbaHeader(buffer));
    } catch {
      if (request.current === id) setResult({ ok: false, error: 'Could not read the file.' });
    }
  }

  function inspectText(event) {
    event.preventDefault();
    request.current += 1;
    setFilename('');
    const decoded = decodeBytes(text, format);
    setResult(decoded.ok ? parseGbaHeader(decoded.bytes) : decoded);
  }

  return (
    <section className="gba-inspector" aria-label="GBA ROM header inspector">
      <p>Inspect a ROM header locally. Files and bytes never leave your browser.</p>
      <div className="gba-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="gba-file">Choose a ROM file or drop one here</label>
        <input id="gba-file" type="file" onChange={(event) => readFile(event.target.files[0])} />
        {filename && <p>File: {filename}</p>}
      </div>
      <form onSubmit={inspectText}>
        <label htmlFor="gba-format">Byte format</label>
        <select id="gba-format" value={format} onChange={(event) => {
          request.current += 1; setFormat(event.target.value); setResult(null); setFilename('');
        }}>
          <option value="hex">Hexadecimal</option>
          <option value="base64">Base64</option>
        </select>
        <label htmlFor="gba-bytes">Paste header bytes</label>
        <textarea id="gba-bytes" value={text} onChange={(event) => {
          request.current += 1; setText(event.target.value); setResult(null); setFilename('');
        }} spellCheck={false} />
        <button type="submit">Inspect bytes</button>
      </form>
      {result && !result.ok && <p role="alert">{result.error}</p>}
      {result?.ok && <section aria-label="Header summary">
        <h2>Header summary</h2>
        <dl>
          <dt>Game title</dt><dd>{result.title || '(empty)'}</dd>
          <dt>Game code</dt><dd>{result.gameCode || '(empty)'}</dd>
          <dt>Maker code</dt><dd>{result.makerCode || '(empty)'}</dd>
          <dt>Main unit code</dt><dd>{hex(result.mainUnitCode)}</dd>
          <dt>Device type</dt><dd>{hex(result.deviceType)}</dd>
          <dt>Software version</dt><dd>{hex(result.softwareVersion)}</dd>
          <dt>ARM entry point</dt><dd>{hex(result.entry.word, 8)} — {result.entry.isBranch
            ? `branch${result.entry.link ? ' with link' : ''} to ${hex(result.entry.target, 8)}` +
              ` (condition ${hex(result.entry.condition)})`
            : 'not an ARM branch'}</dd>
          <dt>Nintendo logo</dt><dd>{result.logoValid ? 'Valid' : 'Invalid'}</dd>
          <dt>Fixed byte</dt>
          <dd>{result.fixedValid ? 'Valid' : 'Invalid'} — {hex(result.fixedByte)}
            {' '}(expected 0x96)</dd>
          <dt>Complement check</dt>
          <dd>{result.checksum.valid ? 'Valid' : 'Invalid'} — actual {hex(result.checksum.actual)},
            {' '}expected {hex(result.checksum.expected)}</dd>
        </dl>
      </section>}
    </section>
  );
}
