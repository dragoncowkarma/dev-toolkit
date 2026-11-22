import { useRef, useState } from 'react';
import { base64ToBytes, hexToBytes, parseAuHeader } from './au-header-inspector.utils.js';
import './au-header-inspector.css';

const INPUT_MODES = { HEX: 'hex', BASE64: 'base64' };

/**
 * Renders a client-side inspector for Sun/NeXT AU audio headers.
 * @returns {React.JSX.Element}
 */
export default function AuHeaderInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.HEX);
  const [input, setInput] = useState('');
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setHeader(parseAuHeader(bytes));
      setError('');
    } catch (parseError) {
      setHeader(null);
      setError(parseError.message);
    }
  }

  function handleInputChange(event) {
    const nextInput = event.target.value;
    setInput(nextInput);
    setFileName('');
    if (!nextInput.trim()) {
      setHeader(null);
      setError('');
      return;
    }
    try {
      inspect(mode === INPUT_MODES.HEX ? hexToBytes(nextInput) : base64ToBytes(nextInput));
    } catch (inputError) {
      setHeader(null);
      setError(inputError.message);
    }
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setInput('');
    setHeader(null);
    setError('');
    setFileName('');
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setInput('');
    try {
      inspect(new Uint8Array(await file.arrayBuffer()));
    } catch {
      setHeader(null);
      setError('Failed to read the selected file.');
    }
  }

  function handleClear() {
    setInput('');
    setHeader(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="au-header-inspector" aria-label="AU Header Inspector">
      <div className="au-header-inspector__toolbar">
        <div className="au-header-inspector__modes" role="group" aria-label="Input format">
          {Object.entries(INPUT_MODES).map(([label, value]) => (
            <button
              key={value}
              type="button"
              className={
                mode === value ? 'au-header-inspector__mode active' : 'au-header-inspector__mode'
              }
              aria-pressed={mode === value}
              onClick={() => handleModeChange(value)}
            >
              {label === 'HEX' ? 'Hex' : 'Base64'}
            </button>
          ))}
        </div>
        <div className="au-header-inspector__actions">
          <label className="au-header-inspector__button au-header-inspector__file-button">
            Upload .au File
            <input
              ref={fileInputRef}
              type="file"
              accept=".au,audio/basic"
              onChange={handleFileChange}
            />
          </label>
          <button type="button" className="au-header-inspector__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <label className="au-header-inspector__label" htmlFor="au-header-input">
        {mode === INPUT_MODES.HEX ? 'AU header bytes (hex)' : 'AU file data (Base64)'}
      </label>
      <textarea
        id="au-header-input"
        className="au-header-inspector__input"
        value={input}
        onChange={handleInputChange}
        placeholder={
          mode === INPUT_MODES.HEX
            ? '2e736e6400000018000000000000000344ac000000000002'
            : 'LnNuZAAAA...'
        }
        spellCheck={false}
      />
      {fileName && <p className="au-header-inspector__file-name">Inspecting: {fileName}</p>}
      {error && <div className="au-header-inspector__error" role="alert">⚠ {error}</div>}

      {header && (
        <dl className="au-header-inspector__results">
          <div><dt>Magic</dt><dd>.snd (0x2E736E64)</dd></div>
          <div><dt>Data offset</dt><dd>{header.dataOffset} bytes</dd></div>
          <div>
            <dt>Data size</dt>
            <dd>{header.dataSizeUnknown ? 'Unknown (0xFFFFFFFF)' : `${header.dataSize} bytes`}</dd>
          </div>
          <div><dt>Encoding</dt><dd>{header.encodingLabel}</dd></div>
          <div><dt>Sample rate</dt><dd>{header.sampleRate} Hz</dd></div>
          <div><dt>Channels</dt><dd>{header.channels}</dd></div>
          {header.annotation && <div><dt>Annotation</dt><dd>{header.annotation}</dd></div>}
        </dl>
      )}
    </section>
  );
}
