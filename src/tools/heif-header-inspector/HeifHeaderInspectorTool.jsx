import { useState } from 'react';
import { parseHeifHeader } from './heifHeader.utils.js';
import './heifHeaderInspector.css';

function BoxTree({ boxes }) {
  return (
    <ul className="heif-header-inspector__tree">
      {boxes.map((box) => (
        <li key={`${box.offset}-${box.type}`}>
          <span>{box.type} <small>({box.size} bytes, offset {box.offset})</small></span>
          {box.children?.length > 0 && <BoxTree boxes={box.children} />}
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders a client-side inspector for HEIF and HEIC container headers.
 * @returns {React.JSX.Element} The HEIF/HEIC header inspector UI.
 */
export default function HeifHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(parseHeifHeader(await file.arrayBuffer()));
  }

  return (
    <section
      className="heif-header-inspector"
      aria-label="HEIF and HEIC Header Inspector"
    >
      <p>Inspect HEIF/HEIC container metadata locally. Files never leave your browser.</p>
      <label className="heif-header-inspector__upload" htmlFor="heif-file">
        Choose a HEIF or HEIC file
        <input
          id="heif-file"
          type="file"
          accept=".heif,.heic,image/heif,image/heic"
          onChange={handleFileChange}
        />
      </label>
      {fileName && <p className="heif-header-inspector__filename">{fileName}</p>}
      {result?.error && (
        <div role="alert" className="heif-header-inspector__error">
          {result.error}
        </div>
      )}
      {result?.ok && (
        <div className="heif-header-inspector__results" aria-live="polite">
          <dl>
            <dt>Major brand</dt>
            <dd>{result.majorBrand}</dd>
            <dt>Compatible brands</dt>
            <dd>{result.compatibleBrands.join(', ') || 'None'}</dd>
            <dt>Primary item</dt>
            <dd>{result.primaryItemId ?? 'Not specified'}</dd>
            <dt>Dimensions</dt>
            <dd>
              {result.dimensions
                ? `${result.dimensions.width} × ${result.dimensions.height}`
                : 'Not specified'}
            </dd>
            <dt>Rotation</dt>
            <dd>
              {result.rotation === undefined ? 'Not specified' : `${result.rotation}°`}
            </dd>
          </dl>
          <h2>Box structure</h2>
          <BoxTree boxes={result.boxes} />
        </div>
      )}
    </section>
  );
}
