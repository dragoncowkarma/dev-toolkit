import { useEffect, useRef, useState } from 'react';
import {
  formatFileSize,
} from '../base64/base64.utils.js';
import {
  calculateBootBlockChecksum,
  calculateRootBlockChecksum,
  inspectAffsFile,
} from './affs-boot-block-inspector.utils.js';
import './affs-boot-block-inspector.css';

/**
 * Creates a synthetic in-memory sample Amiga disk file for interactive testing.
 *
 * @param {'ofs-boot'|'ffs-floppy'|'bad-checksum'} type - Preset type.
 * @returns {File} Synthetic File object.
 */
function createSampleDisk(type) {
  if (type === 'ofs-boot') {
    const bytes = new Uint8Array(1024);
    bytes[0] = 0x44; // 'D'
    bytes[1] = 0x4f; // 'O'
    bytes[2] = 0x53; // 'S'
    bytes[3] = 0x00; // DOS0 (OFS)
    // root block pointer = 880
    bytes[8] = 0x00;
    bytes[9] = 0x00;
    bytes[10] = 0x03;
    bytes[11] = 0x70;
    const cs = calculateBootBlockChecksum(bytes);
    bytes[4] = (cs >> 24) & 0xff;
    bytes[5] = (cs >> 16) & 0xff;
    bytes[6] = (cs >> 8) & 0xff;
    bytes[7] = cs & 0xff;
    return new File([bytes], 'amiga_ofs_bootblock.bin', { type: 'application/octet-stream' });
  }

  if (type === 'bad-checksum') {
    const bytes = new Uint8Array(1024);
    bytes[0] = 0x44;
    bytes[1] = 0x4f;
    bytes[2] = 0x53;
    bytes[3] = 0x01; // DOS1 (FFS)
    bytes[8] = 0x00;
    bytes[9] = 0x00;
    bytes[10] = 0x03;
    bytes[11] = 0x70;
    // Deliberately incorrect checksum
    bytes[4] = 0xde;
    bytes[5] = 0xad;
    bytes[6] = 0xbe;
    bytes[7] = 0xef;
    return new File([bytes], 'corrupted_bootblock.bin', { type: 'application/octet-stream' });
  }

  // 'ffs-floppy': full 880 KB disk (1760 sectors = 901,120 bytes)
  const disk = new Uint8Array(1760 * 512);
  // Boot block at sector 0..1
  disk[0] = 0x44;
  disk[1] = 0x4f;
  disk[2] = 0x53;
  disk[3] = 0x01; // DOS1 (FFS)
  disk[8] = 0x00;
  disk[9] = 0x00;
  disk[10] = 0x03;
  disk[11] = 0x70; // 880
  const bootCs = calculateBootBlockChecksum(disk.slice(0, 1024));
  disk[4] = (bootCs >> 24) & 0xff;
  disk[5] = (bootCs >> 16) & 0xff;
  disk[6] = (bootCs >> 8) & 0xff;
  disk[7] = bootCs & 0xff;

  // Root block at sector 880 (offset 880 * 512 = 450,560)
  const rootOffset = 880 * 512;
  // Primary type = 2
  disk[rootOffset + 3] = 2;
  // Secondary type = 1 at offset 508
  disk[rootOffset + 511] = 1;
  // Bitmap flag = -1 (0xFFFFFFFF) at offset 312
  disk[rootOffset + 312] = 0xff;
  disk[rootOffset + 313] = 0xff;
  disk[rootOffset + 314] = 0xff;
  disk[rootOffset + 315] = 0xff;
  // Volume name = "Workbench" at offset 432
  const name = 'Workbench';
  disk[rootOffset + 432] = name.length;
  for (let i = 0; i < name.length; i += 1) {
    disk[rootOffset + 433 + i] = name.charCodeAt(i);
  }
  // Creation date: 17859 days (~2026), 720 mins (12:00), 0 ticks
  const days = 17859;
  disk[rootOffset + 484] = (days >> 24) & 0xff;
  disk[rootOffset + 485] = (days >> 16) & 0xff;
  disk[rootOffset + 486] = (days >> 8) & 0xff;
  disk[rootOffset + 487] = days & 0xff;
  disk[rootOffset + 488] = 0x00;
  disk[rootOffset + 489] = 0x00;
  disk[rootOffset + 490] = 0x02;
  disk[rootOffset + 491] = 0xd0; // 720 mins

  // Root block checksum at offset 20
  const rootCs = calculateRootBlockChecksum(disk.slice(rootOffset, rootOffset + 512));
  disk[rootOffset + 20] = (rootCs >> 24) & 0xff;
  disk[rootOffset + 21] = (rootCs >> 16) & 0xff;
  disk[rootOffset + 22] = (rootCs >> 8) & 0xff;
  disk[rootOffset + 23] = rootCs & 0xff;

  return new File([disk], 'amiga_workbench_floppy.adf', {
    type: 'application/octet-stream',
  });
}

