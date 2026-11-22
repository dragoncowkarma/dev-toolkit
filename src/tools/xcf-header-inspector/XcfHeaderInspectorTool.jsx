import { useRef, useState } from 'react';
import { parseXcfHeader } from './xcf.utils.js';
import './xcf.css';

function valueOrUnavailable(value) {
  return value ?? 'Not present';
}

/**
 * Renders a local-only inspector for GIMP XCF image headers.
 *
 * @returns {React.JSX.Element} The XCF Header Inspector UI.
 */
export default function XcfHeaderInspectorTool() {
  const [header, setHeader] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseXcfHeader(await file.arrayBuffer());
      setHeader(parsed);
      setFileName(file.name);
      setError('');
    } catch (parseError) {
      setHeader(null);
      setFileName('');
      setError(parseError instanceof Error ? parseError.message : 'Unable to read this XCF file.');
    }
  }

  function handleClear() {
    setHeader(null);
    setFileName('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="xcf-inspector" aria-label="XCF Header Inspector Tool">
      <div className="xcf-inspector__intro">
        <p>Select a local GIMP XCF file to inspect its header. Files stay in your browser.</p>
        <div className="xcf-inspector__actions">
          <label className="xcf-inspector__button">
            Choose XCF file
            <input
              ref={fileInputRef}
              className="xcf-inspector__input"
              type="file"
              accept=".xcf,application/x-gimp-image,image/x-xcf"
              onChange={handleFileChange}
            />
          </label>
          {(header || error) && <button type="button" onClick={handleClear}>Clear</button>}
        </div>
      </div>

      {error && <div className="xcf-inspector__error" role="alert">⚠ {error}</div>}

      {header && (
        <div className="xcf-inspector__results">
          <h2>{fileName}</h2>
          <dl>
            <dt>XCF version</dt><dd>{header.version}</dd>
            <dt>Canvas</dt><dd>{header.width} × {header.height} px</dd>
            <dt>Base image type</dt><dd>{header.baseType}</dd>
            <dt>Precision</dt><dd>{header.precision}</dd>
            <dt>Compression</dt><dd>{valueOrUnavailable(header.compression)}</dd>
            <dt>Resolution</dt><dd>{header.resolution
              ? `${header.resolution.x} × ${header.resolution.y} ppi`
              : 'Not present'}</dd>
            <dt>Parasites</dt><dd>{header.parasiteCount}</dd>
            <dt>Metadata parasites</dt><dd>{header.metadataCount}</dd>
            <dt>Image properties</dt><dd>{header.propertyCount}</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
