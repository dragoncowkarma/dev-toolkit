import { useRef, useState } from 'react';
import {
  createMinimalCfbBuffer,
  formatFileSize,
  parseOleCfbHeader,
} from './oleCfb.utils.js';
import './oleCfb.css';

/**
 * OLE Compound File Binary (CFB/OLE2) Header Inspector component.
 *
 * @returns {React.JSX.Element} The rendered inspector tool UI.
 */
export default function OleCfbHeaderInspectorTool() {
  const [fileInfo, setFileInfo] = useState(null);
  const [headerData, setHeaderData] = useState(null);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  function processBuffer(buffer, fileName, fileSize) {
    try {
      const parsed = parseOleCfbHeader(buffer);
      setHeaderData(parsed);
      setFileInfo({
        name: fileName,
        size: fileSize,
      });
      setError('');
    } catch (err) {
      setHeaderData(null);
      setFileInfo({
        name: fileName,
        size: fileSize,
      });
      setError(err.message || 'Failed to parse OLE CFB header.');
    }
  }

  function handleFileSelection(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target.result;
      processBuffer(buffer, file.name, file.size);
    };
    reader.onerror = () => {
      setHeaderData(null);
      setError('Failed to read the selected file.');
    };
    reader.readAsArrayBuffer(file);
  }

  function handleInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  }

  function handleLoadSample() {
    const sampleBuffer = createMinimalCfbBuffer();
    processBuffer(sampleBuffer, 'sample-cfb-v3.doc', sampleBuffer.byteLength);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClear() {
    setHeaderData(null);
    setFileInfo(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="ole-cfb-tool">
      <div className="ole-cfb-toolbar">
        <div className="toolbar-actions">
          <label className="btn btn-primary file-btn">
            <span>Select CFB File</span>
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              aria-label="Upload OLE CFB file"
              onChange={handleInputChange}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleLoadSample}
            aria-label="Load sample CFB header"
          >
            Load Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!headerData && !error && !fileInfo}
            aria-label="Clear inspection results"
          >
            Clear
          </button>
        </div>
      </div>

      <div
        className={`dropzone ${isDragOver ? 'drag-active' : ''}`}
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
        aria-label="Drop OLE CFB file here or click to select"
      >
        <div className="dropzone-icon" aria-hidden="true">
          📦
        </div>
        <div className="dropzone-title">
          {fileInfo ? fileInfo.name : 'Choose or drop an OLE CFB file (.doc, .xls, .ppt, .msi)'}
        </div>
        <div className="dropzone-hint">
          {fileInfo
            ? `Size: ${formatFileSize(fileInfo.size)}`
            : 'Client-side inspection only. Files never leave your browser.'}
        </div>
      </div>

      {error && (
        <div role="alert" className="ole-cfb-error">
          {error}
        </div>
      )}

      {headerData && (
        <div className="results-container">
          <section className="card-section" aria-labelledby="overview-heading">
            <h3 id="overview-heading" className="section-title">
              Container Overview
            </h3>
            <div className="property-grid">
              <div className="property-row">
                <span className="property-label">Header Signature</span>
                <span className="property-value">
                  <code className="property-code">{headerData.magicHex}</code> (Valid)
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Container CLSID</span>
                <span className="property-value">
                  <code className="property-code">{headerData.clsid}</code>
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">File Size</span>
                <span className="property-value">
                  {headerData.fileSizeFormatted} ({headerData.fileSize} bytes)
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Available Data Sectors</span>
                <span className="property-value">{headerData.maxAvailableSectors}</span>
              </div>
            </div>
          </section>

          <section className="card-section" aria-labelledby="geometry-heading">
            <h3 id="geometry-heading" className="section-title">
              Version &amp; Sector Geometry
            </h3>
            <div className="property-grid">
              <div className="property-row">
                <span className="property-label">Major Version</span>
                <span className="property-value">
                  Version {headerData.majorVersion} (0x
                  {headerData.majorVersion.toString(16).toUpperCase().padStart(4, '0')})
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Minor Version</span>
                <span className="property-value">
                  0x{headerData.minorVersion.toString(16).toUpperCase().padStart(4, '0')} (
                  {headerData.minorVersion})
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Byte Order</span>
                <span className="property-value">{headerData.byteOrderFormatted}</span>
              </div>
              <div className="property-row">
                <span className="property-label">Sector Shift / Size</span>
                <span className="property-value">
                  {headerData.sectorShift} ({headerData.sectorSize} bytes)
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Mini Sector Shift / Size</span>
                <span className="property-value">
                  {headerData.miniSectorShift} ({headerData.miniSectorSize} bytes)
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Mini Stream Cutoff Size</span>
                <span className="property-value">{headerData.miniStreamCutoffSize} bytes</span>
              </div>
            </div>
          </section>

          <section className="card-section" aria-labelledby="allocation-heading">
            <h3 id="allocation-heading" className="section-title">
              Stream &amp; Allocation Table Pointers
            </h3>
            <div className="property-grid">
              <div className="property-row">
                <span className="property-label">First Directory Sector</span>
                <span className="property-value">
                  {headerData.firstDirectorySectorLocationFormatted}
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Directory Sector Count</span>
                <span className="property-value">{headerData.numDirectorySectors}</span>
              </div>
              <div className="property-row">
                <span className="property-label">FAT Sector Count</span>
                <span className="property-value">{headerData.numFatSectors}</span>
              </div>
              <div className="property-row">
                <span className="property-label">First Mini FAT Sector</span>
                <span className="property-value">
                  {headerData.firstMiniFatSectorLocationFormatted}
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">Mini FAT Sector Count</span>
                <span className="property-value">{headerData.numMiniFatSectors}</span>
              </div>
              <div className="property-row">
                <span className="property-label">First DIFAT Sector</span>
                <span className="property-value">
                  {headerData.firstDifatSectorLocationFormatted}
                </span>
              </div>
              <div className="property-row">
                <span className="property-label">DIFAT Sector Count</span>
                <span className="property-value">{headerData.numDifatSectors}</span>
              </div>
              <div className="property-row">
                <span className="property-label">Transaction Signature</span>
                <span className="property-value">{headerData.transactionSignatureNumber}</span>
              </div>
            </div>
          </section>

          <section className="card-section" aria-labelledby="difat-heading">
            <h3 id="difat-heading" className="section-title">
              Header DIFAT Array ({headerData.activeDifatEntries.length} Active / 109 Total)
            </h3>
            {headerData.activeDifatEntries.length === 0 ? (
              <p className="property-hint">
                All 109 header DIFAT entries are unallocated (FREESECT).
              </p>
            ) : (
              <div className="difat-tags" role="list" aria-label="Active DIFAT sector entries">
                {headerData.activeDifatEntries.map(({ index, sector }) => (
                  <span key={index} className="difat-tag" role="listitem">
                    [{index}]: Sector {sector}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
