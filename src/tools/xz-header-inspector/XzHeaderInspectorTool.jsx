import { useRef, useState } from 'react';
import { formatXzValue, parseXzHeaders } from './xz-header-inspector.utils.js';
import './xz-header-inspector.css';

function DetailList({ entries }) {
  return (
    <dl className="xz-details">
      {entries.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Renders a client-side XZ container structure inspector.
 * @returns {React.JSX.Element} The XZ inspector UI.
 */
export default function XzHeaderInspector() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('Choose an XZ file to inspect its container headers.');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsed = parseXzHeaders(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
      const suffix = parsed.blocks.length === 1 ? '' : 's';
      setStatus(`Inspected ${file.name}: ${parsed.blocks.length} block${suffix}.`);
    } catch (inspectionError) {
      setResult(null);
      setFileName('');
      setError(inspectionError.message || 'Unable to inspect this file.');
      setStatus('Inspection failed.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="xz-inspector" aria-label="XZ Header Inspector">
      <p className="sr-only" aria-live="polite">{status}</p>
      <input
        ref={inputRef}
        className="xz-file-input"
        type="file"
        accept=".xz,application/x-xz"
        aria-label="Choose an XZ file"
        onChange={(event) => inspectFile(event.target.files?.[0])}
      />
      <div
        className="xz-drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop an XZ file here, or choose one to inspect its container headers.</p>
        <button type="button" className="xz-button" onClick={() => inputRef.current?.click()}>
          Choose XZ file
        </button>
      </div>
      {error && <div className="xz-error" role="alert">{error}</div>}
      {result && (
        <div className="xz-results">
          <h2>{fileName}</h2>
          <h3>Stream Header</h3>
          <DetailList
            entries={[
              ['Magic', result.streamHeader.magic],
              ['Check', `${result.streamHeader.checkName} (ID ${result.streamHeader.checkId})`],
              ['CRC32', `0x${result.streamHeader.crc32.toString(16).padStart(8, '0')}`],
            ]}
          />
          {result.blocks.map((block) => (
            <section className="xz-block" key={block.number}>
              <h3>Block {block.number}</h3>
              <DetailList
                entries={[
                  ['Header size', `${block.headerSize} bytes`],
                  ['Flags', `0x${block.flags.toString(16).padStart(2, '0')}`],
                  [
                    'Compressed size',
                    block.compressedSize === null
                      ? 'Not stored'
                      : formatXzValue(block.compressedSize),
                  ],
                  [
                    'Uncompressed size',
                    block.uncompressedSize === null
                      ? 'Not stored'
                      : formatXzValue(block.uncompressedSize),
                  ],
                  ['Payload size', formatXzValue(block.payloadSize)],
                  ['Index unpadded size', formatXzValue(block.unpaddedSize)],
                  ['Index uncompressed size', formatXzValue(block.indexUncompressedSize)],
                  ['Header CRC32', `0x${block.crc32.toString(16).padStart(8, '0')}`],
                  [
                    'Filters',
                    block.filters.map((filter) => {
                      const id = formatXzValue(filter.id);
                      const propertySize = formatXzValue(filter.propertiesSize);
                      return `ID ${id} (${propertySize} property bytes)`;
                    }).join(', '),
                  ],
                ]}
              />
            </section>
          ))}
          <h3>Index</h3>
          <DetailList
            entries={[
              ['Record count', formatXzValue(result.index.recordCount)],
              ['CRC32', `0x${result.index.crc32.toString(16).padStart(8, '0')}`],
            ]}
          />
          <h3>Stream Footer</h3>
          <DetailList
            entries={[
              ['CRC32', `0x${result.streamFooter.crc32.toString(16).padStart(8, '0')}`],
              ['Backward Size', result.streamFooter.backwardSize.toString()],
              ['Check', `${result.streamFooter.checkName} (ID ${result.streamFooter.checkId})`],
              ['Magic', result.streamFooter.magic],
            ]}
          />
        </div>
      )}
    </section>
  );
}
