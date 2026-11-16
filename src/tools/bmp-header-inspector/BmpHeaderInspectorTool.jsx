import { useRef, useState } from 'react';
import { parseBmpHeader } from './bmp-header-inspector.utils.js';
import './bmp-header-inspector.css';

function formatValue(value) {
  return value === null || value === undefined ? 'Not available' : value.toLocaleString();
}

function HeaderTable({ caption, rows }) {
  return (
    <div className="bmp-header-inspector__table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{formatValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Renders a browser-only BMP file and DIB header inspector.
 *
 * @returns {React.JSX.Element} The BMP header inspector UI.
 */
export default function BmpHeaderInspectorTool() {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('Choose a BMP file to inspect it locally.');

  async function inspectFile(file) {
    if (!file) return;
    try {
      const parsed = parseBmpHeader(await file.arrayBuffer());
      setResult(parsed);
      setError('');
      setFileName(file.name);
      setStatus(`Inspected ${file.name}.`);
    } catch (caughtError) {
      setResult(null);
      setFileName('');
      setError(caughtError.message);
      setStatus('Could not inspect the selected file.');
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

  const fileRows = result && [
    ['Magic bytes', result.fileHeader.magic],
    ['Declared file size', `${result.fileHeader.fileSize.toLocaleString()} bytes`],
    ['Reserved field 1', result.fileHeader.reserved1],
    ['Reserved field 2', result.fileHeader.reserved2],
    ['Pixel data offset', `${result.fileHeader.pixelDataOffset.toLocaleString()} bytes`],
  ];
  const dibRows = result && [
    ['Header type', result.dibHeader.type ?? 'Unsupported/unknown'],
    ['DIB header size', `${result.dibHeader.size.toLocaleString()} bytes`],
    ['Width', result.dibHeader.width === undefined ? null : `${result.dibHeader.width} px`],
    ['Height', result.dibHeader.height === undefined ? null : `${result.dibHeader.height} px`],
    ['Orientation', result.dibHeader.orientation],
    ['Color planes', result.dibHeader.planes],
    ['Bit depth', result.dibHeader.bitDepth === undefined
      ? null : `${result.dibHeader.bitDepth} bpp`],
    ['Compression', result.dibHeader.compressionName],
    ['Image size', result.dibHeader.imageSize === null
      ? null : `${result.dibHeader.imageSize} bytes`],
    ['Horizontal resolution', result.dibHeader.xPixelsPerMeter === null
      ? null : `${result.dibHeader.xPixelsPerMeter} pixels/meter`],
    ['Vertical resolution', result.dibHeader.yPixelsPerMeter === null
      ? null : `${result.dibHeader.yPixelsPerMeter} pixels/meter`],
    ['Palette colors', result.dibHeader.colorsUsed === null ? null : result.dibHeader.colorsUsed],
  ];

  return (
    <section className="bmp-header-inspector" aria-label="BMP Header Inspector">
      <p className="bmp-header-inspector__privacy">Files are read only in your browser.</p>
      <input
        ref={inputRef}
        className="bmp-header-inspector__input"
        type="file"
        accept=".bmp,image/bmp"
        aria-label="Choose a BMP file"
        onChange={(event) => inspectFile(event.target.files?.[0])}
      />
      <div
        className="bmp-header-inspector__dropzone"
        role="button"
        tabIndex="0"
        aria-label="Drop a BMP file here or choose one"
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <strong>Drop a BMP file here</strong>
        <span>or press Enter to choose a file</span>
      </div>
      <p className="bmp-header-inspector__status" role="status" aria-live="polite">{status}</p>

      {error && <div className="bmp-header-inspector__alert" role="alert">{error}</div>}
      {result?.warnings.map((warning) => (
        <div className="bmp-header-inspector__warning" role="alert" key={warning}>{warning}</div>
      ))}

      {result && (
        <section className="bmp-header-inspector__results" aria-label="Parsed BMP headers">
          <h2>{fileName}</h2>
          <HeaderTable caption="BITMAPFILEHEADER" rows={fileRows} />
          <HeaderTable caption="DIB header" rows={dibRows} />
        </section>
      )}
    </section>
  );
}
