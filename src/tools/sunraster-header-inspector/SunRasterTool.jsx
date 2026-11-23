import { useRef, useState } from 'react';
import { decodeInput, parseSunRaster } from './sunraster.utils.js';
import './sunraster.css';

/** Inspect a locally selected or pasted Sun Raster file. */
export default function SunRasterTool() {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('hex');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const request = useRef(0);

  function inspect(bytes) {
    try {
      setResult(parseSunRaster(bytes));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  async function readFile(file) {
    if (!file) return;
    const id = ++request.current;
    setResult(null);
    setError('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (request.current === id) inspect(bytes);
    } catch {
      if (request.current === id) setError('Failed to read the selected file.');
    }
  }

  function inspectText() {
    request.current += 1;
    try {
      inspect(decodeInput(input, format));
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  return (
    <section className="sunraster-tool" aria-label="Sun Raster Header Inspector">
      <p>Inspect a complete Sun Raster file locally. Data stays in your browser.</p>
      <div
        className="sunraster-drop"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          readFile(event.dataTransfer.files[0]);
        }}
      >
        <label htmlFor="sunraster-file">Select a file or drop it here</label>
        <input id="sunraster-file" type="file" accept=".ras,image/x-sun-raster"
          onChange={(event) => readFile(event.target.files[0])} />
      </div>
      <label htmlFor="sunraster-format">Input format</label>
      <select id="sunraster-format" value={format}
        onChange={(event) => setFormat(event.target.value)}>
        <option value="hex">Hex</option>
        <option value="base64">Base64</option>
      </select>
      <label htmlFor="sunraster-input">File data</label>
      <textarea id="sunraster-input" value={input} spellCheck={false}
        onChange={(event) => setInput(event.target.value)} />
      <button type="button" onClick={inspectText}>Inspect data</button>
      {error && <div className="sunraster-error" role="alert">{error}</div>}
      {result && (
        <dl>
          {Object.entries({
            Width: result.width, Height: result.height, 'Depth (bits)': result.depth,
            'Header length (bytes)': result.length, Type: `${result.typeName} (${result.type})`,
            'Colormap type': `${result.mapTypeName} (${result.maptype})`,
            'Colormap size (bytes)': result.maplength,
            'Expected uncompressed pixel data (bytes)': result.expectedPixelLength,
            'Available payload (bytes)': result.availablePayload,
            'Available pixel data (bytes)': result.availablePixels,
          }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
    </section>
  );
}
