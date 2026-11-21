import { useRef, useState } from 'react';
import { formatCrc32, formatUint64, parse7zSignatureHeader } from './sevenZip.utils.js';
import './sevenZipInspector.css';

/**
 * Renders a client-side inspector for the fixed plaintext 7-Zip signature header.
 *
 * @returns {React.JSX.Element} The 7-Zip signature-header inspector.
 */
export default function SevenZipInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = (requestRef.current += 1);
    setResult(null);
    setError('');
    setFileName(file.name);

    try {
      const header = parse7zSignatureHeader(await file.arrayBuffer());
      if (requestRef.current !== requestId) return;
      setResult(header);
      if (!header.is7z || header.byteLength < 32) {
        setError('This file does not contain a complete valid 7z signature header.');
      }
    } catch {
      if (requestRef.current !== requestId) return;
      setError('The selected file could not be read. Please choose another file.');
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="seven-zip-inspector" aria-label="7-Zip Archive Header Inspector">
      <div className="seven-zip-inspector__actions">
        <label className="seven-zip-inspector__upload">
          Choose 7z File
          <input
            ref={fileInputRef}
            type="file"
            accept=".7z,application/x-7z-compressed"
            onChange={handleFileChange}
            aria-label="Choose a 7z archive to inspect"
          />
        </label>
        <button type="button" onClick={handleClear} disabled={!result && !fileName}>
          Clear
        </button>
      </div>

      {fileName && <p className="seven-zip-inspector__filename">Selected file: {fileName}</p>}
      {error && <p className="seven-zip-inspector__error" role="alert">{error}</p>}

      {result && (
        <div className="seven-zip-inspector__results">
          <dl>
            <ResultRow label="Signature" value={result.is7z ? 'Valid 7z magic' : 'Invalid'} />
            <ResultRow label="Archive version" value={result.version ?? 'Unavailable'} />
            <ResultRow label="StartHeader CRC" value={formatCrc32(result.startHeaderCrc)} />
            <ResultRow label="NextHeaderOffset" value={formatUint64(result.nextHeaderOffset)} />
            <ResultRow label="NextHeaderSize" value={formatUint64(result.nextHeaderSize)} />
            <ResultRow label="NextHeader CRC" value={formatCrc32(result.nextHeaderCrc)} />
            <ResultRow
              label="Next header range"
              value={formatRangeStatus(result.nextHeaderFits)}
            />
          </dl>

          {result.warnings.length > 0 && (
            <div className="seven-zip-inspector__warnings" role="status">
              <h2>Warnings</h2>
              <ul>{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ResultRow({ label, value }) {
  return <><dt>{label}</dt><dd>{value}</dd></>;
}

function formatRangeStatus(nextHeaderFits) {
  if (nextHeaderFits === null) return 'Unavailable';
  return nextHeaderFits ? 'Within file bounds' : 'Exceeds file bounds';
}
