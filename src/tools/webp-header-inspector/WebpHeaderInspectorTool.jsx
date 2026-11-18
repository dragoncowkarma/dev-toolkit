import { useRef, useState } from 'react';
import { parseWebp } from './webp.utils.js';
import './webp-header-inspector.css';

function readFileBytes(file) {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Renders a local WebP RIFF header inspector.
 *
 * @returns {React.JSX.Element} The WebP inspector UI.
 */
export default function WebpHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const bytes = await readFileBytes(file);
      setResult(parseWebp(bytes));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message || 'Unable to inspect this file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleClear() {
    setResult(null);
    setError('');
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="webp-header-inspector" aria-label="WebP Header Inspector">
      <div
        className="webp-header-inspector__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a WebP file here, or choose one from your device.</p>
        <label className="webp-header-inspector__button">
          Choose WebP file
          <input
            ref={inputRef}
            type="file"
            accept="image/webp,.webp"
            onChange={(event) => inspectFile(event.target.files?.[0])}
            aria-label="Choose a WebP file"
          />
        </label>
      </div>

      {fileName && <p className="webp-header-inspector__filename">Inspecting: {fileName}</p>}
      {error && (
        <div className="webp-header-inspector__alert" role="alert">
          ⚠ {error}
        </div>
      )}

      {result && (
        <div className="webp-header-inspector__results">
          <div className="webp-header-inspector__heading">
            <h2>Container details</h2>
            <button type="button" className="webp-header-inspector__clear" onClick={handleClear}>
              Clear
            </button>
          </div>
          <dl className="webp-header-inspector__details">
            <dt>Container</dt><dd>RIFF</dd>
            <dt>Declared size</dt><dd>{result.declaredSize} bytes</dd>
            <dt>Form type</dt><dd>{result.formType}</dd>
            <dt>Primary chunk</dt><dd>{result.primaryChunk}</dd>
            <dt>Dimensions</dt><dd>{result.width} × {result.height}</dd>
            {result.primaryChunk === 'VP8X' && (
              <>
                <dt>Features</dt>
                <dd>{result.features.length ? result.features.join(', ') : 'None'}</dd>
              </>
            )}
          </dl>
          <h3>Optional extended chunks</h3>
          {result.optionalChunks.length ? (
            <ul className="webp-header-inspector__chunks">
              {result.optionalChunks.map((chunk) => (
                <li key={`${chunk.name}-${chunk.size}`}>{chunk.name} — {chunk.size} bytes</li>
              ))}
            </ul>
          ) : <p className="webp-header-inspector__empty">No optional extended chunks found.</p>}
        </div>
      )}
    </section>
  );
}
