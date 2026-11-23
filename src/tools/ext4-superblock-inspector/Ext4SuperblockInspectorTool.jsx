import { useRef, useState } from 'react';
import { useCopyFeedback } from '../../hooks/useCopyFeedback.js';
import {
  bytesToHex,
  createSampleSuperblock,
  parseExt4Superblock,
} from './ext4.utils.js';
import './ext4.css';

/**
 * Ext4 Superblock Inspector tool component.
 * Allows client-side inspection of ext2, ext3, and ext4 filesystem superblocks
 * from disk images or pasted hex strings.
 *
 * @returns {React.JSX.Element} The ext4 inspector UI.
 */
export default function Ext4SuperblockInspectorTool() {
  const [hexInput, setHexInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [error, setError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [copied, showCopied] = useCopyFeedback({ initialValue: false, resetValue: false });

  const fileInputRef = useRef(null);

  /**
   * Reads the first 2048 bytes of a file slice and parses the ext superblock.
   *
   * @param {File} file - Selected or dropped file.
   */
  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setHexInput('');
    setError('');

    const slice = file.slice(0, 2048);
    const reader = new FileReader();

    reader.onload = () => {
      const arrayBuffer = /** @type {ArrayBuffer} */ (reader.result);
      const result = parseExt4Superblock(arrayBuffer);
      if (result.ok) {
        setParsedData(result.data);
        setError('');
      } else {
        setParsedData(null);
        setError(result.error ?? 'Failed to parse ext superblock.');
      }
    };

    reader.onerror = () => {
      setParsedData(null);
      setError('Failed to read the selected file slice.');
    };

    reader.readAsArrayBuffer(slice);
  }

  function handleFileInputChange(event) {
    const file = event.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFile(file);
    }
  }

  function handleDragOver(event) {
    event.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setIsDragOver(false);
  }

  function handleHexChange(event) {
    const text = event.target.value;
    setHexInput(text);
    setFileName('');

    if (!text.trim()) {
      setParsedData(null);
      setError('');
      return;
    }

    const result = parseExt4Superblock(text);
    if (result.ok) {
      setParsedData(result.data);
      setError('');
    } else {
      setParsedData(null);
      setError(result.error ?? 'Failed to parse ext superblock.');
    }
  }

  function loadSample(variant) {
    const sampleBytes = createSampleSuperblock(variant);
    const hex = bytesToHex(sampleBytes);
    setFileName('');
    setHexInput(hex);
    const result = parseExt4Superblock(sampleBytes);
    if (result.ok) {
      setParsedData(result.data);
      setError('');
    } else {
      setParsedData(null);
      setError(result.error ?? 'Failed to parse sample.');
    }
  }

  function handleClear() {
    setHexInput('');
    setFileName('');
    setParsedData(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleCopyHexDump() {
    if (!parsedData?.hexDump) return;
    try {
      await navigator.clipboard.writeText(parsedData.hexDump);
      showCopied(true);
    } catch {
      // Ignore clipboard write failure
    }
  }

  return (
    <section className="ext4-tool" aria-labelledby="ext4-tool-title">
      <header className="ext4-header">
        <h2 id="ext4-tool-title">ext4 Superblock Inspector</h2>
        <p>
          Inspect ext2, ext3, and ext4 filesystem geometry, volume metadata, feature flags,
          and raw superblock bytes client-side.
        </p>
      </header>

      <div className="ext4-input-card">
        <div
          className={`dropzone ${isDragOver ? 'drag-active' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label="Drop or select disk image file"
        >
          <span className="dropzone-icon" aria-hidden="true">
            💾
          </span>
          <span className="dropzone-text">
            {fileName ? `Selected file: ${fileName}` : 'Drop disk image here or click to browse'}
          </span>
          <span className="dropzone-hint">
            Only the first 2048 bytes will be read. Superblock is parsed at offset 1024.
          </span>
          <input
            ref={fileInputRef}
            type="file"
            id="ext4-file-picker"
            className="hidden-input"
            onChange={handleFileInputChange}
            aria-label="Choose filesystem image file"
          />
        </div>

        <div className="ext4-toolbar">
          <div className="toolbar-group">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => loadSample('ext4')}
            >
              Load Sample ext4
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => loadSample('ext3')}
            >
              Sample ext3
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => loadSample('ext2')}
            >
              Sample ext2
            </button>
          </div>

          <div className="toolbar-group">
            <button
              type="button"
              className="btn"
              onClick={handleClear}
              disabled={!hexInput && !fileName && !parsedData}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="ext4-textarea-group">
          <label htmlFor="ext4-hex-textarea">
            Or paste disk image hex bytes (minimum 2048 bytes):
          </label>
          <textarea
            id="ext4-hex-textarea"
            className="ext4-textarea"
            value={hexInput}
            onChange={handleHexChange}
            placeholder="Paste raw hex (e.g. 0000...53ef...) or load a sample above"
            rows={4}
            spellCheck={false}
          />
        </div>

        {error && (
          <div className="alert-error" role="alert">
            <span aria-hidden="true">⚠️</span>
            <span>{error}</span>
          </div>
        )}
      </div>

      {parsedData && (
        <div className="results-container" data-testid="ext4-results">
          {/* Hero status bar */}
          <div className="summary-hero">
            <div className="hero-main">
              <span className="variant-badge">{parsedData.variant}</span>
              <span
                className={`status-badge ${
                  parsedData.isClean ? 'status-clean' : 'status-error'
                }`}
              >
                {parsedData.state}
              </span>
            </div>
            <div>
              <strong>Magic:</strong> <code>{parsedData.magicHex}</code>
            </div>
          </div>

          {/* 2-column detailed summary cards */}
          <div className="grid-2col">
            <article className="info-card">
              <h3>Volume Identity</h3>
              <dl className="data-list">
                <dt>Volume Name</dt>
                <dd>{parsedData.volumeName}</dd>
                <dt>UUID</dt>
                <dd>{parsedData.uuid}</dd>
                <dt>Last Mounted</dt>
                <dd>{parsedData.lastMountedPath}</dd>
                <dt>Creator OS</dt>
                <dd>{parsedData.creatorOs}</dd>
                <dt>Revision Level</dt>
                <dd>{parsedData.revLevelLabel}</dd>
                <dt>Errors Action</dt>
                <dd>{parsedData.errorsBehavior}</dd>
              </dl>
            </article>

            <article className="info-card">
              <h3>Geometry & Sizing</h3>
              <dl className="data-list">
                <dt>Block Size</dt>
                <dd>{parsedData.blockSize.toLocaleString()} bytes</dd>
                <dt>Inode Size</dt>
                <dd>{parsedData.inodeSize} bytes</dd>
                <dt>Total Blocks</dt>
                <dd>{parsedData.blocksCount}</dd>
                <dt>Free Blocks</dt>
                <dd>{parsedData.freeBlocksCount}</dd>
                <dt>Total Inodes</dt>
                <dd>{parsedData.inodesCount.toLocaleString()}</dd>
                <dt>Free Inodes</dt>
                <dd>{parsedData.freeInodesCount.toLocaleString()}</dd>
                <dt>First Data Block</dt>
                <dd>{parsedData.firstDataBlock}</dd>
                <dt>Blocks / Group</dt>
                <dd>{parsedData.blocksPerGroup.toLocaleString()}</dd>
                <dt>Inodes / Group</dt>
                <dd>{parsedData.inodesPerGroup.toLocaleString()}</dd>
              </dl>
            </article>

            <article className="info-card">
              <h3>Mount & Health History</h3>
              <dl className="data-list">
                <dt>Mount Count</dt>
                <dd>
                  {parsedData.mountCount} / {parsedData.maxMountCount}
                </dd>
                <dt>Last Mount Time</dt>
                <dd>{parsedData.mountTimeFormatted}</dd>
                <dt>Last Write Time</dt>
                <dd>{parsedData.writeTimeFormatted}</dd>
                <dt>Last FS Check</dt>
                <dd>{parsedData.lastCheckTimeFormatted}</dd>
                <dt>Check Interval</dt>
                <dd>{parsedData.checkInterval} s</dd>
                <dt>Block Group Nr</dt>
                <dd>{parsedData.blockGroupNr}</dd>
              </dl>
            </article>

            <article className="info-card">
              <h3>Feature Flags</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    Compatible (COMPAT):
                  </strong>
                  <div className="feature-chips">
                    {parsedData.compatFeatures.length > 0 ? (
                      parsedData.compatFeatures.map((flag) => (
                        <span
                          key={flag}
                          className={`chip ${flag.startsWith('UNKNOWN') ? 'chip-unknown' : ''}`}
                        >
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="chip chip-empty">none</span>
                    )}
                  </div>
                </div>

                <div>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    Incompatible (INCOMPAT):
                  </strong>
                  <div className="feature-chips">
                    {parsedData.incompatFeatures.length > 0 ? (
                      parsedData.incompatFeatures.map((flag) => (
                        <span
                          key={flag}
                          className={`chip ${flag.startsWith('UNKNOWN') ? 'chip-unknown' : ''}`}
                        >
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="chip chip-empty">none</span>
                    )}
                  </div>
                </div>

                <div>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    Read-Only Compatible (RO_COMPAT):
                  </strong>
                  <div className="feature-chips">
                    {parsedData.roCompatFeatures.length > 0 ? (
                      parsedData.roCompatFeatures.map((flag) => (
                        <span
                          key={flag}
                          className={`chip ${flag.startsWith('UNKNOWN') ? 'chip-unknown' : ''}`}
                        >
                          {flag}
                        </span>
                      ))
                    ) : (
                      <span className="chip chip-empty">none</span>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </div>

          {/* Superblock raw hex dump */}
          <article className="hexdump-container">
            <div className="hexdump-header">
              <h3>Superblock Raw Hex Dump (Offset 0x0400 - 0x07FF)</h3>
              <button
                type="button"
                className="btn copy-btn"
                onClick={handleCopyHexDump}
                aria-label="Copy hex dump to clipboard"
              >
                {copied ? 'Copied!' : 'Copy Hex Dump'}
              </button>
            </div>
            <pre
              className="hex-pre"
              tabIndex={0}
              aria-label="Superblock raw hex dump"
            >
              {parsedData.hexDump}
            </pre>
          </article>
        </div>
      )}
    </section>
  );
}
