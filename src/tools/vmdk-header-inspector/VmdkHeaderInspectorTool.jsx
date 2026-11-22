import { useMemo, useRef, useState } from 'react';
import {
  VMDK_HEADER_SIZE,
  buildSampleVmdkHeader,
  bytesToBase64,
  bytesToHex,
  formatByteSize,
  formatHeaderSummary,
  formatHex,
  inspectVmdkText,
  parseVmdkHeader,
  readHeaderBytesFromFile,
} from './vmdkHeaderInspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './vmdkHeaderInspector.css';

const INPUT_MODES = {
  HEX: 'hex',
  BASE64: 'base64',
};

/**
 * Formats a sector count alongside its equivalent byte size or offset.
 *
 * @param {bigint} sectors Sector count.
 * @param {bigint} bytes Byte equivalent.
 * @param {string} [zeroLabel] Label appended when the value is zero.
 * @returns {string}
 */
function formatSectorValue(sectors, bytes, zeroLabel = '') {
  if (sectors === 0n && zeroLabel) {
    return `0 sectors (${zeroLabel})`;
  }
  return `${sectors.toString()} sectors (${formatByteSize(bytes)})`;
}

/**
 * Renders the VMDK Disk Image Header Inspector tool for client-side sparse extent header parsing.
 *
 * @returns {React.JSX.Element}
 */
