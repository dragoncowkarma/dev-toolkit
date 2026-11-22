import { useRef, useState } from 'react';
import { decodeBase64, decodeHex, parseRegfHeader } from './regf-header.utils.js';
import './regf-header-inspector.css';

const INPUT_MODES = {
  FILE: 'file',
  HEX: 'hex',
  BASE64: 'base64',
};

function ResultField({ label, children }) {
  return (
    <div className="regf-result__field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Renders a client-side inspector for the fixed 512-byte REGF hive header.
 *
 * @returns {React.JSX.Element} The REGF header inspector UI.
 */
export default function RegfHeaderInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.FILE);
  const [textInput, setTextInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  function inspectBytes(bytes) {
    try {
      setResult(parseRegfHeader(bytes));
      setError('');
    } catch (inspectionError) {
      setResult(null);
      setError(inspectionError.message);
    }
  }

  function handleModeChange(nextMode) {
    fileRequestRef.current += 1;
    setMode(nextMode);
    setTextInput('');
    setFileName('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = (fileRequestRef.current += 1);
    setFileName(file.name);
    try {
      const bytes = new Uint8Array(await file.slice(0, 512).arrayBuffer());
      if (fileRequestRef.current !== requestId) return;
      inspectBytes(bytes);
    } catch {
      if (fileRequestRef.current !== requestId) return;
      setResult(null);
      setError('Failed to read the selected file.');
    }
  }

  function handleInspectText() {
    try {
      inspectBytes(mode === INPUT_MODES.HEX ? decodeHex(textInput) : decodeBase64(textInput));
    } catch (decodeError) {
      setResult(null);
      setError(decodeError.message);
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setTextInput('');
    setFileName('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="regf-tool" aria-label="REGF Header Inspector">
      <p className="regf-tool__intro">
        Inspect the fixed 512-byte header of a Windows Registry hive. Processing stays in your
        browser; hive bins and registry cells are never traversed.
      </p>

      <div className="regf-tool__toolbar">
        <div className="regf-tool__modes" role="group" aria-label="Input type">
          {Object.values(INPUT_MODES).map((inputMode) => (
            <button
              key={inputMode}
              type="button"
              className={mode === inputMode ? 'active' : ''}
              aria-pressed={mode === inputMode}
              onClick={() => handleModeChange(inputMode)}
            >
              {inputMode === INPUT_MODES.BASE64 ? 'Base64' : inputMode[0].toUpperCase()
                + inputMode.slice(1)}
            </button>
          ))}
        </div>
        <button type="button" className="regf-tool__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      {mode === INPUT_MODES.FILE ? (
        <div className="regf-tool__file-panel">
          <label className="regf-tool__file-button">
            Choose registry hive
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              aria-label="Choose a Windows Registry hive file"
            />
          </label>
          <span>{fileName || 'No file selected'}</span>
        </div>
      ) : (
        <div className="regf-tool__text-panel">
          <label htmlFor="regf-text-input">
            {mode === INPUT_MODES.HEX ? 'Hexadecimal bytes' : 'Base64 data'}
          </label>
          <textarea
            id="regf-text-input"
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder={mode === INPUT_MODES.HEX ? '72 65 67 66 …' : 'cmVnZg…'}
            spellCheck={false}
          />
          <button type="button" className="regf-tool__button" onClick={handleInspectText}>
            Inspect header
          </button>
        </div>
      )}

      {error && <div className="regf-tool__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="regf-result" aria-label="Parsed REGF header">
          {!result.checksumMatches && (
            <div className="regf-result__warning" role="status">
              Checksum mismatch: the header may be damaged or incomplete.
            </div>
          )}
          <dl>
            <ResultField label="Magic"><code>{result.magic}</code></ResultField>
            <ResultField label="Primary sequence">{result.sequence1}</ResultField>
            <ResultField label="Secondary sequence">{result.sequence2}</ResultField>
            <ResultField label="Cleanly unloaded">
              {result.sequencesMatch
                ? 'Yes — sequence numbers match'
                : 'No — sequence mismatch'}
            </ResultField>
            <ResultField label="Last written (UTC)">{result.lastWritten.utc}</ResultField>
            <ResultField label="FILETIME ticks">{result.lastWritten.raw}</ResultField>
            <ResultField label="Version">
              {result.majorVersion}.{result.minorVersion}
            </ResultField>
            <ResultField label="File type">{result.fileType}</ResultField>
            <ResultField label="File format">{result.fileFormat}</ResultField>
            <ResultField label="Root cell offset">{result.rootCellOffset} bytes</ResultField>
            <ResultField label="Hive bin data size">{result.hiveBinDataSize} bytes</ResultField>
            {result.hiveName && <ResultField label="Hive name">{result.hiveName}</ResultField>}
            <ResultField label="Declared checksum">
              <code>{result.declaredChecksumHex}</code>
            </ResultField>
            <ResultField label="Computed checksum">
              <code>{result.computedChecksumHex}</code>
            </ResultField>
          </dl>
        </div>
      )}
    </section>
  );
}
