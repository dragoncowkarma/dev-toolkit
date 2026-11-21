import { useRef, useState } from 'react';
import {
  buildSampleCodestreamBuffer,
  buildSampleJp2Buffer,
  formatByteSize,
  parseJp2Container,
  readFileAsUint8Array,
} from './jp2BoxInspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './jp2BoxInspector.css';

function flattenBoxTree(boxes, depth = 0) {
  const rows = [];
  for (const box of boxes) {
    rows.push({ ...box, depth });
    if (Array.isArray(box.children) && box.children.length > 0) {
      rows.push(...flattenBoxTree(box.children, depth + 1));
    }
  }
  return rows;
}

function formatBpcSummary(ihdr) {
  if (!ihdr) {
    return 'N/A';
  }
  if (ihdr.variesByComponent) {
    return 'Varies by component (0xFF — see bpcc)';
  }
  const signLabel = ihdr.isSigned ? 'signed' : 'unsigned';
  return `${ihdr.bitsPerComponent}-bit ${signLabel}`;
}

function formatResolutionEntry(entry) {
  if (!entry) {
    return 'Not present';
  }
  const dpiText = `${entry.horizontalDpi} × ${entry.verticalDpi} DPI`;
  const ppmText = `${entry.horizontalPpm} × ${entry.verticalPpm} PPM`;
  return `${dpiText} (${ppmText})`;
}

/**
 * Renders the JPEG 2000 (JP2) Box Inspector tool for client-side container inspection.
 *
 * @returns {React.JSX.Element} The JP2 Box Inspector tool UI.
 */
