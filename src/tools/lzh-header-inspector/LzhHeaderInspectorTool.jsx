import { useRef, useState } from 'react';
import { parseLzhHeader } from './lzh-header.utils.js';
import './lzh-header-inspector.css';

const NUMBER_FORMATTER = new Intl.NumberFormat();

/**
 * Renders a client-side inspector for the first LZH/LHA archive entry header.
 *
 * @returns {React.JSX.Element} The LZH header inspector interface.
 */
export default function LzhHeaderInspector() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      setResult(parseLzhHeader(buffer));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message);
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="lzh-inspector" aria-label="LZH LHA header inspector">
      <div className="lzh-inspector__actions">
        <label className="lzh-inspector__button">
          Choose LZH or LHA file
          <input
            ref={inputRef}
            className="lzh-inspector__file-input"
            type="file"
            accept=".lzh,.lha,application/octet-stream"
            aria-label="Choose an LZH or LHA archive file"
            onChange={handleFileChange}
          />
        </label>
        <button className="lzh-inspector__button" type="button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {fileName && <p className="lzh-inspector__file-name">Inspecting: {fileName}</p>}
      {error && <div className="lzh-inspector__error" role="alert">{error}</div>}
      {result && (
        <dl className="lzh-inspector__metadata" aria-label="Parsed LZH header metadata">
          <Metadata label="Header level" value={result.headerLevel} />
          <Metadata label="Method" value={result.method} />
          <Metadata
            label="Header checksum"
            value={result.headerChecksum === null
              ? '(not present)'
              : `0x${result.headerChecksum.toString(16).padStart(2, '0')}`}
          />
          <Metadata
            label="File CRC-16"
            value={`0x${result.crc16.toString(16).padStart(4, '0')}`}
          />
          <Metadata label="File CRC-16" value={`0x${result.crc16.toString(16).padStart(4, '0')}`} />
          <Metadata
            label="Packed size"
            value={`${NUMBER_FORMATTER.format(result.packedSize)} bytes`}
          />
          <Metadata
            label="Original size"
            value={`${NUMBER_FORMATTER.format(result.originalSize)} bytes`}
          />
          <Metadata label="Timestamp" value={result.timestamp.toISOString()} />
          <Metadata label="File name" value={result.name || '(not specified)'} />
        </dl>
      )}
    </section>
  );
}

function Metadata({ label, value }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}
