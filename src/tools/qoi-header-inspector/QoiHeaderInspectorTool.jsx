import { useRef, useState } from 'react';
import { parseQoiHeader } from './qoiHeaderInspector.utils.js';
import './qoi-header-inspector.css';

/**
 * Renders a client-side QOI header and end-marker inspector.
 *
 * @returns {React.JSX.Element} The QOI inspector UI.
 */
export default function QoiHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      setFileName(file.name);
      setResult(parseQoiHeader(buffer));
    } catch {
      setFileName(file.name);
      setResult({
        error: 'The selected file could not be read.',
        header: null,
        warnings: [],
      });
    }
  }

  function handleFileChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function openFilePicker() {
    inputRef.current?.click();
  }

  function handleDropZoneKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openFilePicker();
    }
  }

  return (
    <section className="qoi-header-inspector" aria-label="QOI Header Inspector">
      <div
        className="qoi-header-inspector__drop-zone"
        role="button"
        tabIndex={0}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        onKeyDown={handleDropZoneKeyDown}
        aria-describedby="qoi-file-help"
      >
        <p>Drop a QOI file here</p>
        <p id="qoi-file-help">or choose a file to inspect its header locally.</p>
        <label className="qoi-header-inspector__file-label">
          Choose QOI file
          <input
            ref={inputRef}
            type="file"
            accept=".qoi,image/qoi"
            onChange={handleFileChange}
          />
        </label>
      </div>

      {fileName && (
        <p className="qoi-header-inspector__file-name">Inspecting: {fileName}</p>
      )}

      {result?.error && (
        <div className="qoi-header-inspector__error" role="alert">
          {result.error}
        </div>
      )}

      {result?.header && (
        <>
          <dl className="qoi-header-inspector__metadata">
            <div><dt>Magic</dt><dd>{result.header.magic}</dd></div>
            <div><dt>Width</dt><dd>{result.header.width} px</dd></div>
            <div><dt>Height</dt><dd>{result.header.height} px</dd></div>
            <div><dt>Channels</dt><dd>{result.header.channelsDescription}</dd></div>
            <div><dt>Colorspace</dt><dd>{result.header.colorspaceDescription}</dd></div>
            <div>
              <dt>End marker</dt>
              <dd>{result.header.endMarkerPresent ? 'Present' : 'Missing or invalid'}</dd>
            </div>
          </dl>
          {result.warnings.length > 0 && (
            <div className="qoi-header-inspector__warnings" role="alert">
              <p>Warnings</p>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
