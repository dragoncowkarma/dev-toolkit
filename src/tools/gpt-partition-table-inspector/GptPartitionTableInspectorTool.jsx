import { useEffect, useRef, useState } from 'react';
import {
  bytesToHex,
  createSampleGptBytes,
  formatBytes,
  formatHex32,
  formatHex64,
  parseGpt,
  parseHexToBytes,
  readGptSlice,
} from './gpt.utils.js';
import './gpt-partition-table-inspector.css';

const INPUT_MODES = {
  FILE: 'file',
  HEX: 'hex',
};

/**
 * Renders the GPT Partition Table Inspector tool.
 *
 * @returns {React.JSX.Element} The GPT inspector component.
 */
export default function GptPartitionTableInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.FILE);
  const [hexInput, setHexInput] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(null);
  const [gptData, setGptData] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  // Parse whenever hex input changes in hex mode.
  useEffect(() => {
    if (mode !== INPUT_MODES.HEX) return;
    if (!hexInput.trim()) {
      setGptData(null);
      setError('');
      return;
    }
    try {
      const bytes = parseHexToBytes(hexInput);
      const parsed = parseGpt(bytes);
      setGptData(parsed);
      setError('');
    } catch (err) {
      setGptData(null);
      setError(err.message);
    }
  }, [hexInput, mode]);

  async function handleFileUpload(file) {
    if (!file) return;
    setFileName(file.name);
    setFileSize(file.size);
    try {
      const bytes = await readGptSlice(file);
      const parsed = parseGpt(bytes);
      setGptData(parsed);
      setError('');
    } catch (err) {
      setGptData(null);
      setError(err.message);
    }
  }

  function handleModeChange(newMode) {
    setMode(newMode);
    setError('');
  }

  function handleLoadSample() {
    const sampleBytes = createSampleGptBytes();
    const hex = bytesToHex(sampleBytes);
    setMode(INPUT_MODES.HEX);
    setHexInput(hex);
  }

  function handleClear() {
    setHexInput('');
    setFileName('');
    setFileSize(null);
    setGptData(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="gpt-inspector">
      <div className="gpt-toolbar">
        <div className="mode-toggle" role="radiogroup" aria-label="Input Mode">
          <button
            type="button"
            className={`mode-btn ${mode === INPUT_MODES.FILE ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.FILE)}
            aria-checked={mode === INPUT_MODES.FILE}
            role="radio"
          >
            File Upload
          </button>
          <button
            type="button"
            className={`mode-btn ${mode === INPUT_MODES.HEX ? 'active' : ''}`}
            onClick={() => handleModeChange(INPUT_MODES.HEX)}
            aria-checked={mode === INPUT_MODES.HEX}
            role="radio"
          >
            Paste Hex
          </button>
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={handleLoadSample}>
            Load Sample GPT
          </button>
          <button type="button" className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </div>

      {mode === INPUT_MODES.FILE && (
        <div className="file-container">
          <label className="file-dropzone" htmlFor="gpt-file-upload">
            <input
              id="gpt-file-upload"
              ref={fileInputRef}
              type="file"
              className="file-input"
              aria-label="Upload disk image file"
              onChange={(e) => handleFileUpload(e.target.files?.[0])}
            />
            <div className="dropzone-prompt">
              <span className="dropzone-icon" aria-hidden="true">
                🗂️
              </span>
              <span className="dropzone-text">
                {fileName
                  ? `${fileName} (${formatBytes(fileSize)})`
                  : 'Select or drop disk image file'}
              </span>
              <span className="dropzone-subtext">
                Only the first 34 sectors (17,408 bytes) will be read into memory.
              </span>
            </div>
          </label>
        </div>
      )}

      {mode === INPUT_MODES.HEX && (
        <div className="hex-textarea-container">
          <label htmlFor="gpt-hex-input" className="sr-only">
            GPT Hex Data
          </label>
          <textarea
            id="gpt-hex-input"
            className="hex-textarea"
            placeholder="Paste raw hex data starting from LBA 0 (e.g. 0000... or EFI PART at LBA 1)"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
          />
        </div>
      )}

      {error && (
        <div className="error-message" role="alert">
          <strong>Error:</strong> {error}
        </div>
      )}

      {gptData && (
        <div className="results-container">
          <section className="card" aria-labelledby="gpt-header-title">
            <div className="card-header">
              <h2 id="gpt-header-title" className="card-title">
                GPT Header (LBA 1)
              </h2>
              <span className="badge badge-success">
                {gptData.signature} - Valid Header
              </span>
            </div>

            <div className="grid-props">
              <div className="prop-item">
                <span className="prop-label">Sector Size</span>
                <span className="prop-value">{gptData.sectorSize} bytes</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Revision</span>
                <span className="prop-value">{gptData.revision}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Header Size</span>
                <span className="prop-value">{gptData.headerSize} bytes</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Disk GUID</span>
                <span className="prop-value">
                  <code>{gptData.diskGuid}</code>
                </span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Header CRC32</span>
                <span className="prop-value">
                  <code>{formatHex32(gptData.headerCrc32)}</code>{' '}
                  {gptData.headerCrcMatch ? (
                    <span className="badge badge-success">Matched</span>
                  ) : (
                    <span className="badge badge-error">
                      Mismatch ({formatHex32(gptData.computedHeaderCrc32)})
                    </span>
                  )}
                </span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Current LBA</span>
                <span className="prop-value">{gptData.currentLba.toString()}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Backup LBA</span>
                <span className="prop-value">{gptData.backupLba.toString()}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">First Usable LBA</span>
                <span className="prop-value">{gptData.firstUsableLba.toString()}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Last Usable LBA</span>
                <span className="prop-value">{gptData.lastUsableLba.toString()}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Partition Entries LBA</span>
                <span className="prop-value">{gptData.partitionEntryLba.toString()}</span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Entry Count / Size</span>
                <span className="prop-value">
                  {gptData.entryCount} entries ({gptData.entrySize} B each)
                </span>
              </div>
              <div className="prop-item">
                <span className="prop-label">Partition Array CRC32</span>
                <span className="prop-value">
                  <code>{formatHex32(gptData.partitionArrayCrc32)}</code>{' '}
                  {gptData.computedArrayCrc32 !== null ? (
                    gptData.arrayCrcMatch ? (
                      <span className="badge badge-success">Matched</span>
                    ) : (
                      <span className="badge badge-error">
                        Mismatch ({formatHex32(gptData.computedArrayCrc32)})
                      </span>
                    )
                  ) : (
                    <span className="badge badge-info">Buffer Truncated</span>
                  )}
                </span>
              </div>
            </div>
          </section>

          <section className="card" aria-labelledby="gpt-partitions-title">
            <div className="card-header">
              <h2 id="gpt-partitions-title" className="card-title">
                Partition Entries ({gptData.partitions.length} active)
              </h2>
            </div>

            {gptData.partitions.length === 0 ? (
              <p className="prop-value">No active partitions defined (all entries are zero).</p>
            ) : (
              <div className="partitions-list">
                {gptData.partitions.map((part) => (
                  <div key={part.index} className="partition-card">
                    <div className="partition-header">
                      <span className="partition-title">
                        #{part.index} {part.name}
                      </span>
                      <span className="badge badge-info">{part.typeName}</span>
                    </div>

                    <div className="grid-props">
                      <div className="prop-item">
                        <span className="prop-label">Type GUID</span>
                        <span className="prop-value">
                          <code>{part.typeGuid}</code>
                        </span>
                      </div>
                      <div className="prop-item">
                        <span className="prop-label">Partition Unique GUID</span>
                        <span className="prop-value">
                          <code>{part.uniqueGuid}</code>
                        </span>
                      </div>
                      <div className="prop-item">
                        <span className="prop-label">Starting LBA</span>
                        <span className="prop-value">{part.firstLba.toString()}</span>
                      </div>
                      <div className="prop-item">
                        <span className="prop-label">Ending LBA</span>
                        <span className="prop-value">{part.lastLba.toString()}</span>
                      </div>
                      <div className="prop-item">
                        <span className="prop-label">Sector Count / Size</span>
                        <span className="prop-value">
                          {part.sectorCount.toString()} sectors ({part.formattedSize})
                        </span>
                      </div>
                      <div className="prop-item">
                        <span className="prop-label">Attributes</span>
                        <span className="prop-value">
                          <code>{formatHex64(part.attributes)}</code>
                        </span>
                      </div>
                    </div>

                    {part.attributeFlags.length > 0 && (
                      <div className="flags-container">
                        {part.attributeFlags.map((flag) => (
                          <span key={flag} className="flag-tag">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
