import { useRef, useState } from 'react';
import { formatHex32, formatModificationTime, parseGzipHeader } from './gzip-header.utils.js';
import './gzip-header-inspector.css';

function Detail({ label, children }) {
  return (
    <div className="gzip-header-inspector__detail">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Renders a client-side RFC 1952 GZIP header and trailer inspector.
 * @returns {React.JSX.Element} The GZIP header inspector UI.
 */
export default function GzipHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseGzipHeader(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (caught) {
      setResult(null);
      setFileName(file.name);
      setError(caught instanceof Error ? caught.message : 'Unable to inspect the selected file.');
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="gzip-header-inspector" aria-labelledby="gzip-header-inspector-title">
      <header>
        <p className="gzip-header-inspector__eyebrow">RFC 1952</p>
        <h2 id="gzip-header-inspector-title">GZIP Header Inspector</h2>
        <p>
          Read the first member header and final file trailer without uploading or decompressing.
        </p>
      </header>

      <div className="gzip-header-inspector__actions">
        <label className="gzip-header-inspector__upload">
          Choose GZIP file
          <input
            ref={inputRef}
            type="file"
            accept=".gz,application/gzip"
            onChange={handleFileChange}
          />
        </label>
        {(result || error) && <button type="button" onClick={handleClear}>Clear</button>}
      </div>

      {fileName && <p className="gzip-header-inspector__file">Selected: {fileName}</p>}
      {error && <div className="gzip-header-inspector__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="gzip-header-inspector__results">
          <section aria-labelledby="gzip-fixed-header">
            <h3 id="gzip-fixed-header">Fixed header</h3>
            <dl>
              <Detail label="Compression method">8 (deflate)</Detail>
              <Detail label="Flags">{result.flags.join(', ') || 'None'}</Detail>
              <Detail label="Modification time">
                {formatModificationTime(result.modificationTime)}
              </Detail>
              <Detail label="Extra flags">
                0x{result.extraFlags.toString(16).padStart(2, '0').toUpperCase()}
              </Detail>
              <Detail label="Operating system">
                {result.operatingSystem.value} ({result.operatingSystem.name})
              </Detail>
              <Detail label="First member header length">{result.headerLength} bytes</Detail>
            </dl>
          </section>
          <section aria-labelledby="gzip-optional-fields">
            <h3 id="gzip-optional-fields">Optional fields</h3>
            <dl>
              <Detail label="Extra">{result.optional.extra
                ? `${result.optional.extra.length} bytes; ${result.optional.extra.subfields
                  .map((subfield) => `${subfield.identifier} (${subfield.length} bytes)`)
                  .join(', ') || 'no subfields'}`
                : 'Not present'}</Detail>
              <Detail label="Original filename">{result.optional.filename ?? 'Not present'}</Detail>
              <Detail label="Comment">{result.optional.comment ?? 'Not present'}</Detail>
              <Detail label="Header CRC16">
                {result.optional.headerCrc16 === null
                  ? 'Not present'
                  : `0x${result.optional.headerCrc16
                    .toString(16).padStart(4, '0').toUpperCase()}`}
              </Detail>
            </dl>
          </section>
          <section aria-labelledby="gzip-trailer">
            <h3 id="gzip-trailer">Final file trailer</h3>
            <dl>
              <Detail label="CRC32">{formatHex32(result.trailer.crc32)}</Detail>
              <Detail label="Uncompressed size (mod 2³²)">{result.trailer.inputSize} bytes</Detail>
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}
