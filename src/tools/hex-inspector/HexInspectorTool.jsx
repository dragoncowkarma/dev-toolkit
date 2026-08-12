import { useEffect, useState } from 'react';
import {
  bytesToHexString,
  buildByteRows,
  decodeBytesToText,
  parseHexBytes,
  SAMPLE_HEX,
  SAMPLE_TEXT,
  textToBytes,
} from './hexInspector.utils.js';
import './hexInspector.css';

const MODES = {
  TEXT_TO_HEX: 'textToHex',
  HEX_TO_TEXT: 'hexToText',
};

const ROW_LIMIT = 1000;

/**
 * Renders the Hex Inspector tool: converts UTF-8 text to hexadecimal bytes
 * and back, with a full per-byte inspection table. All conversion happens
 * locally in the browser; no input ever leaves the device.
 *
 * @returns {React.JSX.Element} The Hex Inspector tool UI.
 */
export default function HexInspectorTool() {
  const [mode, setMode] = useState(MODES.TEXT_TO_HEX);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');

  // Real-time conversion whenever the input or mode changes.
  useEffect(() => {
    if (mode === MODES.TEXT_TO_HEX) {
      if (input === '') {
        setOutput('');
        setRows([]);
        setError('');
        return;
      }
      const bytes = textToBytes(input);
      setOutput(bytesToHexString(bytes));
      setRows(buildByteRows(bytes));
      setError('');
      return;
    }

    if (input.trim() === '') {
      setOutput('');
      setRows([]);
      setError('');
      return;
    }
    try {
      const bytes = parseHexBytes(input);
      // Bytes are shown for inspection as soon as parsing succeeds, even if
      // UTF-8 decoding below fails — that lets the table point at the exact
      // bytes causing a decode failure.
      setRows(buildByteRows(bytes));
      try {
        setOutput(decodeBytesToText(bytes));
        setError('');
      } catch (decodeError) {
        setOutput('');
        setError(decodeError.message);
      }
    } catch (parseError) {
      setOutput('');
      setRows([]);
      setError(parseError.message);
    }
  }, [input, mode]);

  useEffect(() => {
    if (!copyStatus) return undefined;
    const timer = setTimeout(() => setCopyStatus(''), 1500);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setInput('');
    setOutput('');
    setRows([]);
    setError('');
    setCopyStatus('');
  }

  function handleLoadSample() {
    setInput(mode === MODES.TEXT_TO_HEX ? SAMPLE_TEXT : SAMPLE_HEX);
    setCopyStatus('');
  }

  function handleClear() {
    setInput('');
    setOutput('');
    setRows([]);
    setError('');
    setCopyStatus('');
  }

  async function handleCopy() {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopyStatus('Copied to clipboard.');
    } catch {
      setCopyStatus('Failed to copy to clipboard.');
    }
  }

  const sourceLabel = mode === MODES.TEXT_TO_HEX ? 'Text' : 'Hex bytes';
  const resultLabel = mode === MODES.TEXT_TO_HEX ? 'Hex bytes' : 'Text';
  const visibleRows = rows.slice(0, ROW_LIMIT);
  const copyFailed = copyStatus.startsWith('Failed');

  return (
    <section className="hex-inspector-tool" aria-label="Hex Inspector Tool">
      <div className="hex-inspector-toolbar">
        <div className="mode-toggle" role="group" aria-label="Conversion mode">
          <button
            type="button"
            aria-pressed={mode === MODES.TEXT_TO_HEX}
            className={`mode-btn ${mode === MODES.TEXT_TO_HEX ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.TEXT_TO_HEX)}
          >
            Text to Hex
          </button>
          <button
            type="button"
            aria-pressed={mode === MODES.HEX_TO_TEXT}
            className={`mode-btn ${mode === MODES.HEX_TO_TEXT ? 'active' : ''}`}
            onClick={() => handleModeChange(MODES.HEX_TO_TEXT)}
          >
            Hex to Text
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

      <div className="hex-inspector-panels">
        <div className="panel">
          <label className="panel-label" htmlFor="hex-inspector-input">
            {sourceLabel}
          </label>
          <textarea
            id="hex-inspector-input"
            className="panel-textarea"
            placeholder={
              mode === MODES.TEXT_TO_HEX
                ? 'Type or paste text to convert to hex…'
                : 'Paste hex bytes, e.g. 48 65 6C 6C 6F'
            }
            value={input}
            onChange={(event) => setInput(event.target.value)}
            spellCheck={false}
          />
        </div>

        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="hex-inspector-output">
              {resultLabel}
            </label>
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopy}
              disabled={!output}
            >
              Copy
            </button>
          </div>
          <textarea
            id="hex-inspector-output"
            className="panel-textarea"
            value={output}
            readOnly
            placeholder="Result will appear here…"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="sr-only" role="status">
        {copyStatus}
      </div>

      {error && (
        <div className="hex-inspector-error" role="alert">
          ⚠ {error}
        </div>
      )}
      {!error && copyFailed && (
        <div className="hex-inspector-error" role="alert">
          ⚠ {copyStatus}
        </div>
      )}

      {rows.length > 0 && (
        <section className="hex-inspector-bytes" aria-labelledby="hex-inspector-bytes-heading">
          <h3 id="hex-inspector-bytes-heading">
            Byte inspection ({rows.length} byte{rows.length === 1 ? '' : 's'})
          </h3>
          {rows.length > ROW_LIMIT && (
            <p className="hex-inspector-truncation-note">
              Showing first {ROW_LIMIT} of {rows.length} bytes.
            </p>
          )}
          <div className="hex-inspector-table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Offset</th>
                  <th scope="col">Hex</th>
                  <th scope="col">Decimal</th>
                  <th scope="col">Binary</th>
                  <th scope="col">Char</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.offset}>
                    <td>{row.offset}</td>
                    <td>{row.hex}</td>
                    <td>{row.decimal}</td>
                    <td>{row.binary}</td>
                    <td className="hex-inspector-char-cell">{row.display}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
