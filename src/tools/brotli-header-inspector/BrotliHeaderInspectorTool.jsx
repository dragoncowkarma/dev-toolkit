import { useRef, useState } from 'react';
import { inspectBrotliHeader } from './brotli-header-inspector.utils.js';
import './brotli-header-inspector.css';

function formatBytes(bytes) {
  return new Intl.NumberFormat().format(bytes);
}

/**
 * Renders a fully client-side inspector for Brotli stream headers.
 *
 * @returns {React.JSX.Element} The Brotli header inspector UI.
 */
export default function BrotliHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      setResult(inspectBrotliHeader(new Uint8Array(buffer)));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message || 'Unable to inspect the Brotli stream.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const metaBlock = result?.firstMetaBlock;

  return (
    <section className="brotli-header-inspector" aria-label="Brotli Header Inspector">
      <div
        className="brotli-header-inspector__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a Brotli stream here, or choose a file to inspect locally.</p>
        <label className="brotli-header-inspector__button">
          Choose Brotli File
          <input
            ref={fileInputRef}
            type="file"
            accept=".br,application/brotli"
            onChange={handleFileChange}
            aria-label="Choose a Brotli file"
          />
        </label>
      </div>

      {fileName && <p className="brotli-header-inspector__file">File: {fileName}</p>}
      {error && (
        <div className="brotli-header-inspector__error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="brotli-header-inspector__results">
          <h2>Stream header</h2>
          <dl>
            <div><dt>WBITS</dt><dd>{result.windowBits}</dd></div>
            <div><dt>Window size</dt><dd>{formatBytes(result.windowSize)} bytes</dd></div>
          </dl>
          <h2>First meta-block</h2>
          <dl>
            <div><dt>ISLAST</dt><dd>{String(metaBlock.isLast)}</dd></div>
            {metaBlock.isLast && (
              <div><dt>ISLASTEMPTY</dt><dd>{String(metaBlock.isLastEmpty)}</dd></div>
            )}
            {'mnibbles' in metaBlock && <div><dt>MNIBBLES</dt><dd>{metaBlock.mnibbles}</dd></div>}
            {metaBlock.length !== null && metaBlock.length !== undefined && (
              <div><dt>MLEN</dt><dd>{formatBytes(metaBlock.length)} bytes</dd></div>
            )}
            {'metadataLength' in metaBlock && (
              <div><dt>MSKIPLEN</dt><dd>{metaBlock.metadataLength} bytes</dd></div>
            )}
            {'isUncompressed' in metaBlock && (
              <div><dt>ISUNCOMPRESSED</dt><dd>{String(metaBlock.isUncompressed)}</dd></div>
            )}
          </dl>
        </div>
      )}

      {(result || error) && (
        <button
          type="button"
          className="brotli-header-inspector__clear"
          onClick={handleClear}
        >
          Clear
        </button>
      )}
    </section>
  );
}