export default function Jp2BoxInspectorTool() {
  const [fileMeta, setFileMeta] = useState(null);
  const [report, setReport] = useState(null);
  const [readError, setReadError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  function loadBuffer(bytes, name) {
    const parsed = parseJp2Container(bytes);
    setFileMeta({
      name,
      size: bytes.byteLength,
    });
    setReport(parsed);
    setReadError('');
    setCopyError('');
  }

  async function processFile(selected) {
    if (!selected) {
      return;
    }
    const requestId = (fileRequestRef.current += 1);
    try {
      const bytes = await readFileAsUint8Array(selected);
      if (fileRequestRef.current !== requestId) {
        return;
      }
      loadBuffer(bytes, selected.name);
    } catch (err) {
      if (fileRequestRef.current !== requestId) {
        return;
      }
      setReport(null);
      setFileMeta(null);
      setReadError(err.message || 'Failed to read the selected file.');
    }
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) {
      return;
    }
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
    if (dropped) {
      processFile(dropped);
    }
  }

  function handleDropzoneKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  }

  function handleLoadSampleJp2() {
    fileRequestRef.current += 1;
    const sample = buildSampleJp2Buffer();
    loadBuffer(sample, 'sample-srgb.jp2');
  }

  function handleLoadSampleIccBpcc() {
    fileRequestRef.current += 1;
    const iccHeader = new Uint8Array(40);
    const view = new DataView(iccHeader.buffer);
    view.setUint32(0, 40, false);
    iccHeader.set([0x6d, 0x6e, 0x74, 0x72], 12);
    iccHeader.set([0x52, 0x47, 0x42, 0x20], 16);
    iccHeader.set([0x58, 0x59, 0x5a, 0x20], 20);
    iccHeader.set([0x61, 0x63, 0x73, 0x70], 36);
    const sample = buildSampleJp2Buffer({
      width: 1920,
      height: 1080,
      componentCount: 3,
      bpc: 0xff,
      bpccValues: [0x07, 0x09, 0x8b],
      iccProfileBytes: iccHeader,
      extendedJp2h: true,
      codestreamToEof: true,
    });
    loadBuffer(sample, 'sample-icc-bpcc.jp2');
  }

  function handleLoadSampleCodestream() {
    fileRequestRef.current += 1;
    const sample = buildSampleCodestreamBuffer();
    loadBuffer(sample, 'raw-codestream.j2k');
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setFileMeta(null);
    setReport(null);
    setReadError('');
    setCopyError('');
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopyJson() {
    if (!report) {
      return;
    }
    try {
      const payload = JSON.stringify({ file: fileMeta, ...report }, null, 2);
      await navigator.clipboard.writeText(payload);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy inspection JSON to clipboard.');
    }
  }

  const errorList = [
    ...(readError ? [readError] : []),
    ...(copyError ? [copyError] : []),
    ...(report?.errors ?? []),
  ];
  const warningList = report?.warnings ?? [];
  const boxRows = report ? flattenBoxTree(report.boxes) : [];
  const ihdr = report?.header?.imageHeader ?? null;
  const bpcc = report?.header?.bitsPerComponent ?? null;
  const colrList = report?.header?.colourSpecifications ?? [];
  const res = report?.header?.resolution ?? null;

  return (
    <section className="jp2-inspector" aria-label="JPEG 2000 (JP2) Box Inspector">
      <div className="jp2-inspector__toolbar">
        <div className="jp2-inspector__actions">
          <label className="jp2-inspector__btn jp2-inspector__file-btn">
            Upload JP2 / J2K File
            <input
              ref={fileInputRef}
              type="file"
              accept=".jp2,.j2k,.j2c,image/jp2,image/jpx"
              className="jp2-inspector__file-input"
              onChange={handleFileChange}
              aria-label="Upload a JP2, J2K, or J2C file"
            />
          </label>
          <button
            type="button"
            className="jp2-inspector__btn"
            onClick={handleLoadSampleJp2}
          >
            Load Sample JP2
          </button>
          <button
            type="button"
            className="jp2-inspector__btn"
            onClick={handleLoadSampleIccBpcc}
          >
            Load ICC + BPCC Sample
          </button>
          <button
            type="button"
            className="jp2-inspector__btn"
            onClick={handleLoadSampleCodestream}
          >
            Load Raw .j2k
          </button>
        </div>

        <div className="jp2-inspector__actions">
          <button
            type="button"
            className="jp2-inspector__btn"
            onClick={handleCopyJson}
            disabled={!report}
          >
            {copied ? '✓ Copied JSON' : 'Copy JSON'}
          </button>
          {copied && (
            <div className="sr-only" role="status" aria-live="polite">
              Copied to clipboard
            </div>
          )}
          <button
            type="button"
            className="jp2-inspector__btn"
            onClick={handleClear}
            disabled={!report && !readError && !copyError}
          >
            Clear
          </button>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a .jp2, .j2k, or .j2c file here, or press Enter or Space to browse"
        className={`jp2-inspector__dropzone ${
          isDragging ? 'jp2-inspector__dropzone--active' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleDropzoneKeyDown}
      >
        <p className="jp2-inspector__dropzone-title">
          {fileMeta
            ? `📁 ${fileMeta.name} (${formatByteSize(fileMeta.size)})`
            : 'Drag and drop a .jp2, .j2k, or .j2c file here, or click / press Enter to select'}
        </p>
        <p className="jp2-inspector__dropzone-hint">
          Parsed 100% locally in your browser using ArrayBuffer and DataView.
        </p>
      </div>

      {errorList.length > 0 && (
        <div className="jp2-inspector__alert jp2-inspector__alert--error" role="alert">
          <strong className="jp2-inspector__alert-title">Container Validation Errors</strong>
          <ul className="jp2-inspector__alert-list">
            {errorList.map((msg, idx) => (
              <li key={`${idx}-${msg}`}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {warningList.length > 0 && (
        <div className="jp2-inspector__alert jp2-inspector__alert--warning" role="alert">
          <strong className="jp2-inspector__alert-title">Container Warnings & Notices</strong>
          <ul className="jp2-inspector__alert-list">
            {warningList.map((msg, idx) => (
              <li key={`${idx}-${msg}`}>{msg}</li>
            ))}
          </ul>
        </div>
      )}

      {report && (
        <div className="jp2-inspector__grid">
          <article className="jp2-inspector__card" aria-label="Container Summary">
            <h3 className="jp2-inspector__card-title">Container Summary</h3>
            <dl className="jp2-inspector__dl">
              <div className="jp2-inspector__dl-row">
                <dt>Format</dt>
                <dd>{report.format}</dd>
              </div>
              <div className="jp2-inspector__dl-row">
                <dt>Status</dt>
                <dd>
                  {report.isRawCodestream
                    ? 'Raw Codestream (Container Unavailable)'
                    : report.isValid
                      ? 'Valid JP2 Container'
                      : 'Malformed / Incomplete'}
                </dd>
              </div>
              <div className="jp2-inspector__dl-row">
                <dt>File Size</dt>
                <dd>
                  {formatByteSize(report.byteLength)} ({report.byteLength} bytes)
                </dd>
              </div>
              <div className="jp2-inspector__dl-row">
                <dt>Signature Box (jP  )</dt>
                <dd>
                  {report.signature
                    ? `${report.signature.valid ? 'Valid' : 'Invalid'} (${report.signature.hex})`
                    : 'Not present'}
                </dd>
              </div>
              <div className="jp2-inspector__dl-row">
                <dt>Top-Level Boxes</dt>
                <dd>{report.boxes.length}</dd>
              </div>
              <div className="jp2-inspector__dl-row">
                <dt>Codestream Count</dt>
                <dd>{report.codestreamCount}</dd>
              </div>
            </dl>
          </article>

          {report.fileType && (
            <article className="jp2-inspector__card" aria-label="File Type Box (ftyp)">
              <h3 className="jp2-inspector__card-title">File Type Box (ftyp)</h3>
              <dl className="jp2-inspector__dl">
                <div className="jp2-inspector__dl-row">
                  <dt>Major Brand (BR)</dt>
                  <dd>
                    <code>{report.fileType.brand}</code>
                  </dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Minor Version (MinV)</dt>
                  <dd>{report.fileType.minorVersion}</dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Compatibility List (CL)</dt>
                  <dd>
                    {report.fileType.compatibilityList.length > 0
                      ? report.fileType.compatibilityList.map((brand, idx) => (
                        <code key={`${idx}-${brand}`} className="jp2-inspector__badge">
                          {brand}
                        </code>
                      ))
                      : 'None'}
                  </dd>
                </div>
              </dl>
            </article>
          )}

          {ihdr && (
            <article className="jp2-inspector__card" aria-label="Image Header Box (ihdr)">
              <h3 className="jp2-inspector__card-title">Image Header Box (ihdr)</h3>
              <dl className="jp2-inspector__dl">
                <div className="jp2-inspector__dl-row">
                  <dt>Dimensions</dt>
                  <dd>
                    {ihdr.width} × {ihdr.height} px
                  </dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Components (NC)</dt>
                  <dd>{ihdr.componentCount}</dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Bits Per Component (BPC)</dt>
                  <dd>{formatBpcSummary(ihdr)}</dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Compression Type (C)</dt>
                  <dd>{ihdr.compressionName}</dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Unknown Colourspace (UnkC)</dt>
                  <dd>{ihdr.colourspaceUnknown ? 'Yes (1)' : 'No (0 — Known)'}</dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Intellectual Property (IPR)</dt>
                  <dd>{ihdr.hasIntellectualProperty ? 'Present (1)' : 'None (0)'}</dd>
                </div>
              </dl>
            </article>
          )}

          {bpcc && bpcc.length > 0 && (
            <article className="jp2-inspector__card" aria-label="Bits Per Component Box (bpcc)">
              <h3 className="jp2-inspector__card-title">Bits Per Component Box (bpcc)</h3>
              <ul className="jp2-inspector__bpcc-list">
                {bpcc.map((entry) => (
                  <li key={entry.index} className="jp2-inspector__bpcc-item">
                    <span>Component #{entry.index + 1}</span>
                    <strong>
                      {entry.bitDepth}-bit ({entry.isSigned ? 'signed' : 'unsigned'})
                    </strong>
                    <code>0x{entry.rawByte.toString(16).padStart(2, '0').toUpperCase()}</code>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {colrList.length > 0 && (
            <article className="jp2-inspector__card" aria-label="Colour Specification Box (colr)">
              <h3 className="jp2-inspector__card-title">Colour Specification Box (colr)</h3>
              {colrList.map((colr, index) => (
                <dl key={index} className="jp2-inspector__dl">
                  <div className="jp2-inspector__dl-row">
                    <dt>Method (METH)</dt>
                    <dd>
                      {colr.methodName} ({colr.method})
                    </dd>
                  </div>
                  <div className="jp2-inspector__dl-row">
                    <dt>Precedence / Approx</dt>
                    <dd>
                      PREC {colr.precedence} / APPROX {colr.approximation}
                    </dd>
                  </div>
                  {colr.method === 1 && (
                    <div className="jp2-inspector__dl-row">
                      <dt>Enumerated Colourspace</dt>
                      <dd>
                        {colr.enumeratedColourspaceName} ({colr.enumeratedColourspace})
                      </dd>
                    </div>
                  )}
                  {(colr.method === 2 || colr.method === 3) && (
                    <>
                      <div className="jp2-inspector__dl-row">
                        <dt>Embedded ICC Profile</dt>
                        <dd>{formatByteSize(colr.iccProfileSize)} ({colr.iccProfileSize} B)</dd>
                      </div>
                      {colr.iccProfile?.colorSpaceSignature && (
                        <div className="jp2-inspector__dl-row">
                          <dt>ICC Colour Space / PCS</dt>
                          <dd>
                            <code>{colr.iccProfile.colorSpaceSignature}</code> →{' '}
                            <code>{colr.iccProfile.pcsSignature}</code>
                          </dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              ))}
            </article>
          )}

          {res && (
            <article className="jp2-inspector__card" aria-label="Resolution Superbox (res )">
              <h3 className="jp2-inspector__card-title">Resolution Superbox (res )</h3>
              <dl className="jp2-inspector__dl">
                <div className="jp2-inspector__dl-row">
                  <dt>Capture Resolution (resc)</dt>
                  <dd>{formatResolutionEntry(res.capture)}</dd>
                </div>
                <div className="jp2-inspector__dl-row">
                  <dt>Default Display Resolution (resd)</dt>
                  <dd>{formatResolutionEntry(res.display)}</dd>
                </div>
              </dl>
            </article>
          )}
        </div>
      )}

      {boxRows.length > 0 && (
        <div className="jp2-inspector__table-wrap">
          <h3 className="jp2-inspector__section-title">Box Hierarchy</h3>
          <table className="jp2-inspector__table" aria-label="JP2 Box Hierarchy">
            <thead>
              <tr>
                <th scope="col">Box Type</th>
                <th scope="col">Description</th>
                <th scope="col">Offset</th>
                <th scope="col">Length</th>
                <th scope="col">Payload</th>
                <th scope="col">Length Semantics</th>
              </tr>
            </thead>
            <tbody>
              {boxRows.map((row) => (
                <tr key={`${row.offset}-${row.type}-${row.depth}`}>
                  <td>
                    <span
                      className="jp2-inspector__tree-type"
                      style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                    >
                      <code>{row.type}</code>
                    </span>
                  </td>
                  <td>{row.label}</td>
                  <td>{row.offset} B</td>
                  <td>{row.length} B</td>
                  <td>{row.payloadLength} B</td>
                  <td>
                    <span className="jp2-inspector__badge">{row.lengthMode}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
