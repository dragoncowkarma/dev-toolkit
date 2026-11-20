import { useRef, useState } from 'react';
import { parseZstdFrames } from './zstd-header.utils.js';
import './zstd-header-inspector.css';

/**
 * Renders a client-side inspector for Zstandard frame headers.
 * @returns {React.JSX.Element} The Zstandard header inspector.
 */
export default function ZstdHeaderInspectorTool() {
  const [frames, setFrames] = useState([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Choose a Zstandard stream to inspect.');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsedFrames = parseZstdFrames(await file.arrayBuffer());
      setFrames(parsedFrames);
      setError('');
      const frameLabel = `frame${parsedFrames.length === 1 ? '' : 's'}`;
      setStatus(`Inspected ${parsedFrames.length} ${frameLabel} from ${file.name}.`);
    } catch (inspectionError) {
      setFrames([]);
      setError(inspectionError.message);
      setStatus('Inspection failed.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      inputRef.current?.click();
    }
  }

  return (
    <section
      className="zstd-inspector"
      aria-label="Zstandard Frame Header Inspector"
    >
      <input
        ref={inputRef}
        className="zstd-inspector__input"
        type="file"
        onChange={(event) => inspectFile(event.target.files?.[0])}
        aria-label="Choose a Zstandard stream"
      />
      <div
        className="zstd-inspector__dropzone"
        role="button"
        tabIndex="0"
        onDrop={handleDrop}
        onDragOver={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        onClick={() => inputRef.current?.click()}
      >
        <p>Drop a Zstandard stream here, or click to choose a file.</p>
        <p className="zstd-inspector__hint">
          Only frame metadata is inspected; content is never decompressed.
        </p>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {error && <div className="zstd-inspector__error" role="alert">⚠ {error}</div>}
      {frames.map((frame, index) => (
        <article className="zstd-inspector__frame" key={`${frame.offset}-${frame.type}`}>
          <h2>Frame {index + 1}: {frame.type}</h2>
          <dl>
            {Object.entries(frame).filter(([key]) => key !== 'type').map(([key, value]) => (
              <div className="zstd-inspector__item" key={key}>
                <dt>
                  {key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())}
                </dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        </article>
      ))}
    </section>
  );
}
