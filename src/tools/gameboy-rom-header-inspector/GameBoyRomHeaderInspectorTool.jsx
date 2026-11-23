import { useRef, useState } from 'react';
import { decodeBytes, parseGameBoyHeader } from './gameboy.utils.js';
import './gameboy.css';

const hex = (value, width) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const checksum = (value, width) =>
  `${value.valid ? 'Valid' : 'Invalid'} — expected ${hex(value.expected, width)}, ` +
  `actual ${hex(value.actual, width)}`;

/** Inspect cartridge metadata from local files or pasted bytes. */
export default function GameBoyRomHeaderInspectorTool() {
  const [text, setText] = useState('');
  const [format, setFormat] = useState('hex');
  const [result, setResult] = useState(null);
  const [source, setSource] = useState('');
  const request = useRef(0);

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setSource(`Reading ${file.name}…`);
    try {
      const data = await file.arrayBuffer();
      if (request.current !== id) return;
      setResult(parseGameBoyHeader(data));
      setSource(file.name);
    } catch {
      if (request.current !== id) return;
      setResult({ ok: false, error: 'Could not read the selected file.' });
      setSource('');
    }
  }

  function inspectText(event) {
    event.preventDefault();
    request.current += 1;
    const decoded = decodeBytes(text, format);
    setResult(decoded.ok ? parseGameBoyHeader(decoded.bytes) : decoded);
    setSource('Pasted bytes');
  }

  const fields = result?.ok ? [
    ['Title', result.title], ['CGB flag', result.cgb], ['SGB flag', result.sgb],
    ['Cartridge type', result.cartridgeType], ['ROM size', result.romSize],
    ['RAM size', result.ramSize], ['Destination', result.destination],
    ['Old licensee code', result.oldLicensee], ['New licensee code', result.newLicensee],
    ['ROM version', result.version], ['Nintendo logo', result.logoValid ? 'Valid' : 'Invalid'],
    ['Header checksum', checksum(result.headerChecksum, 2)],
    ['Global checksum', checksum(result.globalChecksum, 4)],
  ] : [];

  return (
    <section className="gameboy-inspector" aria-label="Game Boy ROM header inspector">
      <p>Files and pasted bytes stay in your browser. Global checksum uses all supplied bytes;
        provide the complete ROM for a meaningful result.</p>
      <div className="gameboy-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="gameboy-file">Select a ROM file or drop one here</label>
        <input id="gameboy-file" type="file" onChange={(event) => {
          readFile(event.target.files[0]);
          event.target.value = '';
        }} />
      </div>
      <form onSubmit={inspectText}>
        <label htmlFor="gameboy-format">Pasted byte format</label>
        <select id="gameboy-format" value={format} onChange={(event) => {
          request.current += 1;
          setFormat(event.target.value);
          setResult(null);
          setSource('');
        }}>
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
        </select>
        <label htmlFor="gameboy-bytes">ROM bytes</label>
        <textarea id="gameboy-bytes" value={text} spellCheck={false} onChange={(event) => {
          request.current += 1;
          setText(event.target.value);
          setResult(null);
          setSource('');
        }} />
        <button type="submit">Inspect bytes</button>
      </form>
      {result && !result.ok && <p role="alert">{result.error}</p>}
      {result?.ok && <section aria-label="Header summary">
        <h2>Header summary</h2>
        <p>Source: {source} ({result.byteLength} bytes)</p>
        <dl>{fields.map(([label, value]) => <div key={label}>
          <dt>{label}</dt><dd>{value}</dd>
        </div>)}</dl>
      </section>}
    </section>
  );
}
