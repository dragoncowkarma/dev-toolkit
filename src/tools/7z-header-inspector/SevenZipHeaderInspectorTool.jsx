import { useRef, useState } from 'react';
import { parse7zSignatureHeader } from './7z-header-inspector.utils.js';
import './7z-header-inspector.css';

const DETAIL_ROWS = [
  ['Format version', 'version'],
  ['Start header CRC32 (declared)', 'declaredStartHeaderCrc32'],
  ['Start header CRC32 (validated)', 'computedStartHeaderCrc32'],
  ['Next-header offset', 'nextHeaderOffset'],
  ['Next-header size', 'nextHeaderSize'],
  ['Next-header CRC32', 'nextHeaderCrc32'],
];

function readFileAsArrayBuffer(file) {
  if (typeof file.arrayBuffer === 'function') {
    return file.arrayBuffer();
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Renders a local-only inspector for the fixed 7-Zip signature header.
 *
 * @returns {React.JSX.Element} The 7-Zip header inspector UI.
 */
export default function SevenZipHeaderInspectorTool() {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const requestIdRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = (requestIdRef.current += 1);
    setDetails(null);
    setError('');
    setFileName(file.name);
    try {
      const buffer = await readFileAsArrayBuffer(file);
      if (requestIdRef.current !== requestId) return;
      setDetails(parse7zSignatureHeader(buffer));
    } catch (parseError) {
      if (requestIdRef.current !== requestId) return;
      setError(parseError.message || 'Unable to inspect the selected file.');
    }
  }

  return (
    <section className="seven-zip-header-inspector" aria-label="7-Zip Header Inspector">
      <label className="seven-zip-header-inspector__upload">
        Choose a 7z file
        <input
          type="file"
          accept=".7z,application/x-7z-compressed"
          className="seven-zip-header-inspector__file-input"
          aria-label="Choose a 7z file to inspect"
          onChange={handleFileChange}
        />
      </label>

      <p className="seven-zip-header-inspector__notice">
        Files are inspected locally in your browser. This tool reads only the 32-byte signature
        header and does not decompress the archive.
      </p>

      {error && (
        <div className="seven-zip-header-inspector__error" role="alert">
          {error}
        </div>
      )}

      {details && (
        <>
          <h2>{fileName}</h2>
          <dl className="seven-zip-header-inspector__details">
            {DETAIL_ROWS.map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{details[key]}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}
