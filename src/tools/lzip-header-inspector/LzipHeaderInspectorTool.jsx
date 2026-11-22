import { useRef, useState } from 'react';
import { decodeInput, inspectLzip } from './lzip.utils.js';
import './lzip.css';

/** Render a local lzip metadata inspector. */
export default function LzipHeaderInspectorTool() {
  const [format, setFormat] = useState('hex');
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const request = useRef(0);

  function inspectText(text, encoding) {
    request.current += 1;
    setFileName('');
    const decoded = decodeInput(text, encoding);
    setResult(text.trim() ? (decoded.error ? { errors: [decoded.error] } :
      inspectLzip(decoded.bytes)) : null);
  }

  function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setInput('');
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (id === request.current) setResult(inspectLzip(new Uint8Array(reader.result)));
    };
    reader.onerror = () => {
      if (id === request.current) setResult({ errors: ['Could not read file.'] });
    };
    reader.readAsArrayBuffer(file);
  }

  return (
    <section className="lzip-tool" aria-label="LZIP Header Inspector">
      <p>Inspect a single member locally. Payloads are not decompressed or verified.</p>
      <label htmlFor="lzip-format">Input format</label>
      <select id="lzip-format" value={format} onChange={(event) => {
        setFormat(event.target.value);
        inspectText(input, event.target.value);
      }}>
        <option value="hex">Hex</option>
        <option value="base64">Base64</option>
      </select>
      <label htmlFor="lzip-input">Paste input</label>
      <textarea id="lzip-input" value={input} spellCheck={false} onChange={(event) => {
        setInput(event.target.value);
        inspectText(event.target.value, format);
      }} />
      <div className="lzip-drop" onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); readFile(event.dataTransfer.files[0]); }}>
        <label htmlFor="lzip-file">Upload a file or drop it here</label>
        <input id="lzip-file" type="file" onChange={(event) => readFile(event.target.files[0])} />
        {fileName && <p>File: {fileName}</p>}
      </div>
      {result && <div aria-live="polite">
        {result.errors.map((error) => <p role="alert" key={error}>{error}</p>)}
        {result.version !== undefined && <dl>
          <dt>Version</dt><dd>{result.version}</dd>
          <dt>Dictionary size</dt><dd>{result.dictionarySize.toLocaleString()} bytes</dd>
          {result.trailer && <>
            <dt>CRC32 (unverified)</dt>
            <dd>{result.trailer.crc32.toString(16).padStart(8, '0').toUpperCase()}</dd>
            <dt>Data size</dt><dd>{result.trailer.dataSize.toString()} bytes</dd>
            <dt>Member size</dt><dd>{result.trailer.memberSize.toString()} bytes</dd>
          </>}
        </dl>}
        {result.version === 1 && !result.trailer && <p>No complete v1 trailer available.</p>}
        {result.version === 0 && <p>Version 0 trailer is not interpreted.</p>}
      </div>}
    </section>
  );
}
