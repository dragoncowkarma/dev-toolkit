import { useRef, useState } from 'react';
import { decodeBytes, parseMusepack } from './musepack.utils.js';
import './musepack.css';

/** Render a local Musepack SV8 inspector. */
export default function MusepackHeaderInspectorTool() {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('hex');
  const [bytes, setBytes] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspect(data) {
    setBytes(data);
    const parsed = parseMusepack(data);
    setResult(parsed.ok ? parsed : null);
    setError(parsed.ok ? '' : parsed.error);
  }

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (id === request.current) inspect(data);
    } catch {
      if (id === request.current) {
        setBytes(null);
        setResult(null);
        setError('Unable to read the selected file.');
      }
    }
  }

  function inspectText() {
    request.current += 1;
    try {
      inspect(decodeBytes(input, format));
    } catch (err) {
      setBytes(null);
      setResult(null);
      setError(err.message);
    }
  }

  const dump = bytes && Array.from(bytes.subarray(0, 65536), (byte, index) =>
    `${index && index % 16 === 0 ? '\n' : index ? ' ' : ''}${byte.toString(16).padStart(2, '0')}`
  ).join('');
  const header = result?.header;
  return (
    <section className="musepack" aria-label="Musepack header inspector">
      <p>Files are read locally in your browser.</p>
      <div className="musepack-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="musepack-file">Choose a Musepack file or drop it here</label>
        <input id="musepack-file" type="file" accept=".mpc,audio/x-musepack"
          onChange={(event) => readFile(event.target.files[0])} />
      </div>
      <label htmlFor="musepack-format">Pasted byte format</label>
      <select id="musepack-format" value={format}
        onChange={(event) => setFormat(event.target.value)}>
        <option value="hex">Hexadecimal</option><option value="base64">Base64</option>
      </select>
      <label htmlFor="musepack-input">Pasted bytes</label>
      <textarea id="musepack-input" value={input} onChange={(event) => setInput(event.target.value)}
        rows={5} spellCheck={false} />
      <button type="button" onClick={inspectText}>Inspect bytes</button>
      {error && <p role="alert">{error}</p>}
      {header && <section aria-labelledby="musepack-summary">
        <h2 id="musepack-summary">Stream header</h2>
        <dl>
          <dt>CRC-32 (stored; not validated)</dt><dd>0x{header.crc}</dd>
          <dt>Stream version</dt><dd>{header.version}</dd>
          <dt>Sample count</dt><dd>{header.sampleCount}</dd>
          <dt>Beginning silence</dt><dd>{header.beginningSilence}</dd>
          <dt>Sample rate index</dt>
          <dd>{header.sampleRateIndex}
            {' '}({header.sampleRate ? `${header.sampleRate} Hz` : 'reserved'})</dd>
          <dt>Maximum used bands</dt><dd>{header.maxUsedBands}</dd>
          <dt>Channel count</dt><dd>{header.channels}</dd>
          <dt>Mid-side stereo</dt><dd>{header.midSide ? 'Yes' : 'No'}</dd>
          <dt>Audio block frames</dt><dd>{header.audioBlockFrames}</dd>
        </dl>
        <h3>Packets (total size including header)</h3>
        <ul>{result.packets.map((packet, index) =>
          <li key={index}>{packet.key}: {packet.size} bytes</li>)}</ul>
        <p>Absent: {['RG', 'EI', 'SO', 'AP', 'SE'].filter((key) =>
          !result.packets.some((packet) => packet.key === key)).join(', ') || 'none'}</p>
      </section>}
      {bytes && <section aria-labelledby="musepack-dump"><h2 id="musepack-dump">Raw hex dump</h2>
        {bytes.length > 65536 && <p>Showing the first 65,536 bytes of {bytes.length}.</p>}
        <pre className="musepack-hex">{dump}</pre></section>}
    </section>
  );
}
