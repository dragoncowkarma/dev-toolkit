import { useRef, useState } from 'react';
import { inspectRarArchive } from './rar-header-inspector.utils.js';
import './rar-header-inspector.css';

/**
 * Renders a local RAR 4.x and RAR 5.0 archive header inspector.
 *
 * @returns {React.JSX.Element} RAR header inspector UI.
 */
export default function RarHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  async function inspectFile(file) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setFileName(file.name);
    setResult(inspectRarArchive(buffer));
  }

  function handleDrop(event) {
    event.preventDefault();
    inspectFile(event.dataTransfer.files?.[0]);
  }

  function handleChange(event) {
    inspectFile(event.target.files?.[0]);
  }

  return (
    <section className="rar-inspector" aria-label="RAR Header Inspector">
      <input
        ref={inputRef}
        className="rar-inspector__input"
        type="file"
        accept=".rar,application/vnd.rar,application/x-rar-compressed"
        onChange={handleChange}
        aria-label="Choose a RAR archive"
      />
      <button
        type="button"
        className="rar-inspector__dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <span aria-hidden="true">🗜</span>
        <span>Choose a RAR archive or drop it here</span>
        <small>Files are parsed entirely in your browser.</small>
      </button>

      {result && (
        <div className="rar-inspector__result" aria-live="polite">
          <h2>{fileName || 'Archive'}</h2>
          {result.format && (
            <p className="rar-inspector__format">Detected format: {result.format}</p>
          )}
          {result.blocks.map((block, index) => (
            <article className="rar-inspector__block" key={`${block.offset}-${index}`}>
              <h3>{block.type}</h3>
              <p>Offset {block.offset} · {block.size} bytes</p>
              <dl>
                {block.fields.map((item) => (
                  <div key={item.name}>
                    <dt>{item.name}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
          {result.errors.map((error) => (
            <p className="rar-inspector__error" key={error}>{error}</p>
          ))}
        </div>
      )}
    </section>
  );
}
