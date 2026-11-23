import { useRef, useState } from 'react';
import {
  MAX_HEADER_READ_BYTES,
  buildSampleRadianceHdrBytes,
  formatFileSize,
  parseRadianceHdrHeader,
  readLeadingHeaderBytes,
} from './radianceHdrHeaderInspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './radianceHdrHeaderInspector.css';

/**
 * Renders the Radiance HDR Header Inspector tool for parsing and inspecting
 * Radiance .hdr / .pic image headers client-side.
 *
 * @returns {React.JSX.Element} The Radiance HDR Header Inspector UI.
 */
export default function RadianceHdrHeaderInspectorTool() {
  const [fileInfo, setFileInfo] = useState(null);
  const [parsedHeader, setParsedHeader] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);

    try {
      const leadingBytes = await readLeadingHeaderBytes(selected, MAX_HEADER_READ_BYTES);
      // Discard this result if a newer read started or Clear was clicked while in flight.
      if (fileRequestRef.current !== requestId) return;

      const parsed = parseRadianceHdrHeader(leadingBytes);
      setFileInfo({
        name: selected.name,
        size: selected.size,
        inspectedBytes: leadingBytes.length,
      });
      setParsedHeader(parsed);
      setError('');
      setCopyError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setFileInfo({
        name: selected.name,
        size: selected.size,
        inspectedBytes: 0,
      });
      setParsedHeader(null);
      setError(err.message);
      setCopyError('');
    }
  }

  function handleLoadSample(preset = 'rgbe') {
    fileRequestRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const sampleBytes = buildSampleRadianceHdrBytes(preset);
    const parsed = parseRadianceHdrHeader(sampleBytes);
    setFileInfo({
      name: preset === 'xyze' ? 'sample-cie-xyze.hdr' : 'sample-radiance-rgbe.hdr',
      size: sampleBytes.length,
      inspectedBytes: sampleBytes.length,
    });
    setParsedHeader(parsed);
    setError('');
    setCopyError('');
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setFileInfo(null);
    setParsedHeader(null);
    setError('');
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopyJson() {
    if (!parsedHeader) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(parsedHeader, null, 2));
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section
      className="radiance-hdr-tool"
      aria-label="Radiance HDR Header Inspector Tool"
    >
      <div className="radiance-hdr-toolbar">
        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload .hdr File
            <input
              ref={fileInputRef}
              type="file"
              accept=".hdr,.pic,.rgbe,image/vnd.radiance"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload a Radiance HDR file"
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('rgbe')}
          >
            Load RGBE Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => handleLoadSample('xyze')}
          >
            Load XYZE Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>

        {parsedHeader && (
          <div className="toolbar-copy">
            <button
              type="button"
              className="btn copy-btn"
              onClick={handleCopyJson}
            >
              {copied ? '✓ Copied JSON' : 'Copy JSON'}
            </button>
            {copied && (
              <div className="sr-only" role="status" aria-live="polite">
                Copied to clipboard
              </div>
            )}
          </div>
        )}
      </div>

      {fileInfo && (
        <div className="radiance-hdr-file-banner" aria-label="Selected file info">
          <span className="file-banner-name">📁 {fileInfo.name}</span>
          <span className="file-banner-meta">
            Total size: {formatFileSize(fileInfo.size)} · Read header slice:{' '}
            {formatFileSize(fileInfo.inspectedBytes)}
          </span>
        </div>
      )}

      {alertMessage && (
        <div className="radiance-hdr-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {!parsedHeader && !alertMessage && (
        <div className="radiance-hdr-empty">
          <p>
            Select a Radiance <code>.hdr</code> or <code>.pic</code> image file to
            inspect its magic signature, header variables, dimensions, orientation,
            and scanline RLE format. Only the leading header bytes are read.
          </p>
        </div>
      )}

      {parsedHeader && (
        <div className="radiance-hdr-results">
          <div className="radiance-hdr-grid">
            <div className="summary-card">
              <span className="summary-label">Magic Signature</span>
              <strong className="summary-value" data-testid="hdr-magic">
                {parsedHeader.magic}
              </strong>
            </div>

            <div className="summary-card">
              <span className="summary-label">Format</span>
              <strong className="summary-value" data-testid="hdr-format">
                {parsedHeader.format}
              </strong>
              <span className="summary-sub">
                Color Space: {parsedHeader.colorSpace}
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Dimensions (W × H)</span>
              <strong className="summary-value" data-testid="hdr-dimensions">
                {parsedHeader.width} × {parsedHeader.height}
              </strong>
              <span className="summary-sub">
                Header Size: {parsedHeader.headerByteLength} B
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Orientation</span>
              <strong className="summary-value" data-testid="hdr-orientation">
                {parsedHeader.orientation}
              </strong>
              <span className="summary-sub">
                {parsedHeader.orientationDescription}
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Scanline Encoding</span>
              <strong className="summary-value" data-testid="hdr-scanline-encoding">
                {parsedHeader.scanlineEncoding}
              </strong>
              <span className="summary-sub">
                {parsedHeader.scanlineCount} scanlines × {parsedHeader.scanlineLength} px
              </span>
            </div>

            <div className="summary-card">
              <span className="summary-label">Exposure / Aspect</span>
              <strong className="summary-value" data-testid="hdr-exposure">
                {parsedHeader.exposure}
              </strong>
              <span className="summary-sub">
                Pixel Aspect: {parsedHeader.pixelAspect}
              </span>
            </div>
          </div>

          <div className="radiance-hdr-panels">
            <div className="panel">
              <h3 className="panel-title">Header Variables</h3>
              <dl className="metadata-list">
                <div className="metadata-item">
                  <dt>Resolution String</dt>
                  <dd data-testid="hdr-resolution-line">{parsedHeader.resolutionLine}</dd>
                </div>
                {parsedHeader.software && (
                  <div className="metadata-item">
                    <dt>SOFTWARE</dt>
                    <dd data-testid="hdr-software">{parsedHeader.software}</dd>
                  </div>
                )}
                {parsedHeader.colorCorr && (
                  <div className="metadata-item">
                    <dt>COLORCORR</dt>
                    <dd data-testid="hdr-colorcorr">
                      {parsedHeader.colorCorr.join(' ')}
                    </dd>
                  </div>
                )}
                {parsedHeader.primaries && (
                  <div className="metadata-item">
                    <dt>PRIMARIES</dt>
                    <dd data-testid="hdr-primaries">
                      {parsedHeader.primaries.join(' ')}
                    </dd>
                  </div>
                )}
                {parsedHeader.view && (
                  <div className="metadata-item">
                    <dt>VIEW</dt>
                    <dd>{parsedHeader.view}</dd>
                  </div>
                )}
                {parsedHeader.variables.map((variable, index) => (
                  <div className="metadata-item" key={`${variable.key}-${index}`}>
                    <dt>{variable.key}</dt>
                    <dd>{variable.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="panel">
              <h3 className="panel-title">Comments &amp; History</h3>
              {parsedHeader.comments.length > 0 ? (
                <ul className="comments-list" aria-label="Header comments">
                  {parsedHeader.comments.map((comment, idx) => (
                    <li key={idx} className="comment-item">
                      {comment}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-note">No comments present in header.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
