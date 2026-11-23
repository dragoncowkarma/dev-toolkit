import { useRef, useState } from 'react';
import { parseHex, parseLvm2 } from './lvm2.utils.js';
import './lvm2.css';

const hex32 = (value) => `0x${value.toString(16).padStart(8, '0')}`;

/** Inspect a local file or pasted hexadecimal LVM2 physical volume label. */
export default function Lvm2PvInspectorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);
  const fileRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parseLvm2(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function inspectHex() {
    request.current += 1;
    try {
      inspect(parseHex(input));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function selectFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    try {
      const buffer = await file.slice(0, 2048).arrayBuffer();
      if (request.current === id) inspect(new Uint8Array(buffer));
    } catch {
      if (request.current === id) setError('Unable to read the selected file.');
    }
  }

  function clear() {
    request.current += 1;
    setInput('');
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <section className="lvm2-tool" aria-label="LVM2 PV Label Inspector">
      <p>Inspect the first four sectors of a file or paste hexadecimal bytes. Data stays local.</p>
      <label htmlFor="lvm2-file">Select a file</label>
      <input id="lvm2-file" ref={fileRef} type="file" onChange={selectFile} />
      <label htmlFor="lvm2-hex">Hexadecimal input</label>
      <textarea
        id="lvm2-hex"
        value={input}
        onChange={(event) => {
          request.current += 1;
          setInput(event.target.value);
          setResult(null);
          setError('');
        }}
        spellCheck={false}
      />
      <div className="lvm2-actions">
        <button type="button" onClick={inspectHex}>Inspect hex</button>
        <button type="button" onClick={clear}>Clear</button>
      </div>
      {error && <div className="lvm2-alert" role="alert">{error}</div>}
      {result && (
        <div className="lvm2-result">
          <h2>Label header</h2>
          <dl>
            <dt>Sector index</dt><dd>{result.sectorIndex}</dd>
            <dt>Sector number</dt><dd>{result.sectorNumber}</dd>
            <dt>Stored CRC32</dt><dd>{hex32(result.storedCrc)}</dd>
            <dt>Computed CRC32</dt><dd>{hex32(result.computedCrc)}</dd>
            <dt>CRC status</dt>
            <dd>{result.storedCrc === result.computedCrc ? 'Valid' : 'Mismatch'}</dd>
            <dt>Data offset</dt><dd>{result.dataOffset} bytes</dd>
            <dt>Type</dt><dd>{result.type}</dd>
          </dl>
          <h2>PV header</h2>
          <dl>
            <dt>PV UUID</dt><dd>{result.uuid}</dd>
            <dt>Device size</dt><dd>{result.deviceSize} bytes</dd>
          </dl>
          {[
            ['Data areas', result.dataAreas],
            ['Metadata areas', result.metadataAreas],
          ].map(([title, areas]) => (
            <div key={title}>
              <h3>{title}</h3>
              {areas.length === 0 ? <p>None</p> : (
                <ul>{areas.map((area, index) => (
                  <li key={index}>Offset: {area.offset} bytes; Size: {area.size} bytes</li>
                ))}</ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
