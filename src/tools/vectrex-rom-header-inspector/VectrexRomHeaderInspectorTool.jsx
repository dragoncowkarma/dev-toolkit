import { useRef, useState } from 'react';
import {
  MAX_HEADER_PREFIX_BYTES,
  buildVectrexHeader,
  formatFileSize,
  formatHex,
  formatHexDump,
  parseVectrexHeader,
  readRomHeaderPrefix,
} from './vectrex-rom-header-inspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './vectrex-rom-header-inspector.css';

const SAMPLE_PRESETS = [
  {
    label: 'Mine Storm (Valid 8 KiB)',
    generator: () =>
      buildVectrexHeader({
        copyright: 'g GCE 1982',
        musicPointer: 0xfd0d,
        titleHeight: -8,
        titleWidth: 80,
        titleRelY: 32,
        titleRelX: -85,
        title: 'MINE STORM',
        totalRomSize: 8192,
      }),
    fileName: 'mine_storm.vec',
    fileSize: 8192,
  },
  {
    label: 'Berzerk (Valid 16 KiB)',
    generator: () =>
      buildVectrexHeader({
        copyright: 'g GCE 1982',
        musicPointer: 0xfd1d,
        titleHeight: -8,
        titleWidth: 70,
        titleRelY: 30,
        titleRelX: -65,
        title: 'BERZERK',
        totalRomSize: 16384,
      }),
    fileName: 'berzerk.bin',
    fileSize: 16384,
  },
  {
    label: 'Bad Signature',
    generator: () =>
      buildVectrexHeader({
        copyright: 'x BAD 1982',
        totalRomSize: 8192,
      }),
    fileName: 'corrupt_signature.bin',
    fileSize: 8192,
  },
  {
    label: 'Missing Terminator',
    generator: () =>
      buildVectrexHeader({
        omitTitleTerminator: true,
        omitHeaderTerminator: true,
        totalRomSize: 8192,
      }),
    fileName: 'missing_terminator.bin',
    fileSize: 8192,
  },
  {
    label: 'Truncated Header',
    generator: () => new Uint8Array([0x67, 0x20, 0x47, 0x43, 0x45, 0x20, 0x31, 0x39]),
    fileName: 'truncated.bin',
    fileSize: 8,
  },
  {
    label: 'Oversized (64 KiB)',
    generator: () =>
      buildVectrexHeader({
        copyright: 'g GCE 1998',
        title: 'HOMEBREW 64K',
        totalRomSize: 65536,
      }),
    fileName: 'oversized_64k.bin',
    fileSize: 65536,
  },
];

/**
 * Vectrex ROM Header Inspector component.
 *
 * @returns {React.JSX.Element}
 */