export default function VmdkHeaderInspectorTool() {
  const [inputMode, setInputMode] = useState(INPUT_MODES.HEX);
  const [textInput, setTextInput] = useState('');
  const [fileState, setFileState] = useState(null);
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  const inspection = useMemo(() => {
    if (fileState) {
      return fileState.result;
    }
    if (textInput.trim() === '') {
      return null;
    }
    return inspectVmdkText(textInput, inputMode);
  }, [fileState, textInput, inputMode]);

  const header = inspection?.ok ? inspection.header : null;
  const parseError = inspection && !inspection.ok ? inspection.error : '';
  const alertMessage = parseError || copyError;

  function handleModeChange(nextMode) {
    if (nextMode === inputMode && !fileState) return;
    fileRequestRef.current += 1;
    setInputMode(nextMode);
    setFileState(null);
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleTextChange(event) {
    fileRequestRef.current += 1;
    setFileState(null);
    setCopyError('');
    setTextInput(event.target.value);
  }

  function handleLoadSample() {
    fileRequestRef.current += 1;
    const sampleBytes = buildSampleVmdkHeader();
    setFileState(null);
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setTextInput(
      inputMode === INPUT_MODES.BASE64 ? bytesToBase64(sampleBytes) : bytesToHex(sampleBytes),
    );
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setTextInput('');
    setFileState(null);
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const requestId = (fileRequestRef.current += 1);
    setCopyError('');

    const readResult = await readHeaderBytesFromFile(selected);
    if (fileRequestRef.current !== requestId) return;

    if (!readResult.ok) {
      setFileState({
        name: selected.name,
        totalFileSize: selected.size,
        readBytes: 0,
        result: readResult,
      });
      return;
    }

    const parsed = parseVmdkHeader(readResult.bytes);
    setFileState({
      name: selected.name,
      totalFileSize: readResult.totalFileSize,
      readBytes: readResult.bytes.byteLength,
      result: parsed,
    });
  }

  async function handleCopySummary() {
    if (!header) return;
    try {
      await navigator.clipboard.writeText(formatHeaderSummary(header));
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy summary to clipboard.');
    }
  }

  const fieldRows = header
    ? [
      {
        field: 'magicNumber',
        offset: '0x00',
        raw: `${header.magicHex} ("${header.magicAscii}")`,
        decoded: 'Valid VMware sparse extent signature',
      },
      {
        field: 'version',
        offset: '0x04',
        raw: formatHex(header.version, 8),
        decoded: `Version ${header.version}`,
      },
      {
        field: 'flags',
        offset: '0x08',
        raw: header.flagsHex,
        decoded:
          header.decodedFlags
            .filter((flag) => flag.enabled)
            .map((flag) => flag.name)
            .join(', ') || 'None set',
      },
      {
        field: 'capacity',
        offset: '0x0C',
        raw: formatHex(header.capacity, 16),
        decoded: formatSectorValue(header.capacity, header.capacityBytes),
      },
      {
        field: 'grainSize',
        offset: '0x14',
        raw: formatHex(header.grainSize, 16),
        decoded: formatSectorValue(header.grainSize, header.grainSizeBytes),
      },
      {
        field: 'descriptorOffset',
        offset: '0x1C',
        raw: formatHex(header.descriptorOffset, 16),
        decoded: formatSectorValue(
          header.descriptorOffset,
          header.descriptorOffsetBytes,
          'No embedded descriptor',
        ),
      },
      {
        field: 'descriptorSize',
        offset: '0x24',
        raw: formatHex(header.descriptorSize, 16),
        decoded: formatSectorValue(header.descriptorSize, header.descriptorSizeBytes, 'None'),
      },
      {
        field: 'numGTEsPerGT',
        offset: '0x2C',
        raw: formatHex(header.numGTEsPerGT, 8),
        decoded:
          `${header.numGTEsPerGT} entries ` +
          `(${formatByteSize(header.grainTableCoverageBytes)} per grain table)`,
      },
      {
        field: 'rgdOffset',
        offset: '0x30',
        raw: formatHex(header.rgdOffset, 16),
        decoded: formatSectorValue(header.rgdOffset, header.rgdOffsetBytes, 'Unused'),
      },
      {
        field: 'gdOffset',
        offset: '0x38',
        raw: header.gdOffsetHex,
        decoded: header.isGdAtEnd
          ? 'GD_AT_END (streamOptimized footer)'
          : formatSectorValue(header.gdOffset, header.gdOffsetBytes),
      },
      {
        field: 'overHead',
        offset: '0x40',
        raw: formatHex(header.overHead, 16),
        decoded: formatSectorValue(header.overHead, header.overHeadBytes),
      },
      {
        field: 'uncleanShutdown',
        offset: '0x48',
        raw: formatHex(header.uncleanShutdownRaw, 2),
        decoded: header.uncleanShutdown ? 'Unclean shutdown detected' : 'Clean shutdown',
      },
      {
        field: 'lineEndingCheck',
        offset: '0x49–0x4C',
        raw: [
          header.singleEndLineChar,
          header.nonEndLineChar,
          header.doubleEndLineChar1,
          header.doubleEndLineChar2,
        ]
          .map((byte) => formatHex(byte, 2))
          .join(' '),
        decoded: !(header.flags & 0x1)
          ? 'Newline detection disabled (flag bit 0 clear)'
          : header.lineEndingsValid
            ? 'Valid (LF / SP / CR / LF)'
            : 'Mismatch (expected LF / SP / CR / LF)',
      },
      {
        field: 'compressAlgorithm',
        offset: '0x4D',
        raw: formatHex(header.compressAlgorithm, 4),
        decoded: `${header.compressAlgorithm} (${header.compressAlgorithmName})`,
      },
      {
        field: 'pad[433]',
        offset: '0x4F–0x1FF',
        raw: '433 bytes',
        decoded:
          header.nonZeroPaddingBytes === 0
            ? 'All zero'
            : `${header.nonZeroPaddingBytes} non-zero byte(s)`,
      },
    ]
    : [];

  return (
    <section className="vmdk-tool" aria-label="VMDK Disk Image Header Inspector">
      <div className="vmdk-toolbar">
        <div className="mode-toggle" role="group" aria-label="Text input format">
          <button
            type="button"
            aria-pressed={inputMode === INPUT_MODES.HEX && !fileState}
            className={`mode-btn ${inputMode === INPUT_MODES.HEX && !fileState ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.HEX)}
          >
            Raw Hex
          </button>
          <button
            type="button"
            aria-pressed={inputMode === INPUT_MODES.BASE64 && !fileState}
            className={`mode-btn ${
              inputMode === INPUT_MODES.BASE64 && !fileState ? 'active' : ''
            }`}
            onClick={() => handleModeChange(INPUT_MODES.BASE64)}
          >
            Base64
          </button>
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload VMDK
            <input
              ref={fileInputRef}
              type="file"
              accept=".vmdk,application/octet-stream"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload a VMDK file to inspect its header"
            />
          </label>
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {fileState && (
        <div className="vmdk-file-banner">
          <span className="vmdk-file-name">{fileState.name}</span>
          <span className="vmdk-file-meta">
            Total size: {formatByteSize(fileState.totalFileSize)} · Read {fileState.readBytes}
            {' '}of {VMDK_HEADER_SIZE} header bytes
          </span>
        </div>
      )}

      <div className="vmdk-input-panel">
        <label className="panel-label" htmlFor="vmdk-input">
          {inputMode === INPUT_MODES.BASE64 ? 'Base64 Header Input' : 'Raw Hex Header Input'}
        </label>
        <textarea
          id="vmdk-input"
          className="panel-textarea"
          value={textInput}
          onChange={handleTextChange}
          placeholder={
            inputMode === INPUT_MODES.BASE64
              ? 'Paste Base64-encoded 512-byte VMDK sparse extent header…'
              : 'Paste 512-byte VMDK sparse extent header hex (e.g. 4B 44 4D 56 …)…'
          }
          spellCheck={false}
        />
      </div>

      {alertMessage && (
        <div className="vmdk-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      <div className="vmdk-results" aria-live="polite">
        {header ? (
          <>
            <div className="vmdk-results-header">
              <div className="vmdk-badges">
                <span className="vmdk-badge vmdk-badge--valid">
                  Magic: {header.magicAscii} ({header.magicHex})
                </span>
                <span className="vmdk-badge">v{header.version}</span>
                <span className="vmdk-badge">
                  Capacity: {formatByteSize(header.capacityBytes)}
                </span>
                <span className="vmdk-badge">
                  Compression: {header.compressAlgorithmName}
                </span>
                <span
                  className={`vmdk-badge ${
                    header.uncleanShutdown ? 'vmdk-badge--warn' : 'vmdk-badge--valid'
                  }`}
                >
                  {header.uncleanShutdown ? 'Unclean Shutdown' : 'Clean Shutdown'}
                </span>
              </div>

              <button type="button" className="btn copy-btn" onClick={handleCopySummary}>
                {copied ? '✓ Copied' : 'Copy JSON'}
              </button>
              {copied && (
                <div className="sr-only" role="status" aria-live="polite">
                  Copied VMDK header summary to clipboard
                </div>
              )}
            </div>

            <div className="vmdk-card">
              <h2 className="vmdk-section-title">Sparse Extent Header Fields (512 bytes)</h2>
              <div className="vmdk-table-wrap">
                <table className="vmdk-table">
                  <thead>
                    <tr>
                      <th scope="col">Field</th>
                      <th scope="col">Offset</th>
                      <th scope="col">Raw / Hex</th>
                      <th scope="col">Decoded Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldRows.map((row) => (
                      <tr key={row.field}>
                        <td className="vmdk-mono">{row.field}</td>
                        <td className="vmdk-mono vmdk-muted">{row.offset}</td>
                        <td className="vmdk-mono">{row.raw}</td>
                        <td>{row.decoded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="vmdk-card">
              <h2 className="vmdk-section-title">Flags Breakdown ({header.flagsHex})</h2>
              <ul className="vmdk-flags-list">
                {header.decodedFlags.map((flag) => (
                  <li
                    key={flag.bit}
                    className={`vmdk-flag-item ${flag.enabled ? 'vmdk-flag-item--on' : ''}`}
                  >
                    <div className="vmdk-flag-top">
                      <span className="vmdk-flag-name">{flag.name}</span>
                      <span className="vmdk-mono vmdk-flag-bit">
                        bit {flag.bit} ({formatHex(flag.mask, 8)}) · {flag.enabled ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    <p className="vmdk-flag-desc">{flag.description}</p>
                  </li>
                ))}
              </ul>
              {header.unknownFlagBits !== 0 && (
                <p className="vmdk-unknown-flags">
                  Additional unrecognized flag bits set: {formatHex(header.unknownFlagBits, 8)}
                </p>
              )}
            </div>
          </>
        ) : (
          !parseError && (
            <div className="vmdk-empty">
              Upload a <code>.vmdk</code> file (only the first 512 bytes are read), paste Raw Hex
              or Base64, or click <strong>Load Sample</strong> to inspect a VMware sparse extent
              header.
            </div>
          )
        )}
      </div>
    </section>
  );
}
