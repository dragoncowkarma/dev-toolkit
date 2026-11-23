import { useEffect, useRef, useState } from 'react';
import { inspectBitlocker, parseHex } from './bitlocker.utils.js';
import './bitlocker.css';

/**
 * Renders a local BitLocker volume header inspector.
 * @returns {React.JSX.Element} The inspector interface.
 */
export default function BitlockerHeaderInspectorTool() {
  const [hex, setHex] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const request = useRef(0);
  const fileInput = useRef(null);

  useEffect(() => () => { request.current += 1; }, []);

  function inspect(bytes) {
    try {
      setResult(inspectBitlocker(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function handleHex(event) {
    request.current += 1;
    const value = event.target.value;
    setHex(value);
    setFileName('');
    if (fileInput.current) fileInput.current.value = '';
    if (!value.trim()) {
      setResult(null);
      setError('');
      return;
    }
    try {
      inspect(parseHex(value));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++request.current;
    setHex('');
    setFileName(file.name);
    setResult(null);
    setError('');
    try {
      const data = await file.arrayBuffer();
      if (id === request.current) inspect(new Uint8Array(data));
    } catch {
      if (id === request.current) setError('Failed to read the selected file.');
    }
  }

  function clear() {
    request.current += 1;
    setHex('');
    setFileName('');
    setResult(null);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return (
    <section className="bitlocker-tool" aria-label="BitLocker Header Inspector">
      <p>Upload a volume image or paste its bytes as hex. Data stays in your browser.</p>
      <div className="bitlocker-actions">
        <label>
          Upload volume image
          <input ref={fileInput} type="file" onChange={handleFile} />
        </label>
        <button type="button" onClick={clear}>Clear</button>
      </div>
      {fileName && <p>Selected file: {fileName}</p>}
      <label htmlFor="bitlocker-hex">Hex input (at least 512 bytes)</label>
      <textarea
        id="bitlocker-hex"
        value={hex}
        onChange={handleHex}
        spellCheck={false}
        placeholder="Paste hexadecimal bytes here"
      />
      {error && <p className="bitlocker-error" role="alert">{error}</p>}
      {result && (
        <div aria-live="polite">
          <h2>Volume header</h2>
          <dl>
            <dt>Variant</dt><dd>{result.variant}</dd>
            <dt>OEM ID</dt><dd>{result.oem}</dd>
            <dt>Bytes per sector</dt><dd>{result.bytesPerSector}</dd>
            <dt>Sectors per cluster</dt><dd>{result.sectorsPerCluster}</dd>
            <dt>Total sectors</dt><dd>{result.totalSectors}</dd>
          </dl>
          <h2>FVE metadata blocks</h2>
          {result.blocks.map((block, index) => (
            <div className="bitlocker-block" key={index}>
              <h3>Block {index + 1}</h3>
              <dl>
                <dt>Byte offset</dt><dd>{result.offsets[index]}</dd>
                <dt>Status</dt><dd>{block.status}</dd>
                {block.signature && <><dt>Signature</dt><dd>{block.signature}</dd></>}
                {block.status === 'Available' && <>
                  <dt>Version</dt><dd>{block.version}</dd>
                  <dt>Size field</dt><dd>{block.size}</dd>
                </>}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
