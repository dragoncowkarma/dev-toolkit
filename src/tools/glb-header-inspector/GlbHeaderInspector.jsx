import { useRef, useState } from 'react';
import { formatGlbBytes, inspectGlbHeader } from './glb-header-inspector.utils.js';
import './glb-header-inspector.css';

/**
 * Renders a client-side GLB container header and chunk inspector.
 * @returns {React.JSX.Element}
 */
export default function GlbHeaderInspector() {
  const [fileName, setFileName] = useState('');
  const [inspection, setInspection] = useState(null);
  const [readError, setReadError] = useState('');
  const fileInputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      setFileName(file.name);
      setInspection(inspectGlbHeader(buffer));
      setReadError('');
    } catch (error) {
      setInspection(null);
      setReadError(error instanceof Error ? error.message : 'Unable to read the selected file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  const errors = readError ? [readError] : inspection?.errors ?? [];

  return (
    <section className="glb-inspector" aria-label="GLB Header Inspector">
      <div
        className="glb-inspector__dropzone"
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          className="glb-inspector__file-input"
          type="file"
          accept=".glb,model/gltf-binary"
          aria-label="Select a GLB file"
          onChange={(event) => inspectFile(event.target.files?.[0])}
        />
        <strong>Drop a GLB file here or press Enter to select one</strong>
        <span>Files are inspected locally; mesh and texture payload bytes are not displayed.</span>
      </div>

      <p className="glb-inspector__status" role="status" aria-live="polite">
        {fileName ? `Inspected ${fileName}.` : 'No file selected.'}
      </p>

      {errors.map((error) => (
        <div className="glb-inspector__error" role="alert" key={error}>
          {error}
        </div>
      ))}

      {inspection && (
        <div className="glb-inspector__results">
          <h2>Container summary</h2>
          <dl>
            <dt>Actual file size</dt>
            <dd>{formatGlbBytes(inspection.fileSize)}</dd>
            <dt>Magic</dt>
            <dd>{inspection.header?.magic ?? 'Unavailable'}</dd>
            <dt>Version</dt>
            <dd>{inspection.header?.version ?? 'Unavailable'}</dd>
            <dt>Declared length</dt>
            <dd>
              {inspection.header ? formatGlbBytes(inspection.header.declaredLength) : 'Unavailable'}
            </dd>
          </dl>

          {inspection.warnings.length > 0 && (
            <aside className="glb-inspector__warnings" aria-label="Inspection warnings">
              <h2>Warnings</h2>
              <ul>{inspection.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </aside>
          )}

          <h2>Chunks</h2>
          <dl>
            {inspection.chunks.map((chunk) => (
              <div className="glb-inspector__chunk" key={`${chunk.offset}-${chunk.typeValue}`}>
                <dt>{chunk.type} ({chunk.typeValue})</dt>
                <dd>
                  Offset {chunk.offset}, data offset {chunk.dataOffset},{' '}
                  {formatGlbBytes(chunk.length)}
                </dd>
              </div>
            ))}
          </dl>

          {inspection.jsonMetadata && (
            <>
              <h2>JSON metadata</h2>
              <dl>
                <dt>Top-level keys</dt>
                <dd>{inspection.jsonMetadata.topLevelKeys.join(', ') || 'None'}</dd>
                <dt>Asset version</dt>
                <dd>{inspection.jsonMetadata.assetVersion ?? 'Not provided'}</dd>
                <dt>Asset generator</dt>
                <dd>{inspection.jsonMetadata.assetGenerator ?? 'Not provided'}</dd>
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  );
}
