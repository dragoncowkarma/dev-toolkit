import { useRef, useState } from 'react';
import { compressionMethodName, inspectZip } from './zip-inspector.utils.js';
import './zip-inspector.css';

/** Renders a browser-local ZIP structure inspector. */
export default function ZipInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setResult(inspectZip(await file.arrayBuffer()));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message || 'Unable to inspect this ZIP file.');
    }
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="zip-inspector" aria-label="ZIP File Inspector">
      <div className="zip-inspector__toolbar">
        <label className="zip-inspector__upload btn">
          Choose ZIP file
          <input ref={inputRef} type="file" accept=".zip,application/zip" onChange={handleFileChange}
            aria-label="Choose ZIP file to inspect" />
        </label>
        <button type="button" className="btn" onClick={handleClear}>Clear</button>
      </div>
      <p className="zip-inspector__hint">Metadata is inspected locally; file contents are never extracted.</p>
      <div className="zip-inspector__status" aria-live="polite">{fileName && `Selected: ${fileName}`}</div>
      {error && <div className="zip-inspector__error" role="alert">⚠ {error}</div>}
      {result && <>
        <section className="zip-inspector__card" aria-label="End of Central Directory">
          <h2>End of Central Directory {result.zip64 && <span>ZIP64 extension detected</span>}</h2>
          <dl>
            <div><dt>Entries</dt><dd>{result.eocd.entryCount}</dd></div>
            <div><dt>Central directory offset</dt><dd>{result.eocd.centralDirectoryOffset}</dd></div>
            <div><dt>Central directory size</dt><dd>{result.eocd.centralDirectorySize} bytes</dd></div>
            <div><dt>Comment</dt><dd>{result.eocd.comment || 'None'}</dd></div>
          </dl>
        </section>
        <section className="zip-inspector__card" aria-label="Central directory entries">
          <h2>Central Directory ({result.entries.length})</h2>
          <div className="zip-inspector__entries">
            {result.entries.map((entry, index) => <article className="zip-inspector__entry" key={`${entry.name}-${index}`}>
              <h3>{entry.name}</h3>
              {entry.nameUsedFallback && <p className="zip-inspector__flag">Non-UTF-8 name shown as hex/Base64.</p>}
              <dl>
                <div><dt>Size</dt><dd>{entry.compressedSize} / {entry.uncompressedSize} bytes</dd></div>
                <div><dt>Compression</dt><dd>{entry.compressionMethod} ({compressionMethodName(entry.compressionMethod)})</dd></div>
                <div><dt>CRC-32</dt><dd>{entry.crc32}</dd></div>
                <div><dt>Modified</dt><dd>{entry.modified}</dd></div>
                <div><dt>External attributes</dt><dd>{entry.externalAttributes}</dd></div>
              </dl>
              {(entry.encrypted || entry.dataDescriptor || entry.zip64) && <p className="zip-inspector__flag">
                {[entry.encrypted && 'Encrypted', entry.dataDescriptor && 'Data descriptor', entry.zip64 && 'ZIP64 extension'].filter(Boolean).join(' · ')}
              </p>}
            </article>)}
          </div>
        </section>
      </>}
    </section>
  );
}
