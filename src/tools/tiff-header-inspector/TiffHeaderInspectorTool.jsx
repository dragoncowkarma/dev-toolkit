import { useRef, useState } from 'react';
import { parseTiffHeader } from './tiff-header-inspector.utils.js';
import './tiff-header-inspector.css';

/**
 * Renders a client-side TIFF header and Image File Directory inspector.
 *
 * @returns {React.JSX.Element} The TIFF inspector UI.
 */
export default function TiffHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      setResult(parseTiffHeader(buffer));
      setFileName(file.name);
      setError('');
    } catch (readError) {
      setResult(null);
      setFileName('');
      setError(
        readError instanceof Error ? readError.message : 'Failed to read the selected file.',
      );
    }
  }

  function handleClear() {
    setResult(null);
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="tiff-inspector" aria-label="TIFF Header Inspector">
      <div className="tiff-inspector__toolbar">
        <label className="tiff-inspector__button">
          Select TIFF file
          <input
            ref={inputRef}
            className="tiff-inspector__file-input"
            type="file"
            accept="image/tiff,.tif,.tiff"
            aria-label="Select a TIFF file to inspect"
            onChange={handleFileChange}
          />
        </label>
        <button type="button" className="tiff-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <p className="tiff-inspector__privacy">
        Files are parsed locally in your browser and never uploaded.
      </p>
      {error && <div className="tiff-inspector__error" role="alert">{error}</div>}

      {result && (
        <div className="tiff-inspector__results">
          <div className="tiff-inspector__summary">
            <p><strong>File:</strong> {fileName}</p>
            <p><strong>Byte order:</strong> {result.byteOrder}</p>
            <p><strong>First IFD offset:</strong> {result.firstIfdOffset}</p>
          </div>
          {result.ifds.map((ifd, index) => (
            <section
              key={ifd.offset}
              className="tiff-inspector__ifd"
              aria-labelledby={`ifd-${index}`}
            >
              <h3 id={`ifd-${index}`}>IFD {index + 1} (offset {ifd.offset})</h3>
              <p>
                {ifd.entryCount} tag{ifd.entryCount === 1 ? '' : 's'}; next IFD:{' '}
                {ifd.nextIfdOffset || 'none'}
              </p>
              <div className="tiff-inspector__table-wrap">
                <table>
                  <caption className="sr-only">Tags in IFD {index + 1}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Tag</th>
                      <th scope="col">Type</th>
                      <th scope="col">Count</th>
                      <th scope="col">Value / offset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ifd.entries.map((entry) => (
                      <tr key={`${entry.tagId}-${entry.typeId}`}>
                        <th scope="row">{entry.tagName} ({entry.tagId})</th>
                        <td>{entry.typeName} ({entry.typeId})</td>
                        <td>{entry.count}</td>
                        <td>
                          {entry.value}
                          {entry.valueOffset !== null && ` (offset ${entry.valueOffset})`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
