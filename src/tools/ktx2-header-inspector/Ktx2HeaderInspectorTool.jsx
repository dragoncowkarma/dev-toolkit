import { useRef, useState } from 'react';
import {
  createKtx2Buffer,
  formatFileSize,
  parseKtx2Header,
  readFileAsArrayBuffer,
} from './ktx2.utils.js';
import './ktx2-header-inspector.css';

/**
 * Client-side KTX2 Header Inspector component.
 * Parses Khronos KTX2 texture container headers and level indices entirely in-browser.
 *
 * @returns {React.JSX.Element} The KTX2 Header Inspector UI.
 */
export default function Ktx2HeaderInspectorTool() {
  const [data, setData] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  /**
   * Processes a File or Blob, parses the header and updates state.
   * @param {File|Blob} file
   * @param {string} [customName]
   */
  async function inspectFile(file, customName) {
    if (!file) {
      setError('Missing file: no file selected.');
      return;
    }

    try {
      const buffer = await readFileAsArrayBuffer(file);
      const parsed = parseKtx2Header(buffer);
      const name = customName || file.name || 'texture.ktx2';
      const sizeStr = formatFileSize(file.size ?? buffer.byteLength);

      setData(parsed);
      setFileInfo({ name, size: sizeStr, byteLength: buffer.byteLength });
      setError('');
      setStatus(`Loaded and parsed ${name} (${sizeStr}) successfully.`);
    } catch (err) {
      setData(null);
      setFileInfo(null);
      setError(err.message);
      setStatus('');
    }
  }

  function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      inspectFile(file);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      inspectFile(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleLoadSample() {
    const sampleBuffer = createKtx2Buffer({
      vkFormat: 37,
      pixelWidth: 1024,
      pixelHeight: 1024,
      pixelDepth: 0,
      layerCount: 0,
      faceCount: 1,
      levelCount: 3,
      supercompressionScheme: 1,
      dfdByteOffset: 152,
      dfdByteLength: 44,
      kvdByteOffset: 196,
      kvdByteLength: 28,
      sgdByteOffset: 224n,
      sgdByteLength: 64n,
      extraBytes: 2048,
    });
    const blob = new Blob([sampleBuffer], { type: 'image/ktx2' });
    inspectFile(blob, 'sample_texture.ktx2');
  }

  function handleClear() {
    setData(null);
    setFileInfo(null);
    setError('');
    setStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="ktx2-inspector" aria-label="KTX2 Header Inspector">
      <div className="ktx2-toolbar">
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>KTX2 Header Inspector</h2>
        </div>
        <div className="ktx2-toolbar-actions">
          <label className="ktx2-btn ktx2-file-btn">
            Choose KTX2 File
            <input
              ref={fileInputRef}
              type="file"
              accept=".ktx2,image/ktx2,application/octet-stream"
              aria-label="Upload KTX2 file"
              className="ktx2-file-input"
              onChange={handleFileInputChange}
            />
          </label>
          <button type="button" className="ktx2-btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button
            type="button"
            className="ktx2-btn"
            onClick={handleClear}
            disabled={!data && !error && !fileInfo}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        className={`ktx2-dropzone ${isDragging ? 'active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Drop KTX2 file here or click to browse"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <span className="ktx2-dropzone-icon" aria-hidden="true">
          📦
        </span>
        <span className="ktx2-dropzone-title">
          {fileInfo ? fileInfo.name : 'Drop a KTX2 texture container here'}
        </span>
        <span className="ktx2-dropzone-subtitle">
          {fileInfo
            ? `Size: ${fileInfo.size} — click or drop another to replace`
            : 'or click to browse local files (parsed client-side only)'}
        </span>
      </div>

      {status && (
        <div role="status" className="ktx2-status">
          {status}
        </div>
      )}

      {error && (
        <div role="alert" className="ktx2-alert">
          <strong>Error: </strong>
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="ktx2-section" aria-labelledby="ktx2-header-overview">
            <h3 id="ktx2-header-overview" className="ktx2-section-title">
              Header Overview &amp; Format
            </h3>
            <dl className="ktx2-grid">
              <div className="ktx2-card">
                <dt>Vulkan Format</dt>
                <dd>{data.vkFormatName}</dd>
              </div>
              <div className="ktx2-card">
                <dt>vkFormat ID</dt>
                <dd>{data.vkFormat}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Dimensions</dt>
                <dd>
                  {data.pixelWidth} × {data.pixelHeight} × {data.pixelDepth || 1}
                </dd>
              </div>
              <div className="ktx2-card">
                <dt>Dimensionality</dt>
                <dd>{data.dimensionality}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Texture Type</dt>
                <dd>
                  {data.isCubeMap
                    ? 'Cube Map'
                    : data.isArray
                      ? 'Array Texture'
                      : `${data.dimensionality} Texture`}
                </dd>
              </div>
              <div className="ktx2-card">
                <dt>Cube Map</dt>
                <dd>{data.isCubeMap ? 'Yes (6 faces)' : 'No'}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Array Texture</dt>
                <dd>{data.isArray ? `Yes (${data.layerCount} layers)` : 'No'}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Type Size</dt>
                <dd>{data.typeSize} byte(s)</dd>
              </div>
              <div className="ktx2-card">
                <dt>Mip Level Count</dt>
                <dd>{data.levelCount}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Supercompression</dt>
                <dd>{data.supercompressionSchemeName}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Scheme ID</dt>
                <dd>{data.supercompressionScheme}</dd>
              </div>
              <div className="ktx2-card">
                <dt>Face Count</dt>
                <dd>{data.faceCount}</dd>
              </div>
            </dl>
          </section>

          <section className="ktx2-section" aria-labelledby="ktx2-index-section">
            <h3 id="ktx2-index-section" className="ktx2-section-title">
              Index Section Offsets &amp; Lengths
            </h3>
            <dl className="ktx2-grid">
              <div className="ktx2-card">
                <dt>DFD Offset</dt>
                <dd>{data.dfdByteOffset}</dd>
              </div>
              <div className="ktx2-card">
                <dt>DFD Length</dt>
                <dd>{data.dfdByteLength} bytes</dd>
              </div>
              <div className="ktx2-card">
                <dt>KVD Offset</dt>
                <dd>{data.kvdByteOffset}</dd>
              </div>
              <div className="ktx2-card">
                <dt>KVD Length</dt>
                <dd>{data.kvdByteLength} bytes</dd>
              </div>
              <div className="ktx2-card">
                <dt>SGD Offset (64-bit)</dt>
                <dd>{data.sgdByteOffset.toString()}</dd>
              </div>
              <div className="ktx2-card">
                <dt>SGD Length (64-bit)</dt>
                <dd>{data.sgdByteLength.toString()} bytes</dd>
              </div>
            </dl>
          </section>

          <section className="ktx2-section" aria-labelledby="ktx2-levels-title">
            <h3 id="ktx2-levels-title" className="ktx2-section-title">
              Mipmap Level Index
            </h3>
            <div className="ktx2-table-wrapper">
              <table className="ktx2-table" aria-label="Mipmap Level Index Table">
                <caption>
                  {data.levels.length} {data.levels.length === 1 ? 'level' : 'levels'} listed in
                  level index
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Level</th>
                    <th scope="col">Byte Offset</th>
                    <th scope="col">Byte Length</th>
                    <th scope="col">Uncompressed Length</th>
                    <th scope="col">Bounds Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.levels.map((lvl) => (
                    <tr key={lvl.level}>
                      <th scope="row">Level {lvl.level}</th>
                      <td>{lvl.byteOffset.toString()}</td>
                      <td>{lvl.byteLength.toString()}</td>
                      <td>{lvl.uncompressedByteLength.toString()}</td>
                      <td>
                        {lvl.isOutOfBounds ? (
                          <span className="ktx2-badge ktx2-badge-error">
                            Out of bounds
                          </span>
                        ) : (
                          <span className="ktx2-badge ktx2-badge-ok">In bounds</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
