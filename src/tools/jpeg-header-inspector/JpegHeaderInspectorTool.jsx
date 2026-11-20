import { useRef, useState } from 'react';
import {
  createSampleJpeg,
  formatFileSize,
  parseJpeg,
  readJpegFile,
} from './jpeg.utils.js';
import './jpeg-header-inspector.css';

/**
 * Formats segment decoded details into a readable string.
 * @param {object} segment
 * @returns {string}
 */
function formatSegmentDetails(segment) {
  if (!segment.details) {
    return segment.description ?? '';
  }
  const { details } = segment;
  if (details.jfifVersion) {
    return `v${details.jfifVersion}, ${details.xDensity} × ${details.yDensity} ` +
      `(${details.densityUnitsLabel})`;
  }
  if (details.width && details.height) {
    return `${details.width} × ${details.height} px, ${details.precision}-bit, ` +
      `${details.componentCount} comp`;
  }
  if (details.comment) {
    return `"${details.comment}"`;
  }
  if (details.identifier) {
    return details.identifier;
  }
  if (details.componentCount !== undefined) {
    return `${details.componentCount} component(s)`;
  }
  return segment.description ?? '';
}

/**
 * Renders the JPEG Header Inspector tool.
 *
 * @returns {React.JSX.Element} The inspector component.
 */
export default function JpegHeaderInspectorTool() {
  const [fileInfo, setFileInfo] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);
  const requestIdRef = useRef(0);

  async function handleFileChange(event) {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const requestId = (requestIdRef.current += 1);
    setIsLoading(true);
    setError('');

    try {
      const buffer = await readJpegFile(selectedFile);
      if (requestIdRef.current !== requestId) return;

      const parsed = parseJpeg(buffer);
      setFileInfo({
        name: selectedFile.name,
        size: selectedFile.size,
      });
      setResult(parsed);
      setError('');
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setResult(null);
      setFileInfo(null);
      setError(err.message || 'Failed to parse JPEG file.');
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }

  function handleLoadSample() {
    requestIdRef.current += 1;
    setIsLoading(false);
    try {
      const buffer = createSampleJpeg();
      const parsed = parseJpeg(buffer);
      setFileInfo({
        name: 'sample.jpg',
        size: buffer.byteLength,
      });
      setResult(parsed);
      setError('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setResult(null);
      setError(err.message || 'Failed to load sample JPEG.');
    }
  }

  function handleClear() {
    requestIdRef.current += 1;
    setIsLoading(false);
    setFileInfo(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const hasContent = Boolean(fileInfo || result || error || isLoading);

  return (
    <section className="jpeg-tool" aria-label="JPEG Header Inspector Tool">
      <div className="jpeg-toolbar">
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Select JPEG File
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,image/jpeg"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Select JPEG File"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={handleLoadSample}
          >
            Load Sample JPEG
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
            disabled={!hasContent}
          >
            Clear
          </button>
        </div>
      </div>

      {error && (
        <div className="jpeg-alert" role="alert">
          {error}
        </div>
      )}

      {result && fileInfo && (
        <>
          <div className="jpeg-summary-card" aria-label="JPEG Summary">
            <div className="summary-item">
              <span className="summary-label">File</span>
              <span className="summary-value" title={fileInfo.name}>
                {fileInfo.name} ({formatFileSize(fileInfo.size)})
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Dimensions</span>
              <span className="summary-value">
                {result.imageInfo.width && result.imageInfo.height
                  ? `${result.imageInfo.width} × ${result.imageInfo.height} px`
                  : 'N/A'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">JFIF Density</span>
              <span className="summary-value">
                {result.imageInfo.density || 'None'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Segments</span>
              <span className="summary-value">
                {result.segmentCount} segments
              </span>
            </div>
          </div>

          <div className="jpeg-table-container">
            <table className="jpeg-table" aria-label="JPEG Segments Table">
              <thead>
                <tr>
                  <th scope="col">Marker</th>
                  <th scope="col">Name</th>
                  <th scope="col">Offset</th>
                  <th scope="col">Length</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {result.segments.map((seg, idx) => (
                  <tr key={`${seg.code}-${seg.offset}-${idx}`}>
                    <td>
                      <span className="marker-badge">{seg.code}</span>
                    </td>
                    <td>
                      <strong>{seg.name}</strong>
                    </td>
                    <td className="mono-text">
                      0x{seg.offset.toString(16).toUpperCase().padStart(4, '0')}
                      {' '}({seg.offset})
                    </td>
                    <td className="mono-text">
                      {seg.length > 0 ? `${seg.length} B` : '-'}
                    </td>
                    <td className="details-tag">
                      {formatSegmentDetails(seg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!result && !error && (
        <div className="jpeg-empty-state">
          <div className="jpeg-empty-icon" aria-hidden="true">
            🖼
          </div>
          <p>
            Select a local JPEG image or load the sample above to parse
            and inspect its segment markers, JFIF metadata, and frame headers.
          </p>
        </div>
      )}
    </section>
  );
}
