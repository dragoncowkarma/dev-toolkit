import { useRef, useState } from 'react';
import {
  bytesFromBase64,
  extractIccBytesAsync,
  parseIccProfile,
} from './iccProfile.utils.js';
import './iccProfile.css';

/**
 * Renders a client-side ICC color profile header inspector.
 * @returns {React.JSX.Element} The ICC profile inspector UI.
 */
export default function IccProfileInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [base64, setBase64] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function inspect(bytes, source) {
    try {
      setResult(parseIccProfile(await extractIccBytesAsync(bytes, source), source));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function inspectFile(file) {
    if (file) await inspect(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  async function submitBase64(event) {
    event.preventDefault();
    try {
      await inspect(bytesFromBase64(base64), 'Base64 input');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  return (
    <section className="icc-inspector" aria-label="ICC Color Profile Inspector">
      <div className="icc-controls">
        <input
          ref={inputRef}
          className="icc-file-input"
          type="file"
          accept=".icc,.icm,image/jpeg,image/png,image/tiff"
          aria-label="Choose ICC or image file"
          onChange={(event) => inspectFile(event.target.files?.[0])}
        />
        <div
          className={`icc-upload ${isDragging ? 'is-dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Drop an ICC or image file here or choose a file"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <strong>Drop ICC or image file here</strong>
          <span>or choose a local file to inspect</span>
        </div>
        <form onSubmit={submitBase64}>
          <label htmlFor="icc-base64">Base64 profile data</label>
          <textarea
            id="icc-base64"
            value={base64}
            onChange={(event) => setBase64(event.target.value)}
          />
          <button type="submit">Inspect Base64</button>
        </form>
      </div>
      {error && <p className="icc-error" role="alert">{error}</p>}
      {result && <>
        <h2>Profile header</h2>
        <dl className="icc-header">
          {result.header.map((item) => (
            <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
          ))}
        </dl>
        <h2>Tag table</h2>
        <div className="icc-table-wrap" tabIndex="0">
          <table>
            <thead><tr><th scope="col">Signature</th><th scope="col">Description</th>
              <th scope="col">Offset</th><th scope="col">Size</th><th scope="col">Status</th>
            </tr></thead>
            <tbody>{result.tags.map((tag, index) => (
              <tr key={`${tag.signature}-${index}`}><th scope="row">{tag.signature}</th>
                <td>{tag.label}</td><td>{tag.offset}</td><td>{tag.size}</td>
                <td>{tag.outOfBounds ? 'Out of bounds' : 'Valid'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>}
    </section>
  );
}
