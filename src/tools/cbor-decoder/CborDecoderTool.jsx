import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CBOR_SAMPLES,
  decodeCbor,
  formatDecodedJson,
  parseCborInput,
} from './cborDecoder.utils.js';
import './cborDecoder.css';

/**
 * Reads local binary files without uploading them anywhere.
 *
 * @param {File} file Selected CBOR file.
 * @returns {Promise<Uint8Array>} Raw file bytes.
 */
export async function readCborFile(file) {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Renders a browser-only RFC 8949 CBOR inspection tool.
 *
 * @returns {React.JSX.Element} The CBOR decoder interface.
 */
export default function CborDecoderTool() {
  const [input, setInput] = useState('');
  const [selectedFormat, setSelectedFormat] = useState('auto');
  const [resolvedFormat, setResolvedFormat] = useState('hex');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  const applyBytes = useCallback((bytes, format = 'file') => {
    const decoded = decodeCbor(bytes);
    setResolvedFormat(format);
    if ('error' in decoded) {
      setResult(null);
      setError(decoded.error);
      return;
    }
    setError('');
    setResult(decoded);
  }, []);

  useEffect(() => {
    if (!input.trim()) {
      setResult(null);
      setError('');
      return;
    }
    const parsed = parseCborInput(input, selectedFormat);
    setResolvedFormat(parsed.format);
    if ('error' in parsed) {
      setResult(null);
      setError(parsed.error);
      return;
    }
    applyBytes(parsed.bytes, parsed.format);
  }, [applyBytes, input, selectedFormat]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  function clear() {
    fileRequestRef.current += 1;
    setInput('');
    setResult(null);
    setError('');
    setFileName('');
    setCopyStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function loadSample(sample) {
    fileRequestRef.current += 1;
    setFileName('');
    setSelectedFormat(sample.format);
    setInput(sample.value);
    setCopyStatus('');
  }

  function handleInputChange(event) {
    fileRequestRef.current += 1;
    setFileName('');
    setInput(event.target.value);
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/\.(cbor|bin)$/i.test(file.name)) {
      setResult(null);
      setError('Choose a .cbor or .bin file containing CBOR bytes.');
      return;
    }
    const requestId = (fileRequestRef.current += 1);
    try {
      const bytes = await readCborFile(file);
      if (requestId !== fileRequestRef.current) return;
      setInput('');
      setFileName(file.name);
      applyBytes(bytes);
    } catch {
      if (requestId === fileRequestRef.current) setError('Unable to read the selected file.');
    }
  }

  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    handleFile(event.dataTransfer.files?.[0]);
  }

  const alertMessage = error || (copyStatus.startsWith('Failed') ? copyStatus : '');
  const jsonOutput = result ? formatDecodedJson(result.json) : '';

  return (
    <section className="cbor-decoder" aria-label="CBOR Decoder">
      <p className="cbor-decoder__intro">
        Decode RFC 8949 CBOR locally. Byte strings stay as hex; nothing leaves your browser.
      </p>
      <div className="cbor-decoder__controls">
        <label htmlFor="cbor-format">Payload format</label>
        <select
          id="cbor-format"
          value={selectedFormat}
          onChange={(event) => {
            setFileName('');
            setSelectedFormat(event.target.value);
          }}
        >
          <option value="auto">Auto</option>
          <option value="hex">Hex</option>
          <option value="base64">Base64</option>
          <option value="base64url">Base64URL</option>
        </select>
        <span className="cbor-decoder__resolved">Resolved: {resolvedFormat}</span>
        <label className="cbor-decoder__upload" htmlFor="cbor-file">
          Upload .cbor / .bin
        </label>
        <input
          ref={fileInputRef}
          id="cbor-file"
          type="file"
          accept=".cbor,.bin,application/cbor,application/octet-stream"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <button type="button" onClick={clear}>Clear</button>
      </div>
      <div className="cbor-decoder__samples" aria-label="CBOR samples">
        {CBOR_SAMPLES.map((sample) => (
          <button type="button" key={sample.id} onClick={() => loadSample(sample)}>
            {sample.label}
          </button>
        ))}
      </div>
      <label htmlFor="cbor-payload">CBOR payload</label>
      <textarea
        id="cbor-payload"
        value={input}
        onChange={handleInputChange}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        placeholder="Paste Hex, Base64, or Base64URL CBOR bytes, or drop a .cbor file"
        spellCheck={false}
      />
      {fileName && <p className="cbor-decoder__file">Loaded file: {fileName}</p>}
      {alertMessage && <p className="cbor-decoder__error" role="alert">{alertMessage}</p>}
      {copyStatus && !alertMessage && <p role="status" aria-live="polite">{copyStatus}</p>}
      {result && (
        <section className="cbor-decoder__results" aria-labelledby="cbor-results-heading">
          <header className="cbor-decoder__results-header">
            <div>
              <h3 id="cbor-results-heading">Decoded CBOR</h3>
              <p>{result.byteLength} byte{result.byteLength === 1 ? '' : 's'} decoded</p>
            </div>
            <button type="button" onClick={() => copy(jsonOutput)}>Copy JSON</button>
          </header>
          <div className="cbor-decoder__outputs">
            <div>
              <div className="cbor-decoder__output-label"><h4>Formatted JSON</h4></div>
              <pre aria-label="Formatted JSON output">{jsonOutput}</pre>
            </div>
            <div>
              <div className="cbor-decoder__output-label"><h4>Diagnostic notation</h4></div>
              <pre aria-label="Diagnostic notation output">{result.diagnostic}</pre>
            </div>
          </div>
          <section aria-labelledby="cbor-major-types">
            <h4 id="cbor-major-types">Major type breakdown</h4>
            <ul className="cbor-decoder__types">
              {result.majorTypes.filter((item) => item.count > 0).map((item) => (
                <li key={item.type}><strong>{item.type}</strong> {item.name}: {item.count}</li>
              ))}
            </ul>
          </section>
        </section>
      )}
    </section>
  );
}
