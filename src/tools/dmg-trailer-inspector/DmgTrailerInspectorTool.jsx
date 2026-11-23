import { useRef, useState } from 'react';
import { decodeBase64Bytes, parseKolyTrailer, readFileTrailer } from './dmgTrailer.utils.js';
import './dmgTrailerInspector.css';

const EMPTY_RESULT = { metadata: [], warnings: [] };

/**
 * Renders a local-only Apple DMG koly trailer inspector.
 *
 * @returns {React.JSX.Element} The DMG trailer inspector UI.
 */
export default function DmgTrailerInspectorTool() {
  const [result, setResult] = useState(EMPTY_RESULT);
  const [base64, setBase64] = useState('');
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  function inspect(bytes, size, nextSource) {
    setResult(parseKolyTrailer(bytes, size));
    setSource(nextSource);
    setError('');
  }

  async function inspectFile(file) {
    if (!file) return;
    try {
      const { bytes, size } = await readFileTrailer(file);
      inspect(bytes, size, `${file.name} (${size.toLocaleString()} bytes)`);
    } catch {
      setResult(EMPTY_RESULT);
      setSource('');
      setError('The selected file could not be read locally.');
    }
  }

  function handleBase64Inspect() {
    const decoded = decodeBase64Bytes(base64);
    if (decoded.error) {
      setResult(EMPTY_RESULT);
      setSource('');
      setError(decoded.error);
      return;
    }
    const description = `Base64 input (${decoded.bytes.length.toLocaleString()} bytes)`;
    inspect(decoded.bytes, decoded.bytes.length, description);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="dmg-trailer-inspector" aria-label="DMG Trailer Inspector">
      <p className="dmg-trailer-inspector__privacy">
        Files are read only in this browser. Nothing is uploaded.
      </p>
      <div
        className={`dmg-trailer-inspector__dropzone ${isDragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <label className="dmg-trailer-inspector__file-button">
          Select DMG file
          <input
            ref={inputRef}
            type="file"
            onChange={(event) => inspectFile(event.target.files?.[0])}
            aria-label="Select a DMG file"
          />
        </label>
        <span>or drag a file here</span>
      </div>

      <div className="dmg-trailer-inspector__base64">
        <label htmlFor="dmg-base64">Base64 input</label>
        <textarea
          id="dmg-base64"
          value={base64}
          onChange={(event) => setBase64(event.target.value)}
          placeholder="Paste a Base64-encoded DMG or koly trailer…"
          spellCheck={false}
        />
        <button type="button" onClick={handleBase64Inspect}>Inspect Base64</button>
      </div>

      {source && <p className="dmg-trailer-inspector__source">Inspecting: {source}</p>}
      {error && <div className="dmg-trailer-inspector__alert" role="alert">{error}</div>}
      {result.warnings.map((warning) => (
        <div className="dmg-trailer-inspector__alert" role="alert" key={warning}>{warning}</div>
      ))}

      {result.metadata.length > 0 && (
        <dl className="dmg-trailer-inspector__metadata">
          {result.metadata.map(({ label, value }) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
