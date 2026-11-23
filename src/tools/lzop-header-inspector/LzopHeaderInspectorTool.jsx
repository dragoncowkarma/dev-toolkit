import { useRef, useState } from 'react';
import {
  formatFileSize,
  hexToBytes,
  parseLzopHeader,
  readHeaderSlice,
  SAMPLE_LZOP_BYTES,
  SAMPLE_LZOP_HEX,
} from './lzop-header-inspector.utils.js';
import './lzop-header-inspector.css';

const INPUT_MODES = {
  FILE: 'file',
  HEX: 'hex',
};

/**
 * Renders the LZOP Header Inspector tool for parsing and validating lzop container headers.
 *
 * @returns {React.JSX.Element} The LZOP Header Inspector UI.
 */
export default function LzopHeaderInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.FILE);
  const [fileInfo, setFileInfo] = useState(null);
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [hexInput, setHexInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const readRequestIdRef = useRef(0);

  async function inspectFile(file) {
    const currentRequestId = ++readRequestIdRef.current;

    if (!file) {
      setHeader(null);
      setError('');
      setFileInfo(null);
      return;
    }

    setFileInfo({
      name: file.name,
      size: file.size,
      sizeFormatted: formatFileSize(file.size),
    });
    setHeader(null);
    setError('');

    try {
      const sliceBytes = await readHeaderSlice(file);
      if (currentRequestId !== readRequestIdRef.current) {
        return;
      }
      const parsed = parseLzopHeader(sliceBytes);
      setHeader(parsed);
      setError('');
    } catch (err) {
      if (currentRequestId !== readRequestIdRef.current) {
        return;
      }
      setHeader(null);
      setError(err.message || 'Failed to parse LZOP header.');
    }
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      handleClear();
      return;
    }
    inspectFile(file);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragActive(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragActive(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      inspectFile(file);
    }
  }

  function handleHexChange(event) {
    readRequestIdRef.current++;
    const text = event.target.value;
    setHexInput(text);
    setFileInfo(null);

    const clean = text.trim();
    if (!clean) {
      setHeader(null);
      setError('');
      return;
    }

    try {
      const bytes = hexToBytes(clean);
      const parsed = parseLzopHeader(bytes);
      setHeader(parsed);
      setError('');
    } catch (err) {
      setHeader(null);
      setError(err.message || 'Failed to parse hex bytes.');
    }
  }

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    readRequestIdRef.current++;
    setMode(nextMode);
    setHeader(null);
    setError('');
    setFileInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (nextMode === INPUT_MODES.HEX && hexInput) {
      try {
        const bytes = hexToBytes(hexInput.trim());
        setHeader(parseLzopHeader(bytes));
      } catch (err) {
        setHeader(null);
        setError(err.message);
      }
    }
  }

  function handleLoadSample() {
    readRequestIdRef.current++;
    setFileInfo({
      name: 'sample.lzo',
      size: SAMPLE_LZOP_BYTES.length,
      sizeFormatted: formatFileSize(SAMPLE_LZOP_BYTES.length),
    });
    if (mode === INPUT_MODES.HEX) {
      setHexInput(SAMPLE_LZOP_HEX);
    }
    try {
      const parsed = parseLzopHeader(SAMPLE_LZOP_BYTES);
      setHeader(parsed);
      setError('');
    } catch (err) {
      setHeader(null);
      setError(err.message);
    }
  }

  function handleClear() {
    readRequestIdRef.current++;
    setHeader(null);
    setError('');
    setFileInfo(null);
    setHexInput('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="lzop-tool">
      <div className="lzop-toolbar">
        <div className="mode-toggle" role="tablist" aria-label="Input mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === INPUT_MODES.FILE}
            className={`mode-btn ${mode === INPUT_MODES.FILE ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.FILE)}
          >
            File Upload
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === INPUT_MODES.HEX}
            className={`mode-btn ${mode === INPUT_MODES.HEX ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.HEX)}
          >
            Hex Input
          </button>
        </div>

        <div className="toolbar-actions">
          {mode === INPUT_MODES.FILE && (
            <label className="btn file-btn">
              <span>Select File</span>
              <input
                type="file"
                ref={fileInputRef}
                className="file-input sr-only"
                aria-label="Upload LZOP file"
                onChange={handleFileChange}
              />
            </label>
          )}
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!fileInfo && !header && !error && !hexInput}
          >
            Clear
          </button>
        </div>
      </div>

      {mode === INPUT_MODES.FILE && (
        <div
          className={`dropzone ${dragActive ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="region"
          aria-label="File dropzone"
        >
          <div className="dropzone-icon" aria-hidden="true">
            🗜️
          </div>
          <p className="dropzone-title">Drop an LZOP (.lzo) file here or click to browse</p>
          <p className="dropzone-hint">
            Only the container header slice is read. Large multi-GB files inspect instantly.
          </p>
        </div>
      )}

      {mode === INPUT_MODES.HEX && (
        <div className="hex-editor-container">
          <label htmlFor="lzop-hex-input" className="hex-label">
            Hex Encoded LZOP Header Bytes
          </label>
          <textarea
            id="lzop-hex-input"
            className="hex-textarea"
            placeholder="e.g. 89 4C 5A 4F 00 0D 0A 1A 0A 10 30 20 80 09 40 01 03 03 00 00 00 00..."
            value={hexInput}
            onChange={handleHexChange}
            aria-label="Hex Encoded LZOP Header Bytes"
          />
        </div>
      )}

      {fileInfo && (
        <div className="file-meta-card">
          <div className="meta-item">
            <span className="meta-label">Selected File:</span>
            <span className="meta-value">{fileInfo.name}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Actual File Size:</span>
            <span className="meta-value">
              {fileInfo.sizeFormatted} ({fileInfo.size.toLocaleString()} bytes)
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="alert-error" role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {header && (
        <div className="results-container">
          <div className="status-badges">
            <span className="badge badge-success">✓ Valid Signature</span>
            <span className="badge badge-primary">v{header.version.formatted}</span>
            <span className="badge badge-primary">{header.method.name}</span>
            <span className="badge badge-primary">{header.level.formatted}</span>
            <span className="badge badge-success">
              {header.checksum.type}: {header.checksum.hex} (Valid)
            </span>
          </div>

          <div className="inspector-grid">
            <section className="section-card" aria-labelledby="heading-container-id">
              <h3 id="heading-container-id">Container Identification</h3>
              <dl className="dl-grid">
                <dt>Magic Bytes</dt>
                <dd>{header.magic.bytes}</dd>
                <dt>LZOP Version</dt>
                <dd>{header.version.formatted}</dd>
                <dt>LZO Library</dt>
                <dd>{header.libVersion.formatted}</dd>
                <dt>Extract Version</dt>
                <dd>{header.versionNeededToExtract.formatted}</dd>
                <dt>Header Size</dt>
                <dd>{header.headerSize} bytes</dd>
              </dl>
            </section>

            <section className="section-card" aria-labelledby="heading-compression">
              <h3 id="heading-compression">Compression Details</h3>
              <dl className="dl-grid">
                <dt>Method</dt>
                <dd>
                  {header.method.name} ({header.method.raw})
                </dd>
                <dt>Level</dt>
                <dd>{header.level.formatted}</dd>
                <dt>Header Filter</dt>
                <dd>{header.filter ? header.filter.hex : 'None'}</dd>
                <dt>Header Checksum</dt>
                <dd>
                  {header.checksum.type} ({header.checksum.hex})
                </dd>
              </dl>
            </section>

            <section className="section-card" aria-labelledby="heading-metadata">
              <h3 id="heading-metadata">Original File Metadata</h3>
              <dl className="dl-grid">
                <dt>Filename</dt>
                <dd>{header.fileName.name || 'None (Unnamed)'}</dd>
                <dt>File Mode</dt>
                <dd>{header.mode.permissions}</dd>
                <dt>Raw Mode</dt>
                <dd>{header.mode.octal}</dd>
                <dt>Modification Time</dt>
                <dd>{header.mtime.formatted}</dd>
                <dt>Mtime Low / High</dt>
                <dd>
                  {header.mtime.low} / {header.mtime.high}
                </dd>
              </dl>
            </section>

            <section className="section-card" aria-labelledby="heading-flags">
              <h3 id="heading-flags">Flags & Environment</h3>
              <dl className="dl-grid">
                <dt>Raw Flags</dt>
                <dd>{header.flags.hex}</dd>
                <dt>Origin OS</dt>
                <dd>{header.flags.osName}</dd>
                <dt>Character Set</dt>
                <dd>{header.flags.charsetName}</dd>
              </dl>
              <div className="flags-tags" aria-label="Active Flags">
                {header.flags.activeFlagsList.map((flag) => (
                  <span key={flag} className="flag-tag">
                    {flag}
                  </span>
                ))}
              </div>
            </section>

            {header.extraField && (
              <section className="section-card" aria-labelledby="heading-extra-field">
                <h3 id="heading-extra-field">Extra Field</h3>
                <dl className="dl-grid">
                  <dt>Length</dt>
                  <dd>{header.extraField.length} bytes</dd>
                  <dt>Checksum</dt>
                  <dd>{header.extraField.checksum}</dd>
                  <dt>Data Hex</dt>
                  <dd>
                    {header.extraField.isTruncated ? (
                      <span className="hex-preview">
                        <span className="hex-preview-data">{header.extraField.dataHex}</span>
                        <span className="hex-preview-note">
                          {' '}
                          … (preview limited to first {header.extraField.previewLength} of{' '}
                          {header.extraField.length.toLocaleString()} bytes)
                        </span>
                      </span>
                    ) : (
                      header.extraField.dataHex || 'None'
                    )}
                  </dd>
                </dl>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
