import { useRef, useState } from 'react';
import { parseBzip2Header } from './bzip2-header.utils.js';
import './bzip2-header-inspector.css';

/**
 * Renders a local-only inspector for BZip2 stream headers.
 *
 * @returns {React.JSX.Element} The BZip2 header inspector UI.
 */
export default function Bzip2HeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [inspection, setInspection] = useState(null);
  const requestIdRef = useRef(0);

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const requestId = (requestIdRef.current += 1);
    setFileName(selectedFile.name);
    try {
      const buffer = await selectedFile.arrayBuffer();
      if (requestId !== requestIdRef.current) return;
      setInspection(parseBzip2Header(buffer));
    } catch {
      if (requestId !== requestIdRef.current) return;
      setInspection({
        blockSize: null,
        marker: null,
        warnings: ['The selected file could not be read.'],
      });
    }
  }

  return (
    <section className="bzip2-header-inspector" aria-label="BZip2 Header Inspector">
      <p className="bzip2-header-inspector__intro">
        Inspect BZip2 stream headers entirely in your browser. Selected bytes never leave your
        device.
      </p>
      <label className="bzip2-header-inspector__upload" htmlFor="bzip2-file-input">
        Select BZip2 file
      </label>
      <input
        id="bzip2-file-input"
        type="file"
        accept=".bz2,application/x-bzip2"
        onChange={handleFileChange}
      />

      {fileName && (
        <p className="bzip2-header-inspector__file-name">Inspecting: {fileName}</p>
      )}

      {inspection && (
        <div className="bzip2-header-inspector__results">
          <dl>
            <div>
              <dt>Block size</dt>
              <dd>{inspection.blockSize ? `${inspection.blockSize}00 KB` : 'Unavailable'}</dd>
            </div>
            <div>
              <dt>Initial stream marker</dt>
              <dd>{inspection.marker ?? 'Unavailable'}</dd>
            </div>
          </dl>
          {inspection.warnings.map((warning) => (
            <p key={warning} className="bzip2-header-inspector__warning" role="alert">
              {warning}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
