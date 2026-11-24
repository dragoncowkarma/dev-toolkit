import { useRef, useState } from 'react';
import {
  formatFileSize,
  parseJaguarRomHeader,
  readFileHeader,
} from './atari-jaguar-rom-header-inspector.utils.js';
import './atari-jaguar-rom-header-inspector.css';

/**
 * Atari Jaguar ROM Header Inspector tool component.
 *
 * @returns {React.JSX.Element}
 */
export default function AtariJaguarRomHeaderInspectorTool() {
  const [file, setFile] = useState(null);
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;

    const requestId = ++fileRequestRef.current;
    try {
      const bytes = await readFileHeader(selected);
      if (fileRequestRef.current !== requestId) return;
      const parsed = parseJaguarRomHeader(bytes, selected.size);
      setFile(selected);
      setHeader(parsed);
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setFile(selected);
      setHeader(null);
      setError(err.message || 'Failed to inspect file.');
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setFile(null);
    setHeader(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <section
      className="jaguar-header-inspector"
      aria-label="Atari Jaguar ROM Header Inspector"
    >
      <div className="jaguar-header-inspector__upload">
        <label className="jaguar-header-inspector__file-btn">
          Select Jaguar ROM File
          <input
            ref={fileInputRef}
            type="file"
            className="jaguar-header-inspector__file-input"
            onChange={handleFileChange}
            aria-label="Upload Atari Jaguar ROM"
          />
        </label>
        <p>Upload a .jag, .j64, or .rom cartridge image (client-side only).</p>
      </div>

      {error && (
        <div className="jaguar-header-inspector__alert" role="alert">
          {error}
        </div>
      )}

      {header && (
        <div className="jaguar-header-inspector__results">
          <div className="jaguar-header-inspector__actions">
            <button
              type="button"
              className="jaguar-header-inspector__btn-clear"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>

          <dl className="jaguar-header-inspector__details">
            <div>
              <dt>Header Marker</dt>
              <dd>{header.marker}</dd>
            </div>
            <div>
              <dt>Boot Address</dt>
              <dd>{header.bootAddressHex}</dd>
            </div>
            <div>
              <dt>ROM Size Field</dt>
              <dd>{header.romSizeFormatted}</dd>
            </div>
            <div>
              <dt>Detected ROM Size Class</dt>
              <dd>{header.sizeClass}</dd>
            </div>
            {file && (
              <div>
                <dt>File Name</dt>
                <dd>{file.name}</dd>
              </div>
            )}
            {file && (
              <div>
                <dt>File Size</dt>
                <dd>{formatFileSize(file.size)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
