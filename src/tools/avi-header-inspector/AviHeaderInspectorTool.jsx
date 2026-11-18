import { useRef, useState } from 'react';
import { parseAviHeader } from './avi-header-inspector.utils.js';
import './avi-header-inspector.css';

function formatFourCC(value) {
  return value.trim() || '(none)';
}

/**
 * Renders a local-only AVI header inspector.
 *
 * @returns {React.JSX.Element} The AVI header inspector UI.
 */
export default function AviHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsed = parseAviHeader(await file.arrayBuffer());
      setResult(parsed);
      setFileName(file.name);
      setError('');
    } catch (caughtError) {
      setResult(null);
      setFileName(file.name);
      setError(caughtError.message || 'Unable to inspect this file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    inspectFile(event.dataTransfer.files?.[0]);
  }

  return (
    <section className="avi-inspector" aria-label="AVI Header Inspector">
      <div
        className={`avi-inspector__dropzone ${isDragging ? 'avi-inspector__dropzone--active' : ''}`}
        role="button"
        tabIndex="0"
        aria-label="Choose an AVI file or drop one here"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
        }}
        onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <strong>Drop an AVI file here</strong>
        <span>or choose a local file to inspect its RIFF headers</span>
        <button type="button" className="avi-inspector__button" onClick={(event) => {
          event.stopPropagation();
          inputRef.current?.click();
        }}>
          Choose file
        </button>
        <input
          ref={inputRef}
          className="avi-inspector__input"
          type="file"
          accept=".avi,video/avi"
          aria-label="Choose AVI file"
          onChange={(event) => inspectFile(event.target.files?.[0])}
        />
      </div>

      {fileName && <p className="avi-inspector__file">Inspecting: {fileName}</p>}
      {error && <div className="avi-inspector__error" role="alert">⚠ {error}</div>}

      {result && (
        <div className="avi-inspector__results" aria-live="polite">
          <section className="avi-inspector__card" aria-labelledby="avi-main-header">
            <h2 id="avi-main-header">Main AVI Header</h2>
            <dl>
              <div><dt>Total frames</dt><dd>{result.mainHeader.totalFrames}</dd></div>
              <div>
                <dt>Dimensions</dt>
                <dd>{result.mainHeader.width} × {result.mainHeader.height}</dd>
              </div>
              <div>
                <dt>Frame rate</dt>
                <dd>
                  {result.mainHeader.frameRate ?? 'Unknown'}
                  {result.mainHeader.frameRate ? ' fps' : ''}
                </dd>
              </div>
              <div><dt>Streams</dt><dd>{result.mainHeader.streamCount}</dd></div>
            </dl>
          </section>
          <section className="avi-inspector__card" aria-labelledby="avi-streams">
            <h2 id="avi-streams">Stream Headers</h2>
            {result.streams.length === 0 ? <p>No stream lists found.</p> : (
              <ul className="avi-inspector__streams">
                {result.streams.map((stream) => (
                  <li key={stream.index}>
                    <strong>Stream {stream.index}: {formatFourCC(stream.type)}</strong>
                    <span>Handler: {formatFourCC(stream.handler)}</span>
                    {stream.type === 'vids' && (
                      <span>
                        Compression: {formatFourCC(stream.compression)} · {stream.bitDepth}-bit
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
