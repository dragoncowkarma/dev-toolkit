import { useRef, useState } from 'react';
import {
  createSampleBtrfsSuperblock,
  formatBytes,
  formatFileSize,
  parseBtrfsSuperblock,
  readSuperblockFromImage,
} from './btrfs-superblock-inspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './btrfs-superblock-inspector.css';

/**
 * Client-side Btrfs Superblock Inspector tool.
 * Reads the 4 KiB superblock at offset 0x10000 (64 KiB) of an uploaded image file,
 * reports actual file size, and presents decoded metadata, geometry, checksum, and feature flags.
 *
 * @returns {React.JSX.Element} The Btrfs inspector UI.
 */
export default function BtrfsSuperblockInspectorTool() {
  const [data, setData] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState('');
  const [copiedField, showCopied] = useCopyFeedback({ initialValue: null, resetValue: null });
  const fileInputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      // Selection was cancelled or cleared; reset state
      setData(null);
      setFileInfo(null);
      setError('');
      return;
    }

    try {
      const parsed = await readSuperblockFromImage(file);
      setData(parsed);
      setFileInfo(parsed.fileInfo);
      setError('');
    } catch (err) {
      // Reset state on failed selection
      setData(null);
      setFileInfo(null);
      setError(err.message || 'Failed to inspect Btrfs superblock.');
    }
  }

  function handleLoadSample() {
    try {
      const sampleBuffer = createSampleBtrfsSuperblock();
      const parsed = parseBtrfsSuperblock(sampleBuffer);
      setData(parsed);
      setFileInfo({
        name: 'sample-btrfs.img',
        size: 21474836480, // 20 GiB
        sliceOffset: 0x10000,
        sliceSize: 4096,
      });
      setError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setData(null);
      setFileInfo(null);
      setError(err.message || 'Failed to load sample superblock.');
    }
  }

  function handleClear() {
    setData(null);
    setFileInfo(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopy(text, fieldId) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showCopied(fieldId);
    } catch {
      // Clipboard copy failure is non-fatal
    }
  }

  function renderFlagList(flags, rawHex) {
    return (
      <div className="btrfs-flags-container">
        <span className="flags-raw">Raw: {rawHex}</span>
        <div className="btrfs-tag-list">
          {flags.length > 0 ? (
            flags.map((flag) => (
              <span
                key={flag.name}
                className="btrfs-tag btrfs-tag--primary"
                title={`${flag.label} (${flag.hex})`}
              >
                {flag.name}
              </span>
            ))
          ) : (
            <span className="btrfs-tag btrfs-tag--empty">None</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="btrfs-inspector" aria-label="Btrfs Superblock Inspector Tool">
      <div className="btrfs-toolbar">
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload Image
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload Btrfs filesystem image"
            />
          </label>
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!data && !fileInfo && !error}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="btrfs-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {fileInfo && (
        <div className="btrfs-info-card" aria-label="File inspection summary">
          <div className="btrfs-info-header">
            <span className="btrfs-file-title">📁 {fileInfo.name}</span>
            <span className="btrfs-slice-tag">
              Slice: 4 KiB @ offset 0x{fileInfo.sliceOffset.toString(16)}
            </span>
          </div>
          <p className="btrfs-file-size">
            Actual Image Size: {formatFileSize(fileInfo.size)} (
            {fileInfo.size.toLocaleString()} bytes)
          </p>
        </div>
      )}

      {data ? (
        <div className="btrfs-grid">
          {/* Section: Filesystem Identity */}
          <div className="btrfs-section">
            <h3 className="section-title">Filesystem Overview</h3>
            <div className="btrfs-field-list">
              <div className="btrfs-field-row">
                <span className="field-label">Label:</span>
                <span className="field-value field-value-highlight">
                  {data.label || '(none)'}
                </span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Filesystem UUID (FSID):</span>
                <div className="field-value-wrapper">
                  <span className="field-value">{data.fsid}</span>
                  <button
                    type="button"
                    className="btn copy-btn"
                    onClick={() => handleCopy(data.fsid, 'fsid')}
                    aria-label="Copy FSID"
                  >
                    {copiedField === 'fsid' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Magic Signature:</span>
                <span className="field-value">{data.magic}</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Generation:</span>
                <span className="field-value">{data.generation.toString()}</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Physical Bytenr:</span>
                <span className="field-value">
                  0x{data.bytenr.toString(16)} ({data.bytenr.toString()})
                </span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Total Volume Size:</span>
                <span className="field-value">{formatBytes(data.totalBytes)}</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Used Space:</span>
                <span className="field-value">{formatBytes(data.bytesUsed)}</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Devices:</span>
                <span className="field-value">{data.numDevices.toString()}</span>
              </div>
            </div>
          </div>

          {/* Section: Geometry & Checksum */}
          <div className="btrfs-section">
            <h3 className="section-title">Geometry & Checksum</h3>
            <div className="btrfs-field-list">
              <div className="btrfs-field-row">
                <span className="field-label">Sector Size:</span>
                <span className="field-value">{data.sectorsize} bytes</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Node Size:</span>
                <span className="field-value">{data.nodesize} bytes</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Stripe Size:</span>
                <span className="field-value">{data.stripesize} bytes</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Root Dir Object ID:</span>
                <span className="field-value">{data.rootDirObjectId.toString()}</span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Checksum Type:</span>
                <span className="field-value">
                  {data.csumType.name} (Type {data.csumType.value})
                </span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Superblock Checksum:</span>
                <div className="field-value-wrapper">
                  <span className="field-value">0x{data.csumHex}</span>
                  <button
                    type="button"
                    className="btn copy-btn"
                    onClick={() => handleCopy(`0x${data.csumHex}`, 'csum')}
                    aria-label="Copy Checksum"
                  >
                    {copiedField === 'csum' ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Core Tree Roots */}
          <div className="btrfs-section">
            <h3 className="section-title">Tree Roots</h3>
            <div className="btrfs-field-list">
              <div className="btrfs-field-row">
                <span className="field-label">Root Tree Root:</span>
                <span className="field-value">
                  0x{data.root.toString(16)} ({data.root.toString()})
                </span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Chunk Tree Root:</span>
                <span className="field-value">
                  0x{data.chunkRoot.toString(16)} ({data.chunkRoot.toString()})
                </span>
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Log Tree Root:</span>
                <span className="field-value">
                  0x{data.logRoot.toString(16)} ({data.logRoot.toString()})
                </span>
              </div>
            </div>
          </div>

          {/* Section: Feature Flags */}
          <div className="btrfs-section">
            <h3 className="section-title">Feature Flags</h3>
            <div className="btrfs-field-list">
              <div className="btrfs-field-row">
                <span className="field-label">Incompatible Flags:</span>
                {renderFlagList(data.decodedIncompatFlags, `0x${data.incompatFlags.toString(16)}`)}
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Compat Read-Only Flags:</span>
                {renderFlagList(
                  data.decodedCompatRoFlags,
                  `0x${data.compatRoFlags.toString(16)}`
                )}
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Compat Flags:</span>
                {renderFlagList(data.decodedCompatFlags, `0x${data.compatFlags.toString(16)}`)}
              </div>
              <div className="btrfs-field-row">
                <span className="field-label">Superblock Flags:</span>
                {renderFlagList(data.decodedFlags, `0x${data.flags.toString(16)}`)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        !error && (
          <div className="btrfs-empty-state">
            <span className="btrfs-empty-icon" aria-hidden="true">
              🗄️
            </span>
            <p>
              Select a Btrfs filesystem image file or click &ldquo;Load Sample&rdquo; to inspect.
            </p>
          </div>
        )
      )}
    </section>
  );
}
