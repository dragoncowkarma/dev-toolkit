import { useRef, useState } from 'react';
import { formatByteSize, parseIco } from './icoInspector.utils.js';
import './icoInspector.css';

/**
 * Renders a local-only Windows ICO directory and image-header inspector.
 *
 * @returns {React.JSX.Element} The ICO inspector interface.
 */
export default function IcoInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.ico')) {
      setError('Choose a Windows .ico file.');
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      setResult(parseIco(buffer));
      setFileName(file.name);
      setError('');
    } catch {
      setResult(null);
      setError('The selected file could not be read.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleClear() {
    setResult(null);
    setFileName('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <section className="ico-inspector" aria-label="ICO Icon Inspector">
      <div
        className="ico-inspector__dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <p>Drop a Windows .ico file here, or choose one to inspect locally.</p>
        <label className="ico-inspector__button">
          Choose ICO file
          <input
            ref={inputRef}
            type="file"
            accept=".ico,image/x-icon,image/vnd.microsoft.icon"
            onChange={(event) => inspectFile(event.target.files?.[0])}
            aria-label="Choose ICO file"
          />
        </label>
      </div>

      {error && (
        <p className="ico-inspector__error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="ico-inspector__results">
          <div className="ico-inspector__heading">
            <div>
              <p className="ico-inspector__eyebrow">Local inspection</p>
              <h2>{fileName}</h2>
            </div>
            <button type="button" className="ico-inspector__clear" onClick={handleClear}>
              Clear
            </button>
          </div>

          {result.header && (
            <dl className="ico-inspector__header">
              <div>
                <dt>Reserved</dt>
                <dd>{result.header.reserved}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{result.header.type}</dd>
              </div>
              <div>
                <dt>Image count</dt>
                <dd>{result.header.imageCount}</dd>
              </div>
            </dl>
          )}

          {result.warnings.length > 0 && (
            <div className="ico-inspector__warnings" role="alert">
              <strong>Warnings</strong>
              <ul>
                {result.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.images.length > 0 && (
            <div className="ico-inspector__table-wrap">
              <table>
                <caption>Embedded images</caption>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Dimensions</th>
                    <th>Colors</th>
                    <th>Planes</th>
                    <th>Bit depth</th>
                    <th>Format</th>
                    <th>Byte size</th>
                    <th>Offset</th>
                  </tr>
                </thead>
                <tbody>
                  {result.images.map((image) => (
                    <tr key={image.index}>
                      <td>{image.index}</td>
                      <td>{image.width} &times; {image.height}</td>
                      <td>{image.colorCount}</td>
                      <td>{image.planes}</td>
                      <td>{image.bitDepth}</td>
                      <td>{image.format}</td>
                      <td>{formatByteSize(image.sizeInBytes)}</td>
                      <td>{image.offset}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.images.filter((image) => image.bitmapHeader).map((image) => (
            <section className="ico-inspector__dib" key={`dib-${image.index}`}>
              <h3>Image {image.index} BITMAPINFOHEADER</h3>
              <dl>
                <div>
                  <dt>Width</dt>
                  <dd>{image.bitmapHeader.width}</dd>
                </div>
                <div>
                  <dt>Height</dt>
                  <dd>{image.bitmapHeader.height}</dd>
                </div>
                <div>
                  <dt>Bit depth</dt>
                  <dd>{image.bitmapHeader.bitDepth}</dd>
                </div>
                <div>
                  <dt>Compression</dt>
                  <dd>{image.bitmapHeader.compressionName}</dd>
                </div>
              </dl>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