/**
 * Renders the AFFS Boot Block and Root Block Inspector tool.
 *
 * @returns {React.JSX.Element} The AFFS inspector UI.
 */
export default function AffsBootBlockInspectorTool() {
  const [file, setFile] = useState(null);
  const [fileLabel, setFileLabel] = useState('');
  const [readRootBlock, setReadRootBlock] = useState(true);
  const [rootBlockSource, setRootBlockSource] = useState('pointer');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function inspectTarget(targetFile, source, withRootBlock) {
    if (!targetFile) return;
    const reqId = (fileRequestRef.current += 1);
    setLoading(true);
    setError('');
    try {
      const inspectData = await inspectAffsFile(targetFile, {
        readRootBlock: withRootBlock,
        rootBlockSource: source,
      });
      if (fileRequestRef.current !== reqId) return;
      setResult(inspectData);
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== reqId) return;
      setResult(null);
      setError(err.message);
    } finally {
      if (fileRequestRef.current === reqId) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (file) {
      inspectTarget(file, rootBlockSource, readRootBlock);
    }
  }, [file, rootBlockSource, readRootBlock]);

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    fileRequestRef.current += 1;
    setFile(selected);
    setFileLabel(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setFile(null);
    setFileLabel('');
    setResult(null);
    setError('');
    setLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSample(type) {
    fileRequestRef.current += 1;
    const sample = createSampleDisk(type);
    setFile(sample);
    setFileLabel(`📁 ${sample.name} (${formatFileSize(sample.size)})`);
  }

  const bootBlock = result?.bootBlock;
  const rootBlock = result?.rootBlock;
  const rootBlockError = result?.rootBlockError;

  return (
    <section className="affs-inspector-tool" aria-label="AFFS Boot Block Inspector Tool">
      <div className="affs-toolbar">
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload Disk / Boot Block
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload Amiga disk image or boot block file"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('ffs-floppy')}
          >
            Load 880 KB FFS Floppy
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('ofs-boot')}
          >
            Load OFS Boot Block
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('bad-checksum')}
          >
            Load Corrupt Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!file && !error && !result}
          >
            Clear
          </button>
        </div>

        {fileLabel && <div className="affs-file-meta">{fileLabel}</div>}
      </div>

      <div className="affs-options">
        <label className="affs-option-item">
          <input
            type="checkbox"
            checked={readRootBlock}
            onChange={(e) => setReadRootBlock(e.target.checked)}
          />
          Inspect Root Block (for &ge; 1760 sectors / 880 KB)
        </label>

        <label className="affs-option-item">
          Root block location:
          <select
            className="affs-option-select"
            value={rootBlockSource}
            onChange={(e) => setRootBlockSource(e.target.value)}
            disabled={!readRootBlock}
          >
            <option value="pointer">Boot Block Pointer</option>
            <option value="midpoint">Default Midpoint (Sector 880)</option>
          </select>
        </label>
      </div>

      {loading && <div className="affs-info">Reading and parsing blocks…</div>}

      {error && (
        <div className="affs-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {result && (
        <div className="affs-panels">
          {bootBlock && (
            <div className="panel" aria-label="Boot Block Details">
              <div className="panel-header">
                <h3 className="panel-title">Amiga Boot Block (Sectors 0–1)</h3>
                <span
                  className={`badge ${bootBlock.checksumValid ? 'badge--success' : 'badge--error'}`}
                >
                  {bootBlock.checksumValid ? '✓ Checksum Valid' : '✗ Checksum Mismatch'}
                </span>
              </div>

              <div className="affs-grid">
                <span className="affs-grid-label">DOS Magic:</span>
                <span className="affs-grid-value">
                  {bootBlock.magic} ({bootBlock.dosTypeHex})
                </span>

                <span className="affs-grid-label">Filesystem Type:</span>
                <span className="affs-grid-value">
                  {bootBlock.filesystem === 'FFS'
                    ? 'Fast File System (FFS)'
                    : 'Old File System (OFS)'}
                </span>

                <span className="affs-grid-label">International Mode:</span>
                <span className="affs-grid-value">
                  {bootBlock.international ? 'Enabled (INTL)' : 'Disabled'}
                </span>

                <span className="affs-grid-label">Directory Cache:</span>
                <span className="affs-grid-value">
                  {bootBlock.dircache ? 'Enabled (DIRCACHE)' : 'Disabled'}
                </span>

                <span className="affs-grid-label">Boot Checksum:</span>
                <span className="affs-grid-value">
                  Stored: {bootBlock.storedChecksumHex} | Calc: {bootBlock.calculatedChecksumHex}
                </span>

                <span className="affs-grid-label">Rootblock Pointer:</span>
                <span className="affs-grid-value">
                  Sector {bootBlock.rootblockPtr} (Byte offset {bootBlock.rootblockByteOffset})
                </span>
              </div>
            </div>
          )}

          {result.isFloppyOrLarger && readRootBlock && (
            <div className="panel" aria-label="Root Block Details">
              <div className="panel-header">
                <h3 className="panel-title">
                  Root Block (Sector {result.targetSector})
                </h3>
                {rootBlock ? (
                  <span className="badge badge--success">✓ Validated</span>
                ) : (
                  <span className="badge badge--error">✗ Untrusted / Invalid</span>
                )}
              </div>

              {rootBlockError && (
                <div className="affs-error" role="alert">
                  ⚠ Root block validation error: {rootBlockError}
                </div>
              )}

              {rootBlock && (
                <div className="affs-grid">
                  <span className="affs-grid-label">Volume Name:</span>
                  <span className="affs-grid-value">
                    {rootBlock.volumeName || '(unnamed)'}
                  </span>

                  <span className="affs-grid-label">Creation Date:</span>
                  <span className="affs-grid-value">
                    {rootBlock.creationDate.iso} ({rootBlock.creationDate.days}d,{' '}
                    {rootBlock.creationDate.mins}m, {rootBlock.creationDate.ticks}t)
                  </span>

                  <span className="affs-grid-label">Bitmap Flag:</span>
                  <span className="affs-grid-value">
                    {rootBlock.bitmapFlagStatus}
                  </span>

                  <span className="affs-grid-label">Block Checksum:</span>
                  <span className="affs-grid-value">
                    {rootBlock.storedChecksumHex} (Sum mod 2³² = 0)
                  </span>

                  <span className="affs-grid-label">Structure Types:</span>
                  <span className="affs-grid-value">
                    Primary: {rootBlock.primaryType} (T_SHORT) | Secondary:{' '}
                    {rootBlock.secondaryType} (ST_ROOT)
                  </span>
                </div>
              )}
            </div>
          )}

          {!result.isFloppyOrLarger && (
            <div className="affs-info">
              ℹ File size is {formatFileSize(result.fileSize)} ({result.totalSectors} sectors).
              Root block inspection requires at least 1760 sectors (880 KB standard floppy).
            </div>
          )}
        </div>
      )}
    </section>
  );
}
