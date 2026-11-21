import { useRef, useState } from 'react';
import { parseIso9660 } from './iso9660.utils.js';
import './iso9660.css';

function readFileAsArrayBuffer(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the selected ISO image.'));
    reader.readAsArrayBuffer(file);
  });
}

function Detail({ label, value }) {
  return (
    <div className="iso9660-detail">
      <dt>{label}</dt>
      <dd>{value || 'Not specified'}</dd>
    </div>
  );
}

/**
 * Renders a local-only ISO 9660 volume descriptor inspector.
 * @returns {React.JSX.Element} The ISO 9660 inspector UI.
 */
export default function Iso9660InspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    setFileName(file.name);
    setResult(parseIso9660(await readFileAsArrayBuffer(file)));
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  const primary = result?.primaryVolume;
  const rootDirectoryValue = primary?.rootDirectoryRecord
    ? [
      `Extent ${primary.rootDirectoryRecord.extentLocation},`,
      `${primary.rootDirectoryRecord.dataLength} bytes`,
    ].join(' ')
    : 'Invalid or unavailable';
  return (
    <section className="iso9660-tool" aria-label="ISO 9660 Volume Descriptor Inspector">
      <input
        ref={fileInputRef}
        className="iso9660-file-input"
        type="file"
        accept=".iso,application/x-iso9660-image"
        aria-label="Choose an ISO image to inspect"
        onChange={(event) => inspectFile(event.target.files?.[0])}
      />
      <div
        className={`iso9660-drop-zone ${isDragging ? 'is-dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Drop an ISO image here or choose a local file"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click();
        }}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <strong>Drop an ISO image here</strong>
        <span>or choose a local file to inspect in your browser</span>
      </div>

      {fileName && <p className="iso9660-file-name">Inspecting: {fileName}</p>}
      {result?.errors.map((error) => (
        <div className="iso9660-alert" role="alert" key={error}>⚠ {error}</div>
      ))}

      {result && (
        <div className="iso9660-results">
          <section aria-labelledby="descriptor-list-heading">
            <h2 id="descriptor-list-heading">Volume Descriptors</h2>
            <ul className="iso9660-descriptor-list">
              {result.descriptors.map((descriptor) => (
                <li key={descriptor.sector} className={descriptor.validSignature ? '' : 'invalid'}>
                  Sector {descriptor.sector}: {descriptor.typeName} —
                  {' '}{descriptor.standardIdentifier}
                  {descriptor.jolietLevel ? ` (Joliet level ${descriptor.jolietLevel})` : ''}
                </li>
              ))}
            </ul>
          </section>

          {primary && (
            <section aria-labelledby="primary-volume-heading">
              <h2 id="primary-volume-heading">Primary Volume Descriptor</h2>
              <dl className="iso9660-details">
                <Detail label="Volume Identifier" value={primary.volumeIdentifier} />
                <Detail label="Volume Space Size" value={`${primary.volumeSpaceSize} sectors`} />
                <Detail label="Logical Block Size" value={`${primary.logicalBlockSize} bytes`} />
                <Detail label="Path Table Size" value={`${primary.pathTableSize} bytes`} />
                <Detail label="Path Table Location" value={`Sector ${primary.pathTableLocation}`} />
                <Detail
                  label="Root Directory Record"
                  value={rootDirectoryValue}
                />
                <Detail label="Volume Set Identifier" value={primary.volumeSetIdentifier} />
                <Detail label="Publisher Identifier" value={primary.publisherIdentifier} />
                <Detail label="Data Preparer Identifier" value={primary.dataPreparerIdentifier} />
                <Detail label="Application Identifier" value={primary.applicationIdentifier} />
                <Detail label="Creation Date-Time" value={primary.creationDateTime.formatted} />
                <Detail
                  label="Modification Date-Time"
                  value={primary.modificationDateTime.formatted}
                />
              </dl>
            </section>
          )}

          {result.jolietVolume && (
            <section aria-labelledby="joliet-heading">
              <h2 id="joliet-heading">Joliet Supplementary Volume Descriptor</h2>
              <dl className="iso9660-details">
                <Detail label="Joliet Level" value={String(result.jolietVolume.level)} />
                <Detail
                  label="UCS-2BE Volume Identifier"
                  value={result.jolietVolume.volumeIdentifier}
                />
              </dl>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
