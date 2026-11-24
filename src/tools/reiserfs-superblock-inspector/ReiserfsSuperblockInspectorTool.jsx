import { useEffect, useRef, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  BOUNDED_SLICE_BYTES,
  formatBytes,
  hexToBytes,
  parseReiserfsSuperblock,
  readFileSlice,
  REISERFS_DEFAULT_OFFSET,
  SAMPLE_CORRUPT_HEX,
  SAMPLE_VALID_35_HEX,
  SAMPLE_VALID_36_HEX,
} from './reiserfs-superblock-inspector.utils.js';
import './reiserfs-superblock-inspector.css';

const INPUT_MODES = {
  HEX: 'hex',
  FILE: 'file',
};

/**
 * ReiserFS Superblock Inspector Tool component.
 * Parses and displays ReiserFS v3.5 and v3.6 superblocks from hex or disk images.
 *
 * @returns {React.JSX.Element}
 */
export default function ReiserfsSuperblockInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.HEX);
  const [offset, setOffset] = useState(0);
  const [hexInput, setHexInput] = useState('');
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  // Parse hex dump in hex mode
  useEffect(() => {
    if (mode !== INPUT_MODES.HEX) return;
    setIsLoading(false);
    if (!hexInput.trim()) {
      setParseResult(null);
      return;
    }
    try {
      const bytes = hexToBytes(hexInput);
      const result = parseReiserfsSuperblock(bytes, offset);
      setParseResult(result);
    } catch (err) {
      setParseResult({
        success: false,
        superblock: null,
        derived: null,
        diagnostics: [err.message],
      });
    }
  }, [hexInput, offset, mode]);

  // Read slice in file mode
  useEffect(() => {
    if (mode !== INPUT_MODES.FILE) return;
    if (!file) {
      setIsLoading(false);
      setParseResult(null);
      return;
    }

    const requestId = (fileRequestRef.current += 1);
    setIsLoading(true);
    setParseResult(null);

    readFileSlice(file, offset, BOUNDED_SLICE_BYTES)
      .then((sliceBytes) => {
        if (fileRequestRef.current !== requestId) return;
        setIsLoading(false);
        // The slice starts at `offset`, so the superblock inside the slice is at offset 0
        const result = parseReiserfsSuperblock(sliceBytes, 0);
        setParseResult(result);
      })
      .catch((err) => {
        if (fileRequestRef.current !== requestId) return;
        setIsLoading(false);
        setParseResult({
          success: false,
          superblock: null,
          derived: null,
          diagnostics: [err.message],
        });
      });
  }, [file, offset, mode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    fileRequestRef.current += 1;
    setMode(nextMode);
    setParseResult(null);
    setIsLoading(false);
    if (nextMode === INPUT_MODES.FILE) {
      // Disk images typically place the superblock at 64 KiB
      if (offset === 0) setOffset(REISERFS_DEFAULT_OFFSET);
    }
  }

  function handleSample(sampleHex) {
    fileRequestRef.current += 1;
    setFile(null);
    setIsLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setMode(INPUT_MODES.HEX);
    setOffset(0);
    setHexInput(sampleHex);
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setHexInput('');
    setFile(null);
    setParseResult(null);
    setIsLoading(false);
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    fileRequestRef.current += 1;
    setFile(selected);
  }

  async function handleCopyJson() {
    if (!parseResult) return;
    try {
      const json = JSON.stringify(parseResult, null, 2);
      await navigator.clipboard.writeText(json);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy JSON to clipboard.');
    }
  }

  const superblock = parseResult?.superblock;
  const derived = parseResult?.derived;
  const diagnostics = parseResult?.diagnostics || [];

  return (
    <section className="reiserfs-tool" aria-label="ReiserFS Superblock Inspector">
      <div className="reiserfs-toolbar">
        <div className="reiserfs-mode-toggle" role="group" aria-label="Input Mode">
          <button
            type="button"
            className={`reiserfs-mode-btn ${mode === INPUT_MODES.HEX ? 'active' : ''}`}
            aria-pressed={mode === INPUT_MODES.HEX}
            onClick={() => handleModeChange(INPUT_MODES.HEX)}
          >
            Hex Dump
          </button>
          <button
            type="button"
            className={`reiserfs-mode-btn ${mode === INPUT_MODES.FILE ? 'active' : ''}`}
            aria-pressed={mode === INPUT_MODES.FILE}
            onClick={() => handleModeChange(INPUT_MODES.FILE)}
          >
            File Upload
          </button>
        </div>

        <div className="reiserfs-toolbar-actions">
          <button
            type="button"
            className="reiserfs-btn"
            onClick={handleCopyJson}
            disabled={!parseResult}
          >
            {copied ? '✓ Copied' : 'Copy JSON'}
          </button>
          {copied && (
            <div className="sr-only" role="status" aria-live="polite">
              Copied to clipboard
            </div>
          )}
          <button type="button" className="reiserfs-btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="reiserfs-samples">
        <span className="reiserfs-samples-label">Samples:</span>
        <button
          type="button"
          className="reiserfs-btn reiserfs-btn-secondary"
          onClick={() => handleSample(SAMPLE_VALID_36_HEX)}
        >
          Valid 3.6
        </button>
        <button
          type="button"
          className="reiserfs-btn reiserfs-btn-secondary"
          onClick={() => handleSample(SAMPLE_VALID_35_HEX)}
        >
          Valid 3.5
        </button>
        <button
          type="button"
          className="reiserfs-btn reiserfs-btn-secondary"
          onClick={() => handleSample(SAMPLE_CORRUPT_HEX)}
        >
          Corrupt Sample
        </button>
      </div>

      <div className="reiserfs-offset-controls">
        <label htmlFor="reiserfs-offset-input">Superblock Offset (bytes):</label>
        <input
          id="reiserfs-offset-input"
          type="number"
          min="0"
          step="512"
          className="reiserfs-offset-input"
          value={offset}
          onChange={(e) => setOffset(Math.max(0, parseInt(e.target.value, 10) || 0))}
        />
        <button
          type="button"
          className="reiserfs-btn reiserfs-btn-secondary"
          onClick={() => setOffset(REISERFS_DEFAULT_OFFSET)}
        >
          Disk Image (64 KiB)
        </button>
        <button
          type="button"
          className="reiserfs-btn reiserfs-btn-secondary"
          onClick={() => setOffset(0)}
        >
          Standalone (0)
        </button>
      </div>

      {mode === INPUT_MODES.HEX ? (
        <div className="reiserfs-panel">
          <label className="reiserfs-panel-label" htmlFor="reiserfs-hex-input">
            Paste Superblock Hex Dump
          </label>
          <textarea
            id="reiserfs-hex-input"
            className="reiserfs-textarea"
            placeholder="Paste raw hex dump (spaces and newlines allowed)..."
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="reiserfs-file-dropzone">
          <label className="reiserfs-file-label" htmlFor="reiserfs-file-input">
            <input
              ref={fileInputRef}
              id="reiserfs-file-input"
              type="file"
              className="reiserfs-file-input"
              aria-label="Upload ReiserFS file"
              onChange={handleFileChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.currentTarget.click();
                }
              }}
            />
            <span className="reiserfs-btn reiserfs-file-btn">
              Select Disk Image / Dump File
            </span>
          </label>
          <p className="reiserfs-metric-card-sub">
            Reads only the 512-byte slice holding the superblock via File.slice.
          </p>
          {file && (
            <div className="reiserfs-file-info">
              Selected: {file.name} ({formatBytes(file.size)})
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="reiserfs-loading" role="status" aria-live="polite">
          Reading superblock data...
        </div>
      )}

      {copyError && (
        <div className="reiserfs-diagnostics" role="alert">
          {copyError}
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="reiserfs-diagnostics" role="alert" aria-label="Diagnostics">
          <h3>⚠ Superblock Diagnostics ({diagnostics.length})</h3>
          <ul>
            {diagnostics.map((diag, index) => (
              <li key={index}>{diag}</li>
            ))}
          </ul>
        </div>
      )}

      {superblock && derived && (
        <>
          <div className="reiserfs-metrics">
            <div className="reiserfs-metric-card">
              <span className="reiserfs-metric-card-label">Volume Size</span>
              <span className="reiserfs-metric-card-value">{derived.volumeSizeFormatted}</span>
              <span className="reiserfs-metric-card-sub">
                {superblock.blockCount.toLocaleString()} blocks
              </span>
            </div>

            <div className="reiserfs-metric-card">
              <span className="reiserfs-metric-card-label">Free Space</span>
              <span className="reiserfs-metric-card-value">{derived.freeSpaceFormatted}</span>
              <span className="reiserfs-metric-card-sub">
                {superblock.freeBlocks.toLocaleString()} free blocks
              </span>
            </div>

            <div className="reiserfs-metric-card">
              <span className="reiserfs-metric-card-label">Space Used</span>
              <span className="reiserfs-metric-card-value">
                {derived.usagePercentageFormatted}
              </span>
              <div className="reiserfs-progress" aria-hidden="true">
                <div
                  className="reiserfs-progress-fill"
                  style={{ width: `${Math.min(100, Math.max(0, derived.usagePercentage))}%` }}
                />
              </div>
              <span className="reiserfs-metric-card-sub">
                {derived.usedSpaceFormatted} used
              </span>
            </div>

            <div className="reiserfs-metric-card">
              <span className="reiserfs-metric-card-label">Block Size</span>
              <span className="reiserfs-metric-card-value">
                {superblock.blockSize.toLocaleString()} B
              </span>
              <span className="reiserfs-metric-card-sub">Tree Height: {superblock.treeHeight}</span>
            </div>
          </div>

          <div className="reiserfs-details-grid">
            <div className="reiserfs-section">
              <h3>Filesystem & Format</h3>
              <table className="reiserfs-table">
                <tbody>
                  <tr>
                    <th>Magic String</th>
                    <td>{superblock.magic}</td>
                  </tr>
                  <tr>
                    <th>Format Description</th>
                    <td>{superblock.formatDescription}</td>
                  </tr>
                  <tr>
                    <th>Version</th>
                    <td>{superblock.versionDescription}</td>
                  </tr>
                  <tr>
                    <th>State</th>
                    <td>{superblock.stateDescription}</td>
                  </tr>
                  <tr>
                    <th>Hash Function</th>
                    <td>
                      {superblock.hashFunctionName} ({superblock.hashFunctionCode})
                    </td>
                  </tr>
                  <tr>
                    <th>B-Tree Height</th>
                    <td>{superblock.treeHeight}</td>
                  </tr>
                  <tr>
                    <th>Bitmap Blocks Count</th>
                    <td>{superblock.bitmapCount}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="reiserfs-section">
              <h3>Blocks & Object IDs</h3>
              <table className="reiserfs-table">
                <tbody>
                  <tr>
                    <th>Total Blocks</th>
                    <td>{superblock.blockCount.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>Free Blocks</th>
                    <td>{superblock.freeBlocks.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>Root Block</th>
                    <td>{superblock.rootBlock.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>Block Size</th>
                    <td>{superblock.blockSize} bytes</td>
                  </tr>
                  <tr>
                    <th>OID Max Size</th>
                    <td>{superblock.oidMaxSize}</td>
                  </tr>
                  <tr>
                    <th>OID Current Size</th>
                    <td>{superblock.oidCurSize}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="reiserfs-section">
              <h3>Journal Configuration</h3>
              <table className="reiserfs-table">
                <tbody>
                  <tr>
                    <th>Journal First Block</th>
                    <td>{superblock.journal1stBlock.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>Journal Device</th>
                    <td>{superblock.journalDev}</td>
                  </tr>
                  <tr>
                    <th>Journal Size</th>
                    <td>{superblock.journalSize.toLocaleString()} blocks</td>
                  </tr>
                  <tr>
                    <th>Max Transaction Size</th>
                    <td>{superblock.journalTransMax.toLocaleString()} blocks</td>
                  </tr>
                  <tr>
                    <th>Journal Magic</th>
                    <td>{superblock.journalMagicHex}</td>
                  </tr>
                  <tr>
                    <th>Max Batch</th>
                    <td>{superblock.journalMaxBatch}</td>
                  </tr>
                  <tr>
                    <th>Max Commit Age</th>
                    <td>{superblock.journalMaxCommitAge} s</td>
                  </tr>
                  <tr>
                    <th>Max Transaction Age</th>
                    <td>{superblock.maxTransAge} s</td>
                  </tr>
                  <tr>
                    <th>Reserved for Journal</th>
                    <td>{superblock.reservedForJournal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <details className="reiserfs-json-details">
            <summary>View Raw Superblock JSON</summary>
            <pre>{JSON.stringify(parseResult, null, 2)}</pre>
          </details>
        </>
      )}
    </section>
  );
}