export default function VectrexRomHeaderInspectorTool() {
  const [headerData, setHeaderData] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [rawBytes, setRawBytes] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedJson, showCopiedJson] = useCopyFeedback({ initialValue: false, resetValue: false });
  const [copiedHex, showCopiedHex] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function handleFile(file) {
    if (!file) return;
    const requestId = (fileRequestRef.current += 1);
    setError(null);

    try {
      const prefix = await readRomHeaderPrefix(file, MAX_HEADER_PREFIX_BYTES);
      if (fileRequestRef.current !== requestId) return; // Stale-read guard

      const parsed = parseVectrexHeader(prefix, file.size);
      setHeaderData(parsed);
      setFileInfo({ name: file.name, size: file.size });
      setRawBytes(prefix.slice(0, Math.max(parsed.headerSize || 0, Math.min(prefix.length, 64))));
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setError(err.message || 'Failed to read file.');
      setHeaderData(null);
      setFileInfo(null);
      setRawBytes(null);
    }
  }

  function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleLoadSample(preset) {
    fileRequestRef.current += 1;
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    const bytes = preset.generator();
    const parsed = parseVectrexHeader(bytes, preset.fileSize);
    setHeaderData(parsed);
    setFileInfo({ name: preset.fileName, size: preset.fileSize });
    setRawBytes(bytes.slice(0, Math.max(parsed.headerSize || 0, Math.min(bytes.length, 64))));
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setHeaderData(null);
    setFileInfo(null);
    setRawBytes(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  async function handleCopyJson() {
    if (!headerData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(headerData, null, 2));
      showCopiedJson(true);
    } catch {
      // Ignored
    }
  }

  async function handleCopyHex() {
    if (!rawBytes) return;
    try {
      await navigator.clipboard.writeText(formatHexDump(rawBytes));
      showCopiedHex(true);
    } catch {
      // Ignored
    }
  }

  return (
    <section className="vectrex-tool" aria-label="Vectrex ROM Header Inspector">
      <div className="vectrex-toolbar">
        <div className="vectrex-actions">
          <label className="vectrex-btn vectrex-file-btn">
            Choose ROM File
            <input
              ref={fileInputRef}
              type="file"
              className="vectrex-file-input"
              accept=".vec,.bin,.rom,.gam,*"
              onChange={handleFileInputChange}
              aria-label="Upload Vectrex ROM file"
            />
          </label>
          <button
            type="button"
            className="vectrex-btn"
            onClick={handleClear}
            disabled={!headerData && !error && !fileInfo}
          >
            Clear
          </button>
        </div>

        <div className="vectrex-samples">
          <span className="vectrex-samples-label">Samples:</span>
          {SAMPLE_PRESETS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              className="vectrex-btn"
              onClick={() => handleLoadSample(sample)}
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`vectrex-dropzone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click();
          }
        }}
        aria-label="Drop ROM file here or click to browse"
      >
        <p className="vectrex-dropzone-text">
          Drag & drop a Vectrex ROM (.vec, .bin, .rom) here or click to browse
        </p>
        <p className="vectrex-dropzone-hint">
          Reads only a bounded prefix ({MAX_HEADER_PREFIX_BYTES} bytes max) client-side.
        </p>
      </div>

      {error && (
        <div className="vectrex-alert-error" role="alert">
          ⚠ {error}
        </div>
      )}

      {headerData && (
        <>
          <div className="vectrex-status-row">
            <div className="vectrex-file-summary">
              <span>📁 {fileInfo?.name}</span>
              <span>({formatFileSize(fileInfo?.size ?? 0)})</span>
            </div>

            <div className="vectrex-badges">
              {headerData.valid ? (
                <span className="vectrex-badge vectrex-badge-valid">✓ Valid Header</span>
              ) : (
                <span className="vectrex-badge vectrex-badge-invalid">✕ Invalid Header</span>
              )}

              {headerData.flags.missingSignature && (
                <span className="vectrex-badge vectrex-badge-invalid">Bad Signature</span>
              )}

              {headerData.flags.missingTerminator && (
                <span className="vectrex-badge vectrex-badge-invalid">Missing Terminator</span>
              )}

              {headerData.flags.tooSmall && (
                <span className="vectrex-badge vectrex-badge-invalid">Header Truncated</span>
              )}

              {headerData.flags.notPowerOfTwo && (
                <span className="vectrex-badge vectrex-badge-warning">Non-Power-of-Two</span>
              )}

              {headerData.flags.exceeds32KiB && (
                <span className="vectrex-badge vectrex-badge-warning">&gt; 32 KiB Limit</span>
              )}
            </div>
          </div>

          {(headerData.errors.length > 0 || headerData.warnings.length > 0) && (
            <div className="vectrex-alerts" role="alert" aria-label="Header issues">
              {headerData.errors.map((msg, idx) => (
                <div key={`err-${idx}`} className="vectrex-alert-error">
                  ⚠ {msg}
                </div>
              ))}
              {headerData.warnings.map((msg, idx) => (
                <div key={`warn-${idx}`} className="vectrex-alert-warning">
                  ℹ {msg}
                </div>
              ))}
            </div>
          )}

          <div className="vectrex-panels">
            <div className="vectrex-panel" role="region" aria-label="Cartridge Header Details">
              <div className="vectrex-panel-header">
                <h3 className="vectrex-panel-title">Header Fields</h3>
                <button type="button" className="vectrex-btn" onClick={handleCopyJson}>
                  {copiedJson ? '✓ Copied' : 'Copy JSON'}
                </button>
                {copiedJson && (
                  <div className="sr-only" role="status" aria-live="polite">
                    Copied JSON to clipboard
                  </div>
                )}
              </div>

              <div className="vectrex-fields">
                <div className="vectrex-field full-width">
                  <span className="vectrex-field-label">Copyright String</span>
                  <span className="vectrex-field-value">{headerData.copyright || '—'}</span>
                  {headerData.copyrightNotice && (
                    <span className="vectrex-field-sub">
                      Notice: {headerData.copyrightNotice}
                    </span>
                  )}
                </div>

                <div className="vectrex-field full-width">
                  <span className="vectrex-field-label">Cartridge Title</span>
                  <span className="vectrex-field-value">{headerData.title || '—'}</span>
                </div>

                <div className="vectrex-field">
                  <span className="vectrex-field-label">Music Pointer</span>
                  <span className="vectrex-field-value">
                    {headerData.musicPointerHex || '—'}
                  </span>
                  {headerData.musicName && (
                    <span className="vectrex-field-sub">{headerData.musicName}</span>
                  )}
                </div>

                <div className="vectrex-field">
                  <span className="vectrex-field-label">Header Size</span>
                  <span className="vectrex-field-value">
                    {headerData.headerSize ? `${headerData.headerSize} bytes` : '—'}
                  </span>
                </div>

                <div className="vectrex-field">
                  <span className="vectrex-field-label">Title Text Height</span>
                  <span className="vectrex-field-value">
                    {headerData.titleHeight !== null
                      ? `${headerData.titleHeight} (${formatHex(headerData.titleHeightRaw)})`
                      : '—'}
                  </span>
                </div>

                <div className="vectrex-field">
                  <span className="vectrex-field-label">Title Text Width</span>
                  <span className="vectrex-field-value">
                    {headerData.titleWidth !== null
                      ? `${headerData.titleWidth} (${formatHex(headerData.titleWidthRaw)})`
                      : '—'}
                  </span>
                </div>

                <div className="vectrex-field">
                  <span className="vectrex-field-label">Relative Y</span>
                  <span className="vectrex-field-value">
                    {headerData.titleRelY !== null
                      ? `${headerData.titleRelY} (${formatHex(headerData.titleRelYRaw)})`
                      : '—'}
                  </span>
                </div>

                <div className="vectrex-field">
                  <span className="vectrex-field-label">Relative X</span>
                  <span className="vectrex-field-value">
                    {headerData.titleRelX !== null
                      ? `${headerData.titleRelX} (${formatHex(headerData.titleRelXRaw)})`
                      : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="vectrex-panel" role="region" aria-label="Raw Header Hex Dump">
              <div className="vectrex-panel-header">
                <h3 className="vectrex-panel-title">Header Hex Dump</h3>
                <button
                  type="button"
                  className="vectrex-btn"
                  onClick={handleCopyHex}
                  disabled={!rawBytes}
                >
                  {copiedHex ? '✓ Copied' : 'Copy Hex'}
                </button>
                {copiedHex && (
                  <div className="sr-only" role="status" aria-live="polite">
                    Copied Hex to clipboard
                  </div>
                )}
              </div>

              {rawBytes && rawBytes.length > 0 ? (
                <pre className="vectrex-hexdump" aria-label="Hex dump preview">
                  {formatHexDump(rawBytes)}
                </pre>
              ) : (
                <div className="vectrex-empty">No header bytes loaded.</div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
