import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  bytesToHex,
  createSampleHfsHeader,
  HFS_PLUS_SIGNATURE,
  HFSX_SIGNATURE,
  hexToBytes,
  parseHfsVolumeHeader,
  VOLUME_HEADER_OFFSET,
  VOLUME_HEADER_SIZE,
} from './hfs-volume-header-inspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './hfs-volume-header-inspector.css';

const INPUT_MODES = {
  HEX: 'hex',
  FILE: 'file',
};

/**
 * Client-side HFS+ and HFSX Volume Header Inspector tool component.
 *
 * @returns {React.JSX.Element}
 */
export default function HfsVolumeHeaderInspectorTool() {
  const [inputMode, setInputMode] = useState(INPUT_MODES.HEX);
  const [hexInput, setHexInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileBytes, setFileBytes] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [offset, setOffset] = useState(VOLUME_HEADER_OFFSET);
  const [customOffsetStr, setCustomOffsetStr] = useState(String(VOLUME_HEADER_OFFSET));
  const [activeForkIndex, setActiveForkIndex] = useState(0);

  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const selectedFileRef = useRef(null);
  const activeReadIdRef = useRef(0);
  const activeReaderRef = useRef(null);

  /**
   * Cancels and invalidates any in-flight file read operations.
   */
  function cancelActiveRead() {
    activeReadIdRef.current += 1;
    if (activeReaderRef.current) {
      try {
        activeReaderRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      activeReaderRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      cancelActiveRead();
    };
  }, []);

  /**
   * Reads a bounded 512-byte slice of the selected file at the given offset.
   *
   * @param {File} file
   * @param {number} targetOffset
   */
  function readFileSlice(file, targetOffset) {
    cancelActiveRead();
    const readId = activeReadIdRef.current;
    setFileBytes(null);
    setFileError('');

    const slice = file.slice(targetOffset, targetOffset + VOLUME_HEADER_SIZE);
    const reader = new FileReader();
    activeReaderRef.current = reader;

    reader.onload = () => {
      if (activeReadIdRef.current !== readId) return;
      activeReaderRef.current = null;
      setFileBytes(new Uint8Array(/** @type {ArrayBuffer} */ (reader.result)));
    };

    reader.onerror = () => {
      if (activeReadIdRef.current !== readId) return;
      activeReaderRef.current = null;
      setFileError('Failed to read file. Please try again.');
    };

    reader.onabort = () => {
      if (activeReadIdRef.current !== readId) return;
      activeReaderRef.current = null;
    };

    reader.readAsArrayBuffer(slice);
  }

  const hexInputId = useId();
  const offsetSelectId = useId();
  const customOffsetId = useId();

  // Active bytes based on input mode
  const { bytes, parseError } = useMemo(() => {
    if (inputMode === INPUT_MODES.FILE) {
      if (fileError) return { bytes: null, parseError: fileError };
      return { bytes: fileBytes, parseError: '' };
    }
    if (!hexInput.trim()) {
      return { bytes: null, parseError: '' };
    }
    try {
      const parsedBytes = hexToBytes(hexInput);
      return { bytes: parsedBytes, parseError: '' };
    } catch (err) {
      return { bytes: null, parseError: err.message };
    }
  }, [inputMode, fileBytes, fileError, hexInput]);

  // Inspection result
  const inspection = useMemo(() => {
    if (!bytes) return null;
    return parseHfsVolumeHeader(bytes, {
      offset,
      isSlice: inputMode === INPUT_MODES.FILE,
      fileSize: inputMode === INPUT_MODES.FILE ? selectedFile?.size : undefined,
    });
  }, [bytes, offset, inputMode, selectedFile]);

  function handleOffsetSelectChange(event) {
    const val = event.target.value;
    if (val === 'custom') return;
    const num = parseInt(val, 10);
    setOffset(num);
    setCustomOffsetStr(String(num));
    if (inputMode === INPUT_MODES.FILE && selectedFileRef.current) {
      readFileSlice(selectedFileRef.current, num);
    }
  }

  function handleCustomOffsetChange(event) {
    const val = event.target.value;
    setCustomOffsetStr(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      setOffset(parsed);
      if (inputMode === INPUT_MODES.FILE && selectedFileRef.current) {
        readFileSlice(selectedFileRef.current, parsed);
      }
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    selectedFileRef.current = file;
    setSelectedFile(file);
    setFileName(file.name);
    readFileSlice(file, offset);
  }

  function handleSwitchMode(newMode) {
    if (newMode === inputMode) return;
    cancelActiveRead();
    if (newMode === INPUT_MODES.HEX) {
      selectedFileRef.current = null;
      setSelectedFile(null);
      setFileBytes(null);
      setFileName('');
      setFileError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    setInputMode(newMode);
  }

  function handleLoadSample(type) {
    cancelActiveRead();
    selectedFileRef.current = null;
    setSelectedFile(null);
    setFileBytes(null);
    setFileName('');
    setFileError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    let sampleBuffer;
    if (type === 'hfs+') {
      sampleBuffer = createSampleHfsHeader({ signature: HFS_PLUS_SIGNATURE, offset: 1024 });
    } else if (type === 'hfsx') {
      sampleBuffer = createSampleHfsHeader({
        signature: HFSX_SIGNATURE,
        version: 5,
        offset: 1024,
      });
    } else if (type === 'corrupt') {
      sampleBuffer = createSampleHfsHeader({
        signature: 0x9999,
        blockSize: 3000,
        freeBlocks: 500000,
        totalBlocks: 100000,
        offset: 1024,
      });
    }
    if (sampleBuffer) {
      setInputMode(INPUT_MODES.HEX);
      setOffset(1024);
      setCustomOffsetStr('1024');
      setHexInput(bytesToHex(sampleBuffer));
    }
  }

  function handleClear() {
    cancelActiveRead();
    selectedFileRef.current = null;
    setSelectedFile(null);
    setHexInput('');
    setFileBytes(null);
    setFileName('');
    setFileError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopyJson() {
    if (!inspection) return;
    try {
      const jsonStr = JSON.stringify(
        {
          header: inspection.header,
          derived: inspection.derived,
          diagnostics: inspection.diagnostics,
        },
        (key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2
      );
      await navigator.clipboard.writeText(jsonStr);
      showCopied(true);
    } catch {
      // Ignored
    }
  }

  const forks = inspection?.header
    ? [
      inspection.header.allocationFile,
      inspection.header.extentsFile,
      inspection.header.catalogFile,
      inspection.header.attributesFile,
      inspection.header.startupFile,
    ]
    : [];

  const activeFork = forks[activeForkIndex] || forks[0];

  return (
    <section className="hfs-tool" aria-label="HFS+ Volume Header Inspector">
      <div className="hfs-toolbar">
        <div className="mode-toggle" role="group" aria-label="Input mode">
          <button
            type="button"
            className={`mode-btn ${inputMode === INPUT_MODES.HEX ? 'active' : ''}`}
            onClick={() => handleSwitchMode(INPUT_MODES.HEX)}
          >
            Hex Input
          </button>
          <button
            type="button"
            className={`mode-btn ${inputMode === INPUT_MODES.FILE ? 'active' : ''}`}
            onClick={() => handleSwitchMode(INPUT_MODES.FILE)}
          >
            File Upload
          </button>
        </div>

        <div className="toolbar-samples" role="group" aria-label="Sample volume headers">
          <button
            type="button"
            className="btn sample-btn"
            onClick={() => handleLoadSample('hfs+')}
          >
            Sample HFS+
          </button>
          <button
            type="button"
            className="btn sample-btn"
            onClick={() => handleLoadSample('hfsx')}
          >
            Sample HFSX
          </button>
          <button
            type="button"
            className="btn sample-btn"
            onClick={() => handleLoadSample('corrupt')}
          >
            Sample Corrupt
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="hfs-offset-bar">
        <label htmlFor={offsetSelectId} className="offset-label">
          Header Offset:
        </label>
        <select
          id={offsetSelectId}
          className="offset-select"
          value={[1024, 0].includes(offset) ? offset : 'custom'}
          onChange={handleOffsetSelectChange}
        >
          <option value={1024}>1024 bytes (Standard volume)</option>
          <option value={0}>0 bytes (Standalone header)</option>
          <option value="custom">Custom offset…</option>
        </select>
        <div className="custom-offset-wrap">
          <label htmlFor={customOffsetId} className="sr-only">
            Custom Offset in Bytes
          </label>
          <input
            id={customOffsetId}
            type="number"
            min="0"
            className="custom-offset-input"
            value={customOffsetStr}
            onChange={handleCustomOffsetChange}
            placeholder="Offset"
          />
          <span className="offset-unit">bytes</span>
        </div>
      </div>

      {inputMode === INPUT_MODES.HEX ? (
        <div className="panel hex-panel">
          <label className="panel-label" htmlFor={hexInputId}>
            Paste HFS+ / HFSX Volume Hex
          </label>
          <textarea
            id={hexInputId}
            className="panel-textarea hex-textarea"
            placeholder="Paste hex characters here (spaces, colons, and newlines are ignored)…"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            spellCheck={false}
          />
        </div>
      ) : (
        <div className="panel file-panel">
          <label className="file-dropzone" htmlFor="hfs-file-input">
            <span className="file-dropzone-icon" aria-hidden="true">
              📂
            </span>
            <span className="file-dropzone-text">
              {fileName ? fileName : 'Choose an HFS+ disk image or volume header file'}
            </span>
            <input
              ref={fileInputRef}
              id="hfs-file-input"
              type="file"
              className="sr-only"
              onChange={handleFileChange}
            />
          </label>
        </div>
      )}

      {parseError && (
        <div className="hfs-error-alert" role="alert">
          ⚠ {parseError}
        </div>
      )}

      {inspection && inspection.diagnostics.length > 0 && (
        <div className="diagnostics-box" role="region" aria-label="Volume Header Diagnostics">
          <h3 className="diagnostics-title">Diagnostics & Integrity Checks</h3>
          <ul className="diagnostics-list">
            {inspection.diagnostics.map((diag, idx) => (
              <li
                key={idx}
                className={`diagnostic-item diagnostic-${diag.severity}`}
              >
                <span className="diagnostic-badge">{diag.severity.toUpperCase()}</span>
                <span className="diagnostic-text">{diag.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {inspection && inspection.header && (
        <div className="inspection-results" aria-label="Inspection Results">
          <div className="results-top-bar">
            <h2 className="results-title">Volume Header Details</h2>
            <button
              type="button"
              className="btn copy-json-btn"
              onClick={handleCopyJson}
            >
              {copied ? '✓ Copied JSON' : 'Copy JSON'}
            </button>
          </div>

          <div className="summary-cards">
            <div className="card">
              <span className="card-label">Format</span>
              <span className="card-value format-badge">
                {inspection.header.signatureType} ({inspection.header.signatureString})
              </span>
              <span className="card-sub">{inspection.header.signatureHex}</span>
            </div>

            <div className="card">
              <span className="card-label">Volume Size</span>
              <span className="card-value">{inspection.derived.volumeSizeFormatted}</span>
              <div className="space-bar-wrap" title={`Used: ${inspection.derived.usedPercent}`}>
                <div
                  className="space-bar-fill"
                  style={{ width: inspection.derived.usedPercent }}
                />
              </div>
              <span className="card-sub">
                {inspection.derived.usedSpaceFormatted} used ({inspection.derived.usedPercent})
              </span>
            </div>

            <div className="card">
              <span className="card-label">Block Size</span>
              <span className="card-value">
                {inspection.header.blockSize.toLocaleString()} B
              </span>
              <span className="card-sub">
                {inspection.header.freeBlocks.toLocaleString()} /{' '}
                {inspection.header.totalBlocks.toLocaleString()} free
              </span>
            </div>

            <div className="card">
              <span className="card-label">Items Count</span>
              <span className="card-value">
                {inspection.header.fileCount.toLocaleString()} files
              </span>
              <span className="card-sub">
                {inspection.header.folderCount.toLocaleString()} folders
              </span>
            </div>
          </div>

          <div className="details-section">
            <h3 className="section-title">Core Volume Fields</h3>
            <div className="details-table-wrap">
              <table className="details-table">
                <tbody>
                  <tr>
                    <th>Version</th>
                    <td>{inspection.header.version}</td>
                    <th>Last Mounted Version</th>
                    <td>
                      {inspection.header.lastMountedVersionFormatted} (
                      0x{inspection.header.lastMountedVersion.toString(16).toUpperCase()})
                    </td>
                  </tr>
                  <tr>
                    <th>Journal Info Block</th>
                    <td>{inspection.header.journalInfoBlock}</td>
                    <th>Write Count</th>
                    <td>{inspection.header.writeCount.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>Next Allocation</th>
                    <td>{inspection.header.nextAllocation.toLocaleString()}</td>
                    <th>Next Catalog ID</th>
                    <td>{inspection.header.nextCatalogID.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th>Attributes Raw</th>
                    <td>{inspection.header.attributesHex}</td>
                    <th>Encodings Bitmap</th>
                    <td>{inspection.header.encodingsBitmap}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="details-section">
            <h3 className="section-title">Volume Timestamps (HFS Epoch 1904)</h3>
            <div className="details-table-wrap">
              <table className="details-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Formatted Date</th>
                    <th>Raw Seconds</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Created</td>
                    <td>{inspection.header.createDateFormatted}</td>
                    <td>{inspection.header.createDate}</td>
                  </tr>
                  <tr>
                    <td>Modified</td>
                    <td>{inspection.header.modifyDateFormatted}</td>
                    <td>{inspection.header.modifyDate}</td>
                  </tr>
                  <tr>
                    <td>Checked</td>
                    <td>{inspection.header.checkedDateFormatted}</td>
                    <td>{inspection.header.checkedDate}</td>
                  </tr>
                  <tr>
                    <td>Backup</td>
                    <td>{inspection.header.backupDateFormatted}</td>
                    <td>{inspection.header.backupDate}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="details-section">
            <h3 className="section-title">Attribute Flags</h3>
            <div className="flags-grid">
              {Object.entries(inspection.header.attributeFlags).map(([flagKey, isActive]) => (
                <div
                  key={flagKey}
                  className={`flag-badge ${isActive ? 'flag-active' : 'flag-inactive'}`}
                >
                  <span className="flag-status" aria-hidden="true">
                    {isActive ? '●' : '○'}
                  </span>
                  <span className="flag-name">{flagKey}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="details-section">
            <h3 className="section-title">Fork Data Extents (Special Files)</h3>
            <div className="fork-tabs" role="tablist" aria-label="Special Files Forks">
              {forks.map((fork, idx) => (
                <button
                  key={fork.name}
                  type="button"
                  role="tab"
                  aria-selected={activeForkIndex === idx}
                  className={`fork-tab ${activeForkIndex === idx ? 'active' : ''}`}
                  onClick={() => setActiveForkIndex(idx)}
                >
                  {fork.name}
                </button>
              ))}
            </div>

            {activeFork && (
              <div className="fork-content" role="tabpanel">
                <div className="fork-metrics">
                  <div>
                    <span className="metric-label">Logical Size:</span>{' '}
                    <strong>{activeFork.logicalSizeFormatted}</strong> (
                    {activeFork.logicalSize.toString()} bytes)
                  </div>
                  <div>
                    <span className="metric-label">Clump Size:</span>{' '}
                    <strong>{activeFork.clumpSize.toLocaleString()} bytes</strong>
                  </div>
                  <div>
                    <span className="metric-label">Total Blocks:</span>{' '}
                    <strong>{activeFork.totalBlocks.toLocaleString()}</strong>
                  </div>
                </div>

                <div className="extents-table-wrap">
                  <table className="extents-table">
                    <thead>
                      <tr>
                        <th>Extent #</th>
                        <th>Start Block</th>
                        <th>Block Count</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeFork.extents.map((ext) => (
                        <tr
                          key={ext.index}
                          className={ext.blockCount > 0 ? 'extent-used' : 'extent-empty'}
                        >
                          <td>{ext.index + 1}</td>
                          <td>{ext.startBlock.toLocaleString()}</td>
                          <td>{ext.blockCount.toLocaleString()}</td>
                          <td>{ext.blockCount > 0 ? 'Allocated' : 'Unused'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
