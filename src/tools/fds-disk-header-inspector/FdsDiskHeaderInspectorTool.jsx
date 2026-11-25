import { useEffect, useRef, useState } from 'react';
import {
  FDS_BLOCK1_SIZE,
  FWNES_HEADER_SIZE,
  formatByteCount,
  formatHexOffset,
  inspectFdsFile,
} from './fdsDiskHeaderInspector.utils.js';
import './fdsDiskHeaderInspector.css';

function getSideStatus(side) {
  if (!side.isCompleteSide) {
    return { label: 'Truncated side', variant: 'warning' };
  }
  if (side.headerBlockMatched) {
    return { label: 'Block 1 matches', variant: 'success' };
  }
  return { label: 'Block 1 mismatch', variant: 'error' };
}

/**
 * Renders the client-side Famicom Disk System (FDS) header inspector tool.
 *
 * @returns {React.JSX.Element} The FDS disk header inspector UI.
 */
export default function FdsDiskHeaderInspectorTool() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
    };
  }, []);

  async function inspectSelectedFile(selectedFile) {
    if (!selectedFile) return;
    const requestId = (requestIdRef.current += 1);
    setReport(null);
    setIsInspecting(true);
    setError('');

    try {
      const nextReport = await inspectFdsFile(selectedFile);
      if (requestIdRef.current !== requestId) return;
      setReport(nextReport);
      setIsInspecting(false);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setReport(null);
      setError(err?.message || 'Failed to inspect the selected file.');
      setIsInspecting(false);
    }
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    inspectSelectedFile(selected);
  }

  function handleClear() {
    requestIdRef.current += 1;
    setReport(null);
    setError('');
    setIsInspecting(false);
    setIsDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    if (!isDragActive) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsDragActive(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragActive(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) {
      inspectSelectedFile(dropped);
    }
  }

  return (
    <section
      className={`fds-inspector ${isDragActive ? 'fds-inspector--drag' : ''}`}
      aria-label="Famicom Disk System Header Inspector"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="fds-toolbar">
        <div className="fds-toolbar__actions">
          <label className="fds-btn fds-file-btn">
            Select FDS Image
            <input
              ref={fileInputRef}
              type="file"
              accept=".fds,.bin,.img"
              className="fds-file-input"
              onChange={handleFileChange}
              aria-label="Select an FDS disk image file"
            />
          </label>
          <button
            type="button"
            className="fds-btn"
            onClick={handleClear}
            disabled={!report && !error && !isInspecting}
          >
            Clear
          </button>
        </div>
        <p className="fds-toolbar__hint">
          Local only: reads at most {FWNES_HEADER_SIZE} B header + {FDS_BLOCK1_SIZE} B per side.
        </p>
      </div>

      {isInspecting && (
        <div className="fds-status" role="status" aria-live="polite">
          Inspecting disk image…
        </div>
      )}

      {error && (
        <div className="fds-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {!report && !error && !isInspecting && (
        <div className="fds-empty-state">
          <p className="fds-empty-state__title">Select or drop an FDS disk image</p>
          <p className="fds-empty-state__copy">
            Supports raw 65,500-byte-per-side dumps and images with a 16-byte FDS fwNES header.
            Files never leave your browser.
          </p>
        </div>
      )}

      {report && (
        <div className="fds-results">
          <p className="fds-scope-note">{report.scopeNote}</p>

          {report.warnings.length > 0 && (
            <div className="fds-warnings" role="region" aria-label="Inspection notices">
              <h3 className="fds-section-heading">Inspection Notices</h3>
              <ul className="fds-warnings__list">
                {report.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="fds-card">
            <h3 className="fds-section-heading">Image Summary</h3>
            <dl className="fds-meta-grid">
              <div className="fds-meta-item">
                <dt>File Name</dt>
                <dd>{report.fileName}</dd>
              </div>
              <div className="fds-meta-item">
                <dt>File Size</dt>
                <dd>{formatByteCount(report.fileSize)}</dd>
              </div>
              <div className="fds-meta-item">
                <dt>fwNES Header</dt>
                <dd>
                  {report.fwNesHeader.present
                    ? `Present (${FWNES_HEADER_SIZE} B, FDS\\x1A)`
                    : 'Not present (raw image)'}
                </dd>
              </div>
              <div className="fds-meta-item">
                <dt>Header Side Count</dt>
                <dd>
                  {report.fwNesHeader.present
                    ? String(report.fwNesHeader.sideCount)
                    : 'Not present'}
                </dd>
              </div>
              <div className="fds-meta-item">
                <dt>File-Size Side Count</dt>
                <dd>{report.derivedSideCount}</dd>
              </div>
              <div className="fds-meta-item">
                <dt>Trailing Bytes</dt>
                <dd>{formatByteCount(report.trailingBytes)}</dd>
              </div>
            </dl>
          </div>

          <div className="fds-sides">
            <h3 className="fds-section-heading">
              Disk Sides ({report.sides.length} inspected)
            </h3>

            {report.sides.length === 0 ? (
              <div className="fds-card">
                <p className="fds-empty-sides">No disk side blocks found to inspect.</p>
              </div>
            ) : (
              report.sides.map((side) => {
                const status = getSideStatus(side);
                return (
                  <article key={side.sideIndex} className="fds-card fds-side-card">
                    <div className="fds-side-card__header">
                      <div className="fds-side-card__title-group">
                        <h4 className="fds-side-card__title">
                          Side {side.sideIndex + 1}
                          {!side.isCompleteSide ? ' (Incomplete)' : ''}
                        </h4>
                        <span className="fds-side-card__offset">
                          Offset {formatHexOffset(side.offset)}
                        </span>
                      </div>
                      <span className={`fds-badge fds-badge--${status.variant}`}>
                        {status.label}
                      </span>
                    </div>

                    {side.issues.length > 0 && (
                      <ul className="fds-side-issues">
                        {side.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}

                    <dl className="fds-meta-grid">
                      <div className="fds-meta-item">
                        <dt>Block Code (0x00)</dt>
                        <dd>{side.blockCode}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Verification String (0x01-0x0E)</dt>
                        <dd>{side.verificationString}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Maker Code (0x0F)</dt>
                        <dd>{side.makerCode}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Game Name (0x10-0x12)</dt>
                        <dd>{side.gameName}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Game Version (0x14)</dt>
                        <dd>{side.gameVersion}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Side Number (0x15)</dt>
                        <dd>{side.sideNumber}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Disk Number (0x16)</dt>
                        <dd>{side.diskNumber}</dd>
                      </div>
                      <div className="fds-meta-item">
                        <dt>Disk Type (0x17)</dt>
                        <dd>{side.diskType}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
