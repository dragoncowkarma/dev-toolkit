import { useEffect, useRef, useState } from 'react';
import {
  decodeBencode,
  encodeBencode,
  formatBencodeValue,
  formatEncodedBencode,
  parseBencodeJson,
} from './bencode.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './bencode.css';

const MODES = { ENCODE: 'encode', DECODE: 'decode' };

/**
 * Renders a browser-local Bencode encoder and decoder with .torrent file support.
 * @returns {React.JSX.Element} The Bencode tool UI.
 */
export default function BencodeTool() {
  const [mode, setMode] = useState(MODES.DECODE);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [isFileInput, setIsFileInput] = useState(false);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  useEffect(() => {
    if (isFileInput) return;
    if (input === '') {
      setOutput('');
      setError('');
      return;
    }
    try {
      const result = mode === MODES.DECODE
        ? formatBencodeValue(decodeBencode(input))
        : formatEncodedBencode(encodeBencode(parseBencodeJson(input)));
      setOutput(result);
      setError('');
    } catch (conversionError) {
      setOutput('');
      setError(conversionError.message);
    }
  }, [input, isFileInput, mode]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    fileRequestRef.current += 1;
    setMode(nextMode);
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
    setIsFileInput(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleInputChange(event) {
    fileRequestRef.current += 1;
    setIsFileInput(false);
    setInput(event.target.value);
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setInput('');
    setOutput('');
    setError('');
    setCopyError('');
    setIsFileInput(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);
    try {
      const bytes = new Uint8Array(await selected.arrayBuffer());
      const decoded = formatBencodeValue(decodeBencode(bytes));
      if (fileRequestRef.current !== requestId) return;
      setMode(MODES.DECODE);
      setInput(`📁 ${selected.name} (${selected.size} bytes)`);
      setOutput(decoded);
      setError('');
      setIsFileInput(true);
    } catch (fileError) {
      if (fileRequestRef.current !== requestId) return;
      setOutput('');
      setError(fileError.message || 'Failed to read the selected file.');
    }
  }

  const inputLabel = mode === MODES.DECODE ? 'Bencode text or file' : 'JSON input';
  const inputPlaceholder = mode === MODES.DECODE
    ? 'Paste Bencode, such as d3:foo3:bare'
    : 'Enter JSON, such as {"announce":"https://tracker.example","info":{"name":"file.txt"}}';

  return (
    <section className="bencode-tool" aria-label="Bencode Encoder and Decoder Tool">
      <div className="bencode-toolbar">
        <div className="mode-toggle" role="group" aria-label="Bencode conversion mode">
          <button type="button" aria-pressed={mode === MODES.DECODE}
            className={`mode-btn ${mode === MODES.DECODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.DECODE)}>Decode</button>
          <button type="button" aria-pressed={mode === MODES.ENCODE}
            className={`mode-btn ${mode === MODES.ENCODE ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.ENCODE)}>Encode</button>
        </div>
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload .torrent
            <input ref={fileInputRef} type="file" className="file-input" onChange={handleFileChange}
              aria-label="Decode a Bencode or torrent file" />
          </label>
          <button type="button" className="btn" onClick={handleClear}>Clear</button>
        </div>
      </div>

      <p className="bencode-help">
        Everything runs locally. Raw non-UTF-8 bytes are shown as <code>$bytes</code> with hex and
        Base64.
      </p>

      <div className="bencode-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="bencode-input">{inputLabel}</label>
          <textarea id="bencode-input" className="panel-textarea" value={input}
            onChange={handleInputChange} placeholder={inputPlaceholder} spellCheck={false} />
        </div>
        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="bencode-output">
              {mode === MODES.DECODE ? 'Decoded tree' : 'Canonical Bencode'}
            </label>
            <button type="button" className="btn copy-btn" onClick={handleCopy} disabled={!output}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            {copied && (
              <span className="sr-only" role="status" aria-live="polite">Copied to clipboard</span>
            )}
          </div>
          <textarea id="bencode-output" className="panel-textarea" value={output} readOnly
            placeholder="Result will appear here…" spellCheck={false} />
        </div>
      </div>
      {(error || copyError) && (
        <div className="bencode-error" role="alert">⚠ {error || copyError}</div>
      )}
    </section>
  );
}
