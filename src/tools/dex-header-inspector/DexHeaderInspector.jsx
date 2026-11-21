import { useRef, useState } from 'react';
import { decodeDexInput, formatHex, parseDexHeader, readDexFile } from './dex-header.utils.js';
import './dex-header-inspector.css';

/**
 * Renders a passive, client-side inspector for Android DEX file headers.
 * @returns {React.JSX.Element}
 */
export default function DexHeaderInspector() {
  const [input, setInput] = useState('');
  const [header, setHeader] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Ready to inspect a local DEX file.');
  const fileInputRef = useRef(null);

  function inspect(bytes, source) {
    try {
      const nextHeader = parseDexHeader(bytes);
      setHeader(nextHeader);
      setError('');
      setStatus(`Parsed DEX version ${nextHeader.version} from ${source}.`);
    } catch (parseError) {
      setHeader(null);
      setError(parseError.message);
      setStatus('No DEX header is currently displayed.');
    }
  }

  function handlePasteInspect() {
    try {
      inspect(decodeDexInput(input), 'pasted data');
    } catch (inputError) {
      setHeader(null);
      setError(inputError.message);
      setStatus('No DEX header is currently displayed.');
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      inspect(await readDexFile(file), file.name);
    } catch {
      setHeader(null);
      setError('Failed to read the selected file.');
      setStatus('No DEX header is currently displayed.');
    }
  }

  function handleClear() {
    setInput('');
    setHeader(null);
    setError('');
    setStatus('Ready to inspect a local DEX file.');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="dex-header-inspector" aria-label="DEX Header Inspector">
      <p className="dex-header-inspector__notice">
        Files are parsed only in this browser. This tool never uploads or executes bytecode.
      </p>
      <div className="dex-header-inspector__controls">
        <label className="dex-header-inspector__file-button">
          Choose .dex file
          <input
            ref={fileInputRef}
            type="file"
            accept=".dex,application/vnd.android.dex"
            onChange={handleFileChange}
            aria-label="Choose a DEX file"
          />
        </label>
        <button type="button" onClick={handlePasteInspect}>Inspect pasted data</button>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
      <label htmlFor="dex-header-input">Hexadecimal or Base64 DEX data</label>
      <textarea
        id="dex-header-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste complete .dex bytes as hexadecimal or Base64…"
        spellCheck={false}
      />
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {error && <div className="dex-header-inspector__error" role="alert">{error}</div>}
      {header && (
        <div className="dex-header-inspector__results">
          <h2>DEX {header.version} header</h2>
          <dl className="dex-header-inspector__fields">
            <div><dt>Checksum</dt><dd>{formatHex(header.checksum)}</dd></div>
            <div><dt>SHA-1 signature</dt><dd>{header.signature}</dd></div>
            <div><dt>File size</dt><dd>{header.fileSize} bytes</dd></div>
            <div><dt>Header size</dt><dd>{header.headerSize} bytes</dd></div>
            <div>
              <dt>Endianness</dt>
              <dd>{header.byteOrder} ({formatHex(header.endianTag)})</dd>
            </div>
            <div>
              <dt>Link section</dt>
              <dd>{header.linkSize} bytes at {formatHex(header.linkOffset)}</dd>
            </div>
          </dl>
          <h2>Section table</h2>
          <div className="dex-header-inspector__table-wrap" tabIndex="0">
            <table>
              <thead>
                <tr>
                  <th scope="col">Section</th>
                  <th scope="col">Size</th>
                  <th scope="col">Offset</th>
                </tr>
              </thead>
              <tbody>
                {header.sections.map((section) => (
                  <tr key={section.name}>
                    <th scope="row">{section.name}</th>
                    <td>{section.size ?? 'In map list'}</td>
                    <td>{formatHex(section.offset)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
