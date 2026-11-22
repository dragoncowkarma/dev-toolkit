import { useRef, useState } from 'react';
import { formatHexDump, parseDdsHeader, parseHexBytes } from './dds-header.utils.js';
import './dds-header-inspector.css';

function HeaderValue({ label, value }) {
  return (
    <div className="dds-header-inspector__value">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function HeaderSummary({ header }) {
  const pixelFormat = header.pixelFormat;
  return (
    <div className="dds-header-inspector__summary" aria-label="DDS header summary">
      <section aria-labelledby="dds-core-heading">
        <h3 id="dds-core-heading">DDS Header</h3>
        <dl>
          <HeaderValue label="Magic" value={header.magic} />
          <HeaderValue label="dwSize" value={header.size} />
          <HeaderValue label="dwFlags" value={`0x${header.flags.toString(16)}`} />
          <HeaderValue label="Width" value={header.width} />
          <HeaderValue label="Height" value={header.height} />
          <HeaderValue label="Pitch / Linear Size" value={header.pitchOrLinearSize} />
          <HeaderValue label="Depth" value={header.depth} />
          <HeaderValue label="Mip Map Count" value={header.mipMapCount} />
          <HeaderValue label="dwCaps" value={`0x${header.caps.toString(16)}`} />
          <HeaderValue label="dwCaps2" value={`0x${header.caps2.toString(16)}`} />
          <HeaderValue label="dwCaps3" value={`0x${header.caps3.toString(16)}`} />
          <HeaderValue label="dwCaps4" value={`0x${header.caps4.toString(16)}`} />
        </dl>
      </section>
      <section aria-labelledby="dds-format-heading">
        <h3 id="dds-format-heading">DDS Pixel Format</h3>
        <dl>
          <HeaderValue label="dwSize" value={pixelFormat.size} />
          <HeaderValue label="dwFlags" value={`0x${pixelFormat.flags.toString(16)}`} />
          <HeaderValue label="dwFourCC (hex)" value={pixelFormat.fourCC.hex} />
          <HeaderValue label="dwFourCC (ASCII)" value={pixelFormat.fourCC.ascii} />
          <HeaderValue label="RGB Bit Count" value={pixelFormat.rgbBitCount} />
          <HeaderValue label="Red Mask" value={`0x${pixelFormat.redMask.toString(16)}`} />
          <HeaderValue label="Green Mask" value={`0x${pixelFormat.greenMask.toString(16)}`} />
          <HeaderValue label="Blue Mask" value={`0x${pixelFormat.blueMask.toString(16)}`} />
          <HeaderValue label="Alpha Mask" value={`0x${pixelFormat.alphaMask.toString(16)}`} />
        </dl>
      </section>
      {header.dx10 && (
        <section aria-labelledby="dds-dx10-heading">
          <h3 id="dds-dx10-heading">DDS_HEADER_DXT10</h3>
          <dl>
            <HeaderValue
              label="DXGI Format"
              value={`${header.dx10.dxgiFormat} (${header.dx10.dxgiFormatName})`}
            />
            <HeaderValue label="Resource Dimension" value={header.dx10.resourceDimension} />
            <HeaderValue label="Misc Flag" value={`0x${header.dx10.miscFlag.toString(16)}`} />
            <HeaderValue label="Array Size" value={header.dx10.arraySize} />
            <HeaderValue label="Misc Flags 2" value={`0x${header.dx10.miscFlags2.toString(16)}`} />
          </dl>
        </section>
      )}
    </div>
  );
}

/**
 * Renders a browser-only DDS file header inspector.
 *
 * @returns {React.JSX.Element} The DDS header inspector UI.
 */
export default function DdsHeaderInspectorTool() {
  const [hexInput, setHexInput] = useState('');
  const [result, setResult] = useState(null);
  const [hexDump, setHexDump] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  function inspectBytes(bytes) {
    const nextResult = parseDdsHeader(bytes);
    setHexDump(formatHexDump(bytes));
    if (!nextResult.ok) {
      setResult(null);
      setError(nextResult.error);
      return;
    }
    setResult(nextResult.header);
    setError('');
  }

  function handleHexInspect() {
    const parsed = parseHexBytes(hexInput);
    if (!parsed.ok) {
      setResult(null);
      setHexDump('');
      setError(parsed.error);
      return;
    }
    inspectBytes(parsed.bytes);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => inspectBytes(reader.result);
    reader.onerror = () => {
      setResult(null);
      setHexDump('');
      setError('Failed to read the selected file.');
    };
    reader.readAsArrayBuffer(file);
  }

  function handleClear() {
    setHexInput('');
    setResult(null);
    setHexDump('');
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <main className="dds-header-inspector" aria-label="DDS Header Inspector">
      <section className="dds-header-inspector__input" aria-labelledby="dds-input-heading">
        <h2 id="dds-input-heading">Inspect a DDS header</h2>
        <p>Choose a .dds file or paste hexadecimal bytes. Processing stays in your browser.</p>
        <div className="dds-header-inspector__actions">
          <label className="dds-header-inspector__file-button" htmlFor="dds-file-input">
            Choose DDS file
          </label>
          <input
            ref={fileInputRef}
            id="dds-file-input"
            type="file"
            accept=".dds,application/octet-stream"
            onChange={handleFileChange}
          />
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
        <label htmlFor="dds-hex-input">DDS hexadecimal bytes</label>
        <textarea
          id="dds-hex-input"
          value={hexInput}
          onChange={(event) => setHexInput(event.target.value)}
          placeholder="44 44 53 20 7c 00 00 00 ..."
          spellCheck={false}
        />
        <button type="button" onClick={handleHexInspect}>Inspect hex bytes</button>
      </section>
      {error && <div className="dds-header-inspector__error" role="alert">{error}</div>}
      {result && <HeaderSummary header={result} />}
      {hexDump && (
        <section className="dds-header-inspector__dump" aria-labelledby="dds-dump-heading">
          <h3 id="dds-dump-heading">Raw hex dump</h3>
          <pre>{hexDump}</pre>
        </section>
      )}
    </main>
  );
}
