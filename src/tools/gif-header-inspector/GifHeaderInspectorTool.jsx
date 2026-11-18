import { useRef, useState } from 'react';
import { formatBytes, parseGif } from './gifHeaderInspector.utils.js';
import './gifHeaderInspector.css';

function ValueList({ values }) {
  return (
    <dl className="gif-values">
      {Object.entries(values).map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{String(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function RawBytes({ bytes }) {
  return (
    <details className="gif-raw-bytes">
      <summary>Raw bytes ({bytes.length})</summary>
      <code>{formatBytes(bytes)}</code>
    </details>
  );
}

/**
 * Renders a browser-only GIF structural inspector for uploaded files.
 *
 * @returns {React.JSX.Element} The GIF inspector UI.
 */
export default function GifHeaderInspectorTool() {
  const [inspection, setInspection] = useState(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setFileName(file.name);
      setInspection(parseGif(new Uint8Array(await file.arrayBuffer())));
      setReadError('');
    } catch {
      setInspection(null);
      setReadError('The selected file could not be read.');
    }
  }

  function handleClear() {
    setInspection(null);
    setFileName('');
    setReadError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="gif-inspector" aria-label="GIF Header Inspector">
      <div className="gif-inspector__toolbar">
        <label className="btn gif-inspector__file-button">
          Choose GIF File
          <input
            ref={fileInputRef}
            type="file"
            accept="image/gif,.gif"
            onChange={handleFileChange}
            aria-label="Choose a GIF file to inspect"
          />
        </label>
        <button type="button" className="btn" onClick={handleClear}>
          Clear
        </button>
      </div>
      <p className="gif-inspector__privacy">
        Files are parsed entirely in your browser and are never uploaded.
      </p>
      {readError && (
        <div className="gif-inspector__error" role="alert">
          ⚠ {readError}
        </div>
      )}
      {inspection && (
        <div className="gif-inspector__results">
          <h2>{fileName || 'GIF inspection'}</h2>
          <section className="gif-inspector__section">
            <h3>Header and Logical Screen</h3>
            <ValueList values={{
              Signature: inspection.signature,
              Width: `${inspection.logicalScreen?.width ?? '—'} px`,
              Height: `${inspection.logicalScreen?.height ?? '—'} px`,
              'Global color table': inspection.logicalScreen?.globalColorTableFlag
                ? 'Present'
                : 'Absent',
              'Color resolution': inspection.logicalScreen?.colorResolution ?? '—',
              'Sort flag': inspection.logicalScreen?.sortFlag ? 'Set' : 'Clear',
              'Background color index': inspection.logicalScreen?.backgroundColorIndex ?? '—',
              'Pixel aspect ratio': inspection.logicalScreen?.pixelAspectRatio ?? '—',
            }} />
          </section>
          {inspection.globalColorTable && (
            <section className="gif-inspector__section">
              <h3>Global Color Table ({inspection.globalColorTable.size} colors)</h3>
              <div className="gif-colors">
                {inspection.globalColorTable.colors.map((color, index) => (
                  <span
                    key={`${color.hex}-${index}`}
                    title={`${index}: ${color.hex}`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
              <RawBytes bytes={inspection.globalColorTable.rawBytes} />
            </section>
          )}
          <section className="gif-inspector__section">
            <h3>Blocks</h3>
            {inspection.blocks.length ? (
              inspection.blocks.map((block) => (
                <article className="gif-block" key={`${block.offset}-${block.type}`}>
                  <h4>{block.type} <span>byte {block.offset}</span></h4>
                  {block.details && <ValueList values={block.details} />}
                  {block.localColorTable && (
                    <p>Local Color Table: {block.localColorTable.size} colors</p>
                  )}
                  {block.imageData && (
                    <p>
                      Image Data: LZW minimum code size {block.imageData.lzwMinimumCodeSize},
                      {' '}{block.imageData.byteLength} data bytes
                    </p>
                  )}
                  <RawBytes bytes={block.rawBytes} />
                </article>
              ))
            ) : <p>No complete blocks could be parsed.</p>}
          </section>
          {inspection.errors.length > 0 && (
            <section className="gif-inspector__error" role="alert">
              <h3>Validation messages</h3>
              <ul>{inspection.errors.map((error) => <li key={error}>{error}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
