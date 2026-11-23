import { useEffect, useRef, useState } from 'react';
import {
  CRAMFS_SUPERBLOCK_SIZE,
  createSampleSuperblock,
  formatFileSize,
  parseCramfsSuperblock,
  readBlobAsArrayBuffer,
} from './cramfs.utils.js';
import './cramfs-superblock-inspector.css';

/**
 * Renders the CramFS Superblock Inspector tool.
 *
 * @returns {React.JSX.Element} The CramFS Superblock Inspector UI.
 */
export default function CramfsSuperblockInspectorTool() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [actualFileSize, setActualFileSize] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const activeRequestIdRef = useRef(0);

  function resetState() {
    activeRequestIdRef.current += 1;
    setData(null);
    setError('');
    setFileName('');
    setActualFileSize(0);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  useEffect(() => {
    const input = fileInputRef.current;
    const handleCancel = () => {
      resetState();
    };
    if (input) {
      input.addEventListener('cancel', handleCancel);
    }
    return () => {
      activeRequestIdRef.current += 1;
      if (input) {
        input.removeEventListener('cancel', handleCancel);
      }
    };
  }, []);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      resetState();
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    // Immediately clear old details and display new file name
    setData(null);
    setError('');
    setFileName(file.name);
    setActualFileSize(file.size);

    if (file.size < CRAMFS_SUPERBLOCK_SIZE) {
      setIsLoading(false);
      setError(
        `Truncated CramFS image: expected at least ${CRAMFS_SUPERBLOCK_SIZE} bytes, ` +
        `received ${file.size} byte(s).`
      );
      return;
    }

    setIsLoading(true);

    try {
      const slice = file.slice(0, CRAMFS_SUPERBLOCK_SIZE);
      const buffer = await readBlobAsArrayBuffer(slice);
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      const parsed = parseCramfsSuperblock(buffer);
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      setData(parsed);
      setError('');
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      setData(null);
      setError(err.message || 'Failed to inspect CramFS image.');
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }

  function handleLoadSample(endianness) {
    resetState();
    const sampleName = endianness === 'little' ? 'sample_le.cramfs' : 'sample_be.cramfs';
    const sampleBytes = createSampleSuperblock({
      endianness,
      name: sampleName,
    });
    setFileName(`${sampleName} (Sample)`);
    setActualFileSize(sampleBytes.byteLength);

    try {
      const parsed = parseCramfsSuperblock(sampleBytes);
      setData(parsed);
      setError('');
    } catch (err) {
      setData(null);
      setError(err.message);
    }
  }

  return (
    <div className="cramfs-inspector">
      <header className="cramfs-toolbar">
        <div className="cramfs-toolbar-title">
          <h2>CramFS Superblock Inspector</h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Inspect and decode CramFS filesystem headers (first 76 bytes) client-side.
          </p>
        </div>
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Select CramFS Image
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              aria-label="Upload CramFS image"
              onChange={handleFileChange}
              onCancel={resetState}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('little')}
          >
            Load LE Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('big')}
          >
            Load BE Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={resetState}
            disabled={!data && !error && !fileName && !isLoading}
          >
            Clear
          </button>
        </div>
      </header>

      {error && (
        <div className="cramfs-error" role="alert">
          <strong>Error: </strong>
          {error}
        </div>
      )}

      {fileName && (
        <div className="cramfs-file-meta">
          Inspecting file: <strong style={{ color: 'var(--color-text)' }}>{fileName}</strong>
          {actualFileSize > 0 && (
            <span>
              {' '}({formatFileSize(actualFileSize)}, {actualFileSize.toLocaleString()} bytes)
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="cramfs-loading" role="status">
          Loading and inspecting superblock...
        </div>
      )}

      {!data && !error && !isLoading && (
        <div className="cramfs-empty">
          <p>No CramFS image loaded.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
            Select a CramFS image file or load a sample to inspect its superblock metadata.
          </p>
        </div>
      )}

      {data && (
        <main className="cramfs-grid" aria-label="Superblock details">
          <section className="cramfs-card">
            <h3 className="cramfs-card-title">Header & Identification</h3>
            <div className="cramfs-prop-list">
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Magic Number</span>
                <span className="cramfs-prop-value">
                  {data.magicHex} <span className="badge badge-success">Valid</span>
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Endianness</span>
                <span className="cramfs-prop-value">
                  <span className="badge badge-info">
                    {data.endianness === 'little' ? 'Little-Endian (LE)' : 'Big-Endian (BE)'}
                  </span>
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Signature String</span>
                <span className="cramfs-prop-value">
                  "{data.signature}"
                  {data.signature === 'Compressed ROMFS' && (
                    <span className="badge badge-success" style={{ marginLeft: '0.4rem' }}>
                      Match
                    </span>
                  )}
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Filesystem Name</span>
                <span className="cramfs-prop-value">
                  {data.name ? `"${data.name}"` : <em>(empty)</em>}
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Superblock Size</span>
                <span className="cramfs-prop-value">
                  {formatFileSize(data.size)} ({data.size.toLocaleString()} bytes)
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Actual File Size</span>
                <span className="cramfs-prop-value">
                  {formatFileSize(actualFileSize)} ({actualFileSize.toLocaleString()} bytes)
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Future / Reserved</span>
                <span className="cramfs-prop-value">
                  {data.futureHex} ({data.future})
                </span>
              </div>
            </div>
          </section>

          <section className="cramfs-card">
            <h3 className="cramfs-card-title">Filesystem Info (FSID)</h3>
            <div className="cramfs-prop-list">
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">CRC32</span>
                <span className="cramfs-prop-value">{data.fsid.crcHex}</span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Edition</span>
                <span className="cramfs-prop-value">{data.fsid.edition.toLocaleString()}</span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Block Count</span>
                <span className="cramfs-prop-value">{data.fsid.blocks.toLocaleString()}</span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">File Count</span>
                <span className="cramfs-prop-value">{data.fsid.files.toLocaleString()}</span>
              </div>
            </div>
          </section>

          <section className="cramfs-card cramfs-card-full">
            <h3 className="cramfs-card-title">Feature Flags</h3>
            <div className="cramfs-prop-list" style={{ marginBottom: '0.75rem' }}>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Raw Flags</span>
                <span className="cramfs-prop-value">
                  {data.flagsHex} ({data.flags})
                </span>
              </div>
              <div className="cramfs-prop-row">
                <span className="cramfs-prop-label">Active Flags</span>
                <div className="cramfs-prop-value">
                  {data.flagNames.length === 0 ? (
                    <span className="badge badge-muted">None</span>
                  ) : (
                    <div className="flag-tags">
                      {data.flagNames.map((name) => (
                        <span key={name} className="badge badge-info">
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="cramfs-table-container">
              <table className="cramfs-table" aria-label="Feature flags status">
                <thead>
                  <tr>
                    <th scope="col">Flag</th>
                    <th scope="col">Bitmask</th>
                    <th scope="col">Status</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flagDetails.map((flag) => (
                    <tr key={flag.id}>
                      <td>
                        <code>{flag.id}</code>
                      </td>
                      <td>
                        <code>0x{flag.bit.toString(16).padStart(8, '0')}</code>
                      </td>
                      <td>
                        {flag.active ? (
                          <span className="badge badge-success">Enabled</span>
                        ) : (
                          <span className="badge badge-muted">Disabled</span>
                        )}
                      </td>
                      <td>{flag.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
