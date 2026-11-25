import { useRef, useState } from 'react';
import {
  createSfsRootBlockBuffer,
  formatBytes,
  parseSfsRootBlock,
  readRootBlockFromBlob,
} from './sfs-root-block.utils.js';
import './sfs-root-block.css';

/**
 * Renders the Amiga Smart File System (SFS) Root Block Inspector tool.
 * Reads only the first 4096 bytes via File.slice, parses metadata,
 * and validates the checksum without network access.
 *
 * @returns {React.JSX.Element}
 */
export default function SfsRootBlockInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const fileInputRef = useRef(null);
  const activeRequestIdRef = useRef(0);

  async function handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = ++activeRequestIdRef.current;
    setLoadError('');
    setIsProcessing(true);
    setFileName(file.name);
    setFileSize(file.size);
    setResult(null);

    try {
      const parsed = await readRootBlockFromBlob(file);
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      setResult(parsed);
    } catch (err) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }
      setLoadError(err.message || 'Failed to inspect file.');
      setResult(null);
    } finally {
      if (requestId === activeRequestIdRef.current) {
        setIsProcessing(false);
      }
    }
  }

  function handleLoadSampleValid() {
    activeRequestIdRef.current += 1;
    setIsProcessing(false);
    setLoadError('');
    setFileName('sample_valid_sfs.img');
    const buffer = createSfsRootBlockBuffer({
      blockSize: 512,
      totalBlocks: 8192,
      version: 1,
      sequenceNumber: 1,
      dateCreated: 100000000,
      flags: 0x01,
      bitmapBase: 1,
      adminSpaceContainer: 2,
      rootObjectContainer: 3,
      extentBnodeRoot: 4,
    });
    setFileSize(buffer.byteLength);
    const parsed = parseSfsRootBlock(buffer);
    setResult(parsed);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSampleBadChecksum() {
    activeRequestIdRef.current += 1;
    setIsProcessing(false);
    setLoadError('');
    setFileName('sample_bad_checksum.img');
    const buffer = createSfsRootBlockBuffer({
      blockSize: 512,
      totalBlocks: 8192,
      corruptChecksum: true,
    });
    setFileSize(buffer.byteLength);
    const parsed = parseSfsRootBlock(buffer);
    setResult(parsed);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSampleWrongMagic() {
    activeRequestIdRef.current += 1;
    setIsProcessing(false);
    setLoadError('');
    setFileName('sample_wrong_magic.img');
    const buffer = createSfsRootBlockBuffer({
      magic: 0x53465300, // 'SFS\0' filesystem DOS-type, not root block ID 'ROOT'
    });
    setFileSize(buffer.byteLength);
    const parsed = parseSfsRootBlock(buffer);
    setResult(parsed);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSampleTruncated() {
    activeRequestIdRef.current += 1;
    setIsProcessing(false);
    setLoadError('');
    setFileName('sample_truncated.img');
    const buffer = new ArrayBuffer(64);
    setFileSize(64);
    const parsed = parseSfsRootBlock(buffer);
    setResult(parsed);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClear() {
    activeRequestIdRef.current += 1;
    setIsProcessing(false);
    setResult(null);
    setFileName('');
    setFileSize(null);
    setLoadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="sfs-inspector-tool">
      <header className="tool-header">
        <h2>Amiga SFS Root Block Inspector</h2>
        <p>
          Inspect Amiga Smart File System (SFS) partition images client-side. Reads only the
          first 4096 bytes via <code>File.slice</code> and verifies the 32-bit checksum.
        </p>
      </header>

      <div className="actions-bar">
        <label className="btn file-btn">
          Select SFS Image
          <input
            ref={fileInputRef}
            type="file"
            className="file-input"
            onChange={handleFileSelect}
            aria-label="Select SFS Image"
          />
        </label>
        <button
          type="button"
          className="btn"
          onClick={handleLoadSampleValid}
          aria-label="Load Sample Valid SFS"
        >
          Sample Valid SFS
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleLoadSampleBadChecksum}
          aria-label="Sample Bad Checksum"
        >
          Sample Bad Checksum
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleLoadSampleWrongMagic}
          aria-label="Sample Wrong Magic"
        >
          Sample Wrong Magic
        </button>
        <button
          type="button"
          className="btn"
          onClick={handleLoadSampleTruncated}
          aria-label="Sample Truncated"
        >
          Sample Truncated
        </button>
        {(result || fileName) && (
          <button type="button" className="btn" onClick={handleClear} aria-label="Clear">
            Clear
          </button>
        )}
      </div>

      {loadError && (
        <div className="alert-box" role="alert">
          {loadError}
        </div>
      )}

      {isProcessing && (
        <div className="status-banner" role="status">
          <p>Processing root block...</p>
        </div>
      )}

      {result && (
        <>
          <div className="status-banner" aria-label="Verification Summary">
            <div className="status-banner-left">
              <span>Checksum Status:</span>
              <span
                className={`status-badge status-badge--${result.checksumStatus.toLowerCase()}`}
                data-testid="checksum-badge"
              >
                {result.checksumStatus}
              </span>
            </div>
            {fileName && (
              <span className="file-info">
                📄 {fileName} {fileSize != null ? `(${formatBytes(fileSize)})` : ''}
              </span>
            )}
          </div>

          {result.errorMessage && (
            <div
              className={`alert-box ${result.status === 'Unknown' ? 'alert-box--warning' : ''}`}
              role="alert"
            >
              {result.errorMessage}
            </div>
          )}

          <div className="details-grid">
            <section className="card" aria-labelledby="card-header-id">
              <h3 id="card-header-id">Header & Checksum</h3>
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Magic ID:</span>
                  <span className="field-value" data-testid="field-id">
                    {result.id} {result.idHex !== 'Unknown' ? `(${result.idHex})` : ''}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Block Checksum:</span>
                  <span className="field-value" data-testid="field-checksum">
                    {result.checksumHex}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Checksum Verification:</span>
                  <span className="field-value" data-testid="field-checksum-status">
                    {result.checksumStatus}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Own Block Number:</span>
                  <span className="field-value">
                    {result.ownBlock != null ? result.ownBlock : 'Unknown'}
                  </span>
                </div>
              </div>
            </section>

            <section className="card" aria-labelledby="card-geometry-id">
              <h3 id="card-geometry-id">Partition Geometry</h3>
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Block Size:</span>
                  <span className="field-value" data-testid="field-block-size">
                    {result.blockSize != null
                      ? `${result.blockSize} B (${formatBytes(result.blockSize)})`
                      : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Total Blocks:</span>
                  <span className="field-value" data-testid="field-total-blocks">
                    {result.totalBlocks != null
                      ? result.totalBlocks.toLocaleString()
                      : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Partition Capacity:</span>
                  <span className="field-value">
                    {result.volumeSizeBytes != null
                      ? formatBytes(result.volumeSizeBytes)
                      : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Bytes Read (Slice):</span>
                  <span className="field-value">{result.rawBytesRead} B</span>
                </div>
              </div>
            </section>

            <section className="card" aria-labelledby="card-version-id">
              <h3 id="card-version-id">Version & Timestamp</h3>
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Filesystem Version:</span>
                  <span className="field-value" data-testid="field-version">
                    {result.version != null ? result.version : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Sequence Number:</span>
                  <span className="field-value" data-testid="field-seq">
                    {result.sequenceNumber != null ? result.sequenceNumber : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Creation Date:</span>
                  <span className="field-value" data-testid="field-date">
                    {result.dateCreated}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Creation Seconds (Raw):</span>
                  <span className="field-value">
                    {result.dateCreatedRaw != null ? result.dateCreatedRaw : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Flags (Bits):</span>
                  <span className="field-value" data-testid="field-flags">
                    {result.flagsHex !== 'Unknown'
                      ? `${result.flagsHex} (${result.flagsBinary})`
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            </section>

            <section className="card" aria-labelledby="card-pointers-id">
              <h3 id="card-pointers-id">Root Block Pointers</h3>
              <div className="field-list">
                <div className="field-row">
                  <span className="field-label">Bitmap Base Pointer:</span>
                  <span className="field-value" data-testid="field-bitmap">
                    {result.bitmapBase != null ? `Block #${result.bitmapBase}` : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Admin Space Container:</span>
                  <span className="field-value" data-testid="field-admin">
                    {result.adminSpaceContainer != null
                      ? `Block #${result.adminSpaceContainer}`
                      : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Root Object Container:</span>
                  <span className="field-value" data-testid="field-root-obj">
                    {result.rootObjectContainer != null
                      ? `Block #${result.rootObjectContainer}`
                      : 'Unknown'}
                  </span>
                </div>
                <div className="field-row">
                  <span className="field-label">Extent B-Tree Root:</span>
                  <span className="field-value" data-testid="field-extent">
                    {result.extentBnodeRoot != null
                      ? `Block #${result.extentBnodeRoot}`
                      : 'Unknown'}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {!result && !isProcessing && (
        <div className="empty-state">
          <p>No SFS image loaded. Choose an image file or load one of the test samples above.</p>
        </div>
      )}
    </div>
  );
}
