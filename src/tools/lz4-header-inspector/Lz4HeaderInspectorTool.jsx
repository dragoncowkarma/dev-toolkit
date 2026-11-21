import { useRef, useState } from 'react';
import { formatContentSize, parseLz4Frame } from './lz4-header.utils.js';
import './lz4-header-inspector.css';

function hexadecimal(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

/**
 * Renders a client-side LZ4 frame header inspector.
 *
 * @returns {React.JSX.Element} The LZ4 inspector interface.
 */
export default function Lz4HeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsed = parseLz4Frame(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (readError) {
      setResult(null);
      setFileName(file.name);
      setError(readError instanceof Error ? readError.message : 'Unable to inspect this file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    void inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleFileChange(event) {
    void inspectFile(event.target.files?.[0]);
  }

  const dictionaryLabel = result?.dictionaryId === undefined
    ? 'Not present'
    : hexadecimal(result.dictionaryId, 8);

  return (
    <section className="lz4-header-inspector" aria-label="LZ4 Frame Header Inspector">
      <div
        className="lz4-header-inspector__drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop an LZ4 frame here, or choose a local file.</p>
        <label className="lz4-header-inspector__file-button">
          Choose LZ4 file
          <input
            ref={inputRef}
            type="file"
            onChange={handleFileChange}
            aria-label="Choose an LZ4 file to inspect"
          />
        </label>
      </div>

      {fileName && <p className="lz4-header-inspector__file-name">Inspecting: {fileName}</p>}
      {error && <div className="lz4-header-inspector__error" role="alert">{error}</div>}

      {result?.kind === 'legacy' && (
        <div className="lz4-header-inspector__legacy" role="status">
          LZ4IO legacy frame detected. This older format is recognized but not supported.
        </div>
      )}

      {result?.kind === 'frame' && (
        <>
          <h2>Frame header</h2>
          <div className="lz4-header-inspector__table-wrap">
            <table>
              <caption className="sr-only">LZ4 frame header fields</caption>
              <tbody>
                <tr>
                  <th scope="row">Magic number</th><td>{hexadecimal(result.magic, 8)}</td>
                </tr>
                <tr><th scope="row">Version</th><td>{result.version}</td></tr>
                <tr>
                  <th scope="row">Block maximum size</th>
                  <td>{result.blockMaximumSize.toLocaleString()} bytes</td>
                </tr>
                <tr>
                  <th scope="row">Content size</th><td>{formatContentSize(result.contentSize)}</td>
                </tr>
                <tr>
                  <th scope="row">Dictionary ID</th>
                  <td>{dictionaryLabel}</td>
                </tr>
                <tr>
                  <th scope="row">Header checksum</th>
                  <td>{hexadecimal(result.headerChecksum, 2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>Flags</h2>
          <ul className="lz4-header-inspector__flags" aria-label="LZ4 frame flags">
            {Object.entries(result.flags).map(([name, enabled]) => (
              <li key={name}>
                <span>{name.replace(/([A-Z])/g, ' $1')}</span>
                <strong>{enabled ? 'Enabled' : 'Disabled'}</strong>
              </li>
            ))}
          </ul>

          <h2>Data blocks</h2>
          <div className="lz4-header-inspector__table-wrap">
            <table>
              <caption className="sr-only">LZ4 frame data blocks</caption>
              <thead>
                <tr>
                  <th scope="col">Block</th><th scope="col">Offset</th>
                  <th scope="col">Size</th><th scope="col">Storage</th>
                </tr>
              </thead>
              <tbody>
                {result.blocks.map((block) => (
                  <tr key={block.index}>
                    <td>{block.index}</td><td>{block.offset.toLocaleString()}</td>
                    <td>{block.size.toLocaleString()} bytes</td>
                    <td>{block.uncompressed ? 'Uncompressed' : 'Compressed'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
