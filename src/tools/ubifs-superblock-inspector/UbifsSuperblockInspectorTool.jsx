import { useRef, useState } from 'react';
import { parseUbifsSuperblock } from './ubifsSuperblockInspector.utils.js';
import './ubifsSuperblockInspector.css';

/**
 * Client-side UBIFS Superblock Inspector tool.
 * Reads the first 4096 bytes of an uploaded UBIFS image and displays decoded fields.
 *
 * @returns {React.JSX.Element} The component view.
 */
export default function UbifsSuperblockInspectorTool() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    if (!file) {
      return;
    }
    setError('');
    setData(null);
    setFileName(file.name);

    // Read only the first 4096 bytes (superblock node in LEB 0). No data leaves the browser.
    const slice = file.slice(0, 4096);
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const buffer = reader.result;
        const parsed = parseUbifsSuperblock(buffer);
        setData(parsed);
      } catch (err) {
        setError(err.message || 'Failed to parse UBIFS superblock.');
      }
    };

    reader.onerror = () => {
      setError('Failed to read file from browser.');
    };

    reader.readAsArrayBuffer(slice);
  };

  const handleInputChange = (event) => {
    const file = event.target.files?.[0];
    handleFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    handleFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  return (
    <div className="ubifs-inspector">
      <div
        className="ubifs-inspector__upload"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          id="ubifs-file-input"
          className="ubifs-inspector__file-input"
          data-testid="ubifs-file-input"
          onChange={handleInputChange}
        />
        <button
          type="button"
          className="ubifs-inspector__upload-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          Choose UBIFS Image
        </button>
        <p className="ubifs-inspector__dropzone-hint">
          or drag and drop UBIFS image file here (only first 4096 bytes are read)
        </p>
        {fileName && (
          <p className="ubifs-inspector__file-meta">
            Loaded: {fileName}
          </p>
        )}
      </div>

      {error && (
        <div className="ubifs-inspector__error" role="alert" data-testid="ubifs-error">
          {error}
        </div>
      )}

      {data && (
        <div className="ubifs-inspector__section" data-testid="ubifs-results">
          <h3 className="ubifs-inspector__section-title">Common Node Header</h3>
          <dl className="ubifs-inspector__dl">
            <div className="ubifs-inspector__item">
              <dt>Magic</dt>
              <dd>{data.magic}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>CRC32</dt>
              <dd>
                {data.crc}
                <span
                  className={`ubifs-inspector__tag ubifs-inspector__tag--${
                    data.crcValid ? 'valid' : 'mismatch'
                  }`}
                >
                  {data.crcStatus}
                </span>
              </dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Sequence Number</dt>
              <dd>{data.sqnum}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Node Length</dt>
              <dd>{data.len} bytes</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Node Type</dt>
              <dd>{data.nodeType}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Group Type</dt>
              <dd>{data.groupType}</dd>
            </div>
          </dl>

          <h3 className="ubifs-inspector__section-title">Superblock Fields</h3>
          <dl className="ubifs-inspector__dl">
            <div className="ubifs-inspector__item">
              <dt>Key Hash</dt>
              <dd>{data.keyHash}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Key Format</dt>
              <dd>{data.keyFmt}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Flags</dt>
              <dd>{data.flags}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Min I/O Size</dt>
              <dd>{data.minIoSize} bytes</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>LEB Size</dt>
              <dd>{data.lebSize} bytes</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>LEB Count</dt>
              <dd>{data.lebCnt}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Max LEB Count</dt>
              <dd>{data.maxLebCnt}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Max Bud Bytes</dt>
              <dd>{data.maxBudBytes} bytes</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Log LEBs</dt>
              <dd>{data.logLebs}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>LPT LEBs</dt>
              <dd>{data.lptLebs}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Orphan LEBs</dt>
              <dd>{data.orphLebs}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Journal Heads Count</dt>
              <dd>{data.jheadCnt}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Fanout</dt>
              <dd>{data.fanout}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>LPT Save Count</dt>
              <dd>{data.lsaveCnt}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Format Version</dt>
              <dd>{data.fmtVersion}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Default Compression</dt>
              <dd>{data.defaultCompr}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Reserved Pool UID</dt>
              <dd>{data.rpUid}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Reserved Pool GID</dt>
              <dd>{data.rpGid}</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Reserved Pool Size</dt>
              <dd>{data.rpSize} bytes</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>Time Granularity</dt>
              <dd>{data.timeGran} ns</dd>
            </div>
            <div className="ubifs-inspector__item">
              <dt>UUID</dt>
              <dd>{data.uuid}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
