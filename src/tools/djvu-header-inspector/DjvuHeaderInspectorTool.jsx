import { useRef, useState } from 'react';
import { decodeBase64Bytes, inspectDjvuHeader } from './djvu-header.utils.js';
import './djvu-header-inspector.css';

function display(value, suffix = '') {
  return value === null || value === undefined ? 'Unavailable' : `${value}${suffix}`;
}

function Metadata({ label, value }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

/**
 * Renders a local-only inspector for DjVu IFF85 headers.
 *
 * @returns {React.JSX.Element} The DjVu header inspector.
 */
export default function DjvuHeaderInspectorTool() {
  const [base64, setBase64] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  function inspect(bytes, name = '') {
    setResult(inspectDjvuHeader(bytes));
    setFileName(name);
    setError('');
  }

  function inspectBase64() {
    try {
      inspect(decodeBase64Bytes(base64));
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
    }
  }

  async function inspectFile(file) {
    if (!file) return;
    try {
      inspect(new Uint8Array(await file.arrayBuffer()), file.name);
    } catch {
      setResult(null);
      setError('The selected file could not be read.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function clear() {
    setBase64('');
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="djvu-inspector" aria-label="DjVu Header Inspector">
      <p className="djvu-inspector__privacy">Files and pasted data stay in your browser.</p>
      <div
        className="djvu-inspector__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <label className="djvu-inspector__file-button">
          Select DjVu file
          <input
            ref={inputRef}
            type="file"
            accept=".djvu,.djv,image/vnd.djvu"
            onChange={(event) => inspectFile(event.target.files?.[0])}
          />
        </label>
        <p>or drag and drop a file here</p>
      </div>

      <label className="djvu-inspector__label" htmlFor="djvu-base64">
        Base64-encoded DjVu data
      </label>
      <textarea
        id="djvu-base64"
        value={base64}
        onChange={(event) => setBase64(event.target.value)}
        placeholder="Paste Base64 data to inspect…"
        spellCheck={false}
      />
      <div className="djvu-inspector__actions">
        <button type="button" onClick={inspectBase64}>Inspect Base64</button>
        <button type="button" className="djvu-inspector__secondary" onClick={clear}>Clear</button>
      </div>

      {error && <p className="djvu-inspector__error" role="alert">{error}</p>}
      {result && (
        <div className="djvu-inspector__results">
          <h2>Header details{fileName ? `: ${fileName}` : ''}</h2>
          <dl>
            <Metadata label="Document type" value={display(result.formType)} />
            <Metadata label="Valid DjVu header" value={result.valid ? 'Yes' : 'No'} />
            <Metadata label="FORM size (big-endian)" value={display(result.formSize, ' bytes')} />
            <Metadata
              label="Available form bytes"
              value={display(result.availableFormBytes, ' bytes')}
            />
            <Metadata label="FORM size mismatch" value={result.sizeMismatch ? 'Yes' : 'No'} />
            {result.formType === 'DJVU' && <>
              <Metadata label="Width" value={display(result.info.width, ' px')} />
              <Metadata label="Height" value={display(result.info.height, ' px')} />
              <Metadata
                label="Version"
                value={result.info.majorVersion === null
                  ? 'Unavailable'
                  : `${result.info.majorVersion}.${result.info.minorVersion}`}
              />
              <Metadata label="DPI" value={display(result.info.dpi)} />
              <Metadata label="Gamma" value={display(result.info.gamma)} />
              <Metadata label="Rotation flags" value={display(result.info.rotationFlags)} />
            </>}
            {result.formType === 'DJVM' && (
              <Metadata label="Page count" value={display(result.pageCount)} />
            )}
          </dl>

          {result.formType === 'DJVM' && <>
            <h3>Top-level chunks</h3>
            <ul className="djvu-inspector__chunks">
              {result.chunks.map((chunk) => (
                <li key={`${chunk.offset}-${chunk.id}`}>
                  <strong>{chunk.id}</strong>: {chunk.size} bytes (padded to {chunk.paddedSize});
                  {chunk.truncated
                    ? ` mismatch: ${chunk.availablePayload} bytes available`
                    : ' complete'}
                </li>
              ))}
            </ul>
          </>}
          {result.warnings.length > 0 && (
            <div className="djvu-inspector__error" role="alert">
              <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
