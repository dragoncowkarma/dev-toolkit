import { useRef, useState } from 'react';
import {
  createSampleSuperblock,
  formatFileSize,
  parseErofsSuperblock,
  readErofsSuperblockSlice,
} from './erofs-superblock-inspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './erofs-superblock-inspector.css';

/**
 * Client-side EROFS superblock inspector component.
 *
 * @returns {React.JSX.Element}
 */
export default function ErofsSuperblockInspectorTool() {
  const [parsedData, setParsedData] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  function handleClear() {
    fileRequestRef.current += 1;
    setParsedData(null);
    setFileInfo(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) {
      handleClear();
      return;
    }

    const currentRequestId = (fileRequestRef.current += 1);
    setError('');

    try {
      const slice = await readErofsSuperblockSlice(selected);
      if (fileRequestRef.current !== currentRequestId) {
        return;
      }
      const parsed = parseErofsSuperblock(slice);
      setParsedData(parsed);
      setFileInfo({
        name: selected.name,
        size: selected.size,
      });
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== currentRequestId) {
        return;
      }
      setParsedData(null);
      setError(err.message);
    }
  }

  function handleLoadSample() {
    fileRequestRef.current += 1;
    try {
      const sampleBuffer = createSampleSuperblock();
      const parsed = parseErofsSuperblock(sampleBuffer);
      setParsedData(parsed);
      setFileInfo({
        name: 'sample-image.erofs',
        size: 4 * 1024 * 1024,
      });
      setError('');
    } catch (err) {
      setParsedData(null);
      setError(err.message);
    }
  }

  async function handleCopyJson() {
    if (!parsedData) return;
    try {
      const json = JSON.stringify(
        parsedData,
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2
      );
      await navigator.clipboard.writeText(json);
      showCopied(true);
    } catch {
      // Clipboard errors do not block display.
    }
  }

  return (
    <section className="erofs-inspector" aria-label="EROFS Superblock Inspector">
      <div className="erofs-inspector__header">
        <h2 className="erofs-inspector__title">EROFS Superblock Inspector</h2>
        <p className="erofs-inspector__description">
          Inspect and parse EROFS (Enhanced Read-Only File System) superblocks directly
          in your browser. Upload an EROFS disk image or filesystem file.
        </p>
      </div>

      <div className="erofs-inspector__toolbar">
        <div className="erofs-inspector__actions">
          <label className="erofs-inspector__btn erofs-inspector__file-btn">
            📁 Upload EROFS Image
            <input
              ref={fileInputRef}
              type="file"
              className="erofs-inspector__file-input"
              onChange={handleFileChange}
              aria-label="Upload EROFS Image"
            />
          </label>
          <button
            type="button"
            className="erofs-inspector__btn"
            onClick={handleLoadSample}
          >
            Load Sample
          </button>
          <button
            type="button"
            className="erofs-inspector__btn"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>

        {parsedData && (
          <div className="erofs-inspector__actions">
            <button
              type="button"
              className="erofs-inspector__btn"
              onClick={handleCopyJson}
            >
              {copied ? '✓ JSON Copied' : 'Copy JSON'}
            </button>
            {copied && (
              <span className="sr-only" role="status" aria-live="polite">
                JSON copied to clipboard
              </span>
            )}
          </div>
        )}
      </div>

      {fileInfo && (
        <div className="erofs-inspector__file-info" aria-label="Uploaded file details">
          <div className="erofs-inspector__file-details">
            <span>📄 {fileInfo.name}</span>
            <span className="erofs-inspector__file-meta">
              ({formatFileSize(fileInfo.size)} — {fileInfo.size.toLocaleString()} bytes)
            </span>
          </div>
          <span className="erofs-inspector__file-meta">
            Superblock read from offset 0x400 (128 bytes)
          </span>
        </div>
      )}

      {error && (
        <div className="erofs-inspector__error" role="alert">
          ⚠ {error}
        </div>
      )}

      {parsedData && (
        <div className="erofs-inspector__grid" data-testid="erofs-details">
          {/* General & Identification */}
          <div className="erofs-inspector__card">
            <h3 className="erofs-inspector__card-title">Identification & Integrity</h3>
            <table className="erofs-inspector__table">
              <tbody>
                <tr>
                  <th>Magic Number</th>
                  <td>
                    <span className="erofs-inspector__code">{parsedData.magic}</span>
                  </td>
                </tr>
                <tr>
                  <th>Volume Name</th>
                  <td>
                    {parsedData.volume_name ? (
                      <strong>{parsedData.volume_name}</strong>
                    ) : (
                      <em className="erofs-inspector__file-meta">(none)</em>
                    )}
                  </td>
                </tr>
                <tr>
                  <th>UUID</th>
                  <td>
                    <span className="erofs-inspector__code">{parsedData.uuid}</span>
                  </td>
                </tr>
                <tr>
                  <th>Checksum</th>
                  <td>
                    <span className="erofs-inspector__code">{parsedData.checksum}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Filesystem Geometry */}
          <div className="erofs-inspector__card">
            <h3 className="erofs-inspector__card-title">Filesystem Geometry</h3>
            <table className="erofs-inspector__table">
              <tbody>
                <tr>
                  <th>Block Size</th>
                  <td>
                    {parsedData.blockSize.toLocaleString()} B (
                    <code>blkszbits: {parsedData.blkszbits}</code>)
                  </td>
                </tr>
                <tr>
                  <th>Total Blocks</th>
                  <td>
                    {parsedData.blocks.toLocaleString()} ({parsedData.totalFsSizeFormatted})
                  </td>
                </tr>
                <tr>
                  <th>Inodes Count (inos)</th>
                  <td>{parsedData.inosFormatted}</td>
                </tr>
                <tr>
                  <th>Root Inode NID</th>
                  <td>{parsedData.root_nid}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Addresses & Extensions */}
          <div className="erofs-inspector__card">
            <h3 className="erofs-inspector__card-title">Block Layout & Slots</h3>
            <table className="erofs-inspector__table">
              <tbody>
                <tr>
                  <th>Meta Block Addr</th>
                  <td>
                    <span className="erofs-inspector__code">{parsedData.meta_blkaddr}</span>
                  </td>
                </tr>
                <tr>
                  <th>Xattr Block Addr</th>
                  <td>
                    <span className="erofs-inspector__code">{parsedData.xattr_blkaddr}</span>
                  </td>
                </tr>
                <tr>
                  <th>Extension Slots</th>
                  <td>{parsedData.sb_extslots}</td>
                </tr>
                <tr>
                  <th>Compr Algorithms</th>
                  <td>
                    {parsedData.availableComprAlgsDecoded.length > 0 ? (
                      parsedData.availableComprAlgsDecoded.join(', ')
                    ) : (
                      <span className="erofs-inspector__file-meta">Default / None</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Build Information & Features */}
          <div className="erofs-inspector__card">
            <h3 className="erofs-inspector__card-title">Build Time & Flags</h3>
            <table className="erofs-inspector__table">
              <tbody>
                <tr>
                  <th>Build Time</th>
                  <td>
                    <div>{parsedData.buildTimeFormatted}</div>
                    <div className="erofs-inspector__file-meta">
                      Raw: {parsedData.build_time.toString()} s
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>Incompat Features</th>
                  <td>
                    <div>
                      <span className="erofs-inspector__code">
                        {parsedData.featureIncompatHex}
                      </span>
                    </div>
                    <div className="erofs-inspector__badges">
                      {parsedData.featureIncompatDecoded.length > 0 ? (
                        parsedData.featureIncompatDecoded.map((name) => (
                          <span key={name} className="erofs-inspector__badge">
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="erofs-inspector__badge--none">None</span>
                      )}
                    </div>
                  </td>
                </tr>
                <tr>
                  <th>Compat Features</th>
                  <td>
                    <div>
                      <span className="erofs-inspector__code">
                        {parsedData.featureCompatHex}
                      </span>
                    </div>
                    <div className="erofs-inspector__badges">
                      {parsedData.featureCompatDecoded.length > 0 ? (
                        parsedData.featureCompatDecoded.map((name) => (
                          <span
                            key={name}
                            className="erofs-inspector__badge erofs-inspector__badge--compat"
                          >
                            {name}
                          </span>
                        ))
                      ) : (
                        <span className="erofs-inspector__badge--none">None</span>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!parsedData && !error && (
        <div className="erofs-inspector__placeholder">
          <div className="erofs-inspector__placeholder-icon" aria-hidden="true">
            ⛁
          </div>
          <p>Select an EROFS filesystem image file or click &quot;Load Sample&quot; to inspect.</p>
        </div>
      )}
    </section>
  );
}
