import { useEffect, useRef, useState } from 'react';
import {
  ALGORITHMS,
  FORMATS,
  formatFileSize,
  formatHash,
  hashFile,
  hashText,
} from './hash.utils.js';
import './hash.css';

const EMPTY_HASHES = ALGORITHMS.reduce((acc, algorithm) => {
  acc[algorithm] = '';
  return acc;
}, {});

/**
 * Renders the Hash Generator tool: real-time MD5/SHA-1/SHA-256/SHA-512
 * digests for typed text or a dropped/selected file.
 *
 * @param {object} props
 * @param {() => void} [props.onBack] - Returns to the tool dashboard.
 * @returns {React.JSX.Element} The Hash tool UI.
 */
export default function HashTool({ onBack }) {
  const [input, setInput] = useState('');
  const [file, setFile] = useState(null);
  const [format, setFormat] = useState(FORMATS.LOWER);
  const [hashes, setHashes] = useState(EMPTY_HASHES);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [computing, setComputing] = useState(false);
  const [copiedAlgorithm, setCopiedAlgorithm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  // Real-time hash generation whenever the text input or selected file changes.
  useEffect(() => {
    const requestId = (requestRef.current += 1);

    if (!file && input === '') {
      setHashes(EMPTY_HASHES);
      setError('');
      setComputing(false);
      return;
    }

    // Clear any previous digest immediately so a stale hash from the prior
    // input/file is never visible or copyable while this request is pending.
    setHashes(EMPTY_HASHES);
    setComputing(true);
    const digestOf = (algorithm) =>
      file ? hashFile(algorithm, file) : hashText(algorithm, input);

    Promise.all(ALGORITHMS.map(digestOf))
      .then((results) => {
        // Discard this result if a newer request started while it was in flight.
        if (requestRef.current !== requestId) return;
        const next = {};
        ALGORITHMS.forEach((algorithm, index) => {
          next[algorithm] = results[index];
        });
        setHashes(next);
        setError('');
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return;
        setHashes(EMPTY_HASHES);
        setError(err.message);
      })
      .finally(() => {
        if (requestRef.current === requestId) setComputing(false);
      });
  }, [input, file]);

  useEffect(() => {
    if (!copiedAlgorithm) return;
    const timer = setTimeout(() => setCopiedAlgorithm(''), 1500);
    return () => clearTimeout(timer);
  }, [copiedAlgorithm]);

  function handleInputChange(event) {
    setFile(null);
    setInput(event.target.value);
  }

  function selectFile(selected) {
    if (!selected) return;
    setInput('');
    setError('');
    setFile(selected);
  }

  function handleFileInputChange(event) {
    selectFile(event.target.files?.[0]);
    event.target.value = '';
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleRemoveFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleClear() {
    requestRef.current += 1;
    setInput('');
    setFile(null);
    setHashes(EMPTY_HASHES);
    setError('');
    setCopyError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCopy(algorithm) {
    const value = hashes[algorithm];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(formatHash(value, format));
      setCopiedAlgorithm(algorithm);
      setCopyError('');
    } catch {
      // Clipboard failures are reported separately from hashing errors so a
      // denied copy on one row never disables the others.
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="hash-tool" aria-label="Hash Generator Tool">
      {onBack && (
        <div className="hash-header-row">
          <button className="back-btn" onClick={onBack} aria-label="Go back to tool dashboard">
            <span aria-hidden="true">←</span> Back
          </button>
        </div>
      )}

      <div className="hash-toolbar">
        <div className="format-toggle" role="group" aria-label="Output format">
          <button
            type="button"
            aria-pressed={format === FORMATS.LOWER}
            className={`format-btn ${format === FORMATS.LOWER ? 'active' : ''}`}
            onClick={() => setFormat(FORMATS.LOWER)}
          >
            lowercase
          </button>
          <button
            type="button"
            aria-pressed={format === FORMATS.UPPER}
            className={`format-btn ${format === FORMATS.UPPER ? 'active' : ''}`}
            onClick={() => setFormat(FORMATS.UPPER)}
          >
            UPPERCASE
          </button>
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileInputChange}
              aria-label="Compute a hash for a file"
            />
          </label>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {file ? (
        <div
          className="hash-dropzone hash-dropzone--file"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="hash-file-info">
            <span className="hash-file-name">📁 {file.name}</span>
            <span className="hash-file-size">{formatFileSize(file.size)}</span>
          </div>
          <button type="button" className="btn" onClick={handleRemoveFile}>
            Remove file
          </button>
        </div>
      ) : (
        <div
          className={`hash-dropzone ${isDragging ? 'hash-dropzone--dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label className="panel-label" htmlFor="hash-input">
            Text
          </label>
          <textarea
            id="hash-input"
            className="panel-textarea"
            placeholder="Type or paste text, or drop a file here to hash…"
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>
      )}

      <div className="hash-results">
        {ALGORITHMS.map((algorithm) => (
          <div className="hash-result-row" key={algorithm}>
            <div className="hash-result-label-row">
              <span className="hash-result-label">{algorithm}</span>
              <button
                type="button"
                className="btn copy-btn"
                onClick={() => handleCopy(algorithm)}
                disabled={!hashes[algorithm]}
                aria-label={
                  copiedAlgorithm === algorithm
                    ? `${algorithm} hash copied`
                    : `Copy ${algorithm} hash`
                }
              >
                {copiedAlgorithm === algorithm ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <output className="hash-result-value" aria-label={`${algorithm} hash`}>
              {hashes[algorithm]
                ? formatHash(hashes[algorithm], format)
                : computing
                  ? 'Computing…'
                  : '—'}
            </output>
          </div>
        ))}
      </div>

      {alertMessage && (
        <div className="hash-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}
    </section>
  );
}
