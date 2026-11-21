import { useRef, useState } from 'react';
import { decodePsdInput, fileToBytes, parsePsdHeader } from './psd-header.utils.js';
import './psd-header-inspector.css';

function InspectResult({ result }) {
  return (
    <div className="psd-result" aria-live="polite">
      <h2>Document header</h2>
      <dl className="psd-details">
        <dt>Signature</dt><dd>{result.signature}</dd>
        <dt>Format</dt><dd>{result.format} (version {result.version})</dd>
        <dt>Channels</dt><dd>{result.channels}</dd>
        <dt>Dimensions</dt><dd>{result.width} × {result.height} px</dd>
        <dt>Bit depth</dt><dd>{result.depth}</dd>
        <dt>Color mode</dt><dd>{result.colorMode}</dd>
        <dt>Color Mode Data</dt><dd>{result.colorModeDataLength} bytes</dd>
        <dt>Image Resources</dt><dd>{result.imageResources.length} bytes</dd>
        <dt>Layer and Mask Information</dt><dd>{result.layerMaskLength} bytes</dd>
      </dl>
      <h2>Image resource IDs</h2>
      {result.imageResources.resourceIds.length === 0 ? (
        <p>No image resources are present.</p>
      ) : (
        <ul>
          {result.imageResources.resourceIds.map((resource, index) => (
            <li key={`${resource.id}-${index}`}>
              0x{resource.id.toString(16).padStart(4, '0')} — {resource.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Renders a passive, client-only inspector for PSD and PSB document headers.
 * @returns {React.JSX.Element} PSD header inspector interface.
 */
export default function PsdHeaderInspectorTool() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setResult(parsePsdHeader(bytes));
      setError('');
    } catch (inspectionError) {
      setResult(null);
      setError(inspectionError.message);
    }
  }

  function handleTextInspect() {
    try {
      inspect(decodePsdInput(input));
    } catch (inspectionError) {
      setResult(null);
      setError(inspectionError.message);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      inspect(await fileToBytes(file));
    } catch {
      setResult(null);
      setError('Unable to read the selected file.');
    }
  }

  function handleClear() {
    setInput('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="psd-header-inspector" aria-label="PSD and PSB Header Inspector">
      <p className="psd-notice">
        Files are decoded only in your browser. Nothing is uploaded or executed.
      </p>
      <div className="psd-actions">
        <label className="psd-upload">
          Upload PSD or PSB
          <input
            ref={fileInputRef}
            type="file"
            accept=".psd,.psb"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="psd-button" onClick={handleTextInspect}>
          Inspect pasted bytes
        </button>
        <button type="button" className="psd-button" onClick={handleClear}>Clear</button>
      </div>
      <label className="psd-label" htmlFor="psd-bytes">Hexadecimal or Base64 bytes</label>
      <textarea
        id="psd-bytes"
        className="psd-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste PSD/PSB bytes as hex or Base64…"
        spellCheck={false}
      />
      {error && <div className="psd-error" role="alert">{error}</div>}
      {result && <InspectResult result={result} />}
    </section>
  );
}
