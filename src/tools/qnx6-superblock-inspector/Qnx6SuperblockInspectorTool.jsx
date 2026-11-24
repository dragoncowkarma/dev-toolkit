import { useRef, useState } from 'react';
import {
  buildSampleSuperblock,
  bytesToHex,
  parseHexInput,
  parseQnx6Superblock,
  readSuperblockSlice,
} from './qnx6Superblock.utils.js';
import './qnx6-superblock-inspector.css';

/**
 * Client-side inspector for QNX6 (Power-Safe) filesystem superblocks.
 * Files and data are processed locally and never uploaded.
 *
 * @returns {React.JSX.Element}
 */
export default function Qnx6SuperblockInspectorTool() {
  const [hexInput, setHexInput] = useState('');
  const [fileInfo, setFileInfo] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [parseError, setParseError] = useState('');
  const fileInputRef = useRef(null);

  function analyzeBytes(bytes) {
    try {
      const result = parseQnx6Superblock(bytes);
      setParsed(result);
      setParseError('');
    } catch (err) {
      setParsed(null);
      setParseError(err.message || 'Failed to parse superblock data.');
    }
  }

  function handleHexChange(e) {
    const val = e.target.value;
    setHexInput(val);
    setFileInfo(null);

    if (!val.trim()) {
      setParsed(null);
      setParseError('');
      return;
    }

    try {
      const bytes = parseHexInput(val);
      analyzeBytes(bytes);
    } catch (err) {
      setParsed(null);
      setParseError(err.message);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const bytes = await readSuperblockSlice(file);
      setFileInfo({
        name: file.name,
        size: file.size,
        readBytes: bytes.length,
      });
      setHexInput(bytesToHex(bytes, true));
      analyzeBytes(bytes);
    } catch (err) {
      setParsed(null);
      setParseError(err.message || 'Failed to read file slice.');
    }
  }

  function handleLoadSample() {
    const sampleBytes = buildSampleSuperblock();
    const hex = bytesToHex(sampleBytes, true);
    setHexInput(hex);
    setFileInfo(null);
    analyzeBytes(sampleBytes);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClear() {
    setHexInput('');
    setFileInfo(null);
    setParsed(null);
    setParseError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="qnx6-tool">
      <header className="qnx6-toolbar">
        <div className="toolbar-title-group">
          <h2>QNX6 Superblock Inspector</h2>
          <p>Parse and inspect QNX6 (Power-Safe) filesystem superblocks client-side.</p>
        </div>
        <div className="toolbar-actions">
          <label className="btn file-btn">
            <span>📁 Open File</span>
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              aria-label="Upload disk image or superblock file"
              onChange={handleFileChange}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleLoadSample}
            aria-label="Load Sample Superblock"
          >
            Load Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!hexInput && !fileInfo && !parsed && !parseError}
            aria-label="Clear all inputs"
          >
            Clear
          </button>
        </div>
      </header>

      <section className="input-card" aria-labelledby="input-heading">
        <div className="input-header">
          <label id="input-heading" htmlFor="hex-input">
            Superblock Hex Input / Disk Image Slice (First 12,288 Bytes)
          </label>
          {fileInfo && (
            <span className="source-pill">
              Loaded: {fileInfo.name} ({fileInfo.readBytes} bytes inspected)
            </span>
          )}
        </div>
        <textarea
          id="hex-input"
          className="hex-textarea"
          rows={5}
          placeholder="Paste raw superblock hex or disk image hex (e.g. 22 11 19 68...)"
          value={hexInput}
          onChange={handleHexChange}
          aria-label="Superblock Hex Input"
        />
      </section>

      {parseError && (
        <section className="error-banner" role="alert" aria-live="assertive">
          <h3>Input Error</h3>
          <p>{parseError}</p>
        </section>
      )}

      {parsed && parsed.errors.length > 0 && (
        <section className="error-banner" role="alert" aria-live="assertive">
          <h3>Superblock Diagnostics ({parsed.errors.length} issue(s))</h3>
          <ul>
            {parsed.errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </section>
      )}

      {parsed && !parsed.truncated && parsed.byteOrder !== 'unknown' && (
        <section className="results-section" aria-labelledby="results-heading">
          <div className="overview-card">
            <div>
              <h3 id="results-heading" style={{ margin: 0, fontSize: '1.1rem' }}>
                Inspection Overview
              </h3>
              <p style={{ margin: '0.2rem 0 0', color: 'var(--color-text-muted)' }}>
                Offset 0x{parsed.offset.toString(16)} (
                {parsed.offset === 0 ? 'Raw Superblock' : 'Disk Image'})
              </p>
            </div>
            <div className="overview-meta">
              <span className={`badge ${parsed.valid ? 'valid' : 'invalid'}`}>
                {parsed.valid ? '✓ Valid Superblock' : '⚠ Validation Issues'}
              </span>
              <span className="badge info">
                {parsed.byteOrder === 'little' ? 'Little-Endian (LE)' : 'Big-Endian (BE)'}
              </span>
              <span className={`badge ${parsed.crcMatch ? 'valid' : 'invalid'}`}>
                {parsed.crcMatch ? '✓ CRC32 Match' : '✕ CRC32 Mismatch'}
              </span>
            </div>
          </div>

          <div className="fields-grid">
            <div className="field-card">
              <span className="field-label">Magic Number</span>
              <span className="field-value">
                0x{parsed.magic.toString(16).padStart(8, '0')}
              </span>
              <span className="field-sub">Expected: 0x68191122</span>
            </div>

            <div className={`field-card ${!parsed.crcMatch ? 'field-warning' : ''}`}>
              <span className="field-label">Checksum (CRC32)</span>
              <span className="field-value">
                0x{parsed.checksum.toString(16).padStart(8, '0')}
              </span>
              <span className="field-sub">
                Calculated: 0x{parsed.expectedChecksum.toString(16).padStart(8, '0')} (
                {parsed.crcMatch ? 'Match' : 'Mismatch'})
              </span>
            </div>

            <div className="field-card">
              <span className="field-label">Sequence Serial (64-bit)</span>
              <span className="field-value">{parsed.serial.toString()}</span>
              <span className="field-sub">0x{parsed.serial.toString(16)}</span>
            </div>

            <div className="field-card">
              <span className="field-label">Volume ID (UUID)</span>
              <span className="field-value">{parsed.volumeId || 'N/A'}</span>
              <span className="field-sub">128-bit identifier</span>
            </div>

            <div className={`field-card ${!parsed.validBlockSize ? 'field-warning' : ''}`}>
              <span className="field-label">Block Size</span>
              <span className="field-value">{parsed.blockSize} bytes</span>
              <span className="field-sub">
                {parsed.validBlockSize ? 'Valid (512-4096)' : 'Invalid block size'}
              </span>
            </div>

            <div className="field-card">
              <span className="field-label">Creation Time (ctime)</span>
              <span className="field-value">{parsed.ctimeFormatted}</span>
              <span className="field-sub">Raw: {parsed.ctime}</span>
            </div>

            <div className="field-card">
              <span className="field-label">Access Time (atime)</span>
              <span className="field-value">{parsed.atimeFormatted}</span>
              <span className="field-sub">Raw: {parsed.atime}</span>
            </div>

            <div className={`field-card ${!parsed.validFreeInodes ? 'field-warning' : ''}`}>
              <span className="field-label">Inodes (Total / Free)</span>
              <span className="field-value">
                {parsed.numInodes} / {parsed.freeInodes}
              </span>
              <span className="field-sub">
                Used: {parsed.numInodes - parsed.freeInodes}
                {!parsed.validFreeInodes && ' (Free > Total Error)'}
              </span>
            </div>

            <div className={`field-card ${!parsed.validFreeBlocks ? 'field-warning' : ''}`}>
              <span className="field-label">Blocks (Total / Free)</span>
              <span className="field-value">
                {parsed.numBlocks} / {parsed.freeBlocks}
              </span>
              <span className="field-sub">
                Used: {parsed.numBlocks - parsed.freeBlocks}
                {!parsed.validFreeBlocks && ' (Free > Total Error)'}
              </span>
            </div>
          </div>

          <div className="table-container">
            <h3>Root Node Summaries</h3>
            <table className="roots-table" aria-label="Root nodes summary">
              <thead>
                <tr>
                  <th scope="col">Root Tree</th>
                  <th scope="col">Size (Bytes, 64-bit)</th>
                  <th scope="col">Level</th>
                  <th scope="col">Mode / Flags</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Inode Tree</th>
                  <td>{parsed.roots.inode.size.toString()}</td>
                  <td>{parsed.roots.inode.level}</td>
                  <td>0x{parsed.roots.inode.mode.toString(16)}</td>
                </tr>
                <tr>
                  <th scope="row">Allocation Bitmap Tree</th>
                  <td>{parsed.roots.bitmap.size.toString()}</td>
                  <td>{parsed.roots.bitmap.level}</td>
                  <td>0x{parsed.roots.bitmap.mode.toString(16)}</td>
                </tr>
                <tr>
                  <th scope="row">Longfile Tree</th>
                  <td>{parsed.roots.longfile.size.toString()}</td>
                  <td>{parsed.roots.longfile.level}</td>
                  <td>0x{parsed.roots.longfile.mode.toString(16)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
