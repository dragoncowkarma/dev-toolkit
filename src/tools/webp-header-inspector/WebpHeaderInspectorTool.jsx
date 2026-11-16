import { useRef, useState } from 'react';
import { formatBytes, parseWebp } from './webp.utils.js';
import './webp-header-inspector.css';

const FEATURE_LABELS = {
  iccProfile: 'ICC profile',
  alpha: 'Alpha',
  exif: 'Exif metadata',
  xmp: 'XMP metadata',
  animation: 'Animation',
};

/** Renders a local WebP RIFF container inspector. */
export default function WebpHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const bytes = await file.arrayBuffer();
      setResult(parseWebp(bytes));
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to read this file.');
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  const enabledFeatures = result
    ? Object.entries(result.features)
      .filter(([, enabled]) => enabled)
      .map(([name]) => FEATURE_LABELS[name])
    : [];

  return (
    <section className="webp-header-inspector" aria-label="WebP Header Inspector">
      <input
        ref={inputRef}
        className="webp-header-inspector__input"
        type="file"
        accept="image/webp,.webp"
        aria-label="Select a WebP file"
        onChange={handleFileChange}
      />
      <button
        type="button"
        className={`webp-header-inspector__dropzone ${
          isDragging ? 'webp-header-inspector__dropzone--active' : ''
        }`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span className="webp-header-inspector__dropzone-title">Choose a WebP file</span>
        <span>or drag and drop it here. Files are parsed only in your browser.</span>
      </button>

      {fileName && (
        <p className="webp-header-inspector__file-name">Inspecting: {fileName}</p>
      )}
      {error && <div className="webp-header-inspector__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="webp-header-inspector__results" aria-live="polite">
          <dl className="webp-header-inspector__details">
            <div><dt>Container</dt><dd>RIFF / {result.formType}</dd></div>
            <div>
              <dt>Declared file size</dt>
              <dd>{formatBytes(result.declaredSize)}</dd>
            </div>
            <div><dt>Image chunk</dt><dd>{result.chunkType}</dd></div>
            <div><dt>Dimensions</dt><dd>{result.width} × {result.height}</dd></div>
          </dl>

          {result.chunkType === 'VP8X' && (
            <section className="webp-header-inspector__section" aria-labelledby="webp-features">
              <h3 id="webp-features">VP8X features</h3>
              <p>
                {enabledFeatures.length ? enabledFeatures.join(', ') : 'No optional features flagged.'}
              </p>
            </section>
          )}

          <section className="webp-header-inspector__section" aria-labelledby="webp-chunks">
            <h3 id="webp-chunks">Optional extended chunks</h3>
            {result.optionalChunks.length ? (
              <ul>
                {result.optionalChunks.map((chunk, index) => (
                  <li key={`${chunk.name}-${index}`}>{chunk.name}: {formatBytes(chunk.size)}</li>
                ))}
              </ul>
            ) : <p>None found.</p>}
          </section>
        </div>
      )}
    </section>
  );
}
