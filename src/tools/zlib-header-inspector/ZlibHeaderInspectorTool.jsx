import { useEffect, useId, useRef, useState } from 'react';
import {
  bytesToHex,
  formatHexDump,
  hexToBytes,
  parseZlibHeader,
} from './zlib.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './zlib-header-inspector.css';

const SAMPLE_HEADERS = [
  {
    name: 'Default Deflate (78 9C)',
    hex: '78 9C',
  },
  {
    name: 'Maximum Compression (78 DA)',
    hex: '78 DA',
  },
  {
    name: 'Fastest Compression (78 01)',
    hex: '78 01',
  },
  {
    name: 'Preset Dict FDICT (78 BB 12 34 56 78)',
    hex: '78 BB 12 34 56 78',
  },
  {
    name: 'Stream with Adler-32 (78 9C 00 01 02 03 04)',
    hex: '78 9C 00 01 02 03 04',
  },
];

/**
 * ZlibHeaderInspectorTool component.
 * Allows users to inspect RFC 1950 zlib stream headers from pasted hex or dropped files.
 *
 * @returns {React.JSX.Element}
 */
export default function ZlibHeaderInspectorTool() {
  const [hexInput, setHexInput] = useState('78 9C');
  const [source, setSource] = useState('hex');
  const [parsed, setParsed] = useState(null);
  const [rawBytes, setRawBytes] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');

  const [copiedDump, showCopiedDump] = useCopyFeedback();
  const fileInputRef = useRef(null);
  const hexInputId = useId();
  const fileInputId = useId();

  // Run parsing whenever hexInput changes in hex input mode
  useEffect(() => {
    if (source !== 'hex') {
      return;
    }

    if (!hexInput.trim()) {
      setParsed(null);
      setRawBytes(null);
      setErrorMessage('');
      return;
    }

    try {
      const bytes = hexToBytes(hexInput);
      setRawBytes(bytes);
      const result = parseZlibHeader(bytes);
      setParsed(result);
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Unknown error parsing header.');
      } else {
        setErrorMessage('');
      }
    } catch (err) {
      setParsed(null);
      setRawBytes(null);
      setErrorMessage(err.message);
    }
  }, [hexInput, source]);

  function handleFileRead(file) {
    if (!file) return;
    setSource('file');
    setFileName('');
    setRawBytes(null);
    setParsed(null);
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const bytes = new Uint8Array(arrayBuffer);
      setFileName(file.name);
      setRawBytes(bytes);
      // Format first 64 bytes into hexInput for the textarea preview
      const previewBytes = bytes.slice(0, 64);
      setHexInput(bytesToHex(previewBytes));
      const result = parseZlibHeader(bytes);
      setParsed(result);
      if (!result.ok) {
        setErrorMessage(result.error ?? 'Unknown error parsing file header.');
      } else {
        setErrorMessage('');
      }
    };
    reader.onerror = () => {
      setFileName('');
      setRawBytes(null);
      setParsed(null);
      setErrorMessage('Failed to read the selected file.');
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      handleFileRead(file);
    }
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileRead(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleSampleClick(sampleHex) {
    setSource('hex');
    setFileName('');
    setHexInput(sampleHex);
  }

  function handleCopyDump() {
    if (!rawBytes || rawBytes.length === 0) return;
    const dump = formatHexDump(rawBytes);
    navigator.clipboard?.writeText(dump);
    showCopiedDump();
  }

  return (
    <section className="zlib-inspector" aria-labelledby="zlib-inspector-title">
      <header className="zlib-inspector__header">
        <h2 id="zlib-inspector-title" className="zlib-inspector__title">
          Zlib Header Inspector
        </h2>
        <p className="zlib-inspector__description">
          Parse and inspect RFC 1950 zlib stream headers, compression levels, dictionary flags,
          and checksums client-side.
        </p>
      </header>

      {/* Quick sample buttons */}
      <div className="zlib-inspector__samples" aria-label="Sample headers">
        <span className="zlib-inspector__samples-label">Samples:</span>
        {SAMPLE_HEADERS.map((sample) => (
          <button
            key={sample.name}
            type="button"
            className="zlib-inspector__btn"
            onClick={() => handleSampleClick(sample.hex)}
          >
            {sample.name}
          </button>
        ))}
      </div>

      {/* Hex input section */}
      <div className="zlib-inspector__input-group">
        <label htmlFor={hexInputId} className="zlib-inspector__label">
          Zlib Stream Hex Bytes
        </label>
        <textarea
          id={hexInputId}
          className="zlib-inspector__textarea"
          value={hexInput}
          onChange={(e) => {
            setSource('hex');
            setFileName('');
            setHexInput(e.target.value);
          }}
          placeholder="e.g. 78 9C or paste binary hex stream"
          rows={3}
          spellCheck={false}
          aria-describedby="zlib-hex-help"
        />
        <span id="zlib-hex-help" className="zlib-inspector__dropzone-hint">
          Accepts hex strings with or without spaces, commas, or 0x prefixes.
        </span>
      </div>

      {/* File dropzone */}
      <div
        className={`zlib-inspector__dropzone ${
          isDragging ? 'zlib-inspector__dropzone--active' : ''
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="region"
        aria-label="File upload dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          id={fileInputId}
          className="zlib-inspector__file-input"
          onChange={handleFileInputChange}
          aria-label="Upload zlib file"
        />
        <p className="zlib-inspector__dropzone-text">
          {fileName ? (
            <strong>Loaded file: {fileName}</strong>
          ) : (
            'Drag and drop a zlib file here, or click to select'
          )}
        </p>
        <span className="zlib-inspector__dropzone-hint">
          Files are processed entirely inside your browser. No data leaves your machine.
        </span>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div role="alert" className="zlib-inspector__error">
          <span aria-hidden="true">⚠️</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Decoded summary */}
      {parsed && parsed.ok && (
        <article className="zlib-inspector__results" aria-label="Header Summary">
          <div className="zlib-inspector__grid">
            {/* Compression Method */}
            <div className="zlib-inspector__card">
              <span className="zlib-inspector__card-label">Compression Method</span>
              <span className="zlib-inspector__card-value">{parsed.compressionMethod}</span>
              <span className="zlib-inspector__card-detail">
                CM = {parsed.compressionMethodId} (0x{parsed.cmf?.toString(16).toUpperCase()})
              </span>
            </div>

            {/* Window Size / CINFO */}
            <div className="zlib-inspector__card">
              <span className="zlib-inspector__card-label">Window Size</span>
              <span className="zlib-inspector__card-value">
                {parsed.windowSize
                  ? `${parsed.windowSize.toLocaleString()} B (${parsed.windowSize / 1024} KB)`
                  : 'N/A'}
              </span>
              <span className="zlib-inspector__card-detail">
                CINFO = {parsed.cinfo} ({parsed.windowBits ? `${parsed.windowBits} bits` : ''})
              </span>
            </div>

            {/* FLEVEL */}
            <div className="zlib-inspector__card">
              <span className="zlib-inspector__card-label">Compression Level</span>
              <span className="zlib-inspector__card-value">{parsed.flevel}</span>
              <span className="zlib-inspector__card-detail">
                FLEVEL = {parsed.flevelValue} (0x{parsed.flg?.toString(16).toUpperCase()})
              </span>
            </div>

            {/* FCHECK */}
            <div className="zlib-inspector__card">
              <span className="zlib-inspector__card-label">Header Check (FCHECK)</span>
              <span className="zlib-inspector__card-value">
                {parsed.fcheckValid ? (
                  <span className="zlib-inspector__badge zlib-inspector__badge--valid">
                    Valid (✓)
                  </span>
                ) : (
                  <span className="zlib-inspector__badge zlib-inspector__badge--invalid">
                    Invalid (✕)
                  </span>
                )}
              </span>
              <span className="zlib-inspector__card-detail">
                FCHECK = {parsed.fcheck} ((CMF*256+FLG) % 31 = 0)
              </span>
            </div>

            {/* FDICT */}
            <div className="zlib-inspector__card">
              <span className="zlib-inspector__card-label">Preset Dictionary (FDICT)</span>
              <span className="zlib-inspector__card-value">{parsed.fdict ? 'Yes' : 'No'}</span>
              <span className="zlib-inspector__card-detail">
                {parsed.fdict ? `DICTID: ${parsed.dictId}` : 'No preset dictionary'}
              </span>
            </div>

            {/* Adler-32 */}
            <div className="zlib-inspector__card">
              <span className="zlib-inspector__card-label">Adler-32 Checksum</span>
              <span className="zlib-inspector__card-value">
                {parsed.adler32 ? parsed.adler32 : 'Not present'}
              </span>
              <span className="zlib-inspector__card-detail">
                {parsed.adler32
                  ? `Decimal: ${parsed.adler32Number?.toLocaleString()}`
                  : 'Requires trailing 4 bytes'}
              </span>
            </div>
          </div>

          {/* Hex dump */}
          {rawBytes && rawBytes.length > 0 && (
            <div className="zlib-inspector__hexdump">
              <div className="zlib-inspector__hexdump-header">
                <h3>Raw Hex Dump ({rawBytes.length} bytes)</h3>
                <button
                  type="button"
                  className="zlib-inspector__btn"
                  onClick={handleCopyDump}
                  aria-label="Copy hex dump to clipboard"
                >
                  {copiedDump ? 'Copied!' : 'Copy Hex Dump'}
                </button>
              </div>
              <pre
                role="region"
                className="zlib-inspector__code"
                tabIndex={0}
                aria-label="Raw Hex Dump View"
              >
                <code>{formatHexDump(rawBytes)}</code>
              </pre>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
