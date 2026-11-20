import { useState } from 'react';
import { parseCoseMessage } from './coseInspector.utils.js';
import './coseInspector.css';

const EXAMPLE_SIGN1 = 'd28443a10126a104436b69644568656c6c6f40';

/**
 * Renders a local-only COSE message inspector without signature verification or decryption.
 *
 * @returns {React.JSX.Element} The COSE inspector UI.
 */
export default function CoseInspectorTool() {
  const [input, setInput] = useState('');
  const [format, setFormat] = useState('auto');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function inspect(value = input) {
    if (!value.trim()) {
      setResult(null);
      setError('Paste a Base64 or hexadecimal COSE message first.');
      return;
    }
    try {
      setResult(parseCoseMessage(value, format));
      setError('');
    } catch (err) {
      setResult(null);
      setError(err.message);
    }
  }

  function handleExample() {
    setInput(EXAMPLE_SIGN1);
    try {
      setResult(parseCoseMessage(EXAMPLE_SIGN1, 'hex'));
      setFormat('hex');
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="cose-inspector" aria-label="COSE Message Inspector">
      <div className="cose-inspector__intro">
        <p>
          Inspect COSE CBOR headers locally. No signatures are verified and no data is decrypted.
        </p>
        <button type="button" className="cose-inspector__button" onClick={handleExample}>
          Load COSE_Sign1 example
        </button>
      </div>

      <label className="cose-inspector__label" htmlFor="cose-input">COSE message</label>
      <textarea
        id="cose-input"
        className="cose-inspector__input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Paste Base64, Base64URL, or hexadecimal CBOR bytes"
        spellCheck={false}
      />
      <div className="cose-inspector__controls">
        <label className="cose-inspector__format" htmlFor="cose-format">
          Input format
          <select
            id="cose-format"
            value={format}
            onChange={(event) => setFormat(event.target.value)}
          >
            <option value="auto">Auto detect</option>
            <option value="hex">Hexadecimal</option>
            <option value="base64">Base64</option>
            <option value="base64url">Base64URL</option>
          </select>
        </label>
        <button type="button" className="cose-inspector__button" onClick={() => inspect()}>
          Inspect message
        </button>
      </div>

      {error && <div className="cose-inspector__error" role="alert">{error}</div>}

      {result && (
        <section className="cose-inspector__result" aria-label="COSE inspection result">
          <dl className="cose-inspector__summary">
            <div><dt>Message type</dt><dd>{result.type}</dd></div>
            <div><dt>CBOR tag</dt><dd>{result.tag ?? 'Untagged'}</dd></div>
            <div><dt>Input format</dt><dd>{result.format}</dd></div>
          </dl>

          <h2>Headers</h2>
          {result.headers.length ? (
            <dl className="cose-inspector__headers">
              {result.headers.map((header) => (
                <div key={`${header.source}-${header.label}`}>
                  <dt>{header.name} ({String(header.label)})</dt>
                  <dd>
                    {header.algorithm ? `${header.algorithm} (${header.value})` : header.value}
                  </dd>
                  <dd className="cose-inspector__source">{header.source} header</dd>
                </div>
              ))}
            </dl>
          ) : <p className="cose-inspector__empty">No protected or unprotected headers.</p>}

          <h2>Payload</h2>
          {result.payload ? (
            <dl className="cose-inspector__payload">
              <div><dt>Byte length</dt><dd>{result.payload.byteLength}</dd></div>
              <div><dt>Hex</dt><dd>{result.payload.hex}</dd></div>
              <div><dt>Base64</dt><dd>{result.payload.base64}</dd></div>
            </dl>
          ) : <p className="cose-inspector__empty">Detached payload (null).</p>}
        </section>
      )}
    </section>
  );
}
