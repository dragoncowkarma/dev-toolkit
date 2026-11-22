import { useEffect, useRef, useState } from 'react';
import {
  base64ToBytes,
  fileToBytes,
  formatBytes,
  hexToBytes,
  parseWoff2Header,
  SAMPLE_WOFF2_BASE64,
  SAMPLE_WOFF2_HEX,
} from './woff2-header-inspector.utils.js';
import './woff2-header-inspector.css';

const MODES = {
  HEX: 'hex',
  BASE64: 'base64',
  FILE: 'file',
};

/**
 * Renders the WOFF2 Font Header Inspector tool.
 *
 * @returns {React.JSX.Element} The WOFF2 Header Inspector UI.
 */
export default function Woff2HeaderInspectorTool() {
  const [mode, setMode] = useState(MODES.HEX);
  const [hexInput, setHexInput] = useState(SAMPLE_WOFF2_HEX);
  const [base64Input, setBase64Input] = useState('');
  const [file, setFile] = useState(null);
  const [fileBytes, setFileBytes] = useState(null);
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  // Trigger parsing whenever input changes according to active mode
  useEffect(() => {
    let bytes = null;
    let errMessage = '';

    try {
      if (mode === MODES.HEX) {
        if (!hexInput.trim()) {
          setHeader(null);
          setError('');
          return;
        }
        bytes = hexToBytes(hexInput);
      } else if (mode === MODES.BASE64) {
        if (!base64Input.trim()) {
          setHeader(null);
          setError('');
          return;
        }
        bytes = base64ToBytes(base64Input);
      } else if (mode === MODES.FILE) {
        if (!fileBytes) {
          setHeader(null);
          setError('');
          return;
        }
        bytes = fileBytes;
      }

      if (bytes) {
        const parsed = parseWoff2Header(bytes);
        setHeader(parsed);
        setError('');
      }
    } catch (err) {
      setHeader(null);
      errMessage = err.message || 'Failed to parse WOFF2 header.';
      setError(errMessage);
    }
  }, [mode, hexInput, base64Input, fileBytes]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setError('');
  }

  function handleLoadSample() {
    if (mode === MODES.HEX) {
      setHexInput(SAMPLE_WOFF2_HEX);
    } else if (mode === MODES.BASE64) {
      setBase64Input(SAMPLE_WOFF2_BASE64);
    } else {
      // In File mode, switch to Hex and load sample
      setMode(MODES.HEX);
      setHexInput(SAMPLE_WOFF2_HEX);
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setHexInput('');
    setBase64Input('');
    setFile(null);
    setFileBytes(null);
    setHeader(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);
    setFile(selected);
    setError('');

    try {
      const bytes = await fileToBytes(selected);
      if (fileRequestRef.current !== requestId) return;
      setFileBytes(bytes);
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setFileBytes(null);
      setError(err.message || 'Failed to read the selected file.');
    }
  }

  return (
    <section className="woff2-tool" aria-label="WOFF2 Font Header Inspector">
      <div className="woff2-toolbar">
        <div className="mode-toggle" role="group" aria-label="Input mode">
          <button
            type="button"
            aria-pressed={mode === MODES.HEX}
            className={`mode-btn ${mode === MODES.HEX ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.HEX)}
          >
            Hex
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.BASE64}
            className={`mode-btn ${mode === MODES.BASE64 ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.BASE64)}
          >
            Base64
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.FILE}
            className={`mode-btn ${mode === MODES.FILE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.FILE)}
          >
            File Upload
          </button>
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {mode === MODES.HEX && (
        <div className="panel">
          <label className="panel-label" htmlFor="woff2-hex-input">
            Hex Bytes (minimum 48 bytes)
          </label>
          <textarea
            id="woff2-hex-input"
            className="panel-textarea"
            placeholder="Paste WOFF2 hex bytes (e.g. 77 4F 46 32 00 01 00 00 ...)"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {mode === MODES.BASE64 && (
        <div className="panel">
          <label className="panel-label" htmlFor="woff2-base64-input">
            Base64 Encoded WOFF2
          </label>
          <textarea
            id="woff2-base64-input"
            className="panel-textarea"
            placeholder="Paste Base64-encoded WOFF2 font string..."
            value={base64Input}
            onChange={(e) => setBase64Input(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {mode === MODES.FILE && (
        <div className="panel">
          <label className="panel-label" htmlFor="woff2-file-input">
            WOFF2 Font File
          </label>
          <div className="file-dropzone">
            <label className="btn file-btn">
              Select WOFF2 File
              <input
                id="woff2-file-input"
                ref={fileInputRef}
                type="file"
                className="file-input"
                accept=".woff2,font/woff2,application/font-woff2"
                onChange={handleFileChange}
                aria-label="Upload WOFF2 font file"
              />
            </label>
            {file && (
              <div className="file-info">
                📁 {file.name} ({formatBytes(file.size)})
              </div>
            )}
            {!file && (
              <div className="file-info">
                Upload a .woff2 file to inspect its 48-byte header metadata.
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="woff2-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {header && (
        <div className="woff2-result" aria-live="polite">
          {header.warnings && header.warnings.length > 0 && (
            <div className="woff2-warnings" role="region" aria-label="Header warnings">
              {header.warnings.map((w, idx) => (
                <div key={idx} className="woff2-warning">
                  ⚠️ {w}
                </div>
              ))}
            </div>
          )}

          <div className="woff2-summary-grid">
            <div className="woff2-card">
              <span className="woff2-card-label">Magic Signature</span>
              <span className="woff2-card-value">{header.signature.tag}</span>
              <span className="woff2-card-sub">{header.signature.hex}</span>
            </div>
            <div className="woff2-card">
              <span className="woff2-card-label">Flavor</span>
              <span className="woff2-card-value">{header.flavor.tag}</span>
              <span className="woff2-card-sub">{header.flavor.description}</span>
            </div>
            <div className="woff2-card">
              <span className="woff2-card-label">Version</span>
              <span className="woff2-card-value">v{header.version.formatted}</span>
              <span className="woff2-card-sub">Major.Minor</span>
            </div>
            <div className="woff2-card">
              <span className="woff2-card-label">Tables</span>
              <span className="woff2-card-value">{header.numTables}</span>
              <span className="woff2-card-sub">Directory entries</span>
            </div>
            <div className="woff2-card">
              <span className="woff2-card-label">Total File Size</span>
              <span className="woff2-card-value">{formatBytes(header.length)}</span>
              <span className="woff2-card-sub">{header.length} bytes</span>
            </div>
            <div className="woff2-card">
              <span className="woff2-card-label">Uncompressed SFNT</span>
              <span className="woff2-card-value">{formatBytes(header.totalSfntSize)}</span>
              <span className="woff2-card-sub">{header.totalSfntSize} bytes</span>
            </div>
            <div className="woff2-card">
              <span className="woff2-card-label">Compressed Block</span>
              <span className="woff2-card-value">{formatBytes(header.totalCompressedSize)}</span>
              <span className="woff2-card-sub">{header.totalCompressedSize} bytes</span>
            </div>
            {header.compression.savingsPercent != null && (
              <div className="woff2-card">
                <span className="woff2-card-label">Space Savings</span>
                <span className="woff2-card-value">{header.compression.savingsPercent}%</span>
                <span className="woff2-card-sub">
                  {header.compression.ratio ? `${header.compression.ratio}x ratio` : ''}
                </span>
              </div>
            )}
          </div>

          <div className="woff2-section">
            <h3 className="woff2-section-title">Header Fields (48 Bytes)</h3>
            <div className="woff2-table-wrapper">
              <table className="woff2-table" aria-label="WOFF2 Header Fields Table">
                <thead>
                  <tr>
                    <th scope="col">Offset</th>
                    <th scope="col">Size</th>
                    <th scope="col">Field</th>
                    <th scope="col">Raw Hex</th>
                    <th scope="col">Interpreted Value</th>
                    <th scope="col">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {header.fields.map((f) => (
                    <tr key={f.name}>
                      <td>
                        <code>
                          +{f.offset} (0x{f.offset.toString(16).padStart(2, '0')})
                        </code>
                      </td>
                      <td>{f.size} B</td>
                      <td>
                        <strong>{f.name}</strong>
                      </td>
                      <td>
                        <code>{f.rawHex}</code>
                      </td>
                      <td>
                        {f.name === 'reserved' && (
                          <span
                            className={`badge ${f.valid ? 'badge-success' : 'badge-warning'}`}
                          >
                            {f.interpreted} {f.valid ? '✓ valid' : '⚠ invalid'}
                          </span>
                        )}
                        {f.name !== 'reserved' && f.interpreted}
                      </td>
                      <td>{f.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="woff2-section">
            <h3 className="woff2-section-title">Optional Data Blocks</h3>
            <div className="woff2-blocks-grid">
              <div className="woff2-block-card">
                <span className="woff2-card-label">Extended Metadata Block</span>
                <div className="woff2-block-row">
                  <span>Status:</span>
                  <strong>{header.metadata.present ? 'Present' : 'Not present'}</strong>
                </div>
                <div className="woff2-block-row">
                  <span>Offset:</span>
                  <span>{header.metadata.offset}</span>
                </div>
                <div className="woff2-block-row">
                  <span>Compressed Length:</span>
                  <span>{formatBytes(header.metadata.length)}</span>
                </div>
                <div className="woff2-block-row">
                  <span>Uncompressed Length:</span>
                  <span>{formatBytes(header.metadata.origLength)}</span>
                </div>
              </div>

              <div className="woff2-block-card">
                <span className="woff2-card-label">Private Data Block</span>
                <div className="woff2-block-row">
                  <span>Status:</span>
                  <strong>{header.privateData.present ? 'Present' : 'Not present'}</strong>
                </div>
                <div className="woff2-block-row">
                  <span>Offset:</span>
                  <span>{header.privateData.offset}</span>
                </div>
                <div className="woff2-block-row">
                  <span>Length:</span>
                  <span>{formatBytes(header.privateData.length)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
