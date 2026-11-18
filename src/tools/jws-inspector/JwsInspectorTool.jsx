import { useEffect, useState } from 'react';
import { parseJwsCompact } from './jwsInspector.utils.js';
import './jwsInspector.css';

/**
 * Formats a header value for display without altering its type.
 * @param {unknown} value
 * @returns {string} A readable representation of the value.
 */
function formatValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/**
 * Renders a client-side compact JWS decoder and inspector without verification.
 * @returns {React.JSX.Element} The JWS inspector UI.
 */
export default function JwsInspectorTool() {
  const [compactJws, setCompactJws] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (compactJws.trim() === '') {
      setResult(null);
      setError('');
      return;
    }

    try {
      setResult(parseJwsCompact(compactJws));
      setError('');
    } catch (parseError) {
      setResult(null);
      setError(parseError.message);
    }
  }, [compactJws]);

  function handleClear() {
    setCompactJws('');
  }

  return (
    <section className="jws-inspector" aria-label="JWS Inspector Tool">
      <div className="jws-inspector__heading">
        <div>
          <h2>JWS Inspector</h2>
          <p>
            Decode RFC 7515 compact JWS segments locally. Signature verification is not performed.
          </p>
        </div>
        <button type="button" className="jws-inspector__button" onClick={handleClear}>
          Clear
        </button>
      </div>

      <label className="jws-inspector__label" htmlFor="compact-jws">
        Compact JWS
      </label>
      <textarea
        id="compact-jws"
        className="jws-inspector__input"
        value={compactJws}
        onChange={(event) => setCompactJws(event.target.value)}
        placeholder="Paste header.payload.signature"
        spellCheck={false}
      />

      {error && (
        <div className="jws-inspector__error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="jws-inspector__results">
          <section aria-labelledby="jws-segments-heading">
            <h3 id="jws-segments-heading">Compact segments</h3>
            <dl className="jws-inspector__definition-list">
              <dt>Protected header</dt>
              <dd data-testid="protected-header-segment">{result.segments.protectedHeader}</dd>
              <dt>Payload</dt>
              <dd data-testid="payload-segment">{result.segments.payload}</dd>
              <dt>Signature</dt>
              <dd data-testid="signature-segment">{result.segments.signature}</dd>
            </dl>
          </section>

          <section aria-labelledby="jws-header-heading">
            <h3 id="jws-header-heading">Protected header</h3>
            <dl className="jws-inspector__definition-list">
              {Object.entries(result.headerFields).map(([name, value]) => (
                <div key={name} className="jws-inspector__field">
                  <dt>{name}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
            <pre className="jws-inspector__code">{JSON.stringify(result.header, null, 2)}</pre>
          </section>

          <section aria-labelledby="jws-payload-heading">
            <h3 id="jws-payload-heading">
              {result.payload.isJson ? 'JSON payload' : 'Raw payload'}
            </h3>
            <pre className="jws-inspector__code">
              {result.payload.isJson
                ? JSON.stringify(result.payload.json, null, 2)
                : result.payload.raw}
            </pre>
          </section>
        </div>
      )}
    </section>
  );
}
