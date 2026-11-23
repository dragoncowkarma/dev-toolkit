import { useEffect, useRef, useState } from 'react';
import {
  bytesToHexString,
  createSyntheticHeader,
  fileToArrayBuffer,
  formatBytes,
  formatHex,
  MIN_HEADER_SIZE,
  parseNdsHeader,
} from './ndsRomHeaderInspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './ndsRomHeaderInspector.css';

const INPUT_MODES = {
  FILE: 'file',
  PASTE: 'paste',
};

/**
 * Renders the Nintendo DS ROM Header Inspector tool.
 *
 * @returns {React.JSX.Element} The inspector UI.
 */
export default function NdsRomHeaderInspectorTool() {
  const [inputMode, setInputMode] = useState(INPUT_MODES.FILE);
  const [pastedText, setPastedText] = useState('');
  const [fileName, setFileName] = useState('');
  const [headerData, setHeaderData] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  // Parse pasted text whenever it changes in PASTE mode.
  useEffect(() => {
    if (inputMode !== INPUT_MODES.PASTE) return;
    if (!pastedText.trim()) {
      setHeaderData(null);
      setError('');
      return;
    }
    const result = parseNdsHeader(pastedText);
    if (result.ok) {
      setHeaderData(result);
      setError('');
    } else {
      setHeaderData(null);
      setError(result.error);
    }
  }, [pastedText, inputMode]);

  async function handleFileProcess(file) {
    if (!file) return;
    const requestId = (fileRequestRef.current += 1);
    try {
      const headerBlob = typeof file.slice === 'function' ? file.slice(0, MIN_HEADER_SIZE) : file;
      const buffer = await fileToArrayBuffer(headerBlob);
      if (fileRequestRef.current !== requestId) return;

      const result = parseNdsHeader(buffer);
      if (result.ok) {
        setHeaderData(result);
        setFileName(file.name);
        setError('');
      } else {
        setHeaderData(null);
        setFileName(file.name);
        setError(result.error);
      }
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setHeaderData(null);
      setFileName(file.name);
      setError(err instanceof Error ? err.message : 'Failed to read file.');
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragActive(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setHeaderData(null);
    setFileName('');
    setPastedText('');
    setError('');
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSample() {
    fileRequestRef.current += 1;
    const sample = createSyntheticHeader();
    const result = parseNdsHeader(sample);
    if (inputMode === INPUT_MODES.PASTE) {
      setPastedText(bytesToHexString(sample));
    }
    setHeaderData(result);
    setFileName('sample_mario_kart.nds');
    setError('');
  }

  async function handleCopySummary() {
    if (!headerData) return;
    const lines = [
      `Nintendo DS ROM Header Summary`,
      `---------------------------------`,
      `Game Title:    ${headerData.gameTitle}`,
      `Game Code:     ${headerData.gameCode}`,
      `Maker Code:    ${headerData.makerCode} (${headerData.makerName})`,
      `Unit Code:     ${headerData.unitCodeName}`,
      `ROM Version:   ${headerData.romVersion}`,
      `Total ROM Size: ${headerData.totalRomSizeFormatted} (${headerData.totalRomSize} bytes)`,
      `Device Size:   ${headerData.chipSizeFormatted}`,
      ``,
      `ARM9 Binary:`,
      `  ROM Offset:  ${formatHex(headerData.arm9.romOffset, 8)}`,
      `  Entry Addr:  ${formatHex(headerData.arm9.entryAddress, 8)}`,
      `  RAM Addr:    ${formatHex(headerData.arm9.ramAddress, 8)}`,
      `  Size:        ${formatHex(headerData.arm9.size, 8)} (${formatBytes(headerData.arm9.size)})`,
      ``,
      `ARM7 Binary:`,
      `  ROM Offset:  ${formatHex(headerData.arm7.romOffset, 8)}`,
      `  Entry Addr:  ${formatHex(headerData.arm7.entryAddress, 8)}`,
      `  RAM Addr:    ${formatHex(headerData.arm7.ramAddress, 8)}`,
      `  Size:        ${formatHex(headerData.arm7.size, 8)} (${formatBytes(headerData.arm7.size)})`,
      ``,
      `Checksums:`,
      `  Logo CRC-16:   Expected ${headerData.logoCrc.expectedHex} | ` +
        `Actual ${headerData.logoCrc.actualHex} ` +
        `(${headerData.logoCrc.valid ? 'VALID' : 'MISMATCH'})`,
      `  Header CRC-16: Expected ${headerData.headerCrc.expectedHex} | ` +
        `Actual ${headerData.headerCrc.actualHex} ` +
        `(${headerData.headerCrc.valid ? 'VALID' : 'MISMATCH'})`,
    ];

    if (headerData.validationErrors?.length > 0) {
      lines.push(
        ``,
        `Validation Warnings:`,
        ...headerData.validationErrors.map((errMsg) => `  - ${errMsg}`)
      );
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy summary to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="nds-inspector" aria-label="Nintendo DS ROM Header Inspector">
      <div className="inspector-toolbar" role="toolbar" aria-label="Inspector Controls">
        <div className="input-mode-toggle" role="group" aria-label="Input mode">
          <button
            type="button"
            aria-pressed={inputMode === INPUT_MODES.FILE}
            className={`mode-btn ${inputMode === INPUT_MODES.FILE ? 'active' : ''}`}
            onClick={() => {
              fileRequestRef.current += 1;
              setInputMode(INPUT_MODES.FILE);
              setError('');
            }}
          >
            File Upload
          </button>
          <button
            type="button"
            aria-pressed={inputMode === INPUT_MODES.PASTE}
            className={`mode-btn ${inputMode === INPUT_MODES.PASTE ? 'active' : ''}`}
            onClick={() => {
              fileRequestRef.current += 1;
              setInputMode(INPUT_MODES.PASTE);
              setError('');
            }}
          >
            Paste Hex / Base64
          </button>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="btn"
            onClick={handleLoadSample}
          >
            Load Sample
          </button>
          {headerData && (
            <button
              type="button"
              className="btn"
              onClick={handleCopySummary}
            >
              {copied ? 'Copied!' : 'Copy Summary'}
            </button>
          )}
          {(headerData || fileName || pastedText || alertMessage) && (
            <button
              type="button"
              className="btn"
              onClick={handleClear}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {inputMode === INPUT_MODES.FILE ? (
        <div>
          <div
            className={`dropzone ${isDragActive ? 'drag-active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            aria-label="Upload Nintendo DS ROM File Dropzone"
          >
            <div className="dropzone-icon" aria-hidden="true">
              📂
            </div>
            <div className="dropzone-title">
              {fileName ? fileName : 'Choose a .nds ROM file or drag & drop here'}
            </div>
            <div className="dropzone-hint">
              Supports .nds cartridge files or raw header dumps (minimum 352 bytes / 0x160)
            </div>
          </div>
          <input
            id="nds-file-input"
            ref={fileInputRef}
            type="file"
            accept=".nds,.bin,.rom"
            className="file-input-hidden"
            onChange={handleFileChange}
            aria-label="Select NDS ROM file"
          />
        </div>
      ) : (
        <div className="text-input-group">
          <label htmlFor="nds-paste-input" className="text-input-label">
            Paste ROM Header Bytes (Hex or Base64)
          </label>
          <textarea
            id="nds-paste-input"
            className="text-input"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder="e.g. 4D 41 52 49 4F 20 4B 41 52 54 00 00 41 4D 4B 45 ... or Base64 string"
            rows={5}
          />
        </div>
      )}

      {alertMessage && (
        <div role="alert" className="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{alertMessage}</span>
        </div>
      )}

      {headerData && (
        <section className="summary-card" aria-label="ROM Header Summary">
          <div className="card-header">
            <h2 className="card-title">Cartridge Information</h2>
            <span
              className={`status-badge ${headerData.valid ? 'valid' : 'invalid'}`}
              aria-label={
                headerData.valid
                  ? 'Overall Header Status: Valid'
                  : 'Overall Header Status: Verification Issues Detected'
              }
            >
              {headerData.valid ? '✓ Valid Header' : '✕ Issues Detected'}
            </span>
          </div>

          <div className="grid-fields">
            <div className="field-item">
              <span className="field-label">Game Title</span>
              <span className="field-value">{headerData.gameTitle}</span>
            </div>
            <div className="field-item">
              <span className="field-label">Game Code</span>
              <span className="field-value mono">{headerData.gameCode}</span>
            </div>
            <div className="field-item">
              <span className="field-label">Maker</span>
              <span className="field-value">
                {headerData.makerName} ({headerData.makerCode})
              </span>
            </div>
            <div className="field-item">
              <span className="field-label">Target Unit</span>
              <span className="field-value">{headerData.unitCodeName}</span>
            </div>
            <div className="field-item">
              <span className="field-label">ROM Version</span>
              <span className="field-value">
                {headerData.romVersion} ({formatHex(headerData.romVersion, 2)})
              </span>
            </div>
            <div className="field-item">
              <span className="field-label">Total ROM Size (0x080)</span>
              <span className="field-value">
                {headerData.totalRomSizeFormatted} ({headerData.totalRomSize.toLocaleString()} B)
              </span>
            </div>
            {headerData.chipSizeFormatted && (
              <div className="field-item">
                <span className="field-label">Chip Capacity</span>
                <span className="field-value">{headerData.chipSizeFormatted}</span>
              </div>
            )}
          </div>

          <div className="table-container">
            <table className="data-table" aria-label="ARM Processors Memory and Binary Layout">
              <caption>ARM Processor Memory Configuration</caption>
              <thead>
                <tr>
                  <th scope="col">Processor</th>
                  <th scope="col">ROM Offset</th>
                  <th scope="col">Entry Address</th>
                  <th scope="col">RAM Address</th>
                  <th scope="col">Size</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">ARM9</th>
                  <td className="mono">{formatHex(headerData.arm9.romOffset, 8)}</td>
                  <td className="mono">{formatHex(headerData.arm9.entryAddress, 8)}</td>
                  <td className="mono">{formatHex(headerData.arm9.ramAddress, 8)}</td>
                  <td className="mono">
                    {formatHex(headerData.arm9.size, 8)} ({formatBytes(headerData.arm9.size)})
                  </td>
                  <td>
                    <span
                      className={`status-badge ${headerData.arm9.valid ? 'valid' : 'invalid'}`}
                    >
                      {headerData.arm9.valid ? 'Valid' : 'Out of range'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">ARM7</th>
                  <td className="mono">{formatHex(headerData.arm7.romOffset, 8)}</td>
                  <td className="mono">{formatHex(headerData.arm7.entryAddress, 8)}</td>
                  <td className="mono">{formatHex(headerData.arm7.ramAddress, 8)}</td>
                  <td className="mono">
                    {formatHex(headerData.arm7.size, 8)} ({formatBytes(headerData.arm7.size)})
                  </td>
                  <td>
                    <span
                      className={`status-badge ${headerData.arm7.valid ? 'valid' : 'invalid'}`}
                    >
                      {headerData.arm7.valid ? 'Valid' : 'Out of range'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="table-container">
            <table className="data-table" aria-label="Checksum Verifications">
              <caption>CRC-16 Integrity Verification</caption>
              <thead>
                <tr>
                  <th scope="col">Check Target</th>
                  <th scope="col">Byte Range</th>
                  <th scope="col">Expected (Stored)</th>
                  <th scope="col">Actual (Calculated)</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Nintendo Logo CRC</th>
                  <td>0x0C0 - 0x15B (156 B)</td>
                  <td className="mono">{headerData.logoCrc.expectedHex}</td>
                  <td className="mono">{headerData.logoCrc.actualHex}</td>
                  <td>
                    <span
                      className={`status-badge ${headerData.logoCrc.valid ? 'valid' : 'invalid'}`}
                    >
                      {headerData.logoCrc.valid ? 'Valid' : 'Mismatch'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Header CRC</th>
                  <td>0x000 - 0x15D (350 B)</td>
                  <td className="mono">{headerData.headerCrc.expectedHex}</td>
                  <td className="mono">{headerData.headerCrc.actualHex}</td>
                  <td>
                    <span
                      className={`status-badge ${headerData.headerCrc.valid ? 'valid' : 'invalid'}`}
                    >
                      {headerData.headerCrc.valid ? 'Valid' : 'Mismatch'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {headerData.validationErrors?.length > 0 && (
            <div className="warnings-box" role="status" aria-label="Validation warnings">
              <strong>Header Validation Warnings:</strong>
              <ul>
                {headerData.validationErrors.map((errMsg, idx) => (
                  <li key={idx}>{errMsg}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </section>
  );
}
