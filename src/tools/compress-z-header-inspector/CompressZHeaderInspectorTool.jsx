import { useEffect, useRef, useState } from 'react';
import {
  formatFileSize,
  inspectCompressZHeader,
  parseBase64String,
  parseHexString,
  readFileHeaderBytes,
} from './compress-z-header-inspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './compress-z-header-inspector.css';

const MODES = {
  HEX: 'hex',
  BASE64: 'base64',
};

const SAMPLE_HEX = '1F 9D 90';
const SAMPLE_BASE64 = 'H52Q';

/**
 * Renders the Unix compress (.Z) Header Inspector tool.
 *
 * @returns {React.JSX.Element} The header inspector UI.
 */
export default function CompressZHeaderInspectorTool() {
  const [mode, setMode] = useState(MODES.HEX);
  const [input, setInput] = useState('');
  const [inspected, setInspected] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  useEffect(() => {
    if (file) return;
    if (input.trim() === '') {
      setInspected(null);
      return;
    }

    try {
      const bytes =
        mode === MODES.HEX ? parseHexString(input) : parseBase64String(input);
      const result = inspectCompressZHeader(bytes);
      setInspected(result);
      setError('');
    } catch (err) {
      setInspected(null);
      setError(err.message);
    }
  }, [input, mode, file]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    fileRequestRef.current += 1;
    setMode(nextMode);
    setFile(null);
    setInput('');
    setInspected(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleInputChange(event) {
    fileRequestRef.current += 1;
    setFile(null);
    const value = event.target.value;
    setInput(value);
    if (value.trim() === '') {
      setError('');
      setInspected(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setInput('');
    setInspected(null);
    setError('');
    setCopyError('');
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSample() {
    fileRequestRef.current += 1;
    setFile(null);
    setError('');
    setInput(mode === MODES.HEX ? SAMPLE_HEX : SAMPLE_BASE64);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopy() {
    if (!inspected) return;
    try {
      const json = JSON.stringify(inspected, null, 2);
      await navigator.clipboard.writeText(json);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (!selected) return;

    const requestId = (fileRequestRef.current += 1);
    setFile(null);
    setInput('');
    setInspected(null);
    setError('');

    try {
      const bytes = await readFileHeaderBytes(selected);
      if (fileRequestRef.current !== requestId) return;
      const result = inspectCompressZHeader(bytes, { totalBytes: selected.size });
      setFile(selected);
      setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
      setInspected(result);
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setFile(null);
      setInput('');
      setInspected(null);
      setError(err.message);
    }
  }

  const alertMessage = error || copyError;

  return (
    <section
      className="compress-z-tool"
      aria-label="Unix compress (.Z) Header Inspector Tool"
    >
      <div className="compress-z-toolbar">
        <div className="mode-toggle" role="group" aria-label="Input format">
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
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload .Z file"
            />
          </label>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="compress-z-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="compress-z-input">
            {file ? 'Selected File' : mode === MODES.HEX ? 'Hex Input' : 'Base64 Input'}
          </label>
          <textarea
            id="compress-z-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.HEX
                ? 'Enter hex bytes (e.g. 1F 9D 90)…'
                : 'Enter Base64 data (e.g. H52Q)…'
            }
            value={input}
            onChange={handleInputChange}
            readOnly={!!file}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <span className="panel-label">Header Details</span>
            <button
              type="button"
              className="btn"
              onClick={handleCopy}
              disabled={!inspected}
            >
              {copied ? '✓ Copied' : 'Copy JSON'}
            </button>
            {copied && (
              <div className="sr-only" role="status" aria-live="polite">
                Copied to clipboard
              </div>
            )}
          </div>

          <div className="inspector-card" aria-label="Inspection Results">
            {inspected ? (
              <table className="inspector-table">
                <tbody>
                  <tr>
                    <th scope="row">Magic Bytes</th>
                    <td>
                      {inspected.magic}{' '}
                      <span className="badge badge-success">Valid</span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Max Code Bits</th>
                    <td>{inspected.maxBits} bits</td>
                  </tr>
                  <tr>
                    <th scope="row">Max Dictionary Codes</th>
                    <td>{inspected.maxCodes.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <th scope="row">Block Mode</th>
                    <td>
                      <span
                        className={`badge ${
                          inspected.blockMode ? 'badge-success' : 'badge-info'
                        }`}
                      >
                        {inspected.blockMode ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Reserved Bits (5-6)</th>
                    <td>{inspected.reservedBits} (0b00)</td>
                  </tr>
                  <tr>
                    <th scope="row">Flags Byte (Byte 3)</th>
                    <td>
                      {inspected.byte3Hex} (0b{inspected.byte3Binary})
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">Total Stream Bytes</th>
                    <td>{inspected.totalBytes.toLocaleString()} B</td>
                  </tr>
                  <tr>
                    <th scope="row">Extra Payload Data</th>
                    <td>{inspected.payloadBytes.toLocaleString()} B</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="inspector-empty">
                Enter hex or base64 stream data, or upload a .Z file to inspect the header.
              </div>
            )}
          </div>
        </div>
      </div>

      {alertMessage && (
        <div className="compress-z-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
