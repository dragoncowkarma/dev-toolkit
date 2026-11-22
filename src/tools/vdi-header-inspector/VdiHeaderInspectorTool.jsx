import { useEffect, useRef, useState } from 'react';
import {
  createSampleVdiHeader,
  formatHexDump,
  parseHexBytes,
  parseVdiHeader,
} from './vdi.utils.js';
import './vdi-header-inspector.css';

/**
 * VDI Header Inspector Tool component.
 * Parses and visualizes VirtualBox VDI disk image headers from uploaded files or pasted hex bytes.
 *
 * @returns {React.JSX.Element}
 */
export default function VdiHeaderInspectorTool() {
  const [hexInput, setHexInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedResult, setParsedResult] = useState(null);
  const [hexDump, setHexDump] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  function processBuffer(buffer, label = '') {
    const dump = formatHexDump(buffer);
    setHexDump(dump);

    const result = parseVdiHeader(buffer);
    if (result.ok) {
      setParsedResult(result.header);
      setError('');
    } else {
      setParsedResult(null);
      setError(result.error);
    }
    if (label) setFileName(label);
  }

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setHexInput('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result;
      if (buffer instanceof ArrayBuffer) {
        processBuffer(buffer, file.name);
      }
    };
    reader.onerror = () => {
      setError('Failed to read the specified file.');
      setParsedResult(null);
      setHexDump('');
    };
    reader.readAsArrayBuffer(file);
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleHexInputChange(e) {
    const val = e.target.value;
    setHexInput(val);
    setFileName('');
  }

  useEffect(() => {
    if (fileName) return; // File takes precedence
    const trimmed = hexInput.trim();
    if (!trimmed) {
      setParsedResult(null);
      setHexDump('');
      setError('');
      return;
    }

    const hexResult = parseHexBytes(trimmed);
    if (!hexResult.ok) {
      setError(hexResult.error);
      setParsedResult(null);
      setHexDump('');
      return;
    }

    processBuffer(hexResult.data);
  }, [hexInput, fileName]);

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleLoadSample(type) {
    const imageType = type === 'fixed' ? 2 : 1;
    const sampleBuffer = createSampleVdiHeader({
      imageType,
      description: `Sample VirtualBox ${type === 'fixed' ? 'Fixed' : 'Dynamic'} Disk Image`,
    });
    setHexInput('');
    processBuffer(sampleBuffer, `sample-${type}.vdi`);
  }

  function handleClear() {
    setHexInput('');
    setFileName('');
    setParsedResult(null);
    setHexDump('');
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const badgeClass = parsedResult?.imageType === 'dynamic'
    ? 'badge-dynamic'
    : parsedResult?.imageType === 'fixed'
      ? 'badge-fixed'
      : parsedResult?.imageType === 'differencing'
        ? 'badge-differencing'
        : 'badge-unknown';

  return (
    <section className="vdi-inspector-tool" aria-label="VDI Header Inspector">
      <header className="vdi-toolbar">
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Select .vdi File
            <input
              ref={fileInputRef}
              type="file"
              accept=".vdi"
              className="file-input"
              onChange={handleFileInputChange}
              aria-label="Upload VDI file"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('dynamic')}
          >
            Sample Dynamic VDI
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('fixed')}
          >
            Sample Fixed VDI
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!hexInput && !fileName && !parsedResult && !error}
          >
            Clear
          </button>
        </div>
      </header>

      <div className="vdi-panels">
        <div
          className={`vdi-dropzone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          role="region"
          aria-label="VDI file drop zone"
        >
          <p className="dropzone-text">
            {fileName
              ? `Loaded: ${fileName}`
              : 'Drag & drop a .vdi disk image file here, or select one above'}
          </p>
        </div>

        <div className="panel">
          <label className="panel-label" htmlFor="vdi-hex-input">
            Or Paste Hex Bytes
          </label>
          <textarea
            id="vdi-hex-input"
            className="panel-textarea"
            placeholder="Paste raw hex bytes here (e.g. 3C 3C 3C 20 4F 72 61 63 6C 65...)..."
            value={hexInput}
            onChange={handleHexInputChange}
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <div className="vdi-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {parsedResult && (
        <main className="vdi-results" aria-label="Decoded VDI Header">
          <section className="results-section">
            <h3 className="results-title">General Header Info</h3>
            <div className="fields-grid">
              <div className="field-card">
                <span className="field-label">Pre-Header Text</span>
                <span className="field-value">{parsedResult.preHeaderText}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Signature</span>
                <span className="field-value">{parsedResult.signature}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Version</span>
                <span className="field-value">
                  {`v${parsedResult.version} `}
                  {`(Major: ${parsedResult.versionMajor}, Minor: ${parsedResult.versionMinor})`}
                </span>
              </div>
              <div className="field-card">
                <span className="field-label">Header Size</span>
                <span className="field-value">{parsedResult.headerSize} bytes</span>
              </div>
              <div className="field-card">
                <span className="field-label">Image Type</span>
                <span className="field-value">
                  <span className={`field-badge ${badgeClass}`}>{parsedResult.imageType}</span>
                  {` (raw: ${parsedResult.imageTypeRaw})`}
                </span>
              </div>
              <div className="field-card">
                <span className="field-label">Image Flags</span>
                <span className="field-value">{parsedResult.imageFlags}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Description</span>
                <span className="field-value">{parsedResult.description || '(None)'}</span>
              </div>
            </div>
          </section>

          <section className="results-section">
            <h3 className="results-title">Storage & Offsets</h3>
            <div className="fields-grid">
              <div className="field-card">
                <span className="field-label">Disk Capacity</span>
                <span className="field-value">
                  {parsedResult.diskSizeFormatted} ({parsedResult.diskSizeBytes} bytes)
                </span>
              </div>
              <div className="field-card">
                <span className="field-label">Block Size</span>
                <span className="field-value">
                  {parsedResult.blockSizeFormatted} ({parsedResult.blockSize} bytes)
                </span>
              </div>
              <div className="field-card">
                <span className="field-label">Block Extra Data</span>
                <span className="field-value">{parsedResult.blockExtraData} bytes</span>
              </div>
              <div className="field-card">
                <span className="field-label">Blocks Count</span>
                <span className="field-value">{parsedResult.blocksCount}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Blocks Allocated</span>
                <span className="field-value">{parsedResult.blocksAllocated}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Block Map Offset</span>
                <span className="field-value">
                  {`0x${parsedResult.offsetBlocks.toString(16)} (${parsedResult.offsetBlocks})`}
                </span>
              </div>
              <div className="field-card">
                <span className="field-label">Data Offset</span>
                <span className="field-value">
                  {`0x${parsedResult.offsetData.toString(16)} (${parsedResult.offsetData})`}
                </span>
              </div>
            </div>
          </section>

          <section className="results-section">
            <h3 className="results-title">Disk Geometry</h3>
            <div className="fields-grid">
              <div className="field-card">
                <span className="field-label">Cylinders</span>
                <span className="field-value">{parsedResult.geometry.cylinders}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Heads</span>
                <span className="field-value">{parsedResult.geometry.heads}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Sectors per Track</span>
                <span className="field-value">{parsedResult.geometry.sectors}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Sector Size</span>
                <span className="field-value">{parsedResult.geometry.sectorSize} bytes</span>
              </div>
            </div>
          </section>

          <section className="results-section">
            <h3 className="results-title">UUIDs</h3>
            <div className="fields-grid">
              <div className="field-card">
                <span className="field-label">Image UUID</span>
                <span className="field-value">{parsedResult.uuidImage}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Last Snapshot UUID</span>
                <span className="field-value">{parsedResult.uuidLastSnapshot}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Link UUID</span>
                <span className="field-value">{parsedResult.uuidLink}</span>
              </div>
              <div className="field-card">
                <span className="field-label">Parent UUID</span>
                <span className="field-value">{parsedResult.uuidParent}</span>
              </div>
            </div>
          </section>

          {hexDump && (
            <section className="results-section">
              <div className="hex-dump-container">
                <h3 className="results-title">Raw Header Hex Dump</h3>
                <pre className="hex-dump" aria-label="Hex dump representation of header">
                  {hexDump}
                </pre>
              </div>
            </section>
          )}
        </main>
      )}
    </section>
  );
}
