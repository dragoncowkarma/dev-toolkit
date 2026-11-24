import { useRef, useState } from 'react';
import {
  formatFileSize,
  parseMinixSuperblock,
  readFileBuffer,
  SAMPLES,
} from './minix-superblock-inspector.utils.js';
import './minix-superblock-inspector.css';

/**
 * Minix Filesystem Superblock Inspector tool component.
 *
 * @returns {React.JSX.Element}
 */
export default function MinixSuperblockInspectorTool() {
  const [sampleKey, setSampleKey] = useState('v1_14');
  const [sourceInfo, setSourceInfo] = useState('');
  const [superblock, setSuperblock] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);
    const fileName = selected.name;
    const fileSize = selected.size;

    try {
      const bytes = await readFileBuffer(selected);
      if (fileRequestRef.current !== requestId) return;
      const parsed = parseMinixSuperblock(bytes);
      setSourceInfo(`📁 ${fileName} (${formatFileSize(fileSize)})`);
      setSuperblock(parsed);
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setSourceInfo(`📁 ${fileName} (${formatFileSize(fileSize)})`);
      setSuperblock(null);
      setError(err.message);
    }
  }

  function handleCancel() {
    fileRequestRef.current += 1;
  }

  function handleLoadSample() {
    const requestId = (fileRequestRef.current += 1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const sample = SAMPLES[sampleKey];
    if (!sample) return;

    try {
      const parsed = parseMinixSuperblock(sample.buffer);
      if (fileRequestRef.current !== requestId) return;
      setSourceInfo(`💾 Sample: ${sample.name}`);
      setSuperblock(parsed);
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setSourceInfo(`💾 Sample: ${sample.name}`);
      setSuperblock(null);
      setError(err.message);
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setSuperblock(null);
    setError('');
    setSourceInfo('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <section
      className="minix-tool"
      aria-label="Minix Filesystem Superblock Inspector"
    >
      <div className="minix-toolbar">
        <div className="sample-controls">
          <label htmlFor="minix-sample-select" className="sr-only">
            Select Minix Sample
          </label>
          <select
            id="minix-sample-select"
            className="sample-select"
            value={sampleKey}
            onChange={(e) => setSampleKey(e.target.value)}
          >
            <option value="v1_14">Minix v1 (14-byte names, 0x137F)</option>
            <option value="v1_30">Minix v1 (30-byte names, 0x138F)</option>
            <option value="v2_14">Minix v2 (14-byte names, 0x2468)</option>
            <option value="v2_30">Minix v2 (30-byte names, 0x2478)</option>
            <option value="v3">Minix v3 (0x4D5A)</option>
          </select>
          <button
            type="button"
            className="btn"
            onClick={handleLoadSample}
          >
            Load Sample
          </button>
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload Image
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              onCancel={handleCancel}
              aria-label="Upload Minix filesystem image"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>
      </div>

      {sourceInfo && (
        <div className="source-info-bar">
          <span className="source-info-badge">Source:</span>
          <span>{sourceInfo}</span>
        </div>
      )}

      {error && (
        <div className="minix-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {superblock && (
        <div className="minix-results" aria-label="Superblock Details">
          <div className="summary-card">
            <h3 className="summary-title">{superblock.variant}</h3>
            <p className="summary-subtitle">
              Magic: <code>{superblock.magicHex}</code> | Filesystem Version {superblock.version}
            </p>
          </div>

          <div className="fields-grid">
            <div className="field-card">
              <span className="field-label">Inode Count</span>
              <span className="field-value">{superblock.inodeCount.toLocaleString()}</span>
              <span className="field-subvalue">s_ninodes</span>
            </div>

            <div className="field-card">
              <span className="field-label">Zone Count</span>
              <span className="field-value">{superblock.zoneCount.toLocaleString()}</span>
              <span className="field-subvalue">
                {superblock.version === 1 ? 's_nzones (16-bit)' : 's_zones (32-bit)'}
              </span>
            </div>

            <div className="field-card">
              <span className="field-label">Inode Bitmap Blocks</span>
              <span className="field-value">{superblock.imapBlocks.toLocaleString()}</span>
              <span className="field-subvalue">s_imap_blocks</span>
            </div>

            <div className="field-card">
              <span className="field-label">Zone Bitmap Blocks</span>
              <span className="field-value">{superblock.zmapBlocks.toLocaleString()}</span>
              <span className="field-subvalue">s_zmap_blocks</span>
            </div>

            <div className="field-card">
              <span className="field-label">First Data Zone</span>
              <span className="field-value">{superblock.firstDataZone.toLocaleString()}</span>
              <span className="field-subvalue">s_firstdatazone</span>
            </div>

            <div className="field-card">
              <span className="field-label">Log Zone Size</span>
              <span className="field-value">{superblock.logZoneSize}</span>
              <span className="field-subvalue">
                Zone size = {superblock.blockSize << superblock.logZoneSize} B (
                {1 << superblock.logZoneSize} block(s))
              </span>
            </div>

            <div className="field-card">
              <span className="field-label">Max File Size</span>
              <span className="field-value">{superblock.maxFileSize.toLocaleString()} B</span>
              <span className="field-subvalue">
                {formatFileSize(superblock.maxFileSize)}
              </span>
            </div>

            <div className="field-card">
              <span className="field-label">State Flags</span>
              <span className="field-value">
                {superblock.stateHex ? superblock.stateHex : 'N/A'}
              </span>
              <span className="field-subvalue">{superblock.stateDescription}</span>
            </div>

            <div className="field-card">
              <span className="field-label">v3 Block Size</span>
              <span className="field-value">
                {superblock.v3BlockSize !== null
                  ? `${superblock.v3BlockSize.toLocaleString()} B`
                  : 'N/A'}
              </span>
              <span className="field-subvalue">
                {superblock.version === 3
                  ? 's_blocksize (Minix v3)'
                  : '1024 B (fixed in v1/v2)'}
              </span>
            </div>
          </div>
        </div>
      )}

      {!superblock && !error && (
        <div className="empty-placeholder">
          <p>
            Select a Minix filesystem image file or choose a sample above to
            inspect the superblock.
          </p>
        </div>
      )}
    </section>
  );
}
