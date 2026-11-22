import { useRef, useState } from 'react';
import {
  decodeBase64Bytes,
  parseHexBytes,
  parsePcxHeader,
  readFileBytes,
} from './pcx-header-inspector.utils.js';
import './pcx-header-inspector.css';

const INPUT_MODES = { FILE: 'file', HEX: 'hex', BASE64: 'base64' };

/**
 * Renders a client-side inspector for the fixed ZSoft PCX header.
 * @returns {React.JSX.Element} The PCX header inspector UI.
 */
export default function PcxHeaderInspectorTool() {
  const [mode, setMode] = useState(INPUT_MODES.FILE);
  const [input, setInput] = useState('');
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes) {
    try {
      setHeader(parsePcxHeader(bytes));
      setError('');
    } catch (caughtError) {
      setHeader(null);
      setError(caughtError.message);
    }
  }

  function handleModeChange(nextMode) {
    setMode(nextMode);
    setInput('');
    setHeader(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleTextInput(event) {
    const value = event.target.value;
    setInput(value);
    if (!value.trim()) {
      setHeader(null);
      setError('');
      return;
    }
    try {
      inspect(mode === INPUT_MODES.HEX ? parseHexBytes(value) : decodeBase64Bytes(value));
    } catch (caughtError) {
      setHeader(null);
      setError(caughtError.message);
    }
  }

  async function handleFileChange(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    try {
      inspect(await readFileBytes(selected));
    } catch (caughtError) {
      setHeader(null);
      setError(caughtError.message);
    }
  }

  const fields = header && [
    ['Manufacturer', `0x${header.manufacturer.toString(16).padStart(2, '0').toUpperCase()}`],
    ['Version', header.version],
    ['Encoding', `${header.encoding}${header.encoding === 1 ? ' (RLE)' : ''}`],
    ['Bits per pixel', header.bitsPerPixel],
    ['Bounding box', `(${header.xmin}, ${header.ymin}) – (${header.xmax}, ${header.ymax})`],
    ['Image dimensions', `${header.width} × ${header.height} px`],
    ['Horizontal DPI', header.hDpi],
    ['Vertical DPI', header.vDpi],
    ['Reserved', header.reserved],
    ['Number of planes', header.numberOfPlanes],
    ['Bytes per line', header.bytesPerLine],
    ['Palette info', header.paletteInfo],
    ['Screen size', `${header.hScreenSize} × ${header.vScreenSize}`],
  ];

  return (
    <section className="pcx-header-inspector" aria-label="PCX Header Inspector">
      <div className="pcx-header-inspector__modes" role="group" aria-label="PCX input type">
        {Object.entries(INPUT_MODES).map(([label, value]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={mode === value ? 'is-active' : ''}
            onClick={() => handleModeChange(value)}
          >
            {label === 'FILE' ? 'File upload' : label === 'HEX' ? 'Raw hex' : 'Base64'}
          </button>
        ))}
      </div>

      {mode === INPUT_MODES.FILE ? (
        <label className="pcx-header-inspector__upload">
          Select a PCX file
          <input
            ref={fileInputRef}
            type="file"
            accept=".pcx,image/x-pcx"
            onChange={handleFileChange}
          />
        </label>
      ) : (
        <label className="pcx-header-inspector__input-label" htmlFor="pcx-input">
          {mode === INPUT_MODES.HEX ? 'PCX header bytes in hexadecimal' : 'PCX file in Base64'}
          <textarea
            id="pcx-input"
            value={input}
            onChange={handleTextInput}
            placeholder={mode === INPUT_MODES.HEX ? '0A 05 01 08 ...' : 'CgUBCAAAAA...'}
            spellCheck={false}
          />
        </label>
      )}

      {error && <div className="pcx-header-inspector__error" role="alert">{error}</div>}

      {header && (
        <div className="pcx-header-inspector__results" aria-live="polite">
          <h2>PCX header metadata</h2>
          <dl>
            {fields.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
            <div>
              <dt>EGA palette</dt>
              <dd>{header.egaPalette.length} bytes</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
