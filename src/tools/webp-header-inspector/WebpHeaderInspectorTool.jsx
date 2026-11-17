import { useRef, useState } from 'react';
import { formatBytes, parseWebp } from './webp.utils.js';
import './webp-header-inspector.css';

/**
 * Renders a local WebP RIFF container inspector.
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
      const parsed = parseWebp(await readFileBytes(file));
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message);
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
    <section className="webp-inspector" aria-label="WebP Header Inspector">
      <div
        className="webp-inspector__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a .webp file here, or choose one to inspect locally.</p>
        <label className="webp-inspector__button">
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

      {fileName && <p className="webp-inspector__filename">File: {fileName}</p>}
      {error && <div className="webp-inspector__alert" role="alert">⚠ {error}</div>}

      {result && (
        <div className="webp-inspector__results">
          <div className="webp-inspector__heading">
            <h3>RIFF / WEBP container</h3>
            <button type="button" className="webp-inspector__clear" onClick={handleClear}>Clear</button>
          </div>
          <dl className="webp-inspector__details">
            <dt>Declared file size</dt><dd>{formatBytes(result.declaredSize)}</dd>
            <dt>Actual file size</dt><dd>{formatBytes(result.fileSize)}</dd>
            <dt>Image chunk</dt><dd><code>{result.imageType}</code></dd>
            <dt>Dimensions</dt><dd>{result.width} × {result.height} px</dd>
            {result.imageType === 'VP8X' && (
              <><dt>VP8X features</dt><dd>{result.features.join(', ') || 'None'}</dd></>
            )}
          </dl>
          <h4>Optional extended chunks</h4>
          {result.optionalChunks.length === 0 ? <p>None found.</p> : (
            <ul className="webp-inspector__chunks">
              {result.optionalChunks.map((chunk, index) => (
                <li key={`${chunk.name}-${index}`}><code>{chunk.name}</code> — {formatBytes(chunk.size)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Reads a browser File as raw bytes without transmitting it anywhere.
 *
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
function readFileBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {ArrayBuffer} */ (reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}
