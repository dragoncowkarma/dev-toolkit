import { useRef, useState } from 'react';
import { parseSnappyFramedStream, readSnappyFile } from './snappyFramed.utils.js';
import './snappyFramedInspector.css';

/**
 * Renders a local-only inspector for Snappy framed stream containers.
 *
 * @returns {React.JSX.Element} The Snappy framed stream inspector.
 */
export default function SnappyFramedInspector() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const requestId = (requestRef.current += 1);
    setFileName(file.name);
    setResult(null);
    setError('');
    try {
      const bytes = await readSnappyFile(file);
      if (requestRef.current !== requestId) return;
      setResult(parseSnappyFramedStream(bytes));
    } catch (readError) {
      if (requestRef.current !== requestId) return;
      setError(readError.message || 'Unable to read the selected file.');
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setFileName('');
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="snappy-inspector" aria-label="Snappy Framed Stream Inspector">
      <div className="snappy-inspector__intro">
        <p>
          Inspect local Snappy framed streams only.{' '}
          Chunk payloads are never decompressed or uploaded.
        </p>
        <div className="snappy-inspector__actions">
          <label className="snappy-inspector__button">
            Choose stream file
            <input
              ref={fileInputRef}
              className="snappy-inspector__file-input"
              type="file"
              aria-label="Choose a Snappy framed stream file"
              onChange={handleFileChange}
            />
          </label>
          <button type="button" className="snappy-inspector__button" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {fileName && <p className="snappy-inspector__filename">File: {fileName}</p>}
      {error && <div className="snappy-inspector__error" role="alert">{error}</div>}

      {result && (
        <div className="snappy-inspector__results">
          <p>{result.fileSize} bytes · {result.chunks.length} chunks</p>
          <div className="snappy-inspector__table-wrap">
            <table>
              <caption className="sr-only">Snappy framed stream chunks</caption>
              <thead>
                <tr>
                  <th scope="col">Chunk</th>
                  <th scope="col">Type</th>
                  <th scope="col">Offset</th>
                  <th scope="col">Length</th>
                  <th scope="col">Masked CRC-32C</th>
                </tr>
              </thead>
              <tbody>
                {result.chunks.map((chunk) => (
                  <tr key={`${chunk.offset}-${chunk.type}`}>
                    <td>{chunk.label}</td>
                    <td>0x{chunk.type.toString(16).padStart(2, '0')}</td>
                    <td>{chunk.offset}</td>
                    <td>{chunk.length}</td>
                    <td>{chunk.crc32c || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
