import { useEffect, useRef, useState } from 'react';
import {
  createMockSmsRom,
  formatFileSize,
  formatHex16,
  generateSummary,
  inspectSmsRom,
} from './smsRomHeaderInspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './smsRomHeaderInspector.css';

/**
 * Renders the Sega Master System and Game Gear ROM Header Inspector tool.
 *
 * @returns {React.JSX.Element} The SMS ROM inspector UI.
 */
export default function SmsRomHeaderInspectorTool() {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [inspection, setInspection] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!file) {
      setInspection(null);
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);

    inspectSmsRom(file)
      .then((result) => {
        if (!isCancelled) {
          setInspection(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setInspection({
            valid: false,
            fileSize: file.size ?? 0,
            header: null,
            computedChecksum: null,
            checksumValid: false,
            checksumStatus: 'Error reading ROM',
            diagnostics: [err.message || 'Failed to read ROM'],
          });
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [file]);

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (selected) {
      setFileName(selected.name);
      setFile(selected);
      setCopyError('');
    }
  }

  function handleClear() {
    setFile(null);
    setFileName('');
    setInspection(null);
    setLoading(false);
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function loadSample(type) {
    let mockBytes;
    let name;

    switch (type) {
      case 'sms-32kb':
        mockBytes = createMockSmsRom({
          headerOffset: 0x7ff0,
          regionCode: 0x4,
          romSizeCode: 0xc,
          totalSize: 32 * 1024,
          productCode: 53412,
          version: 0,
        });
        name = 'alex_kidd_sample.sms';
        break;
      case 'sms-8kb':
        mockBytes = createMockSmsRom({
          headerOffset: 0x1ff0,
          regionCode: 0x3,
          romSizeCode: 0xa,
          totalSize: 8 * 1024,
          productCode: 7014,
          version: 1,
        });
        name = 'sms_8kb_sample.sms';
        break;
      case 'gg-16kb':
        mockBytes = createMockSmsRom({
          headerOffset: 0x3ff0,
          regionCode: 0x5,
          romSizeCode: 0xb,
          totalSize: 16 * 1024,
          productCode: 27014,
          version: 0,
        });
        name = 'gamegear_sample.gg';
        break;
      case 'invalid-checksum':
        mockBytes = createMockSmsRom({
          headerOffset: 0x7ff0,
          checksum: 0xbeef,
          regionCode: 0x4,
          romSizeCode: 0xc,
          totalSize: 32 * 1024,
        });
        name = 'bad_checksum.sms';
        break;
      case 'malformed':
      default:
        mockBytes = new Uint8Array(1024);
        mockBytes.fill(0xff);
        name = 'malformed_rom.sms';
        break;
    }

    const mockFile = new File([mockBytes], name, { type: 'application/octet-stream' });
    setFileName(name);
    setFile(mockFile);
    setCopyError('');
  }

  async function handleCopySummary() {
    if (!inspection) return;
    try {
      const summary = generateSummary(inspection);
      await navigator.clipboard.writeText(summary);
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const header = inspection?.header;
  const diagnostics = inspection?.diagnostics || [];
  const hasDiagnostics = diagnostics.length > 0;
  const isValid = inspection?.valid && inspection?.checksumValid && !hasDiagnostics;

  return (
    <div className="sms-inspector">
      <header className="sms-inspector__header">
        <h2 className="sms-inspector__title">Sega Master System ROM Header Inspector</h2>
        <p className="sms-inspector__description">
          Parse and inspect Sega Master System and Game Gear ROM headers client-side. Check
          signatures, checksum integrity, product codes, regions, and size specifications.
        </p>
      </header>

      <div className="sms-inspector__dropzone">
        <input
          ref={fileInputRef}
          type="file"
          id="sms-rom-file-input"
          className="sms-inspector__file-input"
          aria-label="Upload Sega Master System or Game Gear ROM"
          accept=".sms,.gg,.bin,.rom"
          onChange={handleFileChange}
        />
        <span className="sms-inspector__dropzone-icon" aria-hidden="true">
          🎮
        </span>
        <div className="sms-inspector__dropzone-text">
          {fileName ? `Loaded: ${fileName}` : 'Choose a ROM file or drag & drop here'}
        </div>
        <div className="sms-inspector__dropzone-hint">
          Supports .sms, .gg, .bin, .rom files (checked at offsets 0x1FF0, 0x3FF0, and 0x7FF0)
        </div>
      </div>

      <div className="sms-inspector__samples">
        <span className="sms-inspector__samples-label">Load sample:</span>
        <button
          type="button"
          className="sms-inspector__sample-btn"
          onClick={() => loadSample('sms-32kb')}
        >
          32 KB SMS (Valid)
        </button>
        <button
          type="button"
          className="sms-inspector__sample-btn"
          onClick={() => loadSample('sms-8kb')}
        >
          8 KB SMS (0x1FF0)
        </button>
        <button
          type="button"
          className="sms-inspector__sample-btn"
          onClick={() => loadSample('gg-16kb')}
        >
          16 KB GG (0x3FF0)
        </button>
        <button
          type="button"
          className="sms-inspector__sample-btn"
          onClick={() => loadSample('invalid-checksum')}
        >
          Bad Checksum
        </button>
        <button
          type="button"
          className="sms-inspector__sample-btn"
          onClick={() => loadSample('malformed')}
        >
          Malformed ROM
        </button>
      </div>

      <div className="sms-inspector__toolbar">
        <div className="sms-inspector__actions">
          <button
            type="button"
            className="sms-inspector__btn sms-inspector__btn--primary"
            onClick={handleCopySummary}
            disabled={!inspection || loading}
          >
            Copy Summary
          </button>
          <button
            type="button"
            className="sms-inspector__btn"
            onClick={handleClear}
            disabled={!fileName && !inspection}
          >
            Clear
          </button>
        </div>

        {inspection && (
          <div
            className={`sms-inspector__status-badge ${
              isValid
                ? 'sms-inspector__status-badge--valid'
                : inspection.header
                  ? 'sms-inspector__status-badge--warning'
                  : 'sms-inspector__status-badge--invalid'
            }`}
          >
            {isValid
              ? '✓ Valid Header'
              : inspection.header
                ? '⚠ Header Issues'
                : '✕ Missing Header'}
          </div>
        )}
      </div>

      {copied && (
        <div role="status" aria-live="polite" className="sms-inspector__live-status">
          Copied to clipboard
        </div>
      )}

      {copyError && (
        <div role="alert" className="sms-inspector__diagnostics">
          <p className="sms-inspector__diagnostics-title">Clipboard Error</p>
          <p>{copyError}</p>
        </div>
      )}

      {loading && <p>Reading ROM header...</p>}

      {diagnostics.length > 0 && (
        <div className="sms-inspector__diagnostics" role="region" aria-label="Diagnostics">
          <h3 className="sms-inspector__diagnostics-title">Diagnostics</h3>
          <ul className="sms-inspector__diagnostics-list">
            {diagnostics.map((diag, idx) => (
              <li key={idx}>{diag}</li>
            ))}
          </ul>
        </div>
      )}

      {header && (
        <div className="sms-inspector__grid">
          <div className="sms-inspector__card">
            <span className="sms-inspector__card-label">Header Offset</span>
            <span className="sms-inspector__card-value">
              0x{inspection.headerOffset.toString(16).toUpperCase()}
            </span>
            <span className="sms-inspector__card-sub">
              {inspection.headerOffset === 0x7ff0
                ? '32 KB boundary'
                : inspection.headerOffset === 0x3ff0
                  ? '16 KB boundary'
                  : '8 KB boundary'}
            </span>
          </div>

          <div className="sms-inspector__card">
            <span className="sms-inspector__card-label">Signature</span>
            <span className="sms-inspector__card-value">{header.signature}</span>
            <span className="sms-inspector__card-sub">
              {header.valid ? 'TMR SEGA (Valid)' : 'Invalid signature'}
            </span>
          </div>

          <div className="sms-inspector__card">
            <span className="sms-inspector__card-label">Product Code</span>
            <span className="sms-inspector__card-value">{header.productCode || 'None'}</span>
            <span className="sms-inspector__card-sub">
              Version: {header.version} (Rev {header.version})
            </span>
          </div>

          <div className="sms-inspector__card">
            <span className="sms-inspector__card-label">Region</span>
            <span className="sms-inspector__card-value">{header.region}</span>
            <span className="sms-inspector__card-sub">
              Code: 0x{header.regionCode.toString(16).toUpperCase()}
            </span>
          </div>

          <div className="sms-inspector__card">
            <span className="sms-inspector__card-label">ROM Size</span>
            <span className="sms-inspector__card-value">{header.romSizeLabel}</span>
            <span className="sms-inspector__card-sub">
              Code: 0x{header.romSizeCode.toString(16).toUpperCase()} (File:{' '}
              {formatFileSize(inspection.fileSize)})
            </span>
          </div>

          <div className="sms-inspector__card">
            <span className="sms-inspector__card-label">Checksum</span>
            <span className="sms-inspector__card-value">{formatHex16(header.checksum)}</span>
            <span className="sms-inspector__card-sub">
              Computed:{' '}
              {inspection.computedChecksum !== null
                ? formatHex16(inspection.computedChecksum)
                : 'N/A'}{' '}
              ({inspection.checksumStatus})
            </span>
          </div>
        </div>
      )}

      {header?.rawBytes && (
        <section aria-labelledby="raw-header-title">
          <h3 id="raw-header-title" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
            Raw Header Bytes (16 bytes)
          </h3>
          <table className="sms-inspector__raw-table">
            <thead>
              <tr>
                <th>Offset</th>
                <th>Hex</th>
                <th>Field</th>
                <th>Decoded Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>+0x00..+0x07</td>
                <td>
                  {header.rawBytes
                    .slice(0, 8)
                    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
                    .join(' ')}
                </td>
                <td>Signature</td>
                <td>{header.signature}</td>
              </tr>
              <tr>
                <td>+0x08..+0x09</td>
                <td>
                  {header.rawBytes
                    .slice(8, 10)
                    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
                    .join(' ')}
                </td>
                <td>Reserved</td>
                <td>
                  0x{header.rawBytes[8].toString(16).padStart(2, '0').toUpperCase()}{' '}
                  0x{header.rawBytes[9].toString(16).padStart(2, '0').toUpperCase()}
                </td>
              </tr>
              <tr>
                <td>+0x0A..+0x0B</td>
                <td>
                  {header.rawBytes
                    .slice(10, 12)
                    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
                    .join(' ')}
                </td>
                <td>Checksum (LE)</td>
                <td>{formatHex16(header.checksum)}</td>
              </tr>
              <tr>
                <td>+0x0C..+0x0E</td>
                <td>
                  {header.rawBytes
                    .slice(12, 15)
                    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
                    .join(' ')}
                </td>
                <td>Product &amp; Version</td>
                <td>
                  Code: {header.productCode}, Rev: {header.version}
                </td>
              </tr>
              <tr>
                <td>+0x0F</td>
                <td>{header.rawBytes[15].toString(16).padStart(2, '0').toUpperCase()}</td>
                <td>Region &amp; Size</td>
                <td>
                  {header.region} / {header.romSizeLabel}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
