import { useRef, useState } from 'react';
import {
  MAX_INSPECT_BYTES,
  createSampleJffs2Image,
  formatByteSize,
  formatHex,
  inspectJffs2File,
  parseJffs2Nodes,
} from './jffs2.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './jffs2.css';

function formatByteOrderLabel(byteOrder) {
  if (byteOrder === 'little') {
    return 'Little-endian (0x1985)';
  }
  if (byteOrder === 'big') {
    return 'Big-endian (0x8519)';
  }
  return 'Unknown';
}

function buildJsonReport(sourceName, report) {
  return JSON.stringify(
    {
      source: sourceName,
      inspectedBytes: report.inspectedBytes,
      totalBytes: report.totalBytes,
      byteOrder: report.byteOrder,
      magicSignature: report.magicSignature,
      summary: report.summary,
      nodes: report.nodes.map((node) => ({
        index: node.index,
        offset: formatHex(node.offset),
        magic: formatHex(node.magic),
        nodetype: formatHex(node.nodetype),
        nodetypeName: node.nodetypeName,
        totlen: node.totlen,
        hdr_crc: formatHex(node.hdrCrc, 8),
        expected_crc: formatHex(node.expectedCrc, 8),
        crcValid: node.crcValid,
        truncated: node.truncated,
        windowLimited: node.windowLimited,
        totlenTooSmall: node.totlenTooSmall,
        flags: node.flags,
      })),
      regions: report.regions.map((region) => ({
        kind: region.kind,
        fillByte: formatHex(region.fillByte, 2),
        offset: formatHex(region.offset),
        length: region.length,
      })),
      flags: report.flags,
    },
    null,
    2,
  );
}

/**
 * Renders the JFFS2 Node Header Inspector tool for local client-side inspection.
 *
 * @returns {React.JSX.Element} The JFFS2 Node Header Inspector UI.
 */
