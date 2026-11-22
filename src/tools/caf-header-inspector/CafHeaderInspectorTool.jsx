import { useRef, useState } from 'react';
import { decodeBase64Bytes, parseCafHeader } from './cafHeader.utils.js';
import './cafHeaderInspector.css';

function valueOrUnavailable(value) {
  return value === null || value === undefined ? 'Unavailable' : value;
}

function MetadataList({ entries }) {
  return (
    <dl className="caf-header-inspector__metadata">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{valueOrUnavailable(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders a browser-only inspector for CAF headers and top-level chunks.
 *
 * @returns {React.JSX.Element} The CAF header inspector.
 */
export default function CafHeaderInspectorTool() {
  const [base64, setBase64] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  function inspectBytes(bytes, name = '') {
    const nextResult = parseCafHeader(bytes);
    setResult(nextResult);
    setFileName(name);
    setError(nextResult.error);
  }

  async function inspectFile(file) {
    try {
      inspectBytes(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch {
      setError('The selected file could not be read.');
      setResult(null);
    }
  }

  function handleBase64Inspect() {
    try {
      inspectBytes(decodeBase64Bytes(base64));
    } catch (caughtError) {
      setError(caughtError.message);
      setResult(null);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) inspectFile(file);
  }

  function handleClear() {
    setBase64('');
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="caf-header-inspector" aria-label="CAF Header Inspector">
      <p className="caf-header-inspector__privacy">
        Files are parsed locally in your browser and are never uploaded.
      </p>
      <div
        className="caf-header-inspector__drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <label className="caf-header-inspector__file-button">
          Choose CAF file
          <input
            ref={fileInputRef}
            type="file"
            accept=".caf,audio/x-caf"
            onChange={(event) => event.target.files?.[0] && inspectFile(event.target.files[0])}
            aria-label="Choose a CAF file to inspect"
          />
        </label>
        <span>or drag and drop a file here</span>
      </div>
      <label className="caf-header-inspector__base64-label" htmlFor="caf-base64">
        CAF file as Base64
      </label>
      <textarea
        id="caf-base64"
        value={base64}
        onChange={(event) => setBase64(event.target.value)}
        placeholder="Paste Base64-encoded CAF bytes…"
        spellCheck={false}
      />
      <div className="caf-header-inspector__actions">
        <button type="button" onClick={handleBase64Inspect}>Inspect Base64</button>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
      {error && <div className="caf-header-inspector__error" role="alert">{error}</div>}
      {result?.header && (
        <div className="caf-header-inspector__results">
          <h2>CAF header{fileName ? `: ${fileName}` : ''}</h2>
          <MetadataList entries={[
            ['Magic', 'caff'],
            ['File version', result.header.fileVersion],
            ['File flags', result.header.fileFlags],
          ]} />
          <h2>Top-level chunks</h2>
          {result.chunks.length === 0 && <p>No complete top-level chunks were found.</p>}
          {result.chunks.map((chunk, index) => (
            <article className="caf-header-inspector__chunk" key={`${chunk.type}-${index}`}>
              <h3>{chunk.type}</h3>
              <MetadataList entries={[
                ['Declared size', chunk.declaredSize],
                ['Available payload size', chunk.size],
                ['Status', chunk.status],
                ...(chunk.type === 'data' && chunk.details
                  ? [
                    ['Edit count', chunk.details.editCount],
                    ['Payload byte length', chunk.details.payloadByteLength],
                  ]
                  : []),
                ...(chunk.type === 'desc' && chunk.details
                  ? [
                    ['Sample rate', chunk.details.sampleRate],
                    ['Format ID', chunk.details.formatId],
                    ['Format flags', chunk.details.formatFlags],
                    ['Bytes per packet', chunk.details.bytesPerPacket],
                    ['Frames per packet', chunk.details.framesPerPacket],
                    ['Channels per frame', chunk.details.channelsPerFrame],
                    ['Bits per channel', chunk.details.bitsPerChannel],
                  ]
                  : []),
              ]} />
            </article>
          ))}
          {result.warnings.length > 0 && (
            <div className="caf-header-inspector__warning" role="alert">
              {result.warnings.join(' ')}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
