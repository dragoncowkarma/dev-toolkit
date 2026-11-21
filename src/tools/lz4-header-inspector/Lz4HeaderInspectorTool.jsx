import { useRef, useState } from 'react';
import { parseLz4Frame } from './lz4-header-inspector.utils.js';
import './lz4-header-inspector.css';

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function readFileAsArrayBuffer(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/** Renders a local-only LZ4 frame header inspector. */
export default function Lz4HeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsed = parseLz4Frame(await readFileAsArrayBuffer(file));
      setResult(parsed);
      setError('');
      setFileName(file.name);
    } catch (caught) {
      setResult(null);
      setError(caught.message || 'Unable to inspect this LZ4 frame.');
      setFileName(file.name);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="lz4-header-inspector" aria-label="LZ4 Frame Header Inspector">
      <div
        className="lz4-header-inspector__dropzone"
        role="button"
        tabIndex={0}
        aria-label="Drop an LZ4 file here or choose a local file"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        onClick={() => inputRef.current?.click()}
      >
        <strong>Drop an LZ4 frame here</strong>
        <span>or choose a local file to inspect without uploading it</span>
        <input
          ref={inputRef}
          type="file"
          className="lz4-header-inspector__input"
          aria-label="Choose an LZ4 frame file"
          onChange={(event) => inspectFile(event.target.files?.[0])}
        />
      </div>

      {fileName && <p className="lz4-header-inspector__file">Inspecting: {fileName}</p>}
      {error && (
        <div className="lz4-header-inspector__alert" role="alert">⚠ {error}</div>
      )}
      {result && (
        <div className="lz4-header-inspector__results" aria-live="polite">
          <h2>Frame details</h2>
          <dl>
            <div><dt>Version</dt><dd>{result.version}</dd></div>
            <div>
              <dt>Block independence</dt><dd>{result.blockIndependent ? 'Yes' : 'No'}</dd>
            </div>
            <div><dt>Block checksum</dt><dd>{result.blockChecksum ? 'Present' : 'Absent'}</dd></div>
            <div>
              <dt>Content checksum</dt><dd>{result.contentChecksum ? 'Present' : 'Absent'}</dd>
            </div>
            <div><dt>Maximum block size</dt><dd>{result.maxBlockSize}</dd></div>
            <div>
              <dt>Content size</dt>
              <dd>
                {result.contentSize === null ? 'Not specified' : formatNumber(result.contentSize)}
              </dd>
            </div>
            <div>
              <dt>Dictionary ID</dt>
              <dd>
                {result.dictionaryId === null
                  ? 'Not specified'
                  : `0x${result.dictionaryId.toString(16).padStart(8, '0')}`}
              </dd>
            </div>
            <div>
              <dt>Header checksum</dt>
              <dd>Valid (0x{result.headerChecksum.toString(16).padStart(2, '0')})</dd>
            </div>
            <div><dt>Block count</dt><dd>{formatNumber(result.blockCount)}</dd></div>
            <div>
              <dt>Compressed payload size</dt><dd>{formatNumber(result.compressedSize)} bytes</dd>
            </div>
            <div>
              <dt>Uncompressed blocks</dt><dd>{formatNumber(result.uncompressedBlockCount)}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