export default function Jffs2NodeHeaderInspectorTool() {
  const [sourceName, setSourceName] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const readRequestRef = useRef(0);

  async function processFile(file) {
    if (!file) {
      return;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const requestId = (readRequestRef.current += 1);
    setCopyError('');
    try {
      const parsed = await inspectJffs2File(file);
      if (readRequestRef.current !== requestId) {
        return;
      }
      setSourceName(file.name || 'Unnamed file');
      setReport(parsed);
      setError('');
    } catch (err) {
      if (readRequestRef.current !== requestId) {
        return;
      }
      setReport(null);
      setSourceName('');
      setError(err?.message || 'Failed to inspect the selected file.');
    }
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    processFile(selected);
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
    const dropped = event.dataTransfer?.files?.[0];
    processFile(dropped);
  }

  function handleLoadSample(byteOrder) {
    readRequestRef.current += 1;
    const sampleBytes = createSampleJffs2Image(byteOrder);
    const parsed = parseJffs2Nodes(sampleBytes, { totalFileSize: sampleBytes.length });
    setSourceName(`sample-${byteOrder === 'little' ? 'le' : 'be'}.jffs2`);
    setReport(parsed);
    setError('');
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleClear() {
    readRequestRef.current += 1;
    setSourceName('');
    setReport(null);
    setError('');
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopyJson() {
    if (!report) {
      return;
    }
    try {
      await navigator.clipboard.writeText(buildJsonReport(sourceName, report));
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy report to clipboard.');
    }
  }

  const alertMessage = error || copyError;

  return (
    <section className="jffs2-tool" aria-label="JFFS2 Node Header Inspector">
      <div className="jffs2-toolbar">
        <div className="jffs2-toolbar__actions">
          <label className="jffs2-btn jffs2-btn--primary jffs2-file-btn">
            Select JFFS2 Image
            <input
              ref={fileInputRef}
              type="file"
              className="jffs2-file-input"
              onChange={handleFileChange}
              aria-label="Inspect a local JFFS2 image file"
            />
          </label>
          <button
            type="button"
            className="jffs2-btn"
            onClick={() => handleLoadSample('little')}
          >
            Sample (LE)
          </button>
          <button
            type="button"
            className="jffs2-btn"
            onClick={() => handleLoadSample('big')}
          >
            Sample (BE)
          </button>
        </div>

        <div className="jffs2-toolbar__actions">
          <button
            type="button"
            className="jffs2-btn"
            onClick={handleCopyJson}
            disabled={!report}
          >
            {copied ? '✓ Copied JSON' : 'Copy JSON'}
          </button>
          <div className="sr-only" role="status" aria-live="polite">
            {copied ? 'Copied JSON report to clipboard' : ''}
          </div>
          <button
            type="button"
            className="jffs2-btn"
            onClick={handleClear}
            disabled={!report && !error}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        className={`jffs2-dropzone ${isDragging ? 'jffs2-dropzone--active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p className="jffs2-dropzone__title">
          Drop a JFFS2 flash image here, or choose a file above.
        </p>
        <p className="jffs2-dropzone__note">
          Processed locally in your browser — files are never uploaded. Only the first{' '}
          {MAX_INSPECT_BYTES} bytes are read via{' '}
          <code>{`file.slice(0, ${MAX_INSPECT_BYTES})`}</code>.
        </p>
      </div>

      {alertMessage && (
        <div className="jffs2-alert jffs2-alert--error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {report && (
        <>
          <div className="jffs2-summary" aria-label="Inspection summary">
            <div className="jffs2-card">
              <span className="jffs2-card__label">File</span>
              <strong className="jffs2-card__value">{sourceName}</strong>
              <span className="jffs2-card__meta">
                {formatByteSize(report.inspectedBytes)} inspected
                {report.wasWindowTruncated
                  ? ` of ${formatByteSize(report.totalBytes)} (${MAX_INSPECT_BYTES} B cap)`
                  : ''}
              </span>
            </div>

            <div className="jffs2-card">
              <span className="jffs2-card__label">Byte Order</span>
              <strong className="jffs2-card__value">
                {formatByteOrderLabel(report.byteOrder)}
              </strong>
              <span className="jffs2-card__meta">
                {report.magicSignature
                  ? `Detected magic ${report.magicSignature}`
                  : 'No valid magic detected'}
              </span>
            </div>

            <div className="jffs2-card">
              <span className="jffs2-card__label">Nodes Parsed</span>
              <strong className="jffs2-card__value">{report.summary.nodeCount}</strong>
              <span className="jffs2-card__meta">
                {report.summary.validCrcCount} CRC OK · {report.summary.invalidCrcCount} CRC
                mismatch
              </span>
            </div>

            <div className="jffs2-card">
              <span className="jffs2-card__label">Flags</span>
              <strong className="jffs2-card__value">{report.flags.length}</strong>
              <span className="jffs2-card__meta">
                {report.flags.length === 0
                  ? 'No anomalies detected'
                  : `${report.summary.erasedRegionCount} erased · ` +
                    `${report.summary.truncatedCount} truncated`}
              </span>
            </div>
          </div>

          {report.flags.length > 0 && (
            <div className="jffs2-panel" aria-label="Detected flags">
              <h3 className="jffs2-panel__heading">Flags &amp; Diagnostics</h3>
              <ul className="jffs2-flags">
                {report.flags.map((flag, idx) => (
                  <li
                    key={`${flag.code}-${flag.offset}-${idx}`}
                    className={`jffs2-flag jffs2-flag--${flag.severity}`}
                  >
                    <span className="jffs2-badge">{flag.code}</span>
                    <span>{flag.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="jffs2-panel" aria-label="Parsed JFFS2 nodes">
            <h3 className="jffs2-panel__heading">
              Node Headers ({report.nodes.length})
            </h3>
            {report.nodes.length === 0 ? (
              <p className="jffs2-empty">No JFFS2 node headers found in inspected bytes.</p>
            ) : (
              <div className="jffs2-table-wrap">
                <table className="jffs2-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Offset</th>
                      <th scope="col">Magic</th>
                      <th scope="col">Node Type</th>
                      <th scope="col">totlen</th>
                      <th scope="col">hdr_crc</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.nodes.map((node) => (
                      <tr key={node.index}>
                        <td className="jffs2-mono">{node.index}</td>
                        <td className="jffs2-mono">{formatHex(node.offset)}</td>
                        <td className="jffs2-mono">{formatHex(node.magic)}</td>
                        <td>
                          <span className="jffs2-nodetype">{node.nodetypeName}</span>{' '}
                          <span className="jffs2-mono jffs2-muted">
                            ({formatHex(node.nodetype)})
                          </span>
                        </td>
                        <td className="jffs2-mono">
                          {node.totlen} B{' '}
                          <span className="jffs2-muted">
                            ({formatHex(node.totlen, 8)})
                          </span>
                        </td>
                        <td className="jffs2-mono">
                          <div>{formatHex(node.hdrCrc, 8)}</div>
                          {!node.crcValid && (
                            <div className="jffs2-crc-expected">
                              exp {formatHex(node.expectedCrc, 8)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="jffs2-status-list">
                            {node.crcValid ? (
                              <span className="jffs2-pill jffs2-pill--ok">CRC OK</span>
                            ) : (
                              <span className="jffs2-pill jffs2-pill--error">
                                CRC Mismatch
                              </span>
                            )}
                            {node.totlenTooSmall && (
                              <span className="jffs2-pill jffs2-pill--error">
                                totlen &lt; 12
                              </span>
                            )}
                            {node.truncated && (
                              <span className="jffs2-pill jffs2-pill--error">Truncated</span>
                            )}
                            {node.windowLimited && (
                              <span className="jffs2-pill jffs2-pill--info">Window-limited</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
