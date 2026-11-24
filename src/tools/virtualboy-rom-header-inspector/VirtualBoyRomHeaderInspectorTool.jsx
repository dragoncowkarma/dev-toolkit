import { useRef, useState } from 'react';
import {
  HEADER_OFFSET_FROM_END,
  parseVirtualBoyRomHeader,
  readFileAsBytes,
  validateRomSize,
} from './virtualboyRomHeader.utils.js';
import './virtualboy-rom-header-inspector.css';

/**
 * Renders the client-side Virtual Boy ROM Header Inspector tool.
 *
 * @returns {React.JSX.Element} The Virtual Boy ROM Header Inspector UI.
 */
export default function VirtualBoyRomHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [headerInfo, setHeaderInfo] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    event.target.value = '';
    if (!selected) return;

    const requestId = (fileRequestRef.current += 1);
    try {
      validateRomSize(selected.size);
      const bytes = await readFileAsBytes(
        selected.slice(selected.size - HEADER_OFFSET_FROM_END, selected.size),
      );
      if (fileRequestRef.current !== requestId) return;
      const parsed = parseVirtualBoyRomHeader(bytes, selected.size);
      setFileName(selected.name);
      setHeaderInfo(parsed);
      setError('');
    } catch (err) {
      if (fileRequestRef.current !== requestId) return;
      setFileName(selected.name);
      setHeaderInfo(null);
      setError(err.message);
    }
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setFileName('');
    setHeaderInfo(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  const vectorSummary = headerInfo
    ? `${headerInfo.vectorTable.status} ` +
      `(${headerInfo.vectorTable.populatedSlots}/${headerInfo.vectorTable.totalSlots} slots)`
    : '';

  const activeVectorText = headerInfo?.vectorTable.activeNamedVectors.length
    ? headerInfo.vectorTable.activeNamedVectors
      .map((entry) => `${entry.name} [${entry.address}]`)
      .join(', ')
    : 'None';

  return (
    <section className="vb-inspector" aria-label="Virtual Boy ROM Header Inspector">
      <div className="vb-inspector__toolbar">
        <div className="vb-inspector__actions">
          <label className="vb-inspector__btn vb-inspector__file-btn">
            Upload Virtual Boy ROM
            <input
              ref={fileInputRef}
              type="file"
              className="vb-inspector__file-input"
              onChange={handleFileChange}
              aria-label="Upload Virtual Boy ROM file"
            />
          </label>
          <button
            type="button"
            className="vb-inspector__btn"
            onClick={handleClear}
            disabled={!fileName && !error}
          >
            Clear
          </button>
        </div>
        <p className="vb-inspector__privacy">
          Parsed locally in your browser — no ROM data leaves your device.
        </p>
      </div>

      {error && (
        <div className="vb-inspector__error" role="alert">
          {fileName ? `${fileName}: ${error}` : error}
        </div>
      )}

      {!headerInfo && !error && (
        <div className="vb-inspector__empty">
          <p className="vb-inspector__empty-title">No ROM loaded</p>
          <p className="vb-inspector__empty-hint">
            Select a Virtual Boy ROM image (16 KiB to 16 MiB, power-of-two size) to inspect
            the cartridge header at <code>size - 0x220</code> and the V810 interrupt vector
            table.
          </p>
        </div>
      )}

      {headerInfo && (
        <div className="vb-inspector__results">
          <div className="vb-inspector__section">
            <h3 className="vb-inspector__heading">ROM Overview</h3>
            <dl className="vb-inspector__list">
              <div className="vb-inspector__row">
                <dt>File Name</dt>
                <dd>{fileName}</dd>
              </div>
              <div className="vb-inspector__row">
                <dt>ROM Size</dt>
                <dd>{headerInfo.romSizeLabel}</dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Header Offset</dt>
                <dd className="vb-inspector__mono">
                  {headerInfo.headerOffsetHex} (size - 0x220)
                </dd>
              </div>
            </dl>
          </div>

          <div className="vb-inspector__section">
            <h3 className="vb-inspector__heading">Cartridge Header (32 bytes)</h3>
            <dl className="vb-inspector__list">
              <div className="vb-inspector__row">
                <dt>Game Title</dt>
                <dd>
                  <span className="vb-inspector__value">{headerInfo.title.display}</span>
                  <span className="vb-inspector__sub">
                    Encoding: {headerInfo.title.encoding}
                  </span>
                  <code className="vb-inspector__hex">{headerInfo.title.rawHex}</code>
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Reserved Bytes</dt>
                <dd>
                  <span className="vb-inspector__value">{headerInfo.reserved.status}</span>
                  <code className="vb-inspector__hex">{headerInfo.reserved.rawHex}</code>
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Maker Code</dt>
                <dd>
                  <span className="vb-inspector__value">{headerInfo.maker.display}</span>
                  <code className="vb-inspector__hex">{headerInfo.maker.rawHex}</code>
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Game Code</dt>
                <dd>
                  <span className="vb-inspector__value">{headerInfo.gameCode.display}</span>
                  <code className="vb-inspector__hex">{headerInfo.gameCode.rawHex}</code>
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>System Prefix</dt>
                <dd>
                  {headerInfo.gameCode.systemCode
                    ? `${headerInfo.gameCode.systemCode} (${headerInfo.gameCode.system})`
                    : 'Unknown'}
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Region</dt>
                <dd>
                  {headerInfo.gameCode.regionCode
                    ? `${headerInfo.gameCode.regionCode} (${headerInfo.gameCode.region})`
                    : 'Unknown'}
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>ROM Version</dt>
                <dd className="vb-inspector__mono">{headerInfo.version.display}</dd>
              </div>
            </dl>
          </div>

          <div className="vb-inspector__section">
            <h3 className="vb-inspector__heading">Interrupt Vector Table (512 bytes)</h3>
            <dl className="vb-inspector__list">
              <div className="vb-inspector__row">
                <dt>Table Presence</dt>
                <dd>{vectorSummary}</dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Table Offset</dt>
                <dd className="vb-inspector__mono">
                  {headerInfo.vectorTable.offsetHex} (size - 0x200)
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Reset Vector (0xFFFFFFF0)</dt>
                <dd>
                  <span className="vb-inspector__value">
                    {headerInfo.vectorTable.hasResetVector ? 'Present' : 'Not detected (blank)'}
                  </span>
                  <code className="vb-inspector__hex">
                    {headerInfo.vectorTable.resetVectorHex}
                  </code>
                </dd>
              </div>
              <div className="vb-inspector__row">
                <dt>Active Named Vectors</dt>
                <dd>{activeVectorText}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </section>
  );
}
