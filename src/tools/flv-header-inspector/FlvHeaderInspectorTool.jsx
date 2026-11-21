import { useRef, useState } from 'react';
import { parseFlv } from './flv-header-inspector.utils.js';
import './flv-header-inspector.css';

function formatBool(value) {
  return value ? 'Present' : 'Not present';
}

function HeaderDetails({ header }) {
  return (
    <dl className="flv-header-inspector__details">
      <div><dt>Signature</dt><dd>{header.signature}</dd></div>
      <div><dt>Version</dt><dd>{header.version}</dd></div>
      <div><dt>Audio</dt><dd>{formatBool(header.hasAudio)}</dd></div>
      <div><dt>Video</dt><dd>{formatBool(header.hasVideo)}</dd></div>
      <div><dt>DataOffset</dt><dd>{header.dataOffset}</dd></div>
    </dl>
  );
}

function TagDetails({ tag, index }) {
  const codecDetails = tag.video
    ? `Frame: ${tag.video.frameTypeLabel}; Codec: ${tag.video.codecLabel}`
    : tag.audio
      ? `${tag.audio.soundFormatLabel}; ${tag.audio.soundRate}; ${tag.audio.soundSize}; ` +
        tag.audio.soundType
      : '—';
  return (
    <tr>
      <td>{index + 1}</td>
      <td>{tag.previousTagSize}</td>
      <td>{tag.tagType} ({tag.tagTypeCode})</td>
      <td>{tag.dataSize}</td>
      <td>{tag.timestamp}</td>
      <td>{tag.streamId}</td>
      <td>{codecDetails}</td>
    </tr>
  );
}

/**
 * Renders a browser-only inspector for FLV container headers and tag metadata.
 * @returns {React.JSX.Element} The FLV header inspector UI.
 */
export default function FlvHeaderInspectorTool() {
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const [readError, setReadError] = useState('');
  const requestRef = useRef(0);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const requestId = (requestRef.current += 1);
    setFileName(file.name);
    setReadError('');
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      if (requestRef.current !== requestId) return;
      setResult(parseFlv(buffer));
    } catch {
      if (requestRef.current === requestId) {
        setReadError('The selected file could not be read.');
      }
    }
  }

  function handleClear() {
    requestRef.current += 1;
    setFileName('');
    setResult(null);
    setReadError('');
  }

  const diagnostics = result?.diagnostics ?? [];

  return (
    <section className="flv-header-inspector" aria-label="FLV Header Inspector">
      <div className="flv-header-inspector__toolbar">
        <label className="flv-header-inspector__upload">
          Choose FLV file
          <input type="file" accept=".flv,video/x-flv" onChange={handleFileChange} />
        </label>
        {fileName && <span className="flv-header-inspector__file-name">{fileName}</span>}
        {(fileName || result) && <button type="button" onClick={handleClear}>Clear</button>}
      </div>

      <p className="flv-header-inspector__hint">
        Files are inspected locally in your browser. Nothing is uploaded.
      </p>

      {readError && (
        <div className="flv-header-inspector__diagnostic error" role="alert">
          {readError}
        </div>
      )}

      {result?.header && (
        <section className="flv-header-inspector__section">
          <h2>Header</h2>
          <HeaderDetails header={result.header} />
        </section>
      )}

      {diagnostics.map((diagnostic, index) => (
        <div
          key={`${diagnostic.offset}-${index}`}
          className={`flv-header-inspector__diagnostic ${diagnostic.level}`}
          role={diagnostic.level === 'error' ? 'alert' : 'status'}
        >
          {diagnostic.level === 'error' ? 'Error' : 'Warning'} at byte {diagnostic.offset}:{' '}
          {diagnostic.message}
        </div>
      ))}

      {result && result.tags.length > 0 && (
        <section className="flv-header-inspector__section">
          <h2>Tags ({result.tags.length})</h2>
          <div className="flv-header-inspector__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>PreviousTagSize</th><th>Type</th><th>DataSize</th>
                  <th>Timestamp</th><th>StreamID</th><th>Codec details</th>
                </tr>
              </thead>
              <tbody>
                {result.tags.map((tag, index) => (
                  <TagDetails key={tag.offset} tag={tag} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
