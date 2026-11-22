import { useRef, useState } from 'react';
import { parseMbr } from './mbrParser.js';
import './mbrPartitionTableInspector.css';

/**
 * Formats a sector count as an approximate byte size using 512-byte sectors.
 *
 * @param {number} sectorCount - Number of MBR sectors.
 * @returns {string} A concise, human-readable size.
 */
export function formatPartitionSize(sectorCount) {
  const bytes = sectorCount * 512;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Formats a partition type for display.
 *
 * @param {{typeName: string, type: number}} partition - A parsed partition entry.
 * @returns {string} The type name followed by its hexadecimal code.
 */
function formatPartitionType(partition) {
  const code = partition.type.toString(16).padStart(2, '0').toUpperCase();
  return `${partition.typeName} (0x${code})`;
}

/**
 * Renders a client-side inspector for classic MBR partition table sectors.
 *
 * @returns {React.JSX.Element} The MBR partition table inspector.
 */
export default function MBRPartitionTableInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = (requestRef.current += 1);
    setFileName(file.name);
    setResult(null);
    setError('');
    try {
      const parsed = parseMbr(await file.arrayBuffer());
      if (requestRef.current !== requestId) return;
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setResult(parsed);
    } catch {
      if (requestRef.current === requestId) {
        setError('Failed to read the selected file.');
      }
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="mbr-inspector" aria-label="MBR Partition Table Inspector">
      <div className="mbr-inspector__toolbar">
        <label className="mbr-inspector__button mbr-inspector__file-button">
          Choose disk image
          <input
            ref={fileInputRef}
            type="file"
            className="mbr-inspector__file-input"
            aria-label="Choose a disk image to inspect"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="mbr-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <p className="mbr-inspector__privacy-note">
        Files are read and inspected entirely in your browser; nothing is uploaded.
      </p>

      {fileName && <p className="mbr-inspector__file-name">Inspecting: {fileName}</p>}
      {error && <div className="mbr-inspector__error" role="alert">{error}</div>}

      {result && (
        <div className="mbr-inspector__results">
          <dl className="mbr-inspector__summary">
            <div><dt>Boot signature</dt><dd>{result.bootSignature} (valid)</dd></div>
            <div><dt>Bootstrap code region</dt><dd>{result.bootstrapCodeSize} bytes</dd></div>
          </dl>
          {result.note && <p className="mbr-inspector__note">{result.note}</p>}
          <div className="mbr-inspector__table-wrap">
            <table>
              <caption>Primary partition entries</caption>
              <thead>
                <tr>
                  <th scope="col">Entry</th><th scope="col">Boot</th><th scope="col">Type</th>
                  <th scope="col">Start LBA</th>
                  <th scope="col">Sectors</th>
                  <th scope="col">Size</th>
                </tr>
              </thead>
              <tbody>
                {result.partitions.map((partition) => (
                  <tr key={partition.index}>
                    <td>{partition.index}</td>
                    <td>{partition.bootIndicator === 0x80 ? 'Active' : 'No'}</td>
                    <td>{formatPartitionType(partition)}</td>
                    <td>{partition.lbaStart}</td><td>{partition.sectorCount}</td>
                    <td>{formatPartitionSize(partition.sectorCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
