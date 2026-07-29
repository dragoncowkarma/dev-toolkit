import React, { useEffect, useRef, useState } from 'react';
import {
  decodeFromBase64,
  encodeToBase64,
  fileToBase64,
  formatFileSize,
} from './base64.utils.js';
import './base64.css';

const MODES = {
  ENCODE: 'encode',
  DECODE: 'decode',
};

export default function Base64Tool() {
  const [mode, setMode] = useState(MODES.ENCODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  // Real-time conversion whenever the input or mode changes.
  useEffect(() => {
    if (file) return;
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      const result =
        mode === MODES.ENCODE ? encodeToBase64(input) : decodeFromBase64(input);
      setOutput(result);
      setError('');
    } catch (err) {
      setOutput('');
      setError(err.message);
    }
  }, [input, mode, file]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setFile(null);
    setError('');
  }

  function handleInputChange(event) {
    setFile(null);
    setInput(event.target.value);
  }

  function handleSwap() {
    if (error) return;
    setFile(null);
    setInput(output);
    setMode(mode === MODES.ENCODE ? MODES.DECODE : MODES.ENCODE);
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setError('');
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setError('Failed to copy to clipboard.');
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      const base64 = await fileToBase64(selected);
      setMode(MODES.ENCODE);
      setFile(selected);
      setInput(`📁 ${selected.name} (${formatFileSize(selected.size)})`);
      setOutput(base64);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="base64-tool">
      <div className="base64-toolbar">
        <div className="mode-toggle" role="tablist" aria-label="Conversion mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === MODES.ENCODE}
            className={`mode-btn ${mode === MODES.ENCODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.ENCODE)}
          >
            Encode
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === MODES.DECODE}
            className={`mode-btn ${mode === MODES.DECODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.DECODE)}
          >
            Decode
          </button>
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Convert a file to Base64"
            />
          </label>
          <button type="button" className="btn" onClick={handleSwap} disabled={!output || !!error}>
            ⇅ Swap
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="base64-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="base64-input">
            {mode === MODES.ENCODE ? 'Text' : 'Base64'}
          </label>
          <textarea
            id="base64-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.ENCODE
                ? 'Type or paste text to encode…'
                : 'Paste Base64 to decode…'
            }
            value={input}
            onChange={handleInputChange}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="base64-output">
              {mode === MODES.ENCODE ? 'Base64' : 'Text'}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            id="base64-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      {error && (
        <div className="base64-error" role="alert">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
