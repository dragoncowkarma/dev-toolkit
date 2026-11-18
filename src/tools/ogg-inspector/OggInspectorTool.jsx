import { useRef, useState } from 'react';
import { base64ToBytes, parseOgg } from './ogg.utils.js';
import './ogg-inspector.css';

function flagsFor(page) {
  const flags = [];
  if (page.continued) flags.push('Continued');
  if (page.beginningOfStream) flags.push('BOS');
  if (page.endOfStream) flags.push('EOS');
  return flags.length ? flags.join(', ') : 'None';
}

/**
 * Renders a local Ogg container page-header inspector.
 *
 * @returns {React.JSX.Element} The Ogg inspector UI.
 */
export default function OggInspectorTool() {
  const [base64, setBase64] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef(null);

  function inspect(bytes, name = '') {
    try {
      setResult(parseOgg(bytes));
      setError('');
      setFileName(name);
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
      setFileName(name);
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    inspect(new Uint8Array(await file.arrayBuffer()), file.name);
  }

  function handleBase64Inspect() {
    try {
      inspect(base64ToBytes(base64));
    } catch (caughtError) {
      setResult(null);
      setError(caughtError.message);
      setFileName('');
    }
  }

  function handleClear() {
    setBase64('');
    setResult(null);
    setError('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <section className="ogg-inspector" aria-labelledby="ogg-inspector-title">
      <div className="ogg-inspector__intro">
        <h2 id="ogg-inspector-title">Ogg Container Inspector</h2>
        <p>Inspect Ogg page headers and logical bitstream signatures locally in your browser.</p>
      </div>

      <div className="ogg-inspector__controls">
        <label className="ogg-inspector__upload">
          Upload Ogg file
          <input
            ref={fileInputRef}
            type="file"
            accept=".ogg,.oga,.ogv,.opus,audio/ogg,video/ogg"
            onChange={handleFileChange}
            aria-label="Upload an Ogg file"
          />
        </label>
        <button type="button" className="ogg-inspector__button" onClick={handleBase64Inspect}>
          Inspect Base64
        </button>
        <button type="button" className="ogg-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <label className="ogg-inspector__label" htmlFor="ogg-base64">Base64 input</label>
      <textarea
        id="ogg-base64"
        className="ogg-inspector__textarea"
        value={base64}
        onChange={(event) => setBase64(event.target.value)}
        placeholder="Paste Base64-encoded Ogg bytes…"
        spellCheck={false}
      />

      {error && <p className="ogg-inspector__error" role="alert">{error}</p>}

      {result && (
        <div className="ogg-inspector__results">
          <p className="ogg-inspector__summary">
            {fileName ? `${fileName}: ` : ''}
            {result.pages.length} page(s), {result.codecs.length} bitstream(s)
          </p>
          <section aria-labelledby="ogg-codecs-title">
            <h3 id="ogg-codecs-title">Logical bitstreams</h3>
            <div className="ogg-inspector__table-wrap" tabIndex="0">
              <table>
                <thead>
                  <tr><th scope="col">Serial number</th><th scope="col">Codec</th></tr>
                </thead>
                <tbody>
                  {result.codecs.map((codec) => (
                    <tr key={codec.serialNumber}>
                      <th scope="row">{codec.serialNumber}</th><td>{codec.codec}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section aria-labelledby="ogg-pages-title">
            <h3 id="ogg-pages-title">Pages</h3>
            <div className="ogg-inspector__table-wrap" tabIndex="0">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Page</th><th scope="col">Flags</th>
                    <th scope="col">Granule</th><th scope="col">Serial</th>
                    <th scope="col">Sequence</th><th scope="col">Payload</th>
                  </tr>
                </thead>
                <tbody>
                  {result.pages.map((page) => (
                    <tr key={page.index}>
                      <th scope="row">{page.index}</th><td>{flagsFor(page)}</td>
                      <td>{page.granulePosition}</td><td>{page.serialNumber}</td>
                      <td>{page.sequenceNumber}</td><td>{page.payloadSize} bytes</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          {result.pages.map((page) => (
            <section key={`segments-${page.index}`} aria-labelledby={`ogg-segments-${page.index}`}>
              <h3 id={`ogg-segments-${page.index}`}>Page {page.index} header and segment table</h3>
              <dl className="ogg-inspector__header">
                <div><dt>Capture pattern</dt><dd>{page.capturePattern}</dd></div>
                <div><dt>Version</dt><dd>{page.version}</dd></div>
                <div>
                  <dt>Header type</dt>
                  <dd>0x{page.headerType.toString(16).padStart(2, '0')}</dd>
                </div>
                <div><dt>Checksum</dt><dd>{page.checksum}</dd></div>
              </dl>
              <div className="ogg-inspector__table-wrap" tabIndex="0">
                <table>
                  <thead>
                    <tr><th scope="col">Segment</th><th scope="col">Lacing value / bytes</th></tr>
                  </thead>
                  <tbody>
                    {page.segments.map((segment, index) => (
                      <tr key={index}><th scope="row">{index}</th><td>{segment}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
