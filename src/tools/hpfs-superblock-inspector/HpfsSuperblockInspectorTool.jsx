import { useEffect, useRef, useState } from 'react';
import {
  HPFS_SECTOR_SIZE,
  createSampleHpfsSuperblockHex,
  formatFileSize,
  hexToBytes,
  parseByteOffset,
  parseHpfsBootBlock,
  parseHpfsSuperblock,
  readSlice,
} from './hpfs-superblock-inspector.utils.js';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import './hpfs-superblock-inspector.css';

const INPUT_MODES = {
  HEX: 'hex',
  FILE: 'file',
};

/**
 * HPFS Superblock Inspector Tool Component.
 * Parses and displays OS/2 HPFS superblocks, boot blocks, and spare blocks.
 *
 * @returns {React.JSX.Element}
 */
export default function HpfsSuperblockInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.HEX);
  const [hexInput, setHexInput] = useState('');
  const [byteOffsetInput, setByteOffsetInput] = useState('');
  const [file, setFile] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);
  const fileRequestRef = useRef(0);

  // Update inspection when in HEX mode
  useEffect(() => {
    if (mode !== INPUT_MODES.HEX) return;
    if (hexInput.trim() === '') {
      setParsedData(null);
      setError('');
      return;
    }

    try {
      const bytes = hexToBytes(hexInput);
      const result = parseHpfsSuperblock(bytes, { offset: byteOffsetInput });
      if (result.ok) {
        setParsedData(result.data);
        setError('');
      } else {
        setParsedData(null);
        setError(result.error);
      }
    } catch (err) {
      setParsedData(null);
      setError(err.message);
    }
  }, [mode, hexInput, byteOffsetInput]);

  // Read file slice when file or offset changes in FILE mode
  useEffect(() => {
    if (mode !== INPUT_MODES.FILE || !file) return;

    const requestId = (fileRequestRef.current += 1);
    setIsReading(true);
    setParsedData(null);
    setError('');

    let offsetNumber = 0;
    try {
      offsetNumber = parseByteOffset(byteOffsetInput);
    } catch (err) {
      setIsReading(false);
      setError(err.message);
      return;
    }

    // Read enough to cover the sector and any surrounding blocks
    const readStart = offsetNumber === 0 ? 0 : Math.max(0, offsetNumber);
    const readLength = 16384; // 16 KB covers boot block, superblock and spare block

    const needSeparateBootBlock = readStart >= HPFS_SECTOR_SIZE && file.size >= HPFS_SECTOR_SIZE;

    const readMainPromise = readSlice(file, readStart, readLength);
    const readBootPromise = needSeparateBootBlock
      ? readSlice(file, 0, HPFS_SECTOR_SIZE)
      : Promise.resolve(null);

    Promise.all([readMainPromise, readBootPromise])
      .then(([bytes, bootBytes]) => {
        if (fileRequestRef.current !== requestId) return;
        setIsReading(false);
        const relativeOffset = offsetNumber - readStart;
        const result = parseHpfsSuperblock(bytes, {
          offset: relativeOffset,
          baseOffset: readStart,
        });
        if (result.ok) {
          if (!result.data.bootBlock && bootBytes) {
            result.data.bootBlock = parseHpfsBootBlock(bootBytes, 0);
          }
          setParsedData(result.data);
          setError('');
        } else {
          setParsedData(null);
          setError(result.error);
        }
      })
      .catch((err) => {
        if (fileRequestRef.current !== requestId) return;
        setIsReading(false);
        setParsedData(null);
        setError(err.message);
      });
  }, [mode, file, byteOffsetInput]);

  function handleModeChange(nextMode) {
    if (nextMode === mode) return;
    fileRequestRef.current += 1;
    setIsReading(false);
    setMode(nextMode);
    setError('');
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    fileRequestRef.current += 1;
    setMode(INPUT_MODES.FILE);
    setFile(selected);
  }

  function handleClear() {
    fileRequestRef.current += 1;
    setIsReading(false);
    setHexInput('');
    setByteOffsetInput('');
    setFile(null);
    setParsedData(null);
    setError('');
    setCopyError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  function handleLoadSample() {
    fileRequestRef.current += 1;
    setIsReading(false);
    setMode(INPUT_MODES.HEX);
    setFile(null);
    setByteOffsetInput('0');
    setHexInput(createSampleHpfsSuperblockHex());
  }

  async function handleCopyJson() {
    if (!parsedData) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(parsedData, null, 2));
      showCopied(true);
      setCopyError('');
    } catch {
      setCopyError('Failed to copy to clipboard.');
    }
  }

  const alertMessage = error || copyError;
  const sb = parsedData?.superblock;
  const bb = parsedData?.bootBlock;
  const sp = parsedData?.spareBlock;

  return (
    <section className="hpfs-inspector-tool" aria-label="HPFS Superblock Inspector Tool">
      <div className="hpfs-toolbar">
        <div className="mode-toggle" role="group" aria-label="Inspection input mode">
          <button
            type="button"
            aria-pressed={mode === INPUT_MODES.HEX}
            className={`mode-btn ${mode === INPUT_MODES.HEX ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.HEX)}
          >
            Hex Input
          </button>
          <button
            type="button"
            aria-pressed={mode === INPUT_MODES.FILE}
            className={`mode-btn ${mode === INPUT_MODES.FILE ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.FILE)}
          >
            File Upload
          </button>
        </div>

        <div className="toolbar-actions">
          <label className="btn file-btn">
            Upload File
            <input
              ref={fileInputRef}
              type="file"
              className="file-input"
              onChange={handleFileChange}
              aria-label="Upload HPFS image or superblock file"
            />
          </label>
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleCopyJson}
            disabled={!parsedData}
          >
            {copied ? '✓ Copied JSON' : 'Copy JSON'}
          </button>
          {copied && (
            <div className="sr-only" role="status" aria-live="polite">
              Copied to clipboard
            </div>
          )}
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      <div className="offset-row">
        <label htmlFor="hpfs-offset-input" className="offset-label">
          Byte Offset:
        </label>
        <input
          id="hpfs-offset-input"
          type="text"
          className="offset-input"
          placeholder="e.g. 0x2000, 8192, or 0"
          value={byteOffsetInput}
          onChange={(e) => setByteOffsetInput(e.target.value)}
        />
        <span className="offset-hint">
          (Optional. Standard HPFS sector 16 is at offset 0x2000 / 8192)
        </span>
      </div>

      {mode === INPUT_MODES.HEX && (
        <div className="panel">
          <div className="panel-label-row">
            <label className="panel-label" htmlFor="hpfs-hex-input">
              Hex Data
            </label>
          </div>
          <textarea
            id="hpfs-hex-input"
            className="panel-textarea"
            placeholder={
              'Paste raw HPFS superblock hex bytes here ' +
              '(e.g. 49 E8 95 F9 C5 E9 53 FA 02 02…)…'
            }
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {mode === INPUT_MODES.FILE && (
        <div className="panel">
          <div className="panel-label-row">
            <span className="panel-label">File Selection</span>
          </div>
          <div className="hpfs-status">
            {file ? (
              <span>
                📁 <strong>{file.name}</strong> ({formatFileSize(file.size)})
              </span>
            ) : (
              <span>
                No file selected. Click &quot;Upload File&quot; above to select an HPFS image.
              </span>
            )}
          </div>
        </div>
      )}

      {isReading && (
        <div className="hpfs-status" role="status" aria-live="polite">
          ⏳ Reading file slice asynchronously…
        </div>
      )}

      {alertMessage && (
        <div className="hpfs-error" role="alert">
          ⚠ {alertMessage}
        </div>
      )}

      {parsedData && sb && (
        <div className="hpfs-results" aria-label="Inspection Results">
          <div className="section-card">
            <h3 className="section-title">
              HPFS Superblock
              <span className="badge badge-success">Valid Superblock</span>
            </h3>

            <div className="data-grid">
              <div className="data-item">
                <span className="data-item-label">Superblock Location</span>
                <span className="data-item-value">
                  Offset 0x{sb.offset.toString(16).toUpperCase()} ({sb.offset} bytes, Sector {sb.sector})
                </span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Primary Signature (Magic)</span>
                <span className="data-item-value">{sb.magicHex}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Secondary Signature (Magic1)</span>
                <span className="data-item-value">{sb.magic1Hex}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">HPFS Version</span>
                <span className="data-item-value">Version {sb.version}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Functional Version</span>
                <span className="data-item-value">Version {sb.functionalVersion}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Volume Name</span>
                <span className="data-item-value">{sb.volumeName || '(None)'}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Root Directory Fnode Sector</span>
                <span className="data-item-value">{sb.rootFnodeSector}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Total Sectors</span>
                <span className="data-item-value">
                  {sb.totalSectors.toLocaleString()} ({sb.totalBytesFormatted})
                </span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Bad-Block Count</span>
                <span className="data-item-value">{sb.badBlockCount}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Bitmap Pointer Sector</span>
                <span className="data-item-value">{sb.bitmapPointerSector}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Spare Block Sector</span>
                <span className="data-item-value">{sb.spareBlockSector}</span>
              </div>
            </div>

            <h4 style={{ margin: '0.75rem 0 0.25rem', fontSize: '0.95rem' }}>
              Directory Band Fields
            </h4>
            <div className="data-grid">
              <div className="data-item">
                <span className="data-item-label">Dir Band Sector Count</span>
                <span className="data-item-value">
                  {sb.dirBand.sectorCount.toLocaleString()} ({sb.dirBand.sizeFormatted})
                </span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Dir Band Start Sector</span>
                <span className="data-item-value">{sb.dirBand.startSector}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Dir Band End Sector</span>
                <span className="data-item-value">{sb.dirBand.endSector}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Dir Band Bitmap Sector</span>
                <span className="data-item-value">{sb.dirBand.bitmapSector}</span>
              </div>
            </div>

            <h4 style={{ margin: '0.75rem 0 0.25rem', fontSize: '0.95rem' }}>
              Maintenance & Storage Fields
            </h4>
            <div className="data-grid">
              <div className="data-item">
                <span className="data-item-label">Bad-Block List Sector</span>
                <span className="data-item-value">{sb.badBlockListSector}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Last Chkdsk Date</span>
                <span className="data-item-value">{sb.lastChkdsk}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">Last Optimize Date</span>
                <span className="data-item-value">{sb.lastOptimize}</span>
              </div>
              <div className="data-item">
                <span className="data-item-label">User ID Table Sector</span>
                <span className="data-item-value">{sb.userIdTableSector}</span>
              </div>
            </div>
          </div>

          {bb && (
            <div className="section-card">
              <h3 className="section-title">
                Boot Block (Sector 0)
                <span className="badge badge-success">{bb.bootMagicHex}</span>
              </h3>
              <div className="data-grid">
                <div className="data-item">
                  <span className="data-item-label">OEM ID</span>
                  <span className="data-item-value">{bb.oemId || '(None)'}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Bytes per Sector</span>
                  <span className="data-item-value">{bb.bytesPerSector}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Sectors per Cluster</span>
                  <span className="data-item-value">{bb.sectorsPerCluster}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">System ID</span>
                  <span className="data-item-value">{bb.systemId || '(None)'}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Volume Label</span>
                  <span className="data-item-value">{bb.volumeLabel || '(None)'}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Serial Number</span>
                  <span className="data-item-value">{bb.volumeSerialNumberHex}</span>
                </div>
              </div>
            </div>
          )}

          {sp && (
            <div className="section-card">
              <h3 className="section-title">
                Spare Block (Sector 17)
                <span className="badge">{sp.dirty ? 'Improperly Stopped (Dirty)' : 'Clean'}</span>
              </h3>
              <div className="data-grid">
                <div className="data-item">
                  <span className="data-item-label">Volume State</span>
                  <span className="data-item-value">{sp.dirty ? 'Dirty' : 'Clean'}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Hotfixes Used</span>
                  <span className="data-item-value">{sp.hotfixesUsed ? 'Yes' : 'No'}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Spare Dirblks Used</span>
                  <span className="data-item-value">{sp.spareDirUsed ? 'Yes' : 'No'}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Used Hotfixes</span>
                  <span className="data-item-value">{sp.usedHotfixes}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Total Hotfix Spares</span>
                  <span className="data-item-value">{sp.totalHotfixes}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Code Page Directory</span>
                  <span className="data-item-value">{sp.codePageDir}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Code Pages Count</span>
                  <span className="data-item-value">{sp.nCodePages}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Superblock CRC</span>
                  <span className="data-item-value">{sp.superCrcHex}</span>
                </div>
                <div className="data-item">
                  <span className="data-item-label">Spare Block CRC</span>
                  <span className="data-item-value">{sp.spareCrcHex}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
