import { useRef, useState } from 'react';
import { decodeXzBase64, parseXzStream } from './xzHeaderInspector.utils.js';
import './xzHeaderInspector.css';

function readFile(file) {
  return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function DetailList({ entries }) {
  return (
    <dl className="xz-header-inspector__details">
      {entries.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders a client-side inspector for XZ stream containers.
 * @returns {React.JSX.Element} The XZ stream header inspector.
 */
export function XzHeaderInspectorTool() {
  const [base64, setBase64] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  function inspect(bytes, source) {
    try {
      setResult(parseXzStream(bytes));
      setError('');
    } catch (inspectionError) {
      setResult(null);
      setError(`${source}: ${inspectionError.message}`);
    }
  }

  async function inspectFile(file) {
    if (!file) return;
    try {
      inspect(await readFile(file), `File “${file.name}”`);
    } catch {
      setResult(null);
      setError(`File “${file.name}”: could not be read.`);
    }
  }

  function handleBase64Inspect() {
    try {
      inspect(decodeXzBase64(base64), 'Base64 input');
    } catch (decodeError) {
      setResult(null);
      setError(`Base64 input: ${decodeError.message}`);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="xz-header-inspector" aria-label="XZ Stream Header Inspector">
      <div
        className={`xz-header-inspector__dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop an .xz file here, or choose a file to inspect entirely in your browser.</p>
        <label className="xz-header-inspector__button">
          Choose .xz file
          <input
            ref={fileInputRef}
            type="file"
            accept=".xz,application/x-xz"
            onChange={(event) => inspectFile(event.target.files?.[0])}
            aria-label="Choose an XZ file"
          />
        </label>
      </div>

      <div className="xz-header-inspector__base64">
        <label htmlFor="xz-base64">Or paste Base64-encoded XZ data</label>
        <textarea
          id="xz-base64"
          value={base64}
          onChange={(event) => setBase64(event.target.value)}
          placeholder="/Td6WFo..."
          spellCheck={false}
        />
        <button type="button" onClick={handleBase64Inspect}>Inspect Base64</button>
      </div>

      {error && <div className="xz-header-inspector__error" role="alert">{error}</div>}

      {result && (
        <div className="xz-header-inspector__results">
          <article>
            <h3>Stream Header</h3>
            <DetailList entries={[
              ['Magic bytes', result.streamHeader.magicBytes],
              ['Stream Flags', result.streamHeader.flags],
              [
                'Integrity check',
                `${result.streamHeader.integrityCheck} (ID ${result.streamHeader.checkId})`,
              ],
              ['Flags CRC32', result.streamHeader.crc32],
            ]} />
          </article>
          {result.blocks.map((block, index) => (
            <article key={index}>
              <h3>Block Header {index + 1}</h3>
              <DetailList entries={[
                ['Header size', `${block.headerSize} bytes`],
                ['Block Flags', block.flags],
                ['Compressed size', block.compressedSize ?? 'Not present'],
                ['Uncompressed size', block.uncompressedSize ?? 'Not present'],
                [
                  'Filter flags',
                  block.filters.map((filter) => `${filter.name} (${filter.id})`).join(', '),
                ],
                ['Header CRC32', block.crc32],
              ]} />
            </article>
          ))}
          <article>
            <h3>Index and Stream Footer</h3>
            <DetailList entries={[
              ['Index records', result.index.recordCount],
              ['Index CRC32', result.index.crc32],
              ['Footer CRC32', result.streamFooter.crc32],
              ['Backward Size', result.streamFooter.backwardSize],
              ['Footer Stream Flags', result.streamFooter.flags],
              ['Footer magic bytes', result.streamFooter.magicBytes],
            ]} />
          </article>
        </div>
      )}
    </section>
  );
}

export default XzHeaderInspectorTool;
