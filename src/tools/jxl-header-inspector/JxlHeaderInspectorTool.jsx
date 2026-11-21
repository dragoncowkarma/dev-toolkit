import { useRef, useState } from 'react';
import { base64ToBytes, fileToBytes, inspectJxl } from './jxlHeader.utils.js';
import './jxlHeaderInspector.css';

function valueText(value) {
  return typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
}

/**
 * Renders a client-side JPEG XL header inspector.
 *
 * @returns {React.JSX.Element} The JPEG XL header inspector.
 */
export function JxlHeaderInspectorTool() {
  const [result, setResult] = useState(null);
  const [base64, setBase64] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function inspect(bytes, source) {
    try {
      setResult(inspectJxl(bytes, source));
      setError('');
    } catch (caught) {
      setResult(null);
      setError(caught.message);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      inspect(await fileToBytes(file), `File "${file.name}"`);
    } catch (caught) {
      setResult(null);
      setError(`File "${file.name}": ${caught.message}`);
    }
  }

  function handleBase64() {
    try {
      inspect(base64ToBytes(base64), 'Base64 paste');
    } catch (caught) {
      setResult(null);
      setError(caught.message);
    }
  }

  return (
    <section className="jxl-header-inspector" aria-label="JPEG XL Header Inspector">
      <div
        className={`jxl-header-inspector__dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <p>Drop a .jxl file here, or select one from your device.</p>
        <button type="button" onClick={() => inputRef.current?.click()}>Select JXL file</button>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".jxl,image/jxl,application/octet-stream"
          aria-label="Select a JPEG XL file"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>

      <div className="jxl-header-inspector__paste">
        <label htmlFor="jxl-base64">Paste Base64-encoded JPEG XL data</label>
        <textarea
          id="jxl-base64"
          value={base64}
          onChange={(event) => setBase64(event.target.value)}
          placeholder="Paste Base64 data…"
          spellCheck={false}
        />
        <button type="button" onClick={handleBase64}>Inspect Base64</button>
      </div>

      {error && <p className="jxl-header-inspector__error" role="alert">{error}</p>}
      {result && (
        <div className="jxl-header-inspector__result">
          <h3>Image header</h3>
          <dl>
            <dt>Format</dt><dd>{result.format}</dd>
            <dt>Dimensions</dt><dd>{result.header.width} × {result.header.height} px</dd>
            <dt>Bit depth</dt><dd>{valueText(result.header.bitDepth)}</dd>
            <dt>Color channels</dt><dd>{valueText(result.header.colorChannels)}</dd>
            <dt>Has alpha</dt><dd>{valueText(result.header.hasAlpha)}</dd>
            <dt>Encoding mode</dt><dd>{result.header.mode}</dd>
          </dl>
          {result.boxes.length > 0 && (
            <>
              <h3>Container boxes</h3>
              <dl>
                {result.boxes.map((box) => (
                  <div className="jxl-header-inspector__box" key={`${box.offset}-${box.type}`}>
                    <dt>{box.type}</dt><dd>Offset {box.offset}, {box.size} bytes</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default JxlHeaderInspectorTool;
