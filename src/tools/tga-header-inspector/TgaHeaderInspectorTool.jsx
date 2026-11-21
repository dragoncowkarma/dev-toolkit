import { useRef, useState } from 'react';
import { formatFileSize, parseTgaHeader } from './tga-header-inspector.utils.js';
import './tga-header-inspector.css';

const ACCEPTED_EXTENSIONS = '.tga,.icb,.vda,.vst';
const ACCEPTED_TYPES = 'image/x-tga';

/**
 * Renders the TGA (Truevision TARGA) header inspector tool with a drag-and-drop
 * dropzone and file picker. All parsing happens locally in the browser.
 *
 * @returns {React.JSX.Element} The TGA header inspector UI.
 */
export default function TgaHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  async function handleFiles(fileList) {
    const file = fileList?.[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    setResult(null);
    setError('');

    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseTgaHeader(buffer);
      setResult(parsed);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleInputChange(event) {
    handleFiles(event.target.files);
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  }

  function handleDropzoneKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function handleClear() {
    setFileName('');
    setFileSize(0);
    setResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <section className="tga-header-inspector-tool" aria-label="TGA Header Inspector Tool">
      <div
        className={`tga-dropzone ${isDragging ? 'dragging' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Upload a TGA file by clicking or dragging and dropping it here"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleDropzoneKeyDown}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="tga-dropzone-text">
          Drag and drop a <strong>.tga</strong>, <strong>.icb</strong>, <strong>.vda</strong>,{' '}
          or <strong>.vst</strong> file here, or click to browse.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          className="tga-file-input"
          accept={`${ACCEPTED_EXTENSIONS},${ACCEPTED_TYPES}`}
          onChange={handleInputChange}
          aria-label="Choose a TGA file to inspect"
        />
      </div>

      {fileName && (
        <div className="tga-file-meta">
          <span>
            📄 {fileName} ({formatFileSize(fileSize)})
          </span>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="tga-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {result && (
        <div className="tga-results">
          {result.warnings.length > 0 && (
            <div className="tga-warning" role="alert">
              {result.warnings.map((warning) => (
                <p key={warning}>⚠ {warning}</p>
              ))}
            </div>
          )}

          <div className="tga-field-group">
            <h3 className="tga-group-title">Header</h3>
            <dl className="tga-field-list">
              <div className="tga-field">
                <dt>ID Length</dt>
                <dd>{result.header.idLength} byte(s)</dd>
              </div>
              {result.header.imageId && (
                <div className="tga-field">
                  <dt>Image ID</dt>
                  <dd>{result.header.imageId}</dd>
                </div>
              )}
              <div className="tga-field">
                <dt>Color Map Type</dt>
                <dd>
                  {result.header.colorMapType.label} ({result.header.colorMapType.value})
                </dd>
              </div>
              <div className="tga-field">
                <dt>Image Type</dt>
                <dd>
                  {result.header.imageType.label} ({result.header.imageType.value})
                </dd>
              </div>
            </dl>
          </div>

          <div className="tga-field-group">
            <h3 className="tga-group-title">Color Map Specification</h3>
            <dl className="tga-field-list">
              <div className="tga-field">
                <dt>First Entry Index</dt>
                <dd>{result.header.colorMap.firstEntryIndex}</dd>
              </div>
              <div className="tga-field">
                <dt>Length</dt>
                <dd>{result.header.colorMap.length} entries</dd>
              </div>
              <div className="tga-field">
                <dt>Entry Size</dt>
                <dd>{result.header.colorMap.entrySize} bits</dd>
              </div>
            </dl>
          </div>

          <div className="tga-field-group">
            <h3 className="tga-group-title">Image Specification</h3>
            <dl className="tga-field-list">
              <div className="tga-field">
                <dt>Origin</dt>
                <dd>
                  ({result.header.image.xOrigin}, {result.header.image.yOrigin})
                </dd>
              </div>
              <div className="tga-field">
                <dt>Dimensions</dt>
                <dd>
                  {result.header.image.width} × {result.header.image.height} px
                </dd>
              </div>
              <div className="tga-field">
                <dt>Pixel Depth</dt>
                <dd>{result.header.image.pixelDepth} bpp</dd>
              </div>
              <div className="tga-field">
                <dt>Alpha/Attribute Bits</dt>
                <dd>{result.header.image.descriptor.alphaBits}</dd>
              </div>
              <div className="tga-field">
                <dt>Screen Origin</dt>
                <dd>
                  {result.header.image.descriptor.horizontalOrigin}/
                  {result.header.image.descriptor.verticalOrigin}
                </dd>
              </div>
              <div className="tga-field">
                <dt>Interleaving</dt>
                <dd>{result.header.image.descriptor.interleaving}</dd>
              </div>
            </dl>
          </div>

          <div className="tga-field-group">
            <h3 className="tga-group-title">TGA 2.0 Footer</h3>
            {result.footer ? (
              <dl className="tga-field-list">
                <div className="tga-field">
                  <dt>Extension Area Offset</dt>
                  <dd>{result.footer.extensionAreaOffset}</dd>
                </div>
                <div className="tga-field">
                  <dt>Developer Directory Offset</dt>
                  <dd>{result.footer.developerDirectoryOffset}</dd>
                </div>
                {result.footer.extensionArea && (
                  <>
                    {result.footer.extensionArea.authorName && (
                      <div className="tga-field">
                        <dt>Author</dt>
                        <dd>{result.footer.extensionArea.authorName}</dd>
                      </div>
                    )}
                    {result.footer.extensionArea.comments.length > 0 && (
                      <div className="tga-field">
                        <dt>Comments</dt>
                        <dd>{result.footer.extensionArea.comments.join(' ')}</dd>
                      </div>
                    )}
                    {result.footer.extensionArea.timestamp && (
                      <div className="tga-field">
                        <dt>Timestamp</dt>
                        <dd>
                          {result.footer.extensionArea.timestamp.year}-
                          {result.footer.extensionArea.timestamp.month}-
                          {result.footer.extensionArea.timestamp.day}{' '}
                          {result.footer.extensionArea.timestamp.hour}:
                          {result.footer.extensionArea.timestamp.minute}:
                          {result.footer.extensionArea.timestamp.second}
                        </dd>
                      </div>
                    )}
                    {result.footer.extensionArea.aspectRatio && (
                      <div className="tga-field">
                        <dt>Pixel Aspect Ratio</dt>
                        <dd>{result.footer.extensionArea.aspectRatio.value.toFixed(3)}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            ) : (
              <p className="tga-footer-absent">No TGA 2.0 footer detected (legacy TGA file).</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
