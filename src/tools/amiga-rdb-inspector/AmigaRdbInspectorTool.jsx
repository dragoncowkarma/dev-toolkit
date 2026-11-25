import { useRef, useState } from 'react';
import {
  createBadChecksumSample,
  createNoRdskSample,
  createTruncatedSample,
  createValidSample,
  parseRdb,
  readRdbSlice,
} from './amigaRdb.utils.js';
import './amiga-rdb-inspector.css';

/**
 * Formats a block pointer: returns the block number or "None ($FFFFFFFF)".
 *
 * @param {number} ptr - Block number or 0xFFFFFFFF.
 * @returns {string} Formatted string.
 */
function formatPointer(ptr) {
  if (ptr === 0xffffffff || ptr === undefined) return 'None (0xFFFFFFFF)';
  return `Block ${ptr} (0x${ptr.toString(16).toUpperCase()})`;
}

/**
 * Formats byte size to human-readable string.
 *
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted string.
 */
function formatCapacity(bytes) {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let idx = 0;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx += 1;
  }
  return `${val.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

/**
 * Client-side Amiga Rigid Disk Block (RDB) Inspector component.
 *
 * @returns {React.JSX.Element} Amiga RDB Inspector UI.
 */
export default function AmigaRdbInspectorTool() {
  const [sourceLabel, setSourceLabel] = useState('');
  const [data, setData] = useState(null);
  const [readError, setReadError] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = (fileRequestRef.current += 1);
    try {
      const buffer = await readRdbSlice(file);
      if (fileRequestRef.current !== requestId) return;

      const parsed = parseRdb(buffer);
      setSourceLabel(`📁 ${file.name} (${formatCapacity(file.size)})`);
      setData(parsed);
      setReadError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setData(null);
      setReadError(err.message || 'Failed to read disk image slice.');
    }
  }

  function handleLoadSample(sampleName, sampleBuffer) {
    fileRequestRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const parsed = parseRdb(sampleBuffer);
    setSourceLabel(`Sample: ${sampleName}`);
    setData(parsed);
    setReadError('');
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setSourceLabel('');
    setData(null);
    setReadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const rdsk = data?.rdsk;
  const partitions = data?.partitions || [];
  const status = data?.status || 'Unknown';
  const totalCapacity =
    rdsk && rdsk.cylinders && rdsk.sectors && rdsk.heads && rdsk.blockSize
      ? rdsk.cylinders * rdsk.sectors * rdsk.heads * rdsk.blockSize
      : 0;

  return (
    <section className="amiga-rdb-tool" aria-label="Amiga RDB Inspector">
      <div className="amiga-rdb-toolbar">
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload Disk Image
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload Amiga disk image"
            />
          </label>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>

        <div className="sample-actions" role="group" aria-label="Sample disk images">
          <span className="sample-label">Samples:</span>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('Valid RDB', createValidSample())}
          >
            Valid
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('Bad Checksum', createBadChecksumSample())}
          >
            Bad Checksum
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('No RDSK Magic', createNoRdskSample())}
          >
            No RDSK
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('Truncated Buffer', createTruncatedSample())}
          >
            Truncated
          </button>
        </div>
      </div>

      {sourceLabel && <div className="file-badge">{sourceLabel}</div>}

      {readError && (
        <div className="diagnostic-alert" role="alert">
          ⚠ {readError}
        </div>
      )}

      {data && (
        <>
          <div className="status-banner">
            <div>
              <strong>RDB Verification Status: </strong>
              <span className={`status-tag status-${status.toLowerCase()}`}>
                {status}
              </span>
            </div>
            {rdsk && (
              <div>
                <strong>Checksum: </strong>
                <span
                  className={`status-tag status-${(
                    rdsk.checksumStatus || 'unknown'
                  ).toLowerCase()}`}
                >
                  {rdsk.checksumStatus}
                </span>
              </div>
            )}
          </div>

          {data.diagnostic && (
            <div className="diagnostic-alert" role="alert">
              <strong>Diagnostic: </strong>
              {data.diagnostic}
            </div>
          )}

          {rdsk && (
            <>
              <div className="card-section">
                <h3 className="section-title">Drive Identification & Geometry</h3>
                <div className="meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">Vendor</span>
                    <span className="meta-value">{rdsk.vendor}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Product</span>
                    <span className="meta-value">{rdsk.product}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Revision</span>
                    <span className="meta-value">{rdsk.revision}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Block Size</span>
                    <span className="meta-value">{rdsk.blockSize} bytes</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">RDSK Flags</span>
                    <span className="meta-value">{rdsk.flagsFormatted}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Cylinders</span>
                    <span className="meta-value">{rdsk.cylinders}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Sectors / Track</span>
                    <span className="meta-value">{rdsk.sectors}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Heads</span>
                    <span className="meta-value">{rdsk.heads}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Calculated Capacity</span>
                    <span className="meta-value">{formatCapacity(totalCapacity)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">RDSK Checksum</span>
                    <span className="meta-value">
                      0x{rdsk.chkSum.toString(16).toUpperCase().padStart(8, '0')} (
                      {rdsk.checksumStatus})
                    </span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h3 className="section-title">List Pointers</h3>
                <div className="meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">Partition List</span>
                    <span className="meta-value">{formatPointer(rdsk.partitionList)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Filesystem Header List</span>
                    <span className="meta-value">{formatPointer(rdsk.fileSysHeaderList)}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Bad Block List</span>
                    <span className="meta-value">{formatPointer(rdsk.badBlockList)}</span>
                  </div>
                </div>
              </div>

              <div className="card-section">
                <h3 className="section-title">Partitions ({partitions.length})</h3>
                {partitions.length === 0 ? (
                  <p className="empty-desc">No partition blocks found on this disk image.</p>
                ) : (
                  <div className="table-container">
                    <table
                      className="partitions-table"
                      aria-label="Amiga disk partitions"
                    >
                      <thead>
                        <tr>
                          <th>Block</th>
                          <th>Drive Name</th>
                          <th>DosType</th>
                          <th>Low Cyl</th>
                          <th>High Cyl</th>
                          <th>Flags</th>
                          <th>Checksum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partitions.map((part) => (
                          <tr key={part.blockNumber}>
                            <td>{part.blockNumber}</td>
                            <td>
                              <strong>{part.driveName}</strong>
                            </td>
                            <td>{part.dosType}</td>
                            <td>{part.lowCyl}</td>
                            <td>{part.highCyl}</td>
                            <td>{part.flagsFormatted}</td>
                            <td>
                              <span
                                className={`status-tag status-${(
                                  part.checksumStatus || 'unknown'
                                ).toLowerCase()}`}
                              >
                                {part.checksumStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {!data && (
        <div className="empty-state">
          <span className="empty-icon" aria-hidden="true">
            💾
          </span>
          <h3 className="empty-title">No Disk Image Loaded</h3>
          <p className="empty-desc">
            Upload an Amiga hard disk image (.hdf, .img, .rdb) or select one of the
            sample presets above to inspect the Rigid Disk Block (RDSK) geometry and
            the partition (PART) linked chain.
          </p>
        </div>
      )}
    </section>
  );
}
